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

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

TEST_DATABASE_URL = "sqlite:///./test.db"
test_engine = create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


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
    import app.models.system_config  # noqa: F401
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def db():
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
def admin_user(setup_test_db):
    from app.models.user import User
    from app.core.security import get_password_hash

    db = TestingSession()
    user = User(
        email="admin@conico.cl",
        name="Admin",
        hashed_password=get_password_hash("secret123"),
        role="admin",
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
