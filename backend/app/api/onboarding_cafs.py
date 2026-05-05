"""
CAF (Comprobante de Autorización de Folios) Upload API

Endpoints for importing and managing CAF XML files during onboarding.
Handles multi-file uploads, validation, duplicate detection, and inventory management.

Endpoints:
  POST /api/onboarding/cafs          - Upload and process CAF XML files
  GET  /api/onboarding/cafs          - List current CAFs for empresa
  GET  /api/onboarding/cafs/{caf_id} - Retrieve single CAF details
"""

import hashlib
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, status
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.api.config import require_admin
from app.database import get_db
from app.models.caf import CAF
from app.models.empresa import Empresa
from app.models.user import User
from app.services.caf_service import validate_caf

router = APIRouter()


# ============================================================================
# Response Models
# ============================================================================

class CAFUploadResult:
    """Result of uploading a single CAF file."""
    def __init__(
        self,
        filename: str,
        valid: bool,
        tipo_dte: Optional[str] = None,
        num_inicio: Optional[int] = None,
        num_fin: Optional[int] = None,
        rut_emisor: Optional[str] = None,
        message: str = "",
        errors: Optional[list[str]] = None,
        warnings: Optional[list[str]] = None,
        caf_id: Optional[int] = None,
    ):
        self.filename = filename
        self.valid = valid
        self.tipo_dte = tipo_dte
        self.num_inicio = num_inicio
        self.num_fin = num_fin
        self.rut_emisor = rut_emisor
        self.message = message
        self.errors = errors or []
        self.warnings = warnings or []
        self.caf_id = caf_id

    def to_dict(self) -> dict:
        return {
            "filename": self.filename,
            "valid": self.valid,
            "tipo_dte": self.tipo_dte,
            "num_inicio": self.num_inicio,
            "num_fin": self.num_fin,
            "rut_emisor": self.rut_emisor,
            "message": self.message,
            "errors": self.errors,
            "warnings": self.warnings,
            "caf_id": self.caf_id,
        }


class CAFDetailOut:
    """CAF with consumption details."""
    def __init__(self, caf: CAF):
        self.id = caf.id
        self.empresa_id = caf.empresa_id
        self.tipo_dte = caf.tipo_dte
        self.num_inicio = caf.num_inicio
        self.num_fin = caf.num_fin
        self.vigente = caf.vigente
        self.consumido = caf.consumido
        self.fecha_carga = caf.fecha_carga
        self.created_at = caf.created_at
        self.updated_at = caf.updated_at

    @property
    def total_folios(self) -> int:
        """Total number of folios in the range."""
        return self.num_fin - self.num_inicio + 1

    @property
    def folios_restantes(self) -> int:
        """Remaining folios (not yet consumed)."""
        return self.total_folios - self.consumido

    @property
    def porcentaje_consumido(self) -> float:
        """Percentage of folios consumed."""
        if self.total_folios == 0:
            return 0.0
        return (self.consumido / self.total_folios) * 100.0

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "empresa_id": self.empresa_id,
            "tipo_dte": self.tipo_dte,
            "num_inicio": self.num_inicio,
            "num_fin": self.num_fin,
            "vigente": self.vigente,
            "consumido": self.consumido,
            "total_folios": self.total_folios,
            "folios_restantes": self.folios_restantes,
            "porcentaje_consumido": round(self.porcentaje_consumido, 2),
            "fecha_carga": self.fecha_carga.isoformat() if self.fecha_carga else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


# ============================================================================
# Helper Functions
# ============================================================================

def _get_file_signature(content: bytes) -> str:
    """Calculate SHA256 signature of file content."""
    return hashlib.sha256(content).hexdigest()


def _check_duplicate_caf(
    session: Session,
    empresa_id: int,
    tipo_dte: str,
    num_inicio: int,
    num_fin: int,
) -> Optional[CAF]:
    """Check if a CAF with same range already exists."""
    return session.query(CAF).filter(
        CAF.empresa_id == empresa_id,
        CAF.tipo_dte == tipo_dte,
        CAF.num_inicio == num_inicio,
        CAF.num_fin == num_fin,
    ).first()


# ============================================================================
# POST /api/onboarding/cafs - Upload CAF Files
# ============================================================================

@router.post("/", status_code=status.HTTP_200_OK)
def upload_cafs(
    files: list[UploadFile] = File(...),
    perms: tuple[User, Session] = Depends(require_admin),
):
    current_user, db = perms

    empresa_id = current_user.empresa_id
    if not empresa_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tu usuario no está asociado a ninguna empresa",
        )

    # Validate empresa exists
    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    if not empresa:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Empresa con id {empresa_id} no encontrada",
        )

    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Al menos un archivo debe ser proporcionado",
        )

    results = []
    processed_count = 0

    for file in files:
        result = _process_single_caf_file(db, file, empresa_id)
        results.append(result)
        # Count as processed if valid (including duplicates that return existing CAF ID)
        if result.valid and result.caf_id is not None:
            processed_count += 1

    return {
        "success": processed_count > 0,
        "total_files": len(files),
        "processed": processed_count,
        "results": [r.to_dict() for r in results],
    }


