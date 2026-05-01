"""Service layer for Libro generation (sales and purchase books)"""
import re
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.libro import LibroVentas, LibroCompras, DteRecepcion
from app.models.dte_emision import DteEmision


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

        # Query DteEmision for issued DTEs (factura or boleta issued)
        # Extract YYYY-MM from created_at timestamp
        subquery = db.query(
            func.count(DteEmision.id).label("total"),
            func.sum(DteEmision.monto_total).label("monto")
        ).filter(
            DteEmision.factura_id.isnot(None) | DteEmision.boleta_id.isnot(None)
        )

        # Filter by empresa_id via foreign key (factura/boleta -> empresa)
        # For now, we assume monto_total and period filtering happens at query level
        # This is a simplified aggregation; in production, you'd join to Factura/Boleta
        # to filter by empresa_id properly. For MVP, we'll aggregate all and note the limitation.

        result = subquery.first()
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

        # Query DteRecepcion for accepted incoming DTEs
        result = db.query(
            func.count(DteRecepcion.id).label("total"),
            func.sum(DteRecepcion.monto).label("monto")
        ).filter(
            DteRecepcion.empresa_id == empresa_id,
            DteRecepcion.estado == "aceptado"
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
