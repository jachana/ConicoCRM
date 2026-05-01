"""
Onboarding Clientes & Empresas Import API

Endpoints for importing client and company data during onboarding.
Handles template download, preview validation, and transactional import.

Endpoints:
  GET  /template         - Download Excel template
  POST /preview          - Validate and preview file
  POST /import           - Execute transactional import
  GET  /imports/{id}     - Retrieve import report
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
from app.models.cliente import Cliente
from app.models.empresa import Empresa
from app.models.import_report import ImportReport
from app.models.user import User
from app.services.clientes_empresas_parser import ClientesEmpresasParser, ParseError
from app.utils.rut import clean_rut

router = APIRouter()


# ============================================================================
# Schemas / Response Models
# ============================================================================

class RowOut:
    """Single row in preview/report."""
    def __init__(
        self,
        row_num: int,
        rut_empresa: str,
        nombre_empresa: str,
        rut_cliente: str,
        nombre_cliente: str,
        status: str,
        errors: Optional[list[str]] = None,
    ):
        self.row_num = row_num
        self.rut_empresa = rut_empresa
        self.nombre_empresa = nombre_empresa
        self.rut_cliente = rut_cliente
        self.nombre_cliente = nombre_cliente
        self.status = status
        self.errors = errors or []

    def to_dict(self) -> dict:
        return {
            "row_num": self.row_num,
            "rut_empresa": self.rut_empresa,
            "nombre_empresa": self.nombre_empresa,
            "rut_cliente": self.rut_cliente,
            "nombre_cliente": self.nombre_cliente,
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
    Download clientes + empresas import Excel template.

    Returns Excel file with:
    - Headers: rut_empresa, nombre_empresa, razon_social, sector, email_empresa,
               rut_cliente, nombre_cliente, email_cliente, telefono_cliente,
               direccion_despacho, forma_pago
    - Documentation row explaining each column
    - Example data row
    """
    try:
        template = ClientesEmpresasParser.generate_template()

        return FileResponse(
            io.BytesIO(template),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            filename="plantilla_clientes_empresas.xlsx",
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
    Preview and validate clientes + empresas import file without persisting data.

    Returns:
    {
        "total_filas": int,
        "filas_validas": int,
        "filas_invalidas": int,
        "a_crear": {
            "empresas": int,
            "clientes": int
        },
        "a_actualizar": {
            "empresas": int,
            "clientes": int
        },
        "rows": [
            {
                "row_num": int,
                "rut_empresa": str,
                "nombre_empresa": str,
                "rut_cliente": str,
                "nombre_cliente": str,
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

    # Get existing RUTs for count estimation
    existing_empresa_ruts = set()
    existing_cliente_ruts = set()

    try:
        existing_empresa_ruts = {clean_rut(emp.rut) for emp in db.query(Empresa).filter(Empresa.rut.isnot(None)).all()}
        existing_cliente_ruts = {clean_rut(cli.rut) for cli in db.query(Cliente).filter(Cliente.rut.isnot(None)).all()}
    except Exception:
        pass  # If query fails, continue without existing sets

    # Parse file
    try:
        result = ClientesEmpresasParser.parse(
            content,
            file.filename or "clientes_empresas.xlsx",
            existing_empresa_ruts,
            existing_cliente_ruts,
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
        rows.append(RowOut(
            row_num=parsed_row.row_num,
            rut_empresa=parsed_row.rut_empresa,
            nombre_empresa=parsed_row.nombre_empresa,
            rut_cliente=parsed_row.rut_cliente,
            nombre_cliente=parsed_row.nombre_cliente,
            status="valid",
            errors=[],
        ).to_dict())

    # Invalid rows
    for invalid_row in result.invalid_rows:
        rows.append(RowOut(
            row_num=invalid_row.row_num,
            rut_empresa=invalid_row.rut_empresa or "N/A",
            nombre_empresa="N/A",
            rut_cliente=invalid_row.rut_cliente or "N/A",
            nombre_cliente="N/A",
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
    Execute transactional clientes + empresas import.

    Atomicity: On fatal error (bad format, DB constraint), entire import
    is rolled back. On row-level errors (invalid RUT, duplicate),
    error is recorded per row and import continues.

    Returns:
    {
        "status": "success" | "partial" | "error",
        "import_id": str (UUID),
        "timestamp": str (ISO 8601),
        "report": {
            "created_count": int (empresas + clientes created),
            "updated_count": int (empresas + clientes updated),
            "error_count": int,
            "total_rows": int,
            "rows": [
                {
                    "row_num": int,
                    "rut_empresa": str,
                    "nombre_empresa": str,
                    "rut_cliente": str,
                    "nombre_cliente": str,
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

    # Get existing RUTs for comparison
    existing_empresa_ruts = {}  # rut -> empresa
    existing_cliente_ruts = {}  # rut -> cliente

    try:
        for emp in db.query(Empresa).filter(Empresa.rut.isnot(None)).all():
            existing_empresa_ruts[clean_rut(emp.rut)] = emp
        for cli in db.query(Cliente).filter(Cliente.rut.isnot(None)).all():
            existing_cliente_ruts[clean_rut(cli.rut)] = cli
    except Exception:
        pass  # If query fails, continue

    # Parse file
    try:
        parse_result = ClientesEmpresasParser.parse(
            content,
            file.filename or "clientes_empresas.xlsx",
            set(existing_empresa_ruts.keys()),
            set(existing_cliente_ruts.keys()),
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
        created_count = 0
        updated_count = 0
        error_count = 0

        for parsed_row in parse_result.valid_rows:
            try:
                clean_rut_empresa = clean_rut(parsed_row.rut_empresa)
                clean_rut_cliente = clean_rut(parsed_row.rut_cliente)
                row_status = None
                row_errors = []

                # Process empresa
                try:
                    if clean_rut_empresa in existing_empresa_ruts:
                        # Update existing empresa
                        empresa = existing_empresa_ruts[clean_rut_empresa]
                        empresa.nombre = parsed_row.nombre_empresa
                        if parsed_row.razon_social:
                            empresa.razon_social = parsed_row.razon_social
                        if parsed_row.sector:
                            empresa.sector = parsed_row.sector
                        if parsed_row.email_empresa:
                            empresa.email = parsed_row.email_empresa
                        db.add(empresa)
                        row_status = "updated"
                        updated_count += 1
                    else:
                        # Create new empresa
                        empresa = Empresa(
                            rut=clean_rut_empresa,
                            nombre=parsed_row.nombre_empresa,
                            razon_social=parsed_row.razon_social,
                            sector=parsed_row.sector,
                            email=parsed_row.email_empresa,
                        )
                        db.add(empresa)
                        db.flush()  # Flush to get the ID
                        existing_empresa_ruts[clean_rut_empresa] = empresa
                        row_status = "created"
                        created_count += 1
                except Exception as e:
                    row_errors.append(f"Error empresa: {str(e)}")
                    row_status = "error"
                    error_count += 1
                    empresa = None

                # Process cliente
                if not row_errors:  # Only if empresa succeeded
                    try:
                        empresa = existing_empresa_ruts.get(clean_rut_empresa)

                        if clean_rut_cliente in existing_cliente_ruts:
                            # Update existing cliente
                            cliente = existing_cliente_ruts[clean_rut_cliente]
                            cliente.nombre = parsed_row.nombre_cliente
                            if parsed_row.email_cliente:
                                cliente.email = parsed_row.email_cliente
                            if parsed_row.telefono_cliente:
                                cliente.telefono = parsed_row.telefono_cliente
                            if parsed_row.direccion_despacho:
                                cliente.direccion_despacho = parsed_row.direccion_despacho
                            if parsed_row.forma_pago:
                                cliente.forma_pago = parsed_row.forma_pago
                            cliente.empresa_id = empresa.id if empresa else None
                            db.add(cliente)
                            if row_status != "created":  # Don't double-count
                                updated_count += 1
                        else:
                            # Create new cliente
                            cliente = Cliente(
                                rut=clean_rut_cliente,
                                nombre=parsed_row.nombre_cliente,
                                email=parsed_row.email_cliente,
                                telefono=parsed_row.telefono_cliente,
                                direccion_despacho=parsed_row.direccion_despacho,
                                forma_pago=parsed_row.forma_pago,
                                empresa_id=empresa.id if empresa else None,
                            )
                            db.add(cliente)
                            db.flush()
                            existing_cliente_ruts[clean_rut_cliente] = cliente
                            if row_status == "created":
                                pass  # Already counted in empresas
                            else:
                                created_count += 1
                    except Exception as e:
                        row_errors.append(f"Error cliente: {str(e)}")
                        row_status = "error"
                        error_count += 1

                # Build row report
                report_rows.append(RowOut(
                    row_num=parsed_row.row_num,
                    rut_empresa=parsed_row.rut_empresa,
                    nombre_empresa=parsed_row.nombre_empresa,
                    rut_cliente=parsed_row.rut_cliente,
                    nombre_cliente=parsed_row.nombre_cliente,
                    status=row_status or "error",
                    errors=row_errors,
                ).to_dict())

            except Exception as e:
                # Row-level error - record and continue
                error_count += 1
                report_rows.append(RowOut(
                    row_num=parsed_row.row_num,
                    rut_empresa=parsed_row.rut_empresa,
                    nombre_empresa=parsed_row.nombre_empresa,
                    rut_cliente=parsed_row.rut_cliente,
                    nombre_cliente=parsed_row.nombre_cliente,
                    status="error",
                    errors=[str(e)],
                ).to_dict())

        # Add invalid rows to report
        for invalid_row in parse_result.invalid_rows:
            error_count += 1
            report_rows.append(RowOut(
                row_num=invalid_row.row_num,
                rut_empresa=invalid_row.rut_empresa or "N/A",
                nombre_empresa="N/A",
                rut_cliente=invalid_row.rut_cliente or "N/A",
                nombre_cliente="N/A",
                status="invalid",
                errors=invalid_row.errors,
            ).to_dict())

        # Determine overall status
        if error_count == 0:
            overall_status = "success"
        elif created_count > 0 or updated_count > 0:
            overall_status = "partial"
        else:
            overall_status = "error"

        # Commit transaction
        db.commit()

        # Create and save import report
        import_report = ImportReport(
            import_id=import_id,
            status=overall_status,
            created_count=created_count,
            updated_count=updated_count,
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
                "created_count": created_count,
                "updated_count": updated_count,
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

    return {
        "status": report.status,
        "import_id": report.import_id,
        "timestamp": report.created_at.isoformat(),
        "report": {
            "created_count": report.created_count,
            "updated_count": report.updated_count,
            "error_count": report.error_count,
            "total_rows": report.total_rows,
            "rows": report_data,
        },
    }
