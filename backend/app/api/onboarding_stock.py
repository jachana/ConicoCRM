"""
Onboarding Stock Import API

Endpoints for bulk-importing initial stock per bodega during onboarding.

Endpoints:
  GET  /template  - Download Excel template
  POST /preview   - Validate and preview file (no DB writes)
  POST /import    - Execute transactional import
"""

import io
import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.config import require_admin
from app.database import get_db
from app.models.bodega import Bodega
from app.models.empresa import Empresa
from app.models.import_report import ImportReport
from app.models.movimiento_inventario import MovimientoInventario
from app.models.producto import Producto
from app.models.user import User
from app.services.stock_parser import StockParser, ParseError

router = APIRouter()


def _build_lookup_dicts(db: Session, empresa_id: int) -> tuple[dict, dict]:
    """Return (productos_by_sku, bodegas_by_nombre) for given empresa."""
    productos = db.query(Producto).filter(Producto.sku.isnot(None)).all()
    productos_by_sku = {p.sku.strip().upper(): p for p in productos if p.sku}

    bodegas = db.query(Bodega).filter(Bodega.empresa_id == empresa_id).all()
    bodegas_by_nombre = {b.nombre.strip(): b for b in bodegas}

    return productos_by_sku, bodegas_by_nombre


def _get_existing_cargas(db: Session) -> set[tuple[int, int]]:
    """Return set of (producto_id, bodega_id) that already have a CARGA_INICIAL movement."""
    movs = (
        db.query(MovimientoInventario)
        .filter(
            MovimientoInventario.motivo == "carga_inicial",
            MovimientoInventario.referencia_tipo == "bodega",
        )
        .all()
    )
    return {(m.producto_id, m.referencia_id) for m in movs if m.referencia_id is not None}


# ============================================================================
# GET /template
# ============================================================================

@router.get("/template")
def get_template(perms: tuple[User, Session] = Depends(require_admin)):
    try:
        template_bytes = StockParser.generate_template()
        return StreamingResponse(
            io.BytesIO(template_bytes),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=plantilla_stock_inicial.xlsx"},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generando plantilla: {e}")


# ============================================================================
# POST /preview
# ============================================================================

@router.post("/preview")
async def preview_stock(
    file: UploadFile,
    empresa_id: int = Query(...),
    perms: tuple[User, Session] = Depends(require_admin),
):
    _, db = perms

    empresa = db.get(Empresa, empresa_id)
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")

    try:
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="El archivo está vacío")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error leyendo archivo: {e}")

    productos_by_sku, bodegas_by_nombre = _build_lookup_dicts(db, empresa_id)
    existing_cargas = _get_existing_cargas(db)

    try:
        result = StockParser.parse(
            content,
            file.filename or "stock.xlsx",
            productos_by_sku,
            bodegas_by_nombre,
            existing_cargas,
        )
    except ParseError as e:
        raise HTTPException(status_code=422, detail=str(e))

    rows = []
    for r in result.valid_rows:
        rows.append({
            "row_num": r.row_num,
            "sku": r.sku,
            "nombre_bodega": r.nombre_bodega,
            "cantidad": r.cantidad,
            "costo_unitario": str(r.costo_unitario) if r.costo_unitario is not None else None,
            "status": "actualizar" if r.has_existing_carga else "crear",
            "errors": [],
        })
    for r in result.invalid_rows:
        rows.append({
            "row_num": r.row_num,
            "sku": r.sku,
            "nombre_bodega": r.nombre_bodega,
            "cantidad": None,
            "costo_unitario": None,
            "status": "error",
            "errors": r.errors,
        })

    return {
        "total_filas": result.valid_count + result.invalid_count,
        "filas_validas": result.valid_count,
        "filas_invalidas": result.invalid_count,
        "a_crear": result.a_crear,
        "a_actualizar": result.a_actualizar,
        "rows": rows,
    }


# ============================================================================
# POST /import
# ============================================================================

