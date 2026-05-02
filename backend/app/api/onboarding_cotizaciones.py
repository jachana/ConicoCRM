"""
Onboarding Cotizaciones Import API

Endpoints for bulk-importing open/pending Cotizaciones during onboarding.

Endpoints:
  GET  /template  - Download Excel template
  POST /preview   - Validate and preview file (no DB writes)
  POST /import    - Execute transactional import with idempotency
"""

import io
import json
import uuid
from decimal import ROUND_HALF_UP, Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.config import require_admin
from app.models.cliente import Cliente
from app.models.cotizacion import Cotizacion, CotizacionLinea
from app.models.empresa import Empresa
from app.models.import_report import ImportReport
from app.models.producto import Producto
from app.models.system_config import SystemConfig
from app.models.user import User
from app.services.cotizaciones_parser import CotizacionesParser, ParseError

router = APIRouter()


# ============================================================================
# DB lookup helpers
# ============================================================================

def _get_clientes_by_rut(db: Session) -> dict[str, int]:
    """Return {rut: cliente_id} for all clientes with a rut."""
    rows = db.query(Cliente.rut, Cliente.id).filter(Cliente.rut.isnot(None)).all()
    return {r[0]: r[1] for r in rows if r[0]}


def _get_empresas_by_rut(db: Session) -> dict[str, int]:
    """Return {rut: empresa_id} for all empresas with a rut."""
    rows = db.query(Empresa.rut, Empresa.id).filter(Empresa.rut.isnot(None)).all()
    return {r[0]: r[1] for r in rows if r[0]}


def _get_vendedores_by_email(db: Session) -> dict[str, int]:
    """Return {email: user_id} for all users."""
    rows = db.query(User.email, User.id).all()
    return {r[0]: r[1] for r in rows if r[0]}


def _get_productos_by_sku(db: Session) -> dict[str, int]:
    """Return {sku: producto_id} for all productos with a sku."""
    rows = db.query(Producto.sku, Producto.id).filter(Producto.sku.isnot(None)).all()
    return {r[0]: r[1] for r in rows if r[0]}


def _get_existing_numeros(db: Session) -> set[int]:
    """Return set of existing Cotizacion.numero (integer) values."""
    rows = db.query(Cotizacion.numero).filter(Cotizacion.numero.isnot(None)).all()
    return {r[0] for r in rows if r[0] is not None}


def _asignar_numero(db: Session) -> int:
    """Assign the next Cotizacion numero using SystemConfig (same as cotizaciones.py)."""
    config = (
        db.query(SystemConfig)
        .filter_by(key="cotizacion_last_id")
        .with_for_update()
        .first()
    )
    if not config:
        config = SystemConfig(key="cotizacion_last_id", value="12250")
        db.add(config)
        db.flush()
    numero = int(config.value) + 1
    config.value = str(numero)
    return numero


def _cot_group_to_dict(group) -> dict:
    """Convert CotizacionGroup to a JSON-serializable dict."""
    return {
        "numero_cot": group.numero_cot,
        "rut_cliente": group.rut_cliente,
        "rut_empresa": group.rut_empresa,
        "fecha": group.fecha.isoformat() if group.fecha else None,
        "vigencia_hasta": group.vigencia_hasta.isoformat() if group.vigencia_hasta else None,
        "estado": group.estado,
        "vendedor_email": group.vendedor_email,
        "nota": group.nota,
        "status": group.status,
        "row_nums": group.row_nums,
        "total_neto": float(group.total_neto),
        "total_iva": float(group.total_iva),
        "total": float(group.total),
        "lineas": [
            {
                "sku": l.sku,
                "descripcion": l.descripcion,
                "formato": l.formato,
                "cantidad": l.cantidad,
                "precio": float(l.precio),
                "descuento": float(l.descuento),
            }
            for l in group.lines
        ],
    }


def _invalid_row_to_dict(row) -> dict:
    return {
        "row_num": row.row_num,
        "numero_cot": row.numero_cot_raw,
        "motivo": row.motivo,
    }


# ============================================================================
# GET /template
# ============================================================================

@router.get("/template")
def get_template(perms: tuple[User, Session] = Depends(require_admin)):
    try:
        template_bytes = CotizacionesParser.generate_template()
        return StreamingResponse(
            io.BytesIO(template_bytes),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=plantilla_cotizaciones_abiertas.xlsx"},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generando plantilla: {e}")


# ============================================================================
# POST /preview
# ============================================================================

@router.post("/preview")
async def preview_cotizaciones(
    file: UploadFile,
    perms: tuple[User, Session] = Depends(require_admin),
):
    _, db = perms

    try:
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="El archivo está vacío")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error leyendo archivo: {e}")

    clientes_by_rut = _get_clientes_by_rut(db)
    empresas_by_rut = _get_empresas_by_rut(db)
    vendedores_by_email = _get_vendedores_by_email(db)
    productos_by_sku = _get_productos_by_sku(db)
    existing_numeros = _get_existing_numeros(db)

    try:
        result = CotizacionesParser.parse(
            content,
            file.filename or "cotizaciones.xlsx",
            clientes_by_rut=clientes_by_rut,
            empresas_by_rut=empresas_by_rut,
            vendedores_by_email=vendedores_by_email,
            productos_by_sku=productos_by_sku,
            existing_numeros=existing_numeros,
        )
    except ParseError as e:
        raise HTTPException(status_code=422, detail=str(e))

    cotizaciones = [_cot_group_to_dict(g) for g in result.valid_groups]
    invalid_rows = [_invalid_row_to_dict(r) for r in result.invalid_rows]

    return {
        "total_cots": len(result.valid_groups) + result.invalid_group_count,
        "cots_validas": len(result.valid_groups),
        "cots_invalidas": result.invalid_group_count,
        "a_crear": result.a_crear,
        "a_omitir": result.a_omitir,
        "cotizaciones": cotizaciones,
        "invalid_rows": invalid_rows,
    }


