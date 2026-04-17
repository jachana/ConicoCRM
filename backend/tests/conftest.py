import os

# Set required env vars before any app imports so pydantic_settings doesn't fail.
# Tests that need a real DB override DATABASE_URL themselves (e.g. sqlite:///:memory:).
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-unit-tests")
