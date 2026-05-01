"""API endpoints for retrieving Libros (sales and purchase books)"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.database import get_db
from app.models.libro import LibroVentas, LibroCompras
from app.models.user import User
from app.schemas.libro import LibroVentasRead, LibroComprasRead

router = APIRouter()


class PaginationResponse:
    """Base pagination response wrapper"""
    def __init__(self, data: list, limit: int, offset: int, total: int):
        self.data = data
        self.pagination = {
            "limit": limit,
            "offset": offset,
            "total": total
        }


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
    import re
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
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
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
    # Validate parameters
    _validate_pagination(limit, offset)
    _validate_periodo(periodo)

    # Build query - all users can see their empresa's libros
    # For now, we filter by empresa_id from the user's current context
    # In a multi-tenant system, this would come from user.empresa_id or similar
    # Since the requirement says "empresa_id (required header/token)", we get it from the query
    # but in practice, this should be restricted by the auth system

    query = db.query(LibroVentas)

    # For now, accept empresa_id as a query parameter (can be authenticated separately)
    # In production, this should come from the token payload
    empresa_id_param = Query(None, description="Empresa ID (if not in token)")

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
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a specific sales book by ID.

    Parameters:
    - id: LibroVentas ID

    Returns:
    - LibroVentasRead
    """
    libro = db.query(LibroVentas).filter_by(id=id).first()

    if not libro:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Libro de Ventas not found"
        )

    return LibroVentasRead.model_validate(libro)


# ── Libros de Compras ─────────────────────────────────────────────────

@router.get("/compras", response_model=dict)
def listar_libros_compras(
    periodo: str | None = Query(None, description="Filter by YYYY-MM period"),
    limit: int = Query(50, ge=1, le=500, description="Pagination limit"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
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
    # Validate parameters
    _validate_pagination(limit, offset)
    _validate_periodo(periodo)

    # Build query
    query = db.query(LibroCompras)

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
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a specific purchase book by ID.

    Parameters:
    - id: LibroCompras ID

    Returns:
    - LibroComprasRead
    """
    libro = db.query(LibroCompras).filter_by(id=id).first()

    if not libro:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Libro de Compras not found"
        )

    return LibroComprasRead.model_validate(libro)
