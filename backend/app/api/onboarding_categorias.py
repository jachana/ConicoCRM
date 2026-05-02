"""
Onboarding Categorías Import API

Endpoints for bulk-importing product categories (TipoProducto) during onboarding.

Endpoints:
  GET  /template  - Download Excel template
  POST /preview   - Validate and preview file (no DB writes)
  POST /import    - Execute transactional import with idempotency
"""

import io
import json
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.config import require_admin
from app.models.import_report import ImportReport
from app.models.tipo_producto import TipoProducto
from app.models.user import User
from app.services.categorias_parser import CategoriasParser, ParseError

router = APIRouter()


def _get_existing_nombres(db: Session) -> set[str]:
    """Return set of lowercased TipoProducto.nombre values from DB."""
    rows = db.query(func.lower(TipoProducto.nombre)).all()
    return {r[0] for r in rows}


# ============================================================================
# GET /template
# ============================================================================

@router.get("/template")
def get_template(perms: tuple[User, Session] = Depends(require_admin)):
    try:
        template_bytes = CategoriasParser.generate_template()
        return StreamingResponse(
            io.BytesIO(template_bytes),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=plantilla_categorias.xlsx"},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generando plantilla: {e}")


# ============================================================================
# POST /preview
# ============================================================================

@router.post("/preview")
async def preview_categorias(
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

    existing_nombres = _get_existing_nombres(db)

    try:
        result = CategoriasParser.parse(
            content,
            file.filename or "categorias.xlsx",
            existing_nombres,
        )
    except ParseError as e:
        raise HTTPException(status_code=422, detail=str(e))

    rows = []
    for r in result.valid_rows:
        rows.append({
            "row_num": r.row_num,
            "nombre": r.nombre,
            "status": r.status,
            "errors": [],
        })
    for r in result.invalid_rows:
        rows.append({
            "row_num": r.row_num,
            "nombre": r.nombre_raw,
            "status": "error",
            "errors": [r.motivo],
        })

    total = len(result.valid_rows) + len(result.invalid_rows)
    return {
        "total_filas": total,
        "filas_validas": len(result.valid_rows),
        "filas_invalidas": len(result.invalid_rows),
        "a_crear": result.a_crear,
        "a_omitir": result.a_omitir,
        "rows": rows,
    }


# ============================================================================
# POST /import
# ============================================================================

@router.post("/import")
async def import_categorias(
    file: UploadFile,
    idempotency_key: Optional[str] = Query(default=None),
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

    existing_nombres = _get_existing_nombres(db)

    try:
        parse_result = CategoriasParser.parse(
            content,
            file.filename or "categorias.xlsx",
            existing_nombres,
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
        omitted_count = 0
        error_count = 0

        for row in parse_result.valid_rows:
            if row.status == "omitir":
                omitted_count += 1
                report_rows.append({
                    "row_num": row.row_num,
                    "nombre": row.nombre,
                    "status": "omitir",
                    "errors": [],
                })
                continue

            # status == "crear"
            try:
                # Case-insensitive check before creating (race-condition guard)
                existing = (
                    db.query(TipoProducto)
                    .filter(func.lower(TipoProducto.nombre) == row.nombre.lower())
                    .first()
                )
                if existing:
                    omitted_count += 1
                    report_rows.append({
                        "row_num": row.row_num,
                        "nombre": row.nombre,
                        "status": "omitir",
                        "errors": [],
                    })
                else:
                    nuevo = TipoProducto(nombre=row.nombre)
                    db.add(nuevo)
                    db.flush()
                    created_count += 1
                    report_rows.append({
                        "row_num": row.row_num,
                        "nombre": row.nombre,
                        "status": "crear",
                        "errors": [],
                    })
            except Exception as e:
                error_count += 1
                report_rows.append({
                    "row_num": row.row_num,
                    "nombre": row.nombre,
                    "status": "error",
                    "errors": [str(e)],
                })

        for row in parse_result.invalid_rows:
            error_count += 1
            report_rows.append({
                "row_num": row.row_num,
                "nombre": row.nombre_raw,
                "status": "error",
                "errors": [row.motivo],
            })

        overall_status = (
            "success" if error_count == 0
            else "partial" if (created_count + omitted_count) > 0
            else "error"
        )

        report_payload = {
            "created_count": created_count,
            "omitted_count": omitted_count,
            "error_count": error_count,
            "total_rows": len(report_rows),
            "rows": report_rows,
        }

        import_report = ImportReport(
            import_id=import_id,
            status=overall_status,
            created_count=created_count,
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
