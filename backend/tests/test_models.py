import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database import Base
from app.models.user import User

@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    Base.metadata.drop_all(engine)

def test_create_user(db):
    user = User(email="test@example.com", name="Test", hashed_password="x", role="vendedor")
    db.add(user)
    db.commit()
    db.refresh(user)
    assert user.id is not None
    assert user.is_active is True
    assert user.role == "vendedor"
