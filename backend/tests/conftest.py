import os
import sys
from unittest.mock import MagicMock

# Set required env vars before any app imports so pydantic_settings doesn't fail.
os.environ.setdefault("DATABASE_URL", "sqlite:///./test.db")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-unit-tests")

# Mock weasyprint before any app import — native GTK libs are not available on Windows dev.
_weasyprint_mock = MagicMock()
_weasyprint_mock.HTML.return_value.write_pdf.return_value = b"%PDF-1.4 mock"
sys.modules.setdefault("weasyprint", _weasyprint_mock)

import sqlite3
import unicodedata
import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

TEST_DATABASE_URL = "sqlite://"
test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

# Point the app's SessionLocal at TestingSession so the audit middleware
# (`_resolve_user_id` does `from app.database import SessionLocal`) sees the
# in-memory test DB instead of the real production engine.
import app.database as _app_db
_app_db.SessionLocal = TestingSession
_app_db.engine = test_engine


@event.listens_for(test_engine, "connect")
def _register_sqlite_unaccent(dbapi_connection, connection_record):
    if isinstance(dbapi_connection, sqlite3.Connection):
        def _unaccent(s):
            if not s:
                return ""
            return unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode("ascii")
        dbapi_connection.create_function("unaccent", 1, _unaccent)


@pytest.fixture(autouse=True)
def _audit_disabled_by_default():
    """Disable global audit listeners for all tests by default.

    Audit listeners are registered on the SQLAlchemy `Session` class globally
    (matches prod behavior). For tests that mutate auditable models, this
    silently inserts `audit_logs` rows on every flush — flaky for any test
    that asserts `session.dirty` size or counts rows.

    We toggle the per-session `audit_disabled` flag via the sessionmaker's
    `info` default. Tests that need audit behavior must request the
    `audit_enabled` fixture to opt back in.
    """
    TestingSession.configure(info={"audit_disabled": True})
    yield
    TestingSession.configure(info={"audit_disabled": True})


@pytest.fixture
def audit_enabled():
    """Opt-in: re-enable audit listeners for the duration of the test.

    Use in tests that explicitly verify audit log behavior (e.g.
    `test_auditoria.py`). Resets `TestingSession`'s `info` so new sessions
    do NOT carry `audit_disabled=True`.
    """
    TestingSession.configure(info={})
    yield
    TestingSession.configure(info={"audit_disabled": True})


@pytest.fixture(autouse=True)
def setup_test_db():
    from app.database import Base
    import app.models.user  # noqa: F401 — registers User with Base.metadata
    import app.models.permission  # noqa: F401 — registers PermissionOverride with Base.metadata
    import app.models.proveedor  # noqa: F401 — registers Proveedor with Base.metadata
    import app.models.producto  # noqa: F401 — registers Producto with Base.metadata
    import app.models.cliente  # noqa: F401 — registers Cliente with Base.metadata
    import app.models.empresa  # noqa: F401
    import app.models.empleado  # noqa: F401
    import app.models.empleado_documento  # noqa: F401
    import app.models.empleado_vacacion  # noqa: F401
    import app.models.cotizacion  # noqa: F401
    import app.models.nota_venta  # noqa: F401
    import app.models.tag  # noqa: F401
    import app.models.factura  # noqa: F401
    import app.models.orden_compra  # noqa: F401
    import app.models.movimiento_inventario  # noqa: F401
    import app.models.system_config  # noqa: F401
    import app.models.dashboard_layout  # noqa: F401
    import app.models.aprobacion_credito  # noqa: F401
    import app.models.aprobacion_margen  # noqa: F401
    import app.models.solicitud_descuento  # noqa: F401
    import app.models.cobranza_config  # noqa: F401
    import app.models.boleta  # noqa: F401
    import app.models.guia_despacho  # noqa: F401 — registers GuiaDespacho with Base.metadata
    import app.models.nota_credito  # noqa: F401 — registers NotaCredito with Base.metadata
    import app.models.dte_emision  # noqa: F401
    import app.models.banco_receptor  # noqa: F401
    import app.models.sede_despacho  # noqa: F401
    import app.models.marca  # noqa: F401
    import app.models.producto_documento  # noqa: F401
    import app.models.lista_precios  # noqa: F401
    import app.models.tarea  # noqa: F401
    import app.models.regla_tarea  # noqa: F401
    import app.models.audit_log  # noqa: F401
    import app.models.factura_compra  # noqa: F401 — registers FacturaCompra with Base.metadata
    import app.models.notification  # noqa: F401
    import app.models.oportunidad  # noqa: F401 — registers Oportunidad + Etapa with Base.metadata
    import app.models.libro  # noqa: F401 — registers LibroVentas, LibroCompras, DteRecepcion with Base.metadata
    import app.models.caf  # noqa: F401 — registers CAF with Base.metadata
    # Register audit listeners once for the test session.
    from app.services.auditoria import register_listeners as _register_audit
    _register_audit()
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def db(setup_test_db):  # noqa: F811 — ensure tables exist before opening session
    session = TestingSession()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client():
    from app.main import app
    from app.database import get_db
    from fastapi.testclient import TestClient

    def override_get_db():
        session = TestingSession()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.pop(get_db, None)


@pytest.fixture
def admin_user(setup_test_db):  # noqa: F811 — ensure DB is ready before inserting seed user
    from app.models.user import User
    from app.models.empresa import Empresa
    from app.core.security import get_password_hash

    db = TestingSession()
    # Create default empresa for admin
    empresa = Empresa(nombre="Admin Default Empresa")
    db.add(empresa)
    db.flush()

    user = User(
        email="admin@conico.cl",
        name="Admin",
        hashed_password=get_password_hash("secret123"),
        role="admin",
        empresa_id=empresa.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.close()
    return user


@pytest.fixture
def admin_token(client, admin_user):
    resp = client.post("/api/auth/login", data={"username": "admin@conico.cl", "password": "secret123"})
    return resp.json()["access_token"]


@pytest.fixture
def subadmin_user(setup_test_db):
    from app.models.user import User
    from app.core.security import get_password_hash

    db = TestingSession()
    user = User(
        email="subadmin@conico.cl",
        name="SubAdmin",
        hashed_password=get_password_hash("secret123"),
        role="subadmin",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.close()
    return user


@pytest.fixture
def subadmin_token(client, subadmin_user):
    resp = client.post("/api/auth/login", data={"username": "subadmin@conico.cl", "password": "secret123"})
    return resp.json()["access_token"]


@pytest.fixture
def vendedor_user(setup_test_db):
    from app.models.user import User
    from app.core.security import get_password_hash

    db = TestingSession()
    user = User(
        email="vendedor@conico.cl",
        name="Vendedor",
        hashed_password=get_password_hash("secret123"),
        role="vendedor",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    db.close()
    return user


@pytest.fixture
def vendedor_token(client, vendedor_user):
    resp = client.post("/api/auth/login", data={"username": "vendedor@conico.cl", "password": "secret123"})
    return resp.json()["access_token"]


@pytest.fixture
def cliente_demo(setup_test_db):
    from app.models.cliente import Cliente
    session = TestingSession()
    c = Cliente(nombre="Cliente Demo")
    session.add(c)
    session.commit()
    session.refresh(c)
    session.close()
    return c


@pytest.fixture
def empresa_demo(setup_test_db):
    from app.models.empresa import Empresa
    session = TestingSession()
    e = Empresa(nombre="Empresa Demo")
    session.add(e)
    session.commit()
    session.refresh(e)
    session.close()
    return e
