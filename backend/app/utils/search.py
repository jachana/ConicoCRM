from sqlalchemy import func


def unaccent_ilike(field, value: str):
    """Case- and accent-insensitive ILIKE using PostgreSQL unaccent extension."""
    return func.unaccent(field).ilike(func.unaccent(value))
