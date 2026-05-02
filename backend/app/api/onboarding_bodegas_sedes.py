"""
Onboarding Bodegas & SedeDespacho Import API

Endpoints for importing warehouse (bodega) and dispatch site (sede_despacho) data during onboarding.
Handles template download, preview validation, and transactional import.

Endpoints:
  GET  /template         - Download Excel template
  POST /preview          - Validate and preview file
  POST /import           - Execute transactional import
"""

import io
import json
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.api.config import require_admin
from app.database import get_db
from app.models.bodega import Bodega
from app.models.empresa import Empresa
from app.models.sede_despacho import SedeDespacho
from app.models.import_report import ImportReport
from app.models.user import User
from app.services.bodegas_sedes_parser import BodegasSedesParser, ParseError
from app.utils.rut import clean_rut

router = APIRouter()


# ============================================================================
# Schemas / Response Models
# ============================================================================

class BodegaRowOut:
    """Single bodega row in preview/report."""
    def __init__(
        self,
        row_num: int,
        empresa_rut: str,
        bodega_nombre: str,
        bodega_direccion: Optional[str],
        status: str,
        errors: Optional[list[str]] = None,
    ):
        self.row_num = row_num
        self.empresa_rut = empresa_rut
        self.bodega_nombre = bodega_nombre
        self.bodega_direccion = bodega_direccion
        self.status = status
        self.errors = errors or []

    def to_dict(self) -> dict:
        return {
            "row_num": self.row_num,
            "empresa_rut": self.empresa_rut,
            "bodega_nombre": self.bodega_nombre,
            "bodega_direccion": self.bodega_direccion,
            "status": self.status,
            "errors": self.errors,
        }


class SedeRowOut:
    """Single sede row in preview/report."""
    def __init__(
        self,
        row_num: int,
        empresa_rut: str,
        sede_nombre: str,
        sede_direccion: str,
        status: str,
        errors: Optional[list[str]] = None,
    ):
        self.row_num = row_num
        self.empresa_rut = empresa_rut
        self.sede_nombre = sede_nombre
        self.sede_direccion = sede_direccion
        self.status = status
        self.errors = errors or []

    def to_dict(self) -> dict:
        return {
            "row_num": self.row_num,
            "empresa_rut": self.empresa_rut,
            "sede_nombre": self.sede_nombre,
            "sede_direccion": self.sede_direccion,
            "status": self.status,
            "errors": self.errors,
        }


class CombinedRowOut:
    """Combined row with both bodega and sede data."""
    def __init__(
        self,
        row_num: int,
        empresa_rut: str,
        bodega_nombre: str,
        bodega_direccion: Optional[str],
        sede_nombre: str,
        sede_direccion: str,
        status: str,
        errors: Optional[list[str]] = None,
    ):
        self.row_num = row_num
        self.empresa_rut = empresa_rut
        self.bodega_nombre = bodega_nombre
        self.bodega_direccion = bodega_direccion
        self.sede_nombre = sede_nombre
        self.sede_direccion = sede_direccion
        self.status = status
        self.errors = errors or []

    def to_dict(self) -> dict:
        return {
            "row_num": self.row_num,
            "empresa_rut": self.empresa_rut,
            "bodega_nombre": self.bodega_nombre,
            "bodega_direccion": self.bodega_direccion,
            "sede_nombre": self.sede_nombre,
            "sede_direccion": self.sede_direccion,
            "status": self.status,
            "errors": self.errors,
        }


# ============================================================================
# GET /template
# ============================================================================

