"""
Onboarding OC Históricas Import API

Endpoints for bulk-importing historical Órdenes de Compra during onboarding.

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
from app.models.import_report import ImportReport
from app.models.orden_compra import OrdenCompra, OrdenCompraLinea
from app.models.producto import Producto
from app.models.proveedor import Proveedor
from app.models.user import User
from app.services.oc_historicas_parser import OCHistoricasParser, ParseError

router = APIRouter()


# ============================================================================
# DB lookup helpers
# ============================================================================

def _get_proveedores_by_rut(db: Session) -> dict[str, int]:
    """Return {rut: proveedor_id} for all proveedores with a rut."""
    rows = db.query(Proveedor.rut, Proveedor.id).filter(Proveedor.rut.isnot(None)).all()
    return {r[0]: r[1] for r in rows if r[0]}


def _get_productos_by_sku(db: Session) -> dict[str, int]:
    """Return {sku: producto_id} for all productos with a sku."""
    rows = db.query(Producto.sku, Producto.id).filter(Producto.sku.isnot(None)).all()
    return {r[0]: r[1] for r in rows if r[0]}


def _get_existing_numeros(db: Session) -> set[int]:
    """Return set of existing OrdenCompra.numero (integer) values."""
    rows = db.query(OrdenCompra.numero).filter(OrdenCompra.numero.isnot(None)).all()
    return {r[0] for r in rows if r[0] is not None}


def _oc_group_to_dict(group) -> dict:
    """Convert OCGroup to a JSON-serializable dict."""
    return {
        "numero_oc": group.numero_oc,
        "rut_proveedor": group.rut_proveedor,
        "fecha": group.fecha.isoformat() if group.fecha else None,
        "fecha_entrega_esperada": group.fecha_entrega_esperada.isoformat() if group.fecha_entrega_esperada else None,
        "estado": group.estado,
        "nota": group.nota,
        "total_neto": float(group.total_neto),
        "total_iva": float(group.iva),
        "total": float(group.total),
        "status": group.status,
        "row_num": group.row_num,
        "lineas": [
            {
                "sku": l.sku,
                "descripcion": l.descripcion,
                "cantidad": l.cantidad,
                "precio_unitario": float(l.precio_unitario),
                "descuento": float(l.descuento),
                "total_neto_linea": float(l.total_neto_linea),
            }
            for l in group.lines
        ],
    }


def _invalid_row_to_dict(row) -> dict:
    return {
        "row_num": row.row_num,
        "numero_oc": row.numero_oc_raw,
        "sheet": row.sheet,
        "motivo": row.motivo,
    }


# ============================================================================
# GET /template
# ============================================================================

@router.get("/template")
def get_template(perms: tuple[User, Session] = Depends(require_admin)):
    try:
        template_bytes = OCHistoricasParser.generate_template()
        return StreamingResponse(
            io.BytesIO(template_bytes),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=plantilla_oc_historicas.xlsx"},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generando plantilla: {e}")


# ============================================================================
# POST /preview
# ============================================================================

@router.post("/preview")
async def preview_oc(
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

    proveedores_by_rut = _get_proveedores_by_rut(db)
    productos_by_sku = _get_productos_by_sku(db)
    existing_numeros = _get_existing_numeros(db)

    try:
        result = OCHistoricasParser.parse(
            content,
            file.filename or "oc.xlsx",
            proveedores_by_rut=proveedores_by_rut,
            productos_by_sku=productos_by_sku,
            existing_numeros=existing_numeros,
        )
    except ParseError as e:
        raise HTTPException(status_code=422, detail=str(e))

    ocs = [_oc_group_to_dict(g) for g in result.valid_groups]
    invalid_rows = [_invalid_row_to_dict(r) for r in result.invalid_rows]

    return {
        "total_ocs": len(result.valid_groups) + result.invalid_group_count,
        "ocs_validas": len(result.valid_groups),
        "ocs_invalidas": result.invalid_group_count,
        "a_crear": result.a_crear,
        "a_omitir": result.a_omitir,
        "ocs": ocs,
        "invalid_rows": invalid_rows,
    }


# ============================================================================
# POST /import
# ============================================================================

@router.post("/import")
async def import_oc(
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

    proveedores_by_rut = _get_proveedores_by_rut(db)
    productos_by_sku = _get_productos_by_sku(db)
    existing_numeros = _get_existing_numeros(db)

    try:
        parse_result = OCHistoricasParser.parse(
            content,
            file.filename or "oc.xlsx",
            proveedores_by_rut=proveedores_by_rut,
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
        report_ocs = []

        for group in parse_result.valid_groups:
            if group.status == "omitir":
                omitted_count += 1
                report_ocs.append({**_oc_group_to_dict(group), "import_status": "omitir"})
                continue

            # Double-check idempotency for numero_oc (race condition guard)
            if group.numero_oc in existing_numeros:
                omitted_count += 1
                report_ocs.append({**_oc_group_to_dict(group), "import_status": "omitir"})
                continue

            proveedor_id = proveedores_by_rut[group.rut_proveedor]

            # Create OrdenCompra with historico=True
            oc = OrdenCompra(
                numero=group.numero_oc,
                proveedor_id=proveedor_id,
                fecha=group.fecha,
                fecha_entrega_esperada=group.fecha_entrega_esperada,
                estado=group.estado,
                nota=group.nota,
                total_neto=group.total_neto,
                total_iva=group.iva,
                total=group.total,
                historico=True,
            )

            existing_numeros.add(group.numero_oc)

            db.add(oc)
            db.flush()  # get oc.id

            # Create OrdenCompraLineas
            for orden, line in enumerate(group.lines):
                line_iva = (line.total_neto_linea * Decimal("0.19")).quantize(
                    Decimal("1"), rounding=ROUND_HALF_UP
                )
                line_total = line.total_neto_linea + line_iva

                producto_id = None
                if line.sku:
                    producto_id = productos_by_sku.get(line.sku)

                linea = OrdenCompraLinea(
                    orden_compra_id=oc.id,
                    orden=orden,
                    producto_id=producto_id,
                    sku=line.sku,
                    descripcion=line.descripcion,
                    cantidad=line.cantidad,
                    valor_neto=line.precio_unitario,
                    total_neto=line.total_neto_linea,
                    iva=line_iva,
                    total=line_total,
                )
                db.add(linea)

            created_count += 1
            report_ocs.append({**_oc_group_to_dict(group), "import_status": "crear", "oc_id": oc.id})

        overall_status = (
            "success" if error_count == 0
            else "partial" if (created_count + omitted_count) > 0
            else "error"
        )

        report_payload = {
            "created_count": created_count,
            "omitted_count": omitted_count,
            "error_count": error_count,
            "total_ocs": len(parse_result.valid_groups) + parse_result.invalid_group_count,
            "ocs": report_ocs,
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
