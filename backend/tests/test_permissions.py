import pytest
from app.models.user import User
from app.models.permission import PermissionOverride
from app.core.permissions import has_permission

@pytest.fixture
def vendedor(db):
    user = User(email="v@test.com", name="Vendedor", hashed_password="x", role="vendedor")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

def test_vendedor_can_view_catalogo(db, vendedor):
    assert has_permission(db, vendedor, "catalogo", "view") is True

def test_vendedor_cannot_edit_catalogo(db, vendedor):
    assert has_permission(db, vendedor, "catalogo", "edit") is False

def test_vendedor_cannot_view_rrhh(db, vendedor):
    assert has_permission(db, vendedor, "rrhh", "view") is False

def test_override_grants_access(db, vendedor):
    db.add(PermissionOverride(user_id=vendedor.id, module="inventario", action="view", allowed=True))
    db.commit()
    assert has_permission(db, vendedor, "inventario", "view") is True

def test_override_revokes_access(db, vendedor):
    db.add(PermissionOverride(user_id=vendedor.id, module="catalogo", action="view", allowed=False))
    db.commit()
    assert has_permission(db, vendedor, "catalogo", "view") is False

def test_admin_has_all_permissions(db):
    admin = User(email="a@test.com", name="Admin", hashed_password="x", role="admin")
    db.add(admin)
    db.commit()
    db.refresh(admin)
    assert has_permission(db, admin, "rrhh", "delete") is True


def test_tareas_permisos_defaults_vendedor(db, vendedor):
    assert has_permission(db, vendedor, "tareas", "view") is True
    assert has_permission(db, vendedor, "tareas", "create") is True
    assert has_permission(db, vendedor, "tareas", "edit") is True
    assert has_permission(db, vendedor, "tareas", "delete") is False
    assert has_permission(db, vendedor, "tareas", "view_all") is False
    assert has_permission(db, vendedor, "tareas", "admin") is False


def test_tareas_permisos_defaults_admin(db):
    admin = User(email="admin@test.com", name="Admin", hashed_password="x", role="admin")
    db.add(admin)
    db.commit()
    db.refresh(admin)
    assert has_permission(db, admin, "tareas", "view_all") is True
    assert has_permission(db, admin, "tareas", "admin") is True


def test_tareas_permisos_defaults_subadmin(db):
    sub = User(email="sub@test.com", name="Sub", hashed_password="x", role="subadmin")
    db.add(sub)
    db.commit()
    db.refresh(sub)
    assert has_permission(db, sub, "tareas", "view") is True
    assert has_permission(db, sub, "tareas", "create") is True
    assert has_permission(db, sub, "tareas", "view_all") is False
    assert has_permission(db, sub, "tareas", "admin") is False


def test_existing_modules_do_not_gain_view_all_or_admin_by_default(db, vendedor):
    # Adding new global ACTIONS must NOT grant them on existing modules for non-admin users.
    assert has_permission(db, vendedor, "catalogo", "view_all") is False
    assert has_permission(db, vendedor, "cotizaciones", "admin") is False
