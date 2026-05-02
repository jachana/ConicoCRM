"""
Onboarding Payment Import API

Endpoints for importing historical payment data during onboarding.
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
from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.api.config import require_admin
from app.database import get_db
from app.models.import_report import ImportReport
from app.models.pago_importado import PagoImportado
from app.models.user import User
from app.services.payment_parser import PaymentParser, ParseError
from app.services.payment_matcher import PaymentMatcher

router = APIRouter()


# ============================================================================
# Schemas / Response Models
# ============================================================================

class PaymentRowOut:
    """Single payment row in preview/report."""
    def __init__(
        self,
        row_num: int,
        rut_cliente: str,
        monto: Decimal,
        status: str,
        errors: Optional[list[str]] = None,
    ):
        self.row_num = row_num
        self.rut_cliente = rut_cliente
        self.monto = monto
        self.status = status
        self.errors = errors or []

    def to_dict(self) -> dict:
        return {
            "row_num": self.row_num,
            "rut_cliente": self.rut_cliente,
            "monto": str(self.monto),
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
    Download payment import Excel template.

    Returns Excel file with:
    - Headers: fecha_pago, rut_cliente, monto, medio_pago, referencia, folio_documento, tipo_documento
    - Documentation row explaining each column
    - Example data row
    """
    try:
        template = PaymentParser.generate_template()

        return FileResponse(
            io.BytesIO(template),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            filename="plantilla_pagos.xlsx",
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
async def preview_payment_import(
    file: UploadFile,
    perms: tuple[User, Session] = Depends(require_admin),
):
    """
    Preview and validate payment import file without persisting data.

    Returns:
    {
        "valid_count": int,
        "invalid_count": int,
        "rows": [
            {
                "row_num": int,
                "rut_cliente": str,
                "monto": str (Decimal as string),
                "status": "valid" | "invalid",
                "errors": [str] (only if invalid)
            }
        ],
        "estimated_impact": {
            "documents_matched": int,
            "on_account_payments": int
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

    # Parse file
    try:
        result = PaymentParser.parse(content, file.filename or "payments.xlsx")
    except ParseError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        )

    # Build response
    rows = []

    # Valid rows
    for parsed_payment in result.valid_rows:
        rows.append(PaymentRowOut(
            row_num=parsed_payment.fila,
            rut_cliente=parsed_payment.rut_cliente,
            monto=parsed_payment.monto,
            status="valid",
            errors=[],
        ).to_dict())

    # Invalid rows
    for invalid_row in result.invalid_rows:
        rows.append(PaymentRowOut(
            row_num=invalid_row.fila,
            rut_cliente=invalid_row.valores_raw.get("rut_cliente", "") or "N/A",
            monto=Decimal("0"),
            status="invalid",
            errors=[invalid_row.motivo],
        ).to_dict())

    # Estimate impact (quick scan without full matching)
    documents_matched_estimate = 0
    on_account_estimate = 0
    for parsed_payment in result.valid_rows:
        if parsed_payment.folio_documento and parsed_payment.tipo_documento:
            documents_matched_estimate += 1
        else:
            on_account_estimate += 1

    return {
        "valid_count": result.valid_count,
        "invalid_count": result.invalid_count,
        "rows": rows,
        "estimated_impact": {
            "documents_matched": documents_matched_estimate,
            "on_account_payments": on_account_estimate,
        }
    }


# ============================================================================
# POST /import
# ============================================================================

@router.post("/import", status_code=status.HTTP_200_OK)
async def import_payments(
    file: UploadFile,
    idempotency_key: Optional[str] = None,
    perms: tuple[User, Session] = Depends(require_admin),
):
    """
    Execute transactional payment import.

    Atomicity: On fatal error (bad format, DB constraint), entire import
    is rolled back. On row-level errors (document not found, overpayment),
    error is recorded per row and import continues.

    Returns:
    {
        "status": "success" | "partial" | "error",
        "import_id": str (UUID),
        "timestamp": str (ISO 8601),
        "report": {
            "created_count": int,
            "updated_count": int,
            "pending_count": int,
            "error_count": int,
            "rows": [
                {
                    "row_num": int,
                    "rut_cliente": str,
                    "monto": str,
                    "status": "created" | "updated" | "pending" | "error",
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

    # Parse file
    try:
        parse_result = PaymentParser.parse(content, file.filename or "payments.xlsx")
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
        # Start transaction
        report_rows = []
        created_count = 0
        updated_count = 0
        pending_count = 0
        error_count = 0

        matcher = PaymentMatcher(db)

        for parsed_payment in parse_result.valid_rows:
            try:
                # Create PagoImportado record
                pago = PagoImportado(
                    fecha_pago=parsed_payment.fecha_pago,
                    rut_cliente=parsed_payment.rut_cliente,
                    monto=parsed_payment.monto,
                    medio_pago=parsed_payment.medio_pago,
                    referencia=parsed_payment.referencia,
                    folio_documento=parsed_payment.folio_documento,
                    tipo_documento=parsed_payment.tipo_documento,
                    hash_key=parsed_payment.hash_key,
                    estado="pending",  # Will be updated by match_and_apply_payment
                )

                db.add(pago)
                db.flush()  # Flush to ensure hash_key constraint check

                # Try to match and apply payment
                success, message = matcher.match_and_apply_payment(pago)

                if success:
                    # Determine status based on pago estado
                    if pago.estado == "matched":
                        status_str = "created"
                        created_count += 1
                    elif pago.estado == "pending":
                        status_str = "pending"
                        pending_count += 1
                    else:
                        status_str = pago.estado
                else:
                    status_str = "error"
                    error_count += 1

                report_rows.append(PaymentRowOut(
                    row_num=parsed_payment.fila,
                    rut_cliente=parsed_payment.rut_cliente,
                    monto=parsed_payment.monto,
                    status=status_str,
                    errors=[message] if not success else [],
                ).to_dict())

            except Exception as e:
                # Row-level error - record and continue
                error_count += 1
                report_rows.append(PaymentRowOut(
                    row_num=parsed_payment.fila,
                    rut_cliente=parsed_payment.rut_cliente,
                    monto=parsed_payment.monto,
                    status="error",
                    errors=[str(e)],
                ).to_dict())

        # Add invalid rows to report
        for invalid_row in parse_result.invalid_rows:
            error_count += 1
            report_rows.append(PaymentRowOut(
                row_num=invalid_row.fila,
                rut_cliente=invalid_row.valores_raw.get("rut_cliente", "") or "N/A",
                monto=Decimal("0"),
                status="invalid",
                errors=[invalid_row.motivo],
            ).to_dict())

        # Determine overall status
        if error_count == 0:
            overall_status = "success"
        elif created_count > 0 or pending_count > 0:
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
            pending_count=pending_count,
            error_count=error_count,
            total_rows=len(report_rows),
            filename=file.filename,
            report_json=json.dumps(report_rows),
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
                "pending_count": pending_count,
                "error_count": error_count,
                "rows": report_rows,
            }
        }

    except Exception as e:
        # Fatal error - rollback transaction
        db.rollback()

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
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error durante importación: {str(e)}",
        )


# ============================================================================
# GET /imports/{import_id}/report
# ============================================================================

@router.get("/imports/{import_id}/report")
async def get_import_report(
    import_id: str,
    perms: tuple[User, Session] = Depends(require_admin),
):
    """
    Retrieve previously generated import report.

    Returns:
    {
        "status": "success" | "partial" | "error",
        "import_id": str,
        "timestamp": str (ISO 8601),
        "filename": str,
        "report": {
            "created_count": int,
            "updated_count": int,
            "pending_count": int,
            "error_count": int,
            "rows": [...]
        }
    }
    """
    _, db = perms

    # Fetch import report
    import_report = db.query(ImportReport).filter(
        ImportReport.import_id == import_id
    ).first()

    if not import_report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Reporte de importación no encontrado: {import_id}",
        )

    # Parse report JSON
    try:
        report_data = json.loads(import_report.report_json or "{}")
    except json.JSONDecodeError:
        report_data = []

    return {
        "status": import_report.status,
        "import_id": import_report.import_id,
        "timestamp": import_report.created_at.isoformat(),
        "filename": import_report.filename,
        "report": {
            "created_count": import_report.created_count,
            "updated_count": import_report.updated_count,
            "pending_count": import_report.pending_count,
            "error_count": import_report.error_count,
            "rows": report_data,
        }
    }


