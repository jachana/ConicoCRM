"""Run once on the main DB to apply Sprint A schema changes. Safe to re-run."""
import os, sys
sys.modules.setdefault("weasyprint", type(sys)("weasyprint"))

from sqlalchemy import text
from app.database import engine, Base
import app.models  # registers all models including new ones


def run():
    Base.metadata.create_all(engine)
    print("New tables created (idempotent).")

    new_columns = [
        ("nota_ventas",       "ALTER TABLE nota_ventas ADD COLUMN direccion_despacho TEXT"),
        ("nota_ventas",       "ALTER TABLE nota_ventas ADD COLUMN retiro_en_conico BOOLEAN NOT NULL DEFAULT false"),
        ("nota_ventas",       "ALTER TABLE nota_ventas ADD COLUMN terminos_pago VARCHAR(255)"),
        ("cotizaciones",      "ALTER TABLE cotizaciones ADD COLUMN validez_dias INTEGER NOT NULL DEFAULT 5"),
        ("cotizacion_lineas", "ALTER TABLE cotizacion_lineas ADD COLUMN descuento REAL NOT NULL DEFAULT 0.0"),
        ("facturas",          "ALTER TABLE facturas ADD COLUMN banco_receptor_id INTEGER REFERENCES banco_receptores(id)"),
    ]
    with engine.connect() as conn:
        for table, stmt in new_columns:
            try:
                conn.execute(text(stmt))
                conn.commit()
                print(f"  + {table}: column added")
            except Exception as e:
                msg = str(e).lower()
                if "duplicate column" in msg or "already exists" in msg:
                    print(f"  = {table}: already exists, skipped")
                else:
                    raise
    print("Migration complete.")


if __name__ == "__main__":
    run()