# ============================================================================
# POST /import
# ============================================================================

@router.post("/import")
async def import_cotizaciones(
    file: UploadFile,
    idempotency_key: Optional[str] = None,
    perms: tuple[User, Session] = Depends(require_admin),
):
    current_user, db = perms

    try:
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="El archivo está vacío")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error leyendo archivo: {e}")

    import_id = idempotency_key or str(uuid.uuid4())

    # Idempotency: return cached result if same import_id
    existing_report = (
        db.query(ImportReport).filter(ImportReport.import_id == import_id).first()
    )
    if existing_report:
        report_data = json.loads(existing_report.report_json or "{}")
        return {
            "status": existing_report.status,
            "import_id": existing_report.import_id,
            "timestamp": existing_report.created_at.isoformat(),
            "report": report_data,
        }

    clientes_by_rut = _get_clientes_by_rut(db)
    empresas_by_rut = _get_empresas_by_rut(db)
    vendedores_by_email = _get_vendedores_by_email(db)
    productos_by_sku = _get_productos_by_sku(db)
    existing_numeros = _get_existing_numeros(db)

    try:
        parse_result = CotizacionesParser.parse(
            content,
            file.filename or "cotizaciones.xlsx",
            clientes_by_rut=clientes_by_rut,
            empresas_by_rut=empresas_by_rut,
            vendedores_by_email=vendedores_by_email,
            productos_by_sku=productos_by_sku,
            existing_numeros=existing_numeros,
        )
    except ParseError as e:
        err_report = ImportReport(
            import_id=import_id,
            status="error",
            error_message=str(e),
            filename=file.filename,
            total_rows=0,
        )
        db.add(err_report)
        db.commit()
        raise HTTPException(status_code=422, detail=str(e))

    try:
        created_count = 0
        omitted_count = 0
        error_count = len(parse_result.invalid_rows)
        report_cots = []

        for group in parse_result.valid_groups:
            if group.status == "omitir":
                omitted_count += 1
                report_cots.append({**_cot_group_to_dict(group), "import_status": "omitir"})
                continue

            # Double-check idempotency for integer numeros (race condition guard)
            if group.numero_cot is not None:
                try:
                    num_int = int(group.numero_cot)
                    if num_int in existing_numeros:
                        omitted_count += 1
                        report_cots.append({**_cot_group_to_dict(group), "import_status": "omitir"})
                        continue
                except (ValueError, TypeError):
                    pass

            # Build Cotizacion
            cot = Cotizacion(
                cliente_id=clientes_by_rut[group.rut_cliente],
                vendedor_id=vendedores_by_email[group.vendedor_email],
                empresa_id=empresas_by_rut.get(group.rut_empresa) if group.rut_empresa else None,
                fecha=group.fecha,
                estado=group.estado,
                nota=group.nota,
                validez_dias=5,
                total_neto=group.total_neto,
                total_iva=group.total_iva,
                total=group.total,
            )

            # Set numero: use explicit int from file, or auto-assign via SystemConfig
            if group.numero_cot is not None:
                try:
                    cot.numero = int(group.numero_cot)
                    existing_numeros.add(cot.numero)
                except (ValueError, TypeError):
                    cot.numero = _asignar_numero(db)
                    existing_numeros.add(cot.numero)
            else:
                cot.numero = _asignar_numero(db)
                existing_numeros.add(cot.numero)

            db.add(cot)
            db.flush()  # get cot.id

            # Create CotizacionLineas
            for orden, line in enumerate(group.lines):
                line_total_neto = line.total_neto_linea  # already computed by parser
                line_iva = (line_total_neto * Decimal("0.19")).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
                line_total = line_total_neto + line_iva
                producto_id = productos_by_sku.get(line.sku) if line.sku else None
                linea = CotizacionLinea(
                    cotizacion_id=cot.id,
                    orden=orden,
                    producto_id=producto_id,
                    sku=line.sku,
                    descripcion=line.descripcion,
                    formato=line.formato,
                    cantidad=line.cantidad,
                    valor_neto=line.precio,
                    descuento=line.descuento,
                    total_neto=line_total_neto,
                    iva=line_iva,
                    total=line_total,
                )
                db.add(linea)

            created_count += 1
            report_cots.append({**_cot_group_to_dict(group), "import_status": "crear", "cot_id": cot.id})

        overall_status = (
            "success" if error_count == 0
            else "partial" if (created_count + omitted_count) > 0
            else "error"
        )

        report_payload = {
            "created_count": created_count,
            "omitted_count": omitted_count,
            "error_count": error_count,
            "total_cots": len(parse_result.valid_groups) + parse_result.invalid_group_count,
            "cotizaciones": report_cots,
        }

        import_report = ImportReport(
            import_id=import_id,
            status=overall_status,
            created_count=created_count,
            error_count=error_count,
            total_rows=len(parse_result.valid_groups) + len(parse_result.invalid_rows),
            filename=file.filename,
            report_json=json.dumps(report_payload, ensure_ascii=False, default=str),
        )
        db.add(import_report)
        db.commit()
        db.refresh(import_report)

        return {
            "status": overall_status,
            "import_id": import_id,
            "timestamp": import_report.created_at.isoformat(),
            "report": report_payload,
        }

    except Exception as e:
        db.rollback()
        err_report = ImportReport(
            import_id=import_id,
            status="error",
            error_message=f"Transaction error: {e}",
            filename=file.filename,
            total_rows=0,
        )
        db.add(err_report)
        db.commit()
        raise HTTPException(status_code=500, detail=f"Import error: {e}")
