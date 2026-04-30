import unicodedata

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

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


def producto_ids_matching(db: Session, q: str) -> list[int]:
    """Return producto IDs whose name, SKU, marca, tipo, or tag matches `q`.

    Used by NV / Factura / Cotización list endpoints to filter by line item.
    Empty list if `q` is empty (caller should skip the join in that case).
    """
    from app.models.producto import Producto
    from app.models.marca import Marca
    from app.models.tag import ProductoTag
    from app.models.tipo_producto import TipoProducto

    q = (q or "").strip()
    if not q:
        return []
    pattern = f"%{q}%"
    rows = (
        db.query(Producto.id)
        .outerjoin(Producto.marca)
        .outerjoin(Producto.tags)
        .outerjoin(Producto.tipos)
        .filter(
            or_(
                unaccent_ilike(Producto.nombre, pattern),
                unaccent_ilike(Producto.sku, pattern),
                unaccent_ilike(Marca.nombre, pattern),
                unaccent_ilike(ProductoTag.nombre, pattern),
                unaccent_ilike(TipoProducto.nombre, pattern),
            )
        )
        .distinct()
        .all()
    )
    return [r[0] for r in rows]
