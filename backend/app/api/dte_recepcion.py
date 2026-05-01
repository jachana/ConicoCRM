"""API endpoints for DTE Recepción (receiving and tracking SII responses)"""
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.database import get_db
from app.models.libro import DteRecepcion
from app.models.user import User
from app.schemas.libro import DteRecepcionCreate, DteRecepcionRead

router = APIRouter()


class DteRechazoRequest(BaseModel):
    """Request body for rejecting a DTE recepción"""
    motivo: str = Field(..., description="Reason for rejection", min_length=1)


def _validate_pagination(limit: int, offset: int) -> None:
    """Validate pagination parameters.

    Raises:
        HTTPException: If limit or offset are invalid
    """
    if limit < 1 or limit > 500:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="limit must be between 1 and 500"
        )
    if offset < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="offset must be >= 0"
        )


# ── DTE Recepción ──────────────────────────────────────────────────

@router.post("", response_model=DteRecepcionRead)
def crear_dte_recepcion(
    data: DteRecepcionCreate,
    perms: tuple[User, Session] = require_permission("dte_recepcion", "create"),
):
    """Create a new DTE reception record.

    Parameters:
    - tipo: DTE type code (e.g. '46' for Libro de Recepción)
    - folio: DTE folio number
    - rut_emisor: RUT of the DTE issuer
    - monto: DTE amount
    - xml_raw: Optional raw XML content
    - empresa_id: Enterprise ID

    Returns:
    - DteRecepcionRead with initial estado='recibido'
    """
    current_user, db = perms

    # Ensure user has an empresa_id for authorization
    if not current_user.empresa_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is not assigned to an empresa"
        )

    # Verify that the empresa_id in the request matches the user's empresa
    if data.empresa_id != current_user.empresa_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot create DTE for a different empresa"
        )

    # Create new DTE recepción record with estado='recibido'
    dte_recepcion = DteRecepcion(
        empresa_id=data.empresa_id,
        tipo=data.tipo,
        folio=data.folio,
        rut_emisor=data.rut_emisor,
        monto=data.monto,
        xml_raw=data.xml_raw,
        estado="recibido",
    )

    db.add(dte_recepcion)
    db.commit()
    db.refresh(dte_recepcion)

    return DteRecepcionRead.model_validate(dte_recepcion)


@router.get("", response_model=dict)
def listar_dte_recepciones(
    estado: str | None = Query(None, description="Filter by estado: recibido/aceptado/rechazado"),
    rut_emisor: str | None = Query(None, description="Filter by RUT of issuer"),
    limit: int = Query(50, ge=1, le=500, description="Pagination limit"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    perms: tuple[User, Session] = require_permission("dte_recepcion", "view"),
):
    """Get list of DTE receptions for current user's empresa.

    Parameters:
    - estado: Optional filter by estado (recibido, aceptado, rechazado)
    - rut_emisor: Optional filter by RUT of issuer
    - limit: Number of records per page (default 50, max 500)
    - offset: Number of records to skip (default 0)

    Returns:
    - data: List of DteRecepcionRead
    - pagination: {limit, offset, total}
    """
    current_user, db = perms

    # Validate parameters
    _validate_pagination(limit, offset)

    # Validate estado if provided
    if estado and estado not in ("recibido", "aceptado", "rechazado"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="estado must be one of: recibido, aceptado, rechazado"
        )

    # Ensure user has an empresa_id for authorization
    if not current_user.empresa_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is not assigned to an empresa"
        )

    # Build query filtered by current user's empresa
    query = db.query(DteRecepcion).filter(
        DteRecepcion.empresa_id == current_user.empresa_id
    )

    # Apply filters
    if estado:
        query = query.filter(DteRecepcion.estado == estado)

    if rut_emisor:
        query = query.filter(DteRecepcion.rut_emisor == rut_emisor)

    # Count total before applying pagination
    total = query.count()

    # Apply pagination
    recepciones = query.order_by(DteRecepcion.created_at.desc()).offset(offset).limit(limit).all()

    # Convert to response schema
    data = [DteRecepcionRead.model_validate(recepcion) for recepcion in recepciones]

    return {
        "data": data,
        "pagination": {
            "limit": limit,
            "offset": offset,
            "total": total
        }
    }


@router.post("/{id}/aceptar", response_model=DteRecepcionRead)
def aceptar_dte_recepcion(
    id: int,
    perms: tuple[User, Session] = require_permission("dte_recepcion", "edit"),
):
    """Accept a DTE reception and update its estado to 'aceptado'.

    Parameters:
    - id: DteRecepcion ID

    Returns:
    - DteRecepcionRead with updated estado and respuesta_sii

    Raises:
    - 404: DTE recepción not found
    - 403: User not authorized for this empresa
    - 400: DTE already in aceptado or rechazado estado
    """
    current_user, db = perms

    # Fetch the DTE recepción
    dte_recepcion = db.query(DteRecepcion).filter_by(id=id).first()

    if not dte_recepcion:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="DTE recepción not found"
        )

    # Authorization check: ensure user can only access DTEs from their empresa
    if dte_recepcion.empresa_id != current_user.empresa_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access this DTE recepción"
        )

    # Check current estado - cannot transition from aceptado or rechazado
    if dte_recepcion.estado in ("aceptado", "rechazado"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot aceptar DTE in estado '{dte_recepcion.estado}'"
        )

    # Update estado and respuesta_sii
    dte_recepcion.estado = "aceptado"
    dte_recepcion.respuesta_sii = {
        "estado": "aceptado",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    db.commit()
    db.refresh(dte_recepcion)

    return DteRecepcionRead.model_validate(dte_recepcion)


@router.post("/{id}/rechazar", response_model=DteRecepcionRead)
def rechazar_dte_recepcion(
    id: int,
    body: DteRechazoRequest,
    perms: tuple[User, Session] = require_permission("dte_recepcion", "edit"),
):
    """Reject a DTE reception and update its estado to 'rechazado'.

    Parameters:
    - id: DteRecepcion ID
    - body: {motivo: str} - Reason for rejection

    Returns:
    - DteRecepcionRead with updated estado and rechazo_motivo

    Raises:
    - 404: DTE recepción not found
    - 403: User not authorized for this empresa
    - 400: DTE already in aceptado or rechazado estado
    """
    current_user, db = perms

    # Fetch the DTE recepción
    dte_recepcion = db.query(DteRecepcion).filter_by(id=id).first()

    if not dte_recepcion:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="DTE recepción not found"
        )

    # Authorization check: ensure user can only access DTEs from their empresa
    if dte_recepcion.empresa_id != current_user.empresa_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access this DTE recepción"
        )

    # Check current estado - cannot transition from aceptado or rechazado
    if dte_recepcion.estado in ("aceptado", "rechazado"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot rechazar DTE in estado '{dte_recepcion.estado}'"
        )

    # Update estado and rechazo_motivo
    dte_recepcion.estado = "rechazado"
    dte_recepcion.rechazo_motivo = body.motivo

    db.commit()
    db.refresh(dte_recepcion)

    return DteRecepcionRead.model_validate(dte_recepcion)
