"""Service layer for Libro generation (sales and purchase books)"""
import re
from sqlalchemy.orm import Session
from sqlalchemy import func, extract, or_

from app.models.libro import LibroVentas, LibroCompras, DteRecepcion
from app.models.dte_emision import DteEmision
from app.models.factura import Factura
from app.models.boleta import Boleta


class LibroService:
    """Service class for generating and managing DTE Libros (sales/purchase books)"""

    @staticmethod
    def _validate_periodo(periodo: str) -> None:
        """Validate periodo format (YYYY-MM).

        Raises:
            ValueError: If periodo format is invalid
        """
        if not re.match(r'^\d{4}-\d{2}$', periodo):
            raise ValueError(f"Invalid periodo format: {periodo}. Expected YYYY-MM format.")

    @staticmethod
    def generar_libro_ventas(db: Session, empresa_id: int, periodo: str) -> LibroVentas:
        """Generate or retrieve sales book for a given period.

        Queries all DteEmision records where factura_id OR boleta_id is not null
        (outgoing DTEs issued by this empresa) and matches the given period.
        Aggregates total_registros and monto_total.

        Filters by:
        1. periodo (YYYY-MM format) - via EXTRACT(YEAR-MONTH from created_at)
        2. empresa_id - by joining to Factura/Boleta tables

        Idempotent: if a book already exists for (empresa_id, periodo), returns it.

        Args:
            db: SQLAlchemy session
            empresa_id: ID of the empresa
            periodo: Period in YYYY-MM format

        Returns:
            LibroVentas record (created or existing)

        Raises:
            ValueError: If periodo format is invalid
        """
        LibroService._validate_periodo(periodo)

        # Check if already exists
        existing = db.query(LibroVentas).filter_by(
            empresa_id=empresa_id, periodo=periodo
        ).first()
        if existing:
            return existing

        # Parse periodo to YYYY and MM
        year, month = periodo.split('-')
        year = int(year)
        month = int(month)

        # Query DteEmision for issued DTEs (factura or boleta issued)
        # Join to Factura and Boleta to filter by empresa_id and period
        result = db.query(
            func.count(DteEmision.id).label("total"),
            func.sum(DteEmision.monto_total).label("monto")
        ).outerjoin(
            Factura, DteEmision.factura_id == Factura.id
        ).outerjoin(
            Boleta, DteEmision.boleta_id == Boleta.id
        ).filter(
            # Must have either factura_id or boleta_id
            or_(DteEmision.factura_id.isnot(None), DteEmision.boleta_id.isnot(None)),
            # Filter by empresa_id: (factura and empresa_id match) OR (boleta and empresa_id match)
            or_(
                (DteEmision.factura_id.isnot(None)) & (Factura.empresa_id == empresa_id),
                (DteEmision.boleta_id.isnot(None)) & (Boleta.empresa_id == empresa_id),
            ),
            # Filter by period using created_at from DteEmision
            extract('year', DteEmision.created_at) == year,
            extract('month', DteEmision.created_at) == month,
        ).first()

        total_registros = result.total or 0 if result else 0
        monto_total = result.monto or 0 if result else 0

        # Create new libro
        libro = LibroVentas(
            periodo=periodo,
            empresa_id=empresa_id,
            folio_inicio=None,
            folio_fin=None,
            total_registros=total_registros,
            monto_total=monto_total,
            estado="borrador"
        )
        db.add(libro)
        db.commit()
        db.refresh(libro)

        return libro

    @staticmethod
    def generar_libro_compras(db: Session, empresa_id: int, periodo: str) -> LibroCompras:
        """Generate or retrieve purchase book for a given period.

        Queries all DteRecepcion records (incoming DTEs from suppliers)
        where estado='aceptado' and matches the given period.
        Aggregates total_registros and monto_total.

        Filters by:
        1. periodo (YYYY-MM format) - via EXTRACT(YEAR-MONTH from created_at)
        2. empresa_id
        3. estado='aceptado'

        Idempotent: if a book already exists for (empresa_id, periodo), returns it.

        Args:
            db: SQLAlchemy session
            empresa_id: ID of the empresa
            periodo: Period in YYYY-MM format

        Returns:
            LibroCompras record (created or existing)

        Raises:
            ValueError: If periodo format is invalid
        """
        LibroService._validate_periodo(periodo)

        # Check if already exists
        existing = db.query(LibroCompras).filter_by(
            empresa_id=empresa_id, periodo=periodo
        ).first()
        if existing:
            return existing

        # Parse periodo to YYYY and MM
        year, month = periodo.split('-')
        year = int(year)
        month = int(month)

        # Query DteRecepcion for accepted incoming DTEs
        result = db.query(
            func.count(DteRecepcion.id).label("total"),
            func.sum(DteRecepcion.monto).label("monto")
        ).filter(
            DteRecepcion.empresa_id == empresa_id,
            DteRecepcion.estado == "aceptado",
            # Filter by period using created_at from DteRecepcion
            extract('year', DteRecepcion.created_at) == year,
            extract('month', DteRecepcion.created_at) == month,
        ).first()

        total_registros = result.total or 0 if result else 0
        monto_total = result.monto or 0 if result else 0

        # Create new libro
        libro = LibroCompras(
            periodo=periodo,
            empresa_id=empresa_id,
            rut_proveedor=None,
            total_registros=total_registros,
            monto_total=monto_total,
            estado="borrador"
        )
        db.add(libro)
        db.commit()
        db.refresh(libro)

        return libro
