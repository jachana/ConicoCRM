import unicodedata

from sqlalchemy import func

# Set to False at startup if unaccent extension is unavailable; see main.py.
_unaccent_ok: bool = True


def set_unaccent_available(available: bool) -> None:
    global _unaccent_ok
    _unaccent_ok = available


def unaccent_ilike(field, value: str):
    """Case- and accent-insensitive ILIKE.

    Uses PostgreSQL unaccent() when available. Falls back to ilike() with
    Python-side NFD normalization so searches don't 500 if the extension is
    missing (accent-insensitivity degrades but never errors).
    """
    if _unaccent_ok:
        return func.unaccent(field).ilike(func.unaccent(value))
    normalized = unicodedata.normalize("NFD", value).encode("ascii", "ignore").decode("ascii")
    return func.lower(field).ilike(normalized.lower())