@router.post("/import")
async def import_stock(
    file: UploadFile,
    empresa_id: int = Query(...),
    idempotency_key: Optional[str] = None,
    perms: tuple[User, Session] = Depends(require_admin),
):
    current_user, db = perms

    empresa = db.get(Empresa, empresa_id)
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")

    try:
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="El archivo está vacío")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error leyendo archivo: {e}")

    import_id = idempotency_key or str(uuid.uuid4())

    existing_report = db.query(ImportReport).filter(ImportReport.import_id == import_id).first()
    if existing_report:
        report_data = json.loads(existing_report.report_json or "{}")
        return {
            "status": existing_report.status,
            "import_id": existing_report.import_id,
            "timestamp": existing_report.created_at.isoformat(),
            "report": report_data,
        }

    productos_by_sku, bodegas_by_nombre = _build_lookup_dicts(db, empresa_id)
    existing_cargas = _get_existing_cargas(db)

    try:
        parse_result = StockParser.parse(
            content,
            file.filename or "stock.xlsx",
            productos_by_sku,
            bodegas_by_nombre,
            existing_cargas,
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
        report_rows = []
        created_count = 0
        updated_count = 0
        error_count = 0
        now = datetime.now(timezone.utc)

        for row in parse_result.valid_rows:
            try:
                producto = db.get(Producto, row.producto_id)
                if not producto:
                    raise ValueError(f"Producto {row.sku} no encontrado")

                if row.has_existing_carga:
                    # Find and reverse old carga_inicial for this product+bodega
                    old_mov = (
                        db.query(MovimientoInventario)
                        .filter(
                            MovimientoInventario.producto_id == row.producto_id,
                            MovimientoInventario.motivo == "carga_inicial",
                            MovimientoInventario.referencia_tipo == "bodega",
                            MovimientoInventario.referencia_id == row.bodega_id,
                        )
                        .order_by(MovimientoInventario.created_at.desc())
                        .first()
                    )
                    if old_mov:
                        # Reverse old movement
                        producto.stock_actual -= old_mov.signo * old_mov.cantidad
                        db.delete(old_mov)

                # Apply new stock
                producto.stock_actual += row.cantidad
                db.add(producto)

                nota = f"Bodega: {row.nombre_bodega}"
                if row.costo_unitario is not None:
                    nota += f" | Costo unitario: {row.costo_unitario}"

                mov = MovimientoInventario(
                    producto_id=row.producto_id,
                    tipo="entrada",
                    cantidad=row.cantidad,
                    signo=1,
                    referencia_tipo="bodega",
                    referencia_id=row.bodega_id,
                    motivo="carga_inicial",
                    nota=nota,
                    usuario_id=current_user.id,
                    created_at=now,
                )
                db.add(mov)
                db.flush()

                if row.has_existing_carga:
                    updated_count += 1
                    action = "updated"
                else:
                    created_count += 1
                    action = "created"

                report_rows.append({
                    "row_num": row.row_num,
                    "sku": row.sku,
                    "nombre_bodega": row.nombre_bodega,
                    "cantidad": row.cantidad,
                    "status": action,
                    "errors": [],
                })

            except Exception as e:
                error_count += 1
                report_rows.append({
                    "row_num": row.row_num,
                    "sku": row.sku,
                    "nombre_bodega": row.nombre_bodega,
                    "cantidad": row.cantidad,
                    "status": "error",
                    "errors": [str(e)],
                })

        for row in parse_result.invalid_rows:
            error_count += 1
            report_rows.append({
                "row_num": row.row_num,
                "sku": row.sku,
                "nombre_bodega": row.nombre_bodega,
                "cantidad": None,
                "status": "error",
                "errors": row.errors,
            })

        overall_status = (
            "success" if error_count == 0
            else "partial" if (created_count + updated_count) > 0
            else "error"
        )

        report_payload = {
            "created_count": created_count,
            "updated_count": updated_count,
            "error_count": error_count,
            "total_rows": len(report_rows),
            "rows": report_rows,
        }

        import_report = ImportReport(
            import_id=import_id,
            status=overall_status,
            created_count=created_count,
            updated_count=updated_count,
            error_count=error_count,
            total_rows=len(report_rows),
            filename=file.filename,
            report_json=json.dumps(report_payload, ensure_ascii=False),
        )
        db.add(import_report)
        db.commit()

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
