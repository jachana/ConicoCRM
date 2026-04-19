#!/bin/sh
set -e

echo "Running migrations..."
alembic upgrade head

echo "Running seed..."
python scripts/seed_all.py

echo "Starting server..."
exec "$@"
