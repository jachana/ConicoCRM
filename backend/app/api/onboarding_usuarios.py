"""
Onboarding Usuarios Import API

Endpoints for bulk-importing vendedores/usuarios during onboarding.
Handles template download, preview validation, and transactional import.

Endpoints:
  GET  /template  - Download Excel template
  POST /preview   - Validate and preview file (no DB writes)
  POST /import    - Execute transactional import (create or update users)
"""

import io
import json
import secrets
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.config import require_admin
from app.core.security import get_password_hash
from app.database import get_db
from app.models.import_report import ImportReport
from app.models.user import User
from app.services.usuarios_parser import UsuariosParser, ParseError

router = APIRouter()


# ============================================================================
# GET /template
# ============================================================================

@router.get("/template")
def get_template(
    perms: tuple[User, Session] = Depends(require_admin),
):
    """
    Download usuarios import Excel template.

    Returns Excel file with headers, documentation row, and example row.
    """
    try:
        template_bytes = UsuariosParser.generate_template()

        return StreamingResponse(
            io.BytesIO(template_bytes),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=plantilla_usuarios.xlsx"},
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generando plantilla: {str(e)}",
        )


# ============================================================================
# POST /preview
# ============================================================================

@router.post("/preview", status_code=status.HTTP_200_OK)
async def preview_import(
    file: UploadFile,
    perms: tuple[User, Session] = Depends(require_admin),
):
    """
    Preview and validate usuarios import file without persisting data.

    Returns counts and per-row validation status.
    """
    _, db = perms

    try:
        content = await file.read()
        if not content:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El archivo está vacío",
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error leyendo archivo: {str(e)}",
        )

    # Collect existing emails from DB for new/update counts
    existing_emails: set[str] = set()
    try:
        existing_emails = {
            u.email.lower()
            for u in db.query(User).filter(User.email.isnot(None)).all()
        }
    except Exception:
        pass

    try:
        result = UsuariosParser.parse(
            content,
            file.filename or "usuarios.xlsx",
            existing_emails,
        )
    except ParseError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        )

    rows = []

    for parsed_row in result.valid_rows:
        rows.append({
            "row_num": parsed_row.row_num,
            "email": parsed_row.email,
            "nombre": parsed_row.nombre,
            "rol": parsed_row.rol,
            "status": "valid",
            "errors": [],
        })

    for invalid_row in result.invalid_rows:
        rows.append({
            "row_num": invalid_row.row_num,
            "email": invalid_row.email or "N/A",
            "nombre": "N/A",
            "rol": "N/A",
            "status": "invalid",
            "errors": invalid_row.errors,
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

@router.post("/import", status_code=status.HTTP_200_OK)
async def import_usuarios(
    file: UploadFile,
    idempotency_key: Optional[str] = None,
    perms: tuple[User, Session] = Depends(require_admin),
):
    """
    Execute transactional usuarios import.

    - New users (by email): created with a random temp password returned once.
    - Existing users (by email): name, role, is_active updated; password untouched.
    - Idempotent: re-running the same file with the same idempotency_key returns
      the cached report (temp passwords are NOT re-shown on subsequent calls).
    """
    _, db = perms

    try:
        content = await file.read()
        if not content:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El archivo está vacío",
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error leyendo archivo: {str(e)}",
        )

    import_id = idempotency_key or str(uuid.uuid4())

    # Idempotency check — return cached result if already processed
    existing_report = db.query(ImportReport).filter(
        ImportReport.import_id == import_id
    ).first()

    if existing_report:
        report_data = json.loads(existing_report.report_json or "{}")
        return {
            "status": existing_report.status,
            "import_id": existing_report.import_id,
            "timestamp": existing_report.created_at.isoformat(),
            "report": report_data,
        }

    # Collect existing users (email → User) for update vs create decision
    existing_users: dict[str, User] = {}
    try:
        for u in db.query(User).filter(User.email.isnot(None)).all():
            existing_users[u.email.lower()] = u
    except Exception:
        pass

    # Parse the file
    try:
        parse_result = UsuariosParser.parse(
            content,
            file.filename or "usuarios.xlsx",
            set(existing_users.keys()),
        )
    except ParseError as e:
        error_report = ImportReport(
            import_id=import_id,
            status="error",
            error_message=str(e),
            filename=file.filename,
            total_rows=0,
        )
        db.add(error_report)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        )

    # Execute import
    try:
        report_rows = []
        created_count = 0
        updated_count = 0
        error_count = 0

        for parsed_row in parse_result.valid_rows:
            try:
                email_lower = parsed_row.email.lower()
                if email_lower in existing_users:
                    # Update existing user
                    user = existing_users[email_lower]
                    user.name = parsed_row.nombre
                    user.role = parsed_row.rol
                    user.is_active = parsed_row.activo
                    db.add(user)
                    updated_count += 1
                    report_rows.append({
                        "row_num": parsed_row.row_num,
                        "email": parsed_row.email,
                        "nombre": parsed_row.nombre,
                        "rol": parsed_row.rol,
                        "status": "updated",
                        "errors": [],
                        "temp_password": None,
                    })
                else:
                    # Create new user with random temp password
                    temp_password = secrets.token_urlsafe(8)
                    new_user = User(
                        email=email_lower,
                        name=parsed_row.nombre,
                        hashed_password=get_password_hash(temp_password),
                        role=parsed_row.rol,
                        is_active=parsed_row.activo,
                    )
                    db.add(new_user)
                    db.flush()  # Populate new_user.id
                    existing_users[email_lower] = new_user
                    created_count += 1
                    report_rows.append({
                        "row_num": parsed_row.row_num,
                        "email": parsed_row.email,
                        "nombre": parsed_row.nombre,
                        "rol": parsed_row.rol,
                        "status": "created",
                        "errors": [],
                        "temp_password": temp_password,
                    })

            except Exception as e:
                error_count += 1
                report_rows.append({
                    "row_num": parsed_row.row_num,
                    "email": parsed_row.email,
                    "nombre": parsed_row.nombre,
                    "rol": parsed_row.rol,
                    "status": "error",
                    "errors": [str(e)],
                    "temp_password": None,
                })

        # Add invalid rows from parse phase
        for invalid_row in parse_result.invalid_rows:
            error_count += 1
            report_rows.append({
                "row_num": invalid_row.row_num,
                "email": invalid_row.email or "N/A",
                "nombre": "N/A",
                "rol": "N/A",
                "status": "error",
                "errors": invalid_row.errors,
                "temp_password": None,
            })

        # Determine overall status
        if error_count == 0:
            overall_status = "success"
        elif created_count > 0 or updated_count > 0:
            overall_status = "partial"
        else:
            overall_status = "error"

        # Build report payload — strip temp_password before caching to avoid re-showing
        cached_rows = []
        for row in report_rows:
            cached_row = dict(row)
            # Don't cache temp passwords — they should only be shown once
            if cached_row.get("status") == "created":
                cached_row["temp_password"] = None
                if not cached_row.get("errors"):
                    cached_row["errors"] = []
                # Add a note to errors list explaining passwords aren't re-shown
                cached_row["note"] = "Contraseña temporal no disponible en reportes posteriores"
            cached_rows.append(cached_row)

        report_payload = {
            "created_count": created_count,
            "updated_count": updated_count,
            "error_count": error_count,
            "total_rows": len(report_rows),
            "rows": cached_rows,
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
        # Single atomic commit: user rows + ImportReport together so the
        # idempotency key is never lost on a crash between two commits.
        db.commit()

        # Return original report_rows (with temp passwords for created rows)
        return {
            "status": overall_status,
            "import_id": import_id,
            "timestamp": import_report.created_at.isoformat(),
            "report": {
                "created_count": created_count,
                "updated_count": updated_count,
                "error_count": error_count,
                "total_rows": len(report_rows),
                "rows": report_rows,
            },
        }

    except Exception as e:
        db.rollback()
        error_report = ImportReport(
            import_id=import_id,
            status="error",
            error_message=f"Transaction error: {str(e)}",
            filename=file.filename,
            total_rows=0,
        )
        db.add(error_report)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Import error: {str(e)}",
        )
