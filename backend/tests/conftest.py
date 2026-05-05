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
from sqlalchemy import create_engine, event, text
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
def _reset_dependency_overrides():
    """Clear ALL app.dependency_overrides after every test.

    Tests that override get_current_user (or other deps) directly on app
    would otherwise leak those overrides into subsequent tests, causing
    auth failures (403/200 instead of expected 401/201/200).
    The conftest client fixture re-applies get_db per test, so clearing
    all overrides here is safe.
    """
    from app.main import app
    yield
    app.dependency_overrides.clear()


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


# ---------------------------------------------------------------------------
# Schema management — create once per session, DELETE rows between tests
# ---------------------------------------------------------------------------

def _import_all_models():
    import app.models.user  # noqa: F401
    import app.models.permission  # noqa: F401
    import app.models.proveedor  # noqa: F401
    import app.models.producto  # noqa: F401
    import app.models.cliente  # noqa: F401
    import app.models.empresa  # noqa: F401
    import app.models.empleado  # noqa: F401
    import app.models.empleado_documento  # noqa: F401
    import app.models.empleado_vacacion  # noqa: F401
    import app.models.cotizacion  # noqa: F401
    import app.models.nota_venta  # noqa: F401
    import app.models.nota_venta_adjunto  # noqa: F401
    import app.models.tag  # noqa: F401
    import app.models.factura  # noqa: F401
    import app.models.factura_adjunto  # noqa: F401
    import app.models.orden_compra  # noqa: F401
    import app.models.movimiento_inventario  # noqa: F401
    import app.models.system_config  # noqa: F401
    import app.models.dashboard_layout  # noqa: F401
    import app.models.aprobacion_credito  # noqa: F401
    import app.models.aprobacion_margen  # noqa: F401
    import app.models.solicitud_descuento  # noqa: F401
    import app.models.cobranza_config  # noqa: F401
    import app.models.boleta  # noqa: F401
    import app.models.guia_despacho  # noqa: F401
    import app.models.nota_credito  # noqa: F401
    import app.models.nota_debito  # noqa: F401
    import app.models.nota_alerta  # noqa: F401
    import app.models.dte_emision  # noqa: F401
    import app.models.banco_receptor  # noqa: F401
    import app.models.sede_despacho  # noqa: F401
    import app.models.marca  # noqa: F401
    import app.models.producto_documento  # noqa: F401
    import app.models.lista_precios  # noqa: F401
    import app.models.precio_especial_cliente  # noqa: F401
    import app.models.tarea  # noqa: F401
    import app.models.regla_tarea  # noqa: F401
    import app.models.audit_log  # noqa: F401
    import app.models.factura_compra  # noqa: F401
    import app.models.notification  # noqa: F401
    import app.models.oportunidad  # noqa: F401
    import app.models.libro  # noqa: F401
    import app.models.caf  # noqa: F401
    import app.models.tipo_producto  # noqa: F401
    import app.models.import_report  # noqa: F401
    import app.models.pago  # noqa: F401
    import app.models.pago_importado  # noqa: F401
    import app.models.bodega  # noqa: F401
    import app.models.contacto_empresa  # noqa: F401


@pytest.fixture(scope="session", autouse=True)
def _session_schema():
    """Create the full schema once for the entire test session."""
    _import_all_models()
    from app.database import Base
    from app.services.auditoria import register_listeners as _register_audit
    _register_audit()
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture(autouse=True)
def setup_test_db(_session_schema):
    """Ensure a clean DB state for each test by deleting all rows after the test.

    Schema creation happens once per session (_session_schema). Row deletion
    via DELETE is orders of magnitude faster than DROP/CREATE for each test.
    """
    yield
    from app.database import Base
    from sqlalchemy import inspect as sa_inspect
    with test_engine.connect() as conn:
        existing = set(sa_inspect(test_engine).get_table_names())
        conn.execute(text("PRAGMA foreign_keys = OFF"))
        for table in reversed(Base.metadata.sorted_tables):
            if table.name in existing:
                conn.execute(table.delete())
        conn.execute(text("PRAGMA foreign_keys = ON"))
        conn.commit()


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def db(setup_test_db):  # noqa: F811 — ensure tables are clean before opening session
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


# ---------------------------------------------------------------------------
# Password hash — computed once (bcrypt is intentionally slow)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def _test_password_hash():
    from app.core.security import get_password_hash
    return get_password_hash("secret123")


@pytest.fixture
def admin_user(setup_test_db, _test_password_hash):
    from app.models.user import User
    from app.models.empresa import Empresa

    db = TestingSession()
    empresa = Empresa(nombre="Admin Default Empresa")
    db.add(empresa)
    db.flush()

    user = User(
        email="admin@conico.cl",
        name="Admin",
        hashed_password=_test_password_hash,
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
def subadmin_user(setup_test_db, _test_password_hash):
    from app.models.user import User

    db = TestingSession()
    user = User(
        email="subadmin@conico.cl",
        name="SubAdmin",
        hashed_password=_test_password_hash,
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
def vendedor_user(setup_test_db, _test_password_hash):
    from app.models.user import User

    db = TestingSession()
    user = User(
        email="vendedor@conico.cl",
        name="Vendedor",
        hashed_password=_test_password_hash,
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
    e = Empresa(nombre="Empresa Demo", rut="11.111.111-1")
    session.add(e)
    session.commit()
    session.refresh(e)
    session.close()
    return e