def _process_single_caf_file(
    db: Session,
    file: UploadFile,
    empresa_id: int,
) -> CAFUploadResult:
    """
    Process a single CAF XML file.

    Per-file transaction: rollback on DB error, but don't fail other files.

    Order of operations:
    1. File format validation (extension, encoding)
    2. XML parsing (without DB-level validation)
    3. Check for exact duplicate (same range + tipo_dte)
    4. If not duplicate: full validation with overlap checking
    5. Persist to database
    """
    filename = file.filename or "unknown"

    # Validate file extension
    if not filename.lower().endswith(".xml"):
        return CAFUploadResult(
            filename=filename,
            valid=False,
            errors=["Archivo debe ser XML (.xml)"],
        )

    # Read file content
    try:
        content = file.file.read()
        if not content:
            return CAFUploadResult(
                filename=filename,
                valid=False,
                errors=["Archivo vacío"],
            )
    except Exception as exc:
        return CAFUploadResult(
            filename=filename,
            valid=False,
            errors=[f"Error al leer archivo: {str(exc)}"],
        )

    # Decode to string
    try:
        xml_content = content.decode("utf-8")
    except UnicodeDecodeError:
        return CAFUploadResult(
            filename=filename,
            valid=False,
            errors=["Archivo no es UTF-8 válido"],
        )

    # Parse XML to extract basic info (without full validation)
    try:
        from app.services.caf_service import parse_caf_xml
        parsed = parse_caf_xml(xml_content)
    except ValueError as exc:
        return CAFUploadResult(
            filename=filename,
            valid=False,
            errors=[str(exc)],
        )

    # Extract tipo_dte from first tipo_folio for duplicate check
    first_tipo = parsed["tipos_folios"][0] if parsed["tipos_folios"] else None
    if not first_tipo:
        return CAFUploadResult(
            filename=filename,
            valid=False,
            errors=["No se encontraron tipos de folio"],
        )

    tipo_dte = first_tipo["tipo_dte"]
    num_inicio = first_tipo["folio_inicio"]
    num_fin = first_tipo["folio_fin"]

    # Check for exact duplicate (same range and tipo_dte)
    existing = _check_duplicate_caf(
        db,
        empresa_id,
        tipo_dte,
        num_inicio,
        num_fin,
    )

    if existing:
        result = CAFUploadResult(
            filename=filename,
            valid=True,
            tipo_dte=tipo_dte,
            num_inicio=num_inicio,
            num_fin=num_fin,
            rut_emisor=parsed["rut_emisor"],
            message="CAF ya existe (folios idénticos)",
            caf_id=existing.id,
        )
        return result

    # Full validation (includes overlap checking)
    report = validate_caf(db, xml_content, empresa_id)

    result = CAFUploadResult(
        filename=filename,
        valid=report.valid,
        tipo_dte=report.tipo_dte,
        num_inicio=report.num_inicio,
        num_fin=report.num_fin,
        rut_emisor=report.rut_emisor,
        errors=report.errors,
        warnings=report.warnings,
    )

    # If validation failed, return early
    if not report.valid:
        return result

    # Persist to database with transaction per file
    try:
        from datetime import date as date_type
        vigencia_str = first_tipo.get("folio_vigencia")
        fecha_venc = None
        if vigencia_str:
            try:
                fecha_venc = date_type.fromisoformat(vigencia_str)
            except ValueError:
                pass

        caf = CAF(
            empresa_id=empresa_id,
            tipo_dte=report.tipo_dte,
            num_inicio=report.num_inicio,
            num_fin=report.num_fin,
            archivo_xml=xml_content,
            vigente=True,
            consumido=0,
            fecha_vencimiento=fecha_venc,
        )
        db.add(caf)
        db.flush()  # Flush to get the id without committing
        db.commit()

        result.message = "CAF cargado exitosamente"
        result.caf_id = caf.id
        return result

    except Exception as exc:
        db.rollback()
        result.valid = False
        result.errors.append(f"Error al guardar en base de datos: {str(exc)}")
        result.caf_id = None
        return result


# ============================================================================
# GET /api/onboarding/cafs - List CAFs for Empresa
# ============================================================================

@router.get("/", status_code=status.HTTP_200_OK)
def list_cafs(
    perms: tuple[User, Session] = Depends(require_admin),
):
    current_user, db = perms

    empresa_id = current_user.empresa_id
    if not empresa_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tu usuario no está asociado a ninguna empresa",
        )

    # Validate empresa exists
    empresa = db.query(Empresa).filter(Empresa.id == empresa_id).first()
    if not empresa:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Empresa con id {empresa_id} no encontrada",
        )

    cafs = db.query(CAF).filter(CAF.empresa_id == empresa_id).all()

    return {
        "count": len(cafs),
        "cafs": [CAFDetailOut(caf).to_dict() for caf in cafs],
    }


# ============================================================================
# GET /api/onboarding/cafs/{caf_id} - Get Single CAF
# ============================================================================

@router.get("/{caf_id}", status_code=status.HTTP_200_OK)
def get_caf(
    caf_id: int,
    perms: tuple[User, Session] = Depends(require_admin),
):
    """
    Retrieve a single CAF with consumption details.

    Args:
        caf_id: CAF ID

    Returns:
        {
          "id": int,
          "empresa_id": int,
          "tipo_dte": str,
          "num_inicio": int,
          "num_fin": int,
          "vigente": bool,
          "consumido": int,
          "total_folios": int,
          "folios_restantes": int,
          "porcentaje_consumido": float,
          "fecha_carga": str,
          "created_at": str,
          "updated_at": str
        }

    Raises:
        401: Unauthorized (not admin)
        404: CAF not found
    """
    _, db = perms

    caf = db.query(CAF).filter(CAF.id == caf_id).first()
    if not caf:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"CAF con id {caf_id} no encontrada",
        )

    return CAFDetailOut(caf).to_dict()
