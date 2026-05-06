"""Assign admin user to 'Conico' empresa with all modules enabled.

Uses raw SQL to avoid any ORM mutation-tracking issues with JSON columns.
Safe to run on every startup (idempotent).

Run inside backend container:
  docker-compose exec backend python scripts/fix_admin_empresa.py
"""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from sqlalchemy import text
from app.database import engine
from app.core.modulos import OPTIONAL_MODULES

ALL_MODULES_ON = json.dumps({slug: True for slug in OPTIONAL_MODULES})


def fix():
    with engine.begin() as conn:
        # 1. Find or create Conico empresa
        row = conn.execute(text("SELECT id FROM empresas WHERE nombre = 'Conico'")).first()
        if row:
            empresa_id = row[0]
            conn.execute(text(
                "UPDATE empresas SET modulos_enabled = :m WHERE id = :id"
            ), {"m": ALL_MODULES_ON, "id": empresa_id})
            print(f"Updated empresa 'Conico' id={empresa_id} — all modules ON")
        else:
            result = conn.execute(text(
                "INSERT INTO empresas (nombre, razon_social, modulos_enabled) "
                "VALUES ('Conico', 'Conico SpA', :m) RETURNING id"
            ), {"m": ALL_MODULES_ON})
            empresa_id = result.first()[0]
            print(f"Created empresa 'Conico' id={empresa_id}")

        # 2. Assign ALL users without an empresa to Conico
        result = conn.execute(text(
            "UPDATE users SET empresa_id = :eid "
            "WHERE empresa_id IS NULL "
            "RETURNING id, email, empresa_id"
        ), {"eid": empresa_id})
        rows = result.fetchall()
        if not rows:
            print("All users already have an empresa — nothing to update")
            return
        for r in rows:
            print(f"Assigned user id={r[0]} ({r[1]}) → empresa_id={r[2]}")

    print("Done. User must log out and back in to get a fresh JWT.")


if __name__ == "__main__":
    fix()
