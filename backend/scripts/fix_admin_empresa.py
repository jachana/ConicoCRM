"""Assign admin user to 'Conico' empresa with all modules enabled.

Run inside backend container:
  docker-compose exec backend python scripts/fix_admin_empresa.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.database import SessionLocal
from app.models.user import User
from app.models.empresa import Empresa
from app.core.modulos import OPTIONAL_MODULES

ALL_MODULES_ON = {slug: True for slug in OPTIONAL_MODULES}


def fix():
    db = SessionLocal()
    try:
        empresa = db.query(Empresa).filter(Empresa.nombre == "Conico").first()
        if not empresa:
            empresa = Empresa(
                nombre="Conico",
                razon_social="Conico SpA",
                modulos_enabled=ALL_MODULES_ON,
            )
            db.add(empresa)
            db.flush()
            print(f"Created empresa 'Conico' id={empresa.id}")
        else:
            empresa.modulos_enabled = ALL_MODULES_ON
            print(f"Updated empresa 'Conico' id={empresa.id} — all modules ON")

        admin = db.query(User).filter_by(role="admin").first()
        if not admin:
            print("ERROR: no admin user found")
            return

        admin.empresa_id = empresa.id
        db.commit()
        print(f"Assigned user '{admin.email}' → empresa_id={empresa.id}")
        print("Done. User must log out and back in to get a fresh token.")
    except Exception as exc:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    fix()
