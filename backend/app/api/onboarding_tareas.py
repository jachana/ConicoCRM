"""
Onboarding Tareas/Actividades Import API

Endpoints:
  GET  /template  - Download single-sheet Excel template
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
from app.models.import_report import ImportReport
from app.models.tarea import Tarea
from app.models.user import User
from app.services.tareas_parser import TareasParser, ParseError

router = APIRouter()


# ============================================================================
# DB lookup helpers
# ============================================================================

def _get_existing_dedup_keys(db: Session) -> set[str]:
    rows = (
        db.query(Tarea.dedup_key)
        .filter(Tarea.estado == "pendiente", Tarea.dedup_key.isnot(None))
        .all()
    )
    return {r[0] for r in rows if r[0]}


def _get_clientes_by_rut(db: Session) -> dict[str, int]:
    rows = db.query(Cliente.rut, Cliente.id).filter(Cliente.rut.isnot(None)).all()
    return {r[0]: r[1] for r in rows if r[0]}


def _get_users_by_email(db: Session) -> dict[str, int]:
    rows = db.query(User.email, User.id).all()
    return {r[0]: r[1] for r in rows if r[0]}


def _tarea_row_to_dict(row) -> dict:
    return {
        "descripcion": row.descripcion,
        "titulo": row.titulo,
        "due_date": row.due_date.isoformat() if row.due_date else None,
        "tipo": row.tipo,
        "rut_cliente": row.rut_cliente,
        "asignado_email": row.asignado_email,
        "estado": row.estado,
        "prioridad": row.prioridad,
        "dedup_key": row.dedup_key,
        "status": row.status,
        "row_num": row.row_num,
    }


def _invalid_row_to_dict(row) -> dict:
    return {
        "row_num": row.row_num,
        "descripcion": row.descripcion_raw,
        "motivo": row.motivo,
    }


# ============================================================================
# GET /template
# ============================================================================

@router.get("/template")
def get_template(perms: tuple[User, Session] = Depends(require_admin)):
    try:
        template_bytes = TareasParser.generate_template()
        return StreamingResponse(
            io.BytesIO(template_bytes),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=plantilla_tareas.xlsx"},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generando plantilla: {e}")


# ============================================================================
# POST /preview
# ============================================================================

@router.post("/preview")
async def preview_tareas(
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

    existing_dedup_keys = _get_existing_dedup_keys(db)

    try:
        result = TareasParser.parse(content, file.filename or "tareas.xlsx", existing_dedup_keys)
    except ParseError as e:
        raise HTTPException(status_code=422, detail=str(e))

    clientes_by_rut = _get_clientes_by_rut(db)
    users_by_email = _get_users_by_email(db)

    valid_out = []
    sin_cliente = 0
    asignado_fallback = 0

    for row in result.valid_rows:
        r = _tarea_row_to_dict(row)

        # Annotate cliente lookup
        if row.rut_cliente:
            r["cliente_encontrado"] = row.rut_cliente in clientes_by_rut
            if not clientes_by_rut.get(row.rut_cliente):
                sin_cliente += 1
        else:
            r["cliente_encontrado"] = None

        # Annotate asignado lookup
        if row.asignado_email:
            r["asignado_encontrado"] = row.asignado_email in users_by_email
            if row.asignado_email not in users_by_email:
                asignado_fallback += 1
        else:
            r["asignado_encontrado"] = None
            asignado_fallback += 1

        valid_out.append(r)

    return {
        "valid": valid_out,
        "invalid": [_invalid_row_to_dict(r) for r in result.invalid_rows],
        "a_crear": result.a_crear,
        "a_omitir": result.a_omitir,
        "invalid_count": len(result.invalid_rows),
        "sin_cliente": sin_cliente,
        "asignado_fallback": asignado_fallback,
    }


# ============================================================================
# POST /import
# ============================================================================

@router.post("/import")
async def import_tareas(
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

    existing_dedup_keys = _get_existing_dedup_keys(db)

    try:
        parse_result = TareasParser.parse(
            content, file.filename or "tareas.xlsx", existing_dedup_keys
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
        clientes_by_rut = _get_clientes_by_rut(db)
        users_by_email = _get_users_by_email(db)

        dedup_seen: set[str] = set(existing_dedup_keys)
        created_count = 0
        omitted_count = 0
        error_count = len(parse_result.invalid_rows)
        report_rows = []

        for row in parse_result.valid_rows:
            r_dict = _tarea_row_to_dict(row)

            if row.status == "omitir":
                omitted_count += 1
                report_rows.append({**r_dict, "import_status": "omitido"})
                continue

            if row.dedup_key in dedup_seen:
                omitted_count += 1
                report_rows.append({**r_dict, "import_status": "omitido"})
                continue

            # Resolve cliente
            cliente_id: Optional[int] = None
            sin_cliente = False
            if row.rut_cliente:
                cliente_id = clientes_by_rut.get(row.rut_cliente)
                if cliente_id is None:
                    sin_cliente = True

            # Resolve asignado — fallback to current_user (admin)
            asignado_id: int = current_user.id
            asignado_fallback = False
            if row.asignado_email:
                found_id = users_by_email.get(row.asignado_email)
                if found_id is not None:
                    asignado_id = found_id
                else:
                    asignado_fallback = True
            else:
                asignado_fallback = True

            tarea = Tarea(
                titulo=row.titulo,
                descripcion=row.descripcion,
                due_date=row.due_date,
                estado=row.estado,
                origen="importado",
                tipo_regla=row.tipo,
                dedup_key=row.dedup_key,
                asignado_id=asignado_id,
                creado_por_id=current_user.id,
                cliente_id=cliente_id,
            )
            db.add(tarea)
            db.flush()

            dedup_seen.add(row.dedup_key)
            created_count += 1

            import_status = "creado"
            if sin_cliente:
                import_status = "creado_sin_cliente"
            elif asignado_fallback:
                import_status = "creado_asignado_fallback"

            report_rows.append({
                **r_dict,
                "import_status": import_status,
                "tarea_id": tarea.id,
                "asignado_id": asignado_id,
                "cliente_id": cliente_id,
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
            "total_rows": len(parse_result.valid_rows) + len(parse_result.invalid_rows),
            "rows": report_rows,
        }

        import_report = ImportReport(
            import_id=import_id,
            status=overall_status,
            created_count=created_count,
            error_count=error_count,
            total_rows=len(parse_result.valid_rows) + len(parse_result.invalid_rows),
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