@router.get("/template")
def get_template(
    perms: tuple[User, Session] = Depends(require_admin),
):
    """
    Download bodegas + sedes import Excel template.

    Returns Excel file with:
    - Headers: empresa_rut, bodega_nombre, bodega_direccion, sede_nombre, sede_direccion
    - Documentation row explaining each column
    - Example data row
    """
    try:
        template = BodegasSedesParser.generate_template()

        return FileResponse(
            io.BytesIO(template),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            filename="plantilla_bodegas_sedes.xlsx",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generating template: {str(e)}",
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
    Preview and validate bodegas + sedes import file without persisting data.

    Returns:
    {
        "total_filas": int,
        "filas_validas": int,
        "filas_invalidas": int,
        "a_crear": {
            "bodegas": int,
            "sedes": int
        },
        "a_actualizar": {
            "bodegas": int,
            "sedes": int
        },
        "rows": [
            {
                "row_num": int,
                "empresa_rut": str,
                "bodega_nombre": str,
                "bodega_direccion": str,
                "sede_nombre": str,
                "sede_direccion": str,
                "status": "valid" | "invalid",
                "errors": [str] (only if invalid)
            }
        ]
    }
    """
    _, db = perms

    # Read file
    try:
        content = await file.read()
        if not content:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El archivo está vacío",
            )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error leyendo archivo: {str(e)}",
        )

    # Get existing records for count estimation
    existing_empresas = {}  # rut -> empresa
    existing_bodegas = {}  # (empresa_id, nombre) -> bodega
    existing_sedes = {}  # (empresa_id, nombre) -> sede

    try:
        for emp in db.query(Empresa).filter(Empresa.rut.isnot(None)).all():
            existing_empresas[clean_rut(emp.rut)] = emp

        for bodega in db.query(Bodega).all():
            key = (bodega.empresa_id, bodega.nombre)
            existing_bodegas[key] = bodega

        for sede in db.query(SedeDespacho).all():
            key = (sede.empresa_id, sede.nombre)
            existing_sedes[key] = sede
    except Exception:
        pass  # If query fails, continue without existing sets

    # Parse file
    try:
        result = BodegasSedesParser.parse(
            content,
            file.filename or "bodegas_sedes.xlsx",
            existing_empresas,
            existing_bodegas,
            existing_sedes,
        )
    except ParseError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        )

    # Build response
    rows = []

    # Valid rows
    for parsed_row in result.valid_rows:
        rows.append(CombinedRowOut(
            row_num=parsed_row.row_num,
            empresa_rut=parsed_row.empresa_rut,
            bodega_nombre=parsed_row.bodega_nombre,
            bodega_direccion=parsed_row.bodega_direccion,
            sede_nombre=parsed_row.sede_nombre,
            sede_direccion=parsed_row.sede_direccion,
            status="valid",
            errors=[],
        ).to_dict())

    # Invalid rows
    for invalid_row in result.invalid_rows:
        rows.append(CombinedRowOut(
            row_num=invalid_row.row_num,
            empresa_rut=invalid_row.empresa_rut or "N/A",
            bodega_nombre=invalid_row.bodega_nombre or "N/A",
            bodega_direccion=invalid_row.bodega_direccion,
            sede_nombre=invalid_row.sede_nombre or "N/A",
            sede_direccion=invalid_row.sede_direccion or "N/A",
            status="invalid",
            errors=invalid_row.errors,
        ).to_dict())

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
async def import_data(
    file: UploadFile,
    idempotency_key: Optional[str] = None,
    perms: tuple[User, Session] = Depends(require_admin),
):
    """
    Execute transactional bodegas + sedes import.

    Atomicity: On fatal error (bad format, DB constraint), entire import
    is rolled back. On row-level errors (invalid RUT, duplicate),
    error is recorded per row and import continues.

    Returns:
    {
        "status": "success" | "partial" | "error",
        "import_id": str (UUID),
        "timestamp": str (ISO 8601),
        "report": {
            "created_bodega_count": int,
            "updated_bodega_count": int,
            "created_sede_count": int,
            "updated_sede_count": int,
            "error_count": int,
            "total_rows": int,
            "rows": [
                {
                    "row_num": int,
                    "empresa_rut": str,
                    "bodega_nombre": str,
                    "bodega_direccion": str,
                    "sede_nombre": str,
                    "sede_direccion": str,
                    "status": "created" | "updated" | "error",
                    "errors": [str]
                }
            ]
        }
    }
    """
    _, db = perms

    # Read file
    try:
        content = await file.read()
        if not content:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El archivo está vacío",
            )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error leyendo archivo: {str(e)}",
        )

    # Generate import ID
    import_id = idempotency_key or str(uuid.uuid4())

    # Check if import already exists (idempotency)
    existing_report = db.query(ImportReport).filter(
        ImportReport.import_id == import_id
    ).first()

    if existing_report:
        # Return cached result
        report_data = json.loads(existing_report.report_json or "{}")
        return {
            "status": existing_report.status,
            "import_id": existing_report.import_id,
            "timestamp": existing_report.created_at.isoformat(),
            "report": report_data,
        }

    # Get existing records for matching
    existing_empresas = {}  # rut -> empresa
    existing_bodegas = {}  # (empresa_id, nombre) -> bodega
    existing_sedes = {}  # (empresa_id, nombre) -> sede

    try:
        for emp in db.query(Empresa).filter(Empresa.rut.isnot(None)).all():
            existing_empresas[clean_rut(emp.rut)] = emp

        for bodega in db.query(Bodega).all():
            key = (bodega.empresa_id, bodega.nombre)
            existing_bodegas[key] = bodega

        for sede in db.query(SedeDespacho).all():
            key = (sede.empresa_id, sede.nombre)
            existing_sedes[key] = sede
    except Exception:
        pass  # If query fails, continue

    # Parse file
    try:
        parse_result = BodegasSedesParser.parse(
            content,
            file.filename or "bodegas_sedes.xlsx",
            existing_empresas,
            existing_bodegas,
            existing_sedes,
        )
    except ParseError as e:
        # Fatal error - create error report
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

    # Execute import in transaction
    try:
        report_rows = []
        created_bodega_count = 0
        updated_bodega_count = 0
        created_sede_count = 0
        updated_sede_count = 0
        error_count = 0

        for parsed_row in parse_result.valid_rows:
            try:
                clean_rut_empresa = clean_rut(parsed_row.empresa_rut)
                row_status = None
                row_errors = []

                # Get or find empresa
                empresa = existing_empresas.get(clean_rut_empresa)
                if not empresa:
                    row_errors.append(f"Empresa con RUT {clean_rut_empresa} no encontrada")
                    row_status = "error"
                    error_count += 1
                else:
                    # Process bodega
                    try:
                        bodega_key = (empresa.id, parsed_row.bodega_nombre)
                        if bodega_key in existing_bodegas:
                            # Update existing bodega
                            bodega = existing_bodegas[bodega_key]
                            if parsed_row.bodega_direccion:
                                bodega.direccion = parsed_row.bodega_direccion
                            db.add(bodega)
                            row_status = "updated"
                            updated_bodega_count += 1
                        else:
                            # Create new bodega
                            bodega = Bodega(
                                empresa_id=empresa.id,
                                nombre=parsed_row.bodega_nombre,
                                direccion=parsed_row.bodega_direccion,
                            )
                            db.add(bodega)
                            db.flush()  # Flush to get the ID
                            existing_bodegas[bodega_key] = bodega
                            row_status = "created"
                            created_bodega_count += 1
                    except Exception as e:
                        row_errors.append(f"Error bodega: {str(e)}")
                        row_status = "error"
                        error_count += 1

                    # Process sede (only if bodega succeeded)
                    if not row_errors:
                        try:
                            sede_key = (empresa.id, parsed_row.sede_nombre)
                            if sede_key in existing_sedes:
                                # Update existing sede
                                sede = existing_sedes[sede_key]
                                sede.direccion = parsed_row.sede_direccion
                                db.add(sede)
                                if row_status != "created":  # Don't double-count
                                    updated_sede_count += 1
                            else:
                                # Create new sede
                                sede = SedeDespacho(
                                    empresa_id=empresa.id,
                                    nombre=parsed_row.sede_nombre,
                                    direccion=parsed_row.sede_direccion,
                                )
                                db.add(sede)
                                db.flush()
                                existing_sedes[sede_key] = sede
                                if row_status == "created":
                                    pass  # Already counted in bodegas
                                else:
                                    created_sede_count += 1
                        except Exception as e:
                            row_errors.append(f"Error sede: {str(e)}")
                            row_status = "error"
                            error_count += 1

                # Build row report
                report_rows.append(CombinedRowOut(
                    row_num=parsed_row.row_num,
                    empresa_rut=parsed_row.empresa_rut,
                    bodega_nombre=parsed_row.bodega_nombre,
                    bodega_direccion=parsed_row.bodega_direccion,
                    sede_nombre=parsed_row.sede_nombre,
                    sede_direccion=parsed_row.sede_direccion,
                    status=row_status or "error",
                    errors=row_errors,
                ).to_dict())

            except Exception as e:
                # Row-level error - record and continue
                error_count += 1
                report_rows.append(CombinedRowOut(
                    row_num=parsed_row.row_num,
                    empresa_rut=parsed_row.empresa_rut,
                    bodega_nombre=parsed_row.bodega_nombre,
                    bodega_direccion=parsed_row.bodega_direccion,
                    sede_nombre=parsed_row.sede_nombre,
                    sede_direccion=parsed_row.sede_direccion,
                    status="error",
                    errors=[str(e)],
                ).to_dict())

        # Add invalid rows to report
        for invalid_row in parse_result.invalid_rows:
            error_count += 1
            report_rows.append(CombinedRowOut(
                row_num=invalid_row.row_num,
                empresa_rut=invalid_row.empresa_rut or "N/A",
                bodega_nombre=invalid_row.bodega_nombre or "N/A",
                bodega_direccion=invalid_row.bodega_direccion,
                sede_nombre=invalid_row.sede_nombre or "N/A",
                sede_direccion=invalid_row.sede_direccion or "N/A",
                status="error",
                errors=invalid_row.errors,
            ).to_dict())

        # Determine overall status
        if error_count == 0:
            overall_status = "success"
        elif created_bodega_count > 0 or updated_bodega_count > 0 or created_sede_count > 0 or updated_sede_count > 0:
            overall_status = "partial"
        else:
            overall_status = "error"

        # Commit transaction
        db.commit()

        # Create and save import report
        import_report = ImportReport(
            import_id=import_id,
            status=overall_status,
            created_count=created_bodega_count + created_sede_count,
            updated_count=updated_bodega_count + updated_sede_count,
            error_count=error_count,
            total_rows=len(report_rows),
            filename=file.filename,
            report_json=json.dumps(report_rows, ensure_ascii=False),
        )
        db.add(import_report)
        db.commit()

        return {
            "status": overall_status,
            "import_id": import_id,
            "timestamp": import_report.created_at.isoformat(),
            "report": {
                "created_bodega_count": created_bodega_count,
                "updated_bodega_count": updated_bodega_count,
                "created_sede_count": created_sede_count,
                "updated_sede_count": updated_sede_count,
                "error_count": error_count,
                "total_rows": len(report_rows),
                "rows": report_rows,
            },
        }

    except Exception as e:
        db.rollback()
        # Log transaction error but return as partial
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


# ============================================================================
# GET /imports/{import_id}
# ============================================================================

@router.get("/imports/{import_id}", status_code=status.HTTP_200_OK)
def get_import_report(
    import_id: str,
    perms: tuple[User, Session] = Depends(require_admin),
):
    """
    Retrieve import report by ID.
    """
    _, db = perms

    report = db.query(ImportReport).filter(
        ImportReport.import_id == import_id
    ).first()

    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Import report not found",
        )

    report_data = json.loads(report.report_json or "{}")

    # Extract bodega and sede counts from report rows
    # Each successful row creates/updates both a bodega AND a sede together
    created_bodega_count = 0
    updated_bodega_count = 0
    created_sede_count = 0
    updated_sede_count = 0

    for row in report_data:
        status_val = row.get("status")
        if status_val == "created":
            # Row created both bodega and sede
            created_bodega_count += 1
            created_sede_count += 1
        elif status_val == "updated":
            # Row updated both bodega and sede
            updated_bodega_count += 1
            updated_sede_count += 1
        # "error" status rows are not counted in any create/update totals

    return {
        "status": report.status,
        "import_id": report.import_id,
        "timestamp": report.created_at.isoformat(),
        "report": {
            "created_bodega_count": created_bodega_count,
            "updated_bodega_count": updated_bodega_count,
            "created_sede_count": created_sede_count,
            "updated_sede_count": updated_sede_count,
            "error_count": report.error_count,
            "total_rows": report.total_rows,
            "rows": report_data,
        },
    }
