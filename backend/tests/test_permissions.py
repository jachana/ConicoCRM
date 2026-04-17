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
