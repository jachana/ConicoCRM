#!/bin/sh
set -e

echo "Running migrations..."
alembic upgrade z9a0b1c2d3e4

echo "Running seed..."
python scripts/seed_all.py || echo "Seed warning: non-fatal errors (see above)"

echo "Starting server..."
exec "$@"
