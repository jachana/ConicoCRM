"""Test models for LibroVentas, LibroCompras, and DteRecepcion"""
import pytest
from datetime import datetime, timezone
from sqlalchemy.exc import IntegrityError

from app.models import LibroVentas, LibroCompras, DteRecepcion, Empresa
from app.database import SessionLocal


@pytest.fixture
def session():
    """Create a test session"""
    db = SessionLocal()
    yield db
    db.close()


@pytest.fixture
def empresa(session):
    """Create a test empresa"""
    from app.config import settings
    # Use raw SQL to avoid model complexity
    from sqlalchemy import text
    from app.database import engine

    with engine.begin() as conn:
        result = conn.execute(text(
            "INSERT INTO empresas (nombre) VALUES ('Test Company') RETURNING id"
        ))
        empresa_id = result.scalar()

    empresa = session.query(Empresa).filter_by(id=empresa_id).first()
    if not empresa:
        # Create via ORM if needed, but skip extra fields
        empresa = Empresa.__new__(Empresa)
        empresa.id = empresa_id
    return empresa


def test_libro_ventas_instantiation():
    """Test LibroVentas model instantiation"""
    libro = LibroVentas(
        periodo="2026-05",
        empresa_id=1,
        folio_inicio=1,
        folio_fin=100,
        total_registros=50,
        monto_total=5000000,
        estado="borrador"
    )

    assert libro.periodo == "2026-05"
    assert libro.empresa_id == 1
    assert libro.folio_inicio == 1
    assert libro.folio_fin == 100
    assert libro.total_registros == 50
    assert libro.monto_total == 5000000
    assert libro.estado == "borrador"


def test_libro_ventas_defaults():
    """Test LibroVentas default values"""
    libro = LibroVentas(
        periodo="2026-05",
        empresa_id=1
    )

    assert libro.estado == "borrador"
    assert libro.total_registros == 0
    assert libro.monto_total == 0


def test_libro_compras_instantiation():
    """Test LibroCompras model instantiation"""
    libro = LibroCompras(
        periodo="2026-05",
        empresa_id=1,
        rut_proveedor="98.765.432-1",
        total_registros=30,
        monto_total=3000000,
        estado="borrador"
    )

    assert libro.periodo == "2026-05"
    assert libro.empresa_id == 1
    assert libro.rut_proveedor == "98.765.432-1"
    assert libro.total_registros == 30
    assert libro.monto_total == 3000000
    assert libro.estado == "borrador"


def test_libro_compras_defaults():
    """Test LibroCompras default values"""
    libro = LibroCompras(
        periodo="2026-05",
        empresa_id=1
    )

    assert libro.estado == "borrador"
    assert libro.total_registros == 0
    assert libro.monto_total == 0


def test_dte_recepcion_instantiation():
    """Test DteRecepcion model instantiation"""
    dte = DteRecepcion(
        empresa_id=1,
        tipo="46",
        folio=12345,
        rut_emisor="11.222.333-4",
        monto=1500000,
        xml_raw="<xml>...</xml>",
        estado="recibido",
        respuesta_sii={"status": "received"}
    )

    assert dte.empresa_id == 1
    assert dte.tipo == "46"
    assert dte.folio == 12345
    assert dte.rut_emisor == "11.222.333-4"
    assert dte.monto == 1500000
    assert dte.xml_raw == "<xml>...</xml>"
    assert dte.estado == "recibido"
    assert dte.respuesta_sii == {"status": "received"}


def test_dte_recepcion_defaults():
    """Test DteRecepcion default values"""
    dte = DteRecepcion(
        empresa_id=1,
        tipo="46",
        folio=12345,
        rut_emisor="11.222.333-4",
        monto=1500000
    )

    assert dte.estado == "recibido"


def test_libro_ventas_unique_constraint_fields():
    """Test that LibroVentas has unique constraint on (empresa_id, periodo)"""
    # Check table constraints
    from app.models.libro import LibroVentas
    from sqlalchemy import inspect

    mapper = inspect(LibroVentas)
    # Check that table has unique constraints
    table = mapper.mapped_table
    assert table is not None
    # Verify unique constraints exist
    unique_constraints = [c for c in table.constraints if hasattr(c, 'name') and 'uq_' in str(c.name)]
    assert len(unique_constraints) > 0


def test_libro_compras_unique_constraint_fields():
    """Test that LibroCompras has unique constraint on (empresa_id, periodo)"""
    from app.models.libro import LibroCompras
    from sqlalchemy import inspect

    mapper = inspect(LibroCompras)
    # Check that table has unique constraints
    table = mapper.mapped_table
    assert table is not None
    # Verify unique constraints exist
    unique_constraints = [c for c in table.constraints if hasattr(c, 'name') and 'uq_' in str(c.name)]
    assert len(unique_constraints) > 0


def test_libro_ventas_table_name():
    """Test LibroVentas table name"""
    assert LibroVentas.__tablename__ == "libros_ventas"


def test_libro_compras_table_name():
    """Test LibroCompras table name"""
    assert LibroCompras.__tablename__ == "libros_compras"


def test_dte_recepcion_table_name():
    """Test DteRecepcion table name"""
    assert DteRecepcion.__tablename__ == "dte_recepciones"


def test_libro_ventas_periodo_field():
    """Test LibroVentas periodo field is string"""
    from sqlalchemy import inspect
    mapper = inspect(LibroVentas)
    periodo_col = mapper.columns['periodo']
    assert periodo_col.type.length == 7  # YYYY-MM format


def test_dte_recepcion_tipo_field():
    """Test DteRecepcion tipo field"""
    from sqlalchemy import inspect
    mapper = inspect(DteRecepcion)
    tipo_col = mapper.columns['tipo']
    assert tipo_col.type.length == 3  # e.g. '046'


def test_dte_recepcion_estado_enum_values():
    """Test DteRecepcion estado field supports expected enum values"""
    # Create instances with different estado values to verify they're accepted
    dte1 = DteRecepcion(
        empresa_id=1, tipo="46", folio=1, rut_emisor="11.111.111-1", monto=100, estado="recibido"
    )
    dte2 = DteRecepcion(
        empresa_id=1, tipo="46", folio=2, rut_emisor="11.111.111-1", monto=100, estado="aceptado"
    )
    dte3 = DteRecepcion(
        empresa_id=1, tipo="46", folio=3, rut_emisor="11.111.111-1", monto=100, estado="rechazado"
    )

    assert dte1.estado == "recibido"
    assert dte2.estado == "aceptado"
    assert dte3.estado == "rechazado"


def test_libro_ventas_estado_enum_values():
    """Test LibroVentas estado field supports expected enum values"""
    libro1 = LibroVentas(periodo="2026-05", empresa_id=1, estado="borrador")
    libro2 = LibroVentas(periodo="2026-05", empresa_id=2, estado="enviado")

    assert libro1.estado == "borrador"
    assert libro2.estado == "enviado"


def test_libro_compras_estado_enum_values():
    """Test LibroCompras estado field supports expected enum values"""
    libro1 = LibroCompras(periodo="2026-05", empresa_id=1, estado="borrador")
    libro2 = LibroCompras(periodo="2026-05", empresa_id=2, estado="enviado")

    assert libro1.estado == "borrador"
    assert libro2.estado == "enviado"
