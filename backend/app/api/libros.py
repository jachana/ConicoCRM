"""API endpoints for retrieving Libros (sales and purchase books)"""
import re
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.database import get_db
from app.models.libro import LibroVentas, LibroCompras
from app.models.user import User
from app.schemas.libro import LibroVentasRead, LibroComprasRead

router = APIRouter()


def _validate_pagination(limit: int, offset: int) -> None:
    """Validate pagination parameters.

    Raises:
        HTTPException: If limit or offset are invalid
    """
    if limit < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="limit must be >= 1"
        )
    if offset < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="offset must be >= 0"
        )


def _validate_periodo(periodo: str | None) -> None:
    """Validate periodo format (YYYY-MM).

    Raises:
        HTTPException: If periodo format is invalid
    """
    if periodo is None:
        return
    if not re.match(r'^\d{4}-\d{2}$', periodo):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="periodo must be in YYYY-MM format"
        )


# ── Libros de Ventas ──────────────────────────────────────────────────

@router.get("/ventas", response_model=dict)
def listar_libros_ventas(
    periodo: str | None = Query(None, description="Filter by YYYY-MM period"),
    limit: int = Query(50, ge=1, le=500, description="Pagination limit"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    perms: tuple[User, Session] = require_permission("libros", "view"),
):
    """Get list of sales books (Libros de Ventas) for current user's empresa.

    Parameters:
    - periodo: Optional filter by YYYY-MM period
    - limit: Number of records per page (default 50, max 500)
    - offset: Number of records to skip (default 0)

    Returns:
    - data: List of LibroVentasRead
    - pagination: {limit, offset, total}
    """
    current_user, db = perms

    # Validate parameters
    _validate_pagination(limit, offset)
    _validate_periodo(periodo)

    # Ensure user has an empresa_id for authorization
    if not current_user.empresa_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is not assigned to an empresa"
        )

    # Build query filtered by current user's empresa
    query = db.query(LibroVentas).filter(LibroVentas.empresa_id == current_user.empresa_id)

    # Apply filters
    if periodo:
        query = query.filter(LibroVentas.periodo == periodo)

    # Count total before applying pagination
    total = query.count()

    # Apply pagination
    libros = query.order_by(LibroVentas.created_at.desc()).offset(offset).limit(limit).all()

    # Convert to response schema
    data = [LibroVentasRead.model_validate(libro) for libro in libros]

    return {
        "data": data,
        "pagination": {
            "limit": limit,
            "offset": offset,
            "total": total
        }
    }


@router.get("/ventas/{id}", response_model=LibroVentasRead)
def obtener_libro_ventas(
    id: int,
    perms: tuple[User, Session] = require_permission("libros", "view"),
):
    """Get a specific sales book by ID.

    Parameters:
    - id: LibroVentas ID

    Returns:
    - LibroVentasRead
    """
    current_user, db = perms

    libro = db.query(LibroVentas).filter_by(id=id).first()

    if not libro:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Libro de Ventas not found"
        )

    # Authorization check: ensure user can only access libros from their empresa
    if libro.empresa_id != current_user.empresa_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access this libro"
        )

    return LibroVentasRead.model_validate(libro)


# ── Libros de Compras ─────────────────────────────────────────────────

@router.get("/compras", response_model=dict)
def listar_libros_compras(
    periodo: str | None = Query(None, description="Filter by YYYY-MM period"),
    limit: int = Query(50, ge=1, le=500, description="Pagination limit"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    perms: tuple[User, Session] = require_permission("libros", "view"),
):
    """Get list of purchase books (Libros de Compras) for current user's empresa.

    Parameters:
    - periodo: Optional filter by YYYY-MM period
    - limit: Number of records per page (default 50, max 500)
    - offset: Number of records to skip (default 0)

    Returns:
    - data: List of LibroComprasRead
    - pagination: {limit, offset, total}
    """
    current_user, db = perms

    # Validate parameters
    _validate_pagination(limit, offset)
    _validate_periodo(periodo)

    # Ensure user has an empresa_id for authorization
    if not current_user.empresa_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is not assigned to an empresa"
        )

    # Build query filtered by current user's empresa
    query = db.query(LibroCompras).filter(LibroCompras.empresa_id == current_user.empresa_id)

    # Apply filters
    if periodo:
        query = query.filter(LibroCompras.periodo == periodo)

    # Count total before applying pagination
    total = query.count()

    # Apply pagination
    libros = query.order_by(LibroCompras.created_at.desc()).offset(offset).limit(limit).all()

    # Convert to response schema
    data = [LibroComprasRead.model_validate(libro) for libro in libros]

    return {
        "data": data,
        "pagination": {
            "limit": limit,
            "offset": offset,
            "total": total
        }
    }


@router.get("/compras/{id}", response_model=LibroComprasRead)
def obtener_libro_compras(
    id: int,
    perms: tuple[User, Session] = require_permission("libros", "view"),
):
    """Get a specific purchase book by ID.

    Parameters:
    - id: LibroCompras ID

    Returns:
    - LibroComprasRead
    """
    current_user, db = perms

    libro = db.query(LibroCompras).filter_by(id=id).first()

    if not libro:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Libro de Compras not found"
        )

    # Authorization check: ensure user can only access libros from their empresa
    if libro.empresa_id != current_user.empresa_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access this libro"
        )

    return LibroComprasRead.model_validate(libro)
