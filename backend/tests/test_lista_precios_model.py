from datetime import datetime
from decimal import Decimal

from app.models.lista_precios import ListaPrecios, ListaPreciosItem
from app.models.user import User


def test_lista_precios_has_expected_columns(db):
    user = User(email="admin@test.com", hashed_password="x", role="admin", name="A")
    db.add(user); db.flush()

    lp = ListaPrecios(
        nombre_archivo="precios.xlsx",
        ruta_archivo="uploads/listas_precios/1_precios.xlsx",
        subida_por_id=user.id,
        activa=True,
        total_items=3,
    )
    db.add(lp); db.flush()

    item = ListaPreciosItem(lista_id=lp.id, sku="ABC-1", costo_unitario=Decimal("100.50"))
    db.add(item); db.commit()

    reloaded = db.get(ListaPrecios, lp.id)
    assert reloaded.activa is True
    assert reloaded.total_items == 3
    assert isinstance(reloaded.fecha_subida, datetime)
    assert reloaded.items[0].sku == "ABC-1"
    assert reloaded.items[0].costo_unitario == Decimal("100.50")
