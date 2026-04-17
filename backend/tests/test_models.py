from app.models.user import User


def test_create_user(db):
    user = User(email="test@example.com", name="Test", hashed_password="x", role="vendedor")
    db.add(user)
    db.commit()
    db.refresh(user)
    assert user.id is not None
    assert user.is_active is True
    assert user.role == "vendedor"
