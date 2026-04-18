"""Creates the first admin user. Run once after initial deploy."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.database import SessionLocal
from app.models.user import User
from app.core.security import get_password_hash

def seed():
    db = SessionLocal()
    if db.query(User).filter_by(role="admin").first():
        print("Admin already exists — skipping.")
        db.close()
        return
    user = User(
        email="admin@conico.cl",
        name="Administrador",
        hashed_password=get_password_hash("changeme123"),
        role="admin",
    )
    db.add(user)
    db.commit()
    print(f"Created: {user.email} / changeme123 — CHANGE PASSWORD IMMEDIATELY")
    db.close()

if __name__ == "__main__":
    seed()
