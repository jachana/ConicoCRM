#!/bin/sh
set -e

echo "Running migrations..."
alembic upgrade heads

echo "Running seed..."
python scripts/seed_all.py || echo "Seed warning: non-fatal errors (see above)"

echo "Starting server..."
exec "$@"
