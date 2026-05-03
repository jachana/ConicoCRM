#!/bin/sh
set -e

echo "Checking alembic_version integrity..."
python - <<'PYEOF'
import os, sys
try:
    import psycopg2
    url = os.environ.get("DATABASE_URL", "")
    # parse postgresql://user:pass@host:port/db
    if not url.startswith("postgresql"):
        sys.exit(0)
    conn = psycopg2.connect(url)
    cur = conn.cursor()
    cur.execute("SELECT version_num FROM alembic_version ORDER BY version_num")
    rows = [r[0] for r in cur.fetchall()]
    print(f"Current alembic_version rows: {rows}")
    # Remove known stale ancestor: a6b7c8d9e0f1 is superseded by 7432c1eb1576
    if 'a6b7c8d9e0f1' in rows and '7432c1eb1576' in rows:
        cur.execute("DELETE FROM alembic_version WHERE version_num = 'a6b7c8d9e0f1'")
        conn.commit()
        print("Removed stale row a6b7c8d9e0f1 (superseded by 7432c1eb1576)")
    conn.close()
except Exception as e:
    print(f"alembic_version check skipped: {e}")
PYEOF

echo "Running migrations..."
alembic upgrade heads

echo "Running seed..."
python scripts/seed_all.py || echo "Seed warning: non-fatal errors (see above)"

echo "Starting server..."
exec "$@"
