"""
Onboarding Facturas Históricas Import API

Endpoints for bulk-importing historical invoices/boletas (DTEs) during onboarding.
Documents are registered as origen=externo — NOT re-emitted to SII, no CAF consumed.

Endpoints:
  GET  /template  - Download two-sheet Excel template
  POST /preview   - Validate and preview file (no DB writes)
  POST /import    - Execute transactional import with idempotency
"""

import io
import json
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.config import require_admin
from app.models.cliente import Cliente
from app.models.empresa import Empresa
from app.models.factura import Factura, FacturaLinea
from app.models.import_report import ImportReport
from app.models.producto import Producto
from app.models.user import User
from app.services.facturas_historicas_parser import FacturasHistoricasParser, ParseError

router = APIRouter()


# ============================================================================
# DB lookup helpers
# ============================================================================

def _get_clientes_by_rut(db: Session) -> dict[str, int]:
    rows = db.query(Cliente.rut, Cliente.id).filter(Cliente.rut.isnot(None)).all()
    return {r[0]: r[1] for r in rows if r[0]}


def _get_empresas_by_rut(db: Session) -> dict[str, int]:
    rows = db.query(Empresa.rut, Empresa.id).filter(Empresa.rut.isnot(None)).all()
    return {r[0]: r[1] for r in rows if r[0]}


def _get_productos_by_sku(db: Session) -> dict[str, int]:
    rows = db.query(Producto.sku, Producto.id).filter(Producto.sku.isnot(None)).all()
    return {r[0]: r[1] for r in rows if r[0]}


def _get_existing_folios(db: Session) -> set[int]:
    rows = db.query(Factura.numero).filter(Factura.numero.isnot(None)).all()
    return {r[0] for r in rows if r[0] is not None}


def _group_to_dict(group) -> dict:
    return {
        "folio": group.folio,
        "tipo_dte": group.tipo_dte,
        "rut_receptor": group.rut_receptor,
        "rut_empresa": group.rut_empresa,
        "fecha_emision": group.fecha_emision.isoformat() if group.fecha_emision else None,
        "neto": float(group.neto),
        "iva": float(group.iva),
        "total": float(group.total),
        "estado_pago": group.estado_pago,
        "nota": group.nota,
        "status": group.status,
        "cliente_stub": group.cliente_stub,
        "row_num": group.row_num,
        "lineas": [
            {
                "sku": l.sku,
                "descripcion": l.descripcion,
                "cantidad": l.cantidad,
                "precio_unitario": float(l.precio_unitario),
                "descuento": float(l.descuento),
                "exento": l.exento,
            }
            for l in group.lines
        ],
    }


def _invalid_row_to_dict(row) -> dict:
    return {
        "row_num": row.row_num,
        "folio_raw": row.folio_raw,
        "sheet": row.sheet,
        "motivo": row.motivo,
    }


# ============================================================================
# GET /template
# ============================================================================

@router.get("/template")
def get_template(perms: tuple[User, Session] = Depends(require_admin)):
    try:
        template_bytes = FacturasHistoricasParser.generate_template()
        return StreamingResponse(
            io.BytesIO(template_bytes),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=plantilla_facturas_historicas.xlsx"},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generando plantilla: {e}")


# ============================================================================
# POST /preview
# ============================================================================

@router.post("/preview")
async def preview_facturas(
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
    productos_by_sku = _get_productos_by_sku(db)
    existing_folios = _get_existing_folios(db)

    try:
        result = FacturasHistoricasParser.parse(
            content,
            clientes_by_rut=clientes_by_rut,
            empresas_by_rut=empresas_by_rut,
            productos_by_sku=productos_by_sku,
            existing_folios=existing_folios,
        )
    except ParseError as e:
        raise HTTPException(status_code=422, detail=str(e))

    return {
        "total_docs": len(result.valid_groups) + result.invalid_count,
        "docs_validos": len(result.valid_groups),
        "docs_invalidos": result.invalid_count,
        "a_crear": result.a_crear,
        "a_omitir": result.a_omitir,
        "stubs_a_crear": result.stubs_a_crear,
        "facturas": [_group_to_dict(g) for g in result.valid_groups],
        "invalid_rows": [_invalid_row_to_dict(r) for r in result.invalid_rows],
    }


# ============================================================================
# POST /import
# ============================================================================

@router.post("/import")
async def import_facturas(
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
    productos_by_sku = _get_productos_by_sku(db)
    existing_folios = _get_existing_folios(db)

    try:
        parse_result = FacturasHistoricasParser.parse(
            content,
            clientes_by_rut=clientes_by_rut,
            empresas_by_rut=empresas_by_rut,
            productos_by_sku=productos_by_sku,
            existing_folios=existing_folios,
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
        stubs_created = 0
        error_count = len(parse_result.invalid_rows)
        report_facturas = []

        for group in parse_result.valid_groups:
            if group.status == "omitir":
                omitted_count += 1
                report_facturas.append({**_group_to_dict(group), "import_status": "omitir"})
                continue

            # Race-condition guard: re-check folio uniqueness
            if group.folio in existing_folios:
                omitted_count += 1
                report_facturas.append({**_group_to_dict(group), "import_status": "omitir"})
                continue

            # Resolve or create stub client
            if group.cliente_stub:
                # Create minimal stub client
                stub = Cliente(nombre=group.rut_receptor, rut=group.rut_receptor)
                db.add(stub)
                db.flush()
                cliente_id = stub.id
                clientes_by_rut[group.rut_receptor] = cliente_id
                stubs_created += 1
            else:
                cliente_id = clientes_by_rut[group.rut_receptor]

            empresa_id = empresas_by_rut.get(group.rut_empresa) if group.rut_empresa else None

            factura = Factura(
                numero=group.folio,
                cliente_id=cliente_id,
                empresa_id=empresa_id,
                tipo_dte=group.tipo_dte,
                fecha=group.fecha_emision,
                estado=group.estado_pago,
                nota=group.nota,
                total_neto=group.neto,
                total_iva=group.iva,
                total=group.total,
                origen="externo",
                dte_estado="no_emitida",
            )

            db.add(factura)
            db.flush()
            existing_folios.add(group.folio)

            for orden, line in enumerate(group.lines):
                producto_id = productos_by_sku.get(line.sku) if line.sku else None
                linea = FacturaLinea(
                    factura_id=factura.id,
                    orden=orden,
                    producto_id=producto_id,
                    sku=line.sku,
                    descripcion=line.descripcion,
                    cantidad=line.cantidad,
                    valor_neto=line.precio_unitario,
                    total_neto=line.total_neto_linea,
                    iva=line.iva_linea,
                    total=line.total_linea,
                )
                db.add(linea)

            created_count += 1
            report_facturas.append({
                **_group_to_dict(group),
                "import_status": "crear",
                "factura_id": factura.id,
            })

        overall_status = (
            "success" if error_count == 0
            else "partial" if (created_count + omitted_count) > 0
            else "error"
        )

        report_payload = {
            "created_count": created_count,
            "omitted_count": omitted_count,
            "stubs_created": stubs_created,
            "error_count": error_count,
            "total_docs": len(parse_result.valid_groups) + parse_result.invalid_count,
            "facturas": report_facturas,
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
