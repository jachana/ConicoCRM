# backend/tests/test_dashboard.py
import pytest
from tests.conftest import TestingSession

# ── helpers ───────────────────────────────────────────────────────────────────

SAMPLE_WIDGETS = [
    {
        "id": "w1",
        "type": "ventas_periodo",
        "chart": "bar",
        "date_range": "month",
        "limit": 10,
        "grid": {"x": 0, "y": 0, "w": 6, "h": 4},
    }
]
SAMPLE_LAYOUT = {"widgets": SAMPLE_WIDGETS}


def _make_user(role: str, email: str):
    from app.models.user import User
    from app.core.security import get_password_hash
    db = TestingSession()
    user = User(email=email, name=role, hashed_password=get_password_hash("secret123"), role=role)
    db.add(user)
    db.commit()
    db.refresh(user)
    db.close()
    return user


def _token(client, email: str) -> str:
    resp = client.post("/api/auth/login", data={"username": email, "password": "secret123"})
    return resp.json()["access_token"]


# ── preset CRUD ───────────────────────────────────────────────────────────────

class TestPresetCRUD:
    def test_list_presets_empty(self, client, setup_test_db):
        _make_user("admin", "a@test.cl")
        tok = _token(client, "a@test.cl")
        r = client.get("/api/dashboard/layout/admin", headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 200
        assert r.json() == []

    def test_create_preset(self, client, setup_test_db):
        _make_user("admin", "a@test.cl")
        tok = _token(client, "a@test.cl")
        r = client.post(
            "/api/dashboard/layout/admin",
            json={"name": "Principal"},
            headers={"Authorization": f"Bearer {tok}"},
        )
        assert r.status_code == 201
        body = r.json()
        assert body["name"] == "Principal"
        assert body["slot"] == 1
        assert body["layout"]["widgets"] == []

    def test_save_preset_updates_layout(self, client, setup_test_db):
        _make_user("admin", "a@test.cl")
        tok = _token(client, "a@test.cl")
        r = client.post("/api/dashboard/layout/admin", json={"name": "P"}, headers={"Authorization": f"Bearer {tok}"})
        slot = r.json()["slot"]
        r2 = client.put(
            f"/api/dashboard/layout/admin/{slot}",
            json={"name": "Renombrado", "layout": SAMPLE_LAYOUT},
            headers={"Authorization": f"Bearer {tok}"},
        )
        assert r2.status_code == 200
        assert r2.json()["name"] == "Renombrado"
        assert r2.json()["layout"]["widgets"][0]["id"] == "w1"

    def test_create_forbidden_for_vendedor(self, client, setup_test_db):
        _make_user("vendedor", "v@test.cl")
        tok = _token(client, "v@test.cl")
        r = client.post(
            "/api/dashboard/layout/vendedor",
            json={"name": "Mi dash"},
            headers={"Authorization": f"Bearer {tok}"},
        )
        assert r.status_code == 403

    def test_subadmin_fallback_to_admin_presets(self, client, setup_test_db):
        _make_user("admin", "a@test.cl")
        _make_user("subadmin", "s@test.cl")
        admin_tok = _token(client, "a@test.cl")
        subadmin_tok = _token(client, "s@test.cl")
        client.post("/api/dashboard/layout/admin", json={"name": "Admin dash"}, headers={"Authorization": f"Bearer {admin_tok}"})
        r = client.get("/api/dashboard/layout/subadmin", headers={"Authorization": f"Bearer {subadmin_tok}"})
        assert r.status_code == 200
        assert len(r.json()) == 1
        assert r.json()[0]["name"] == "Admin dash"

    def test_max_5_presets(self, client, setup_test_db):
        _make_user("admin", "a@test.cl")
        tok = _token(client, "a@test.cl")
        for i in range(5):
            r = client.post("/api/dashboard/layout/admin", json={"name": f"D{i+1}"}, headers={"Authorization": f"Bearer {tok}"})
            assert r.status_code == 201
        r = client.post("/api/dashboard/layout/admin", json={"name": "Extra"}, headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 400

    def test_delete_preset(self, client, setup_test_db):
        _make_user("admin", "a@test.cl")
        tok = _token(client, "a@test.cl")
        r1 = client.post("/api/dashboard/layout/admin", json={"name": "A"}, headers={"Authorization": f"Bearer {tok}"})
        client.post("/api/dashboard/layout/admin", json={"name": "B"}, headers={"Authorization": f"Bearer {tok}"})
        slot1 = r1.json()["slot"]
        r = client.delete(f"/api/dashboard/layout/admin/{slot1}", headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 204
        r = client.get("/api/dashboard/layout/admin", headers={"Authorization": f"Bearer {tok}"})
        assert len(r.json()) == 1
        assert r.json()[0]["name"] == "B"

    def test_delete_last_preset_fails(self, client, setup_test_db):
        _make_user("admin", "a@test.cl")
        tok = _token(client, "a@test.cl")
        r = client.post("/api/dashboard/layout/admin", json={"name": "Solo"}, headers={"Authorization": f"Bearer {tok}"})
        slot = r.json()["slot"]
        r = client.delete(f"/api/dashboard/layout/admin/{slot}", headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 400

    def test_unauthenticated_returns_401(self, client, setup_test_db):
        r = client.get("/api/dashboard/layout/admin")
        assert r.status_code == 401


# ── data endpoints ────────────────────────────────────────────────────────────

from datetime import date
from app.models.nota_venta import NotaVenta
from app.models.cliente import Cliente
from decimal import Decimal


def _seed_data(vendedor_id: int, cliente_id: int | None = None) -> None:
    """Seeds one NV pendiente and one NV pagada for vendedor."""
    db = TestingSession()

    if cliente_id is None:
        cli = Cliente(nombre="Cliente Test")
        db.add(cli)
        db.flush()
        cliente_id = cli.id

    nv1 = NotaVenta(
        numero=9001,
        cliente_id=cliente_id,
        vendedor_id=vendedor_id,
        fecha=date.today(),
        estado="pendiente",
        total_neto=Decimal("1000"),
        total_iva=Decimal("190"),
        total=Decimal("1190"),
    )
    db.add(nv1)
    db.flush()

    nv2 = NotaVenta(
        numero=9002,
        cliente_id=cliente_id,
        vendedor_id=vendedor_id,
        fecha=date.today(),
        estado="pagada",
        total_neto=Decimal("2000"),
        total_iva=Decimal("380"),
        total=Decimal("2380"),
    )
    db.add(nv2)
    db.commit()
    db.close()


class TestDataEndpoints:
    def test_ventas_periodo_admin_sees_all(self, client, setup_test_db):
        _make_user("admin", "a@test.cl")
        v = _make_user("vendedor", "v@test.cl")
        _seed_data(v.id)
        tok = _token(client, "a@test.cl")
        r = client.get("/api/dashboard/data/ventas_periodo", headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 200
        body = r.json()
        assert "total" in body
        assert "series" in body
        assert body["total"] > 0

    def test_ventas_periodo_vendedor_sees_own(self, client, setup_test_db):
        _make_user("admin", "a@test.cl")
        v1 = _make_user("vendedor", "v1@test.cl")
        _make_user("vendedor", "v2@test.cl")
        _seed_data(v1.id)
        tok = _token(client, "v1@test.cl")
        r = client.get("/api/dashboard/data/ventas_periodo", headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 200
        assert r.json()["total"] > 0

    def test_cotizaciones_abiertas(self, client, setup_test_db):
        _make_user("admin", "a@test.cl")
        tok = _token(client, "a@test.cl")
        r = client.get("/api/dashboard/data/cotizaciones_abiertas",
                       headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 200
        body = r.json()
        assert "total" in body
        assert "por_estado" in body

    def test_stock_critico(self, client, setup_test_db):
        db = TestingSession()
        from app.models.producto import Producto
        p = Producto(nombre="Bajo Stock", precio_costo=Decimal("10"), precio_venta=Decimal("20"),
                     stock_minimo=10, stock_actual=2)
        db.add(p)
        db.commit()
        db.close()
        _make_user("admin", "a@test.cl")
        tok = _token(client, "a@test.cl")
        r = client.get("/api/dashboard/data/stock_critico",
                       headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 200
        items = r.json()
        assert any(i["nombre"] == "Bajo Stock" for i in items)

    def test_nv_por_cobrar(self, client, setup_test_db):
        _make_user("admin", "a@test.cl")
        v = _make_user("vendedor", "v@test.cl")
        _seed_data(v.id)
        tok = _token(client, "a@test.cl")
        r = client.get("/api/dashboard/data/nv_por_cobrar",
                       headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 200
        body = r.json()
        assert body["count"] >= 1
        assert body["total_monto"] >= 1190

    def test_vendedor_cannot_call_admin_only_widgets(self, client, setup_test_db):
        _make_user("vendedor", "v@test.cl")
        tok = _token(client, "v@test.cl")
        for widget_type in ("cotizaciones_por_vendedor", "ventas_por_vendedor"):
            r = client.get(f"/api/dashboard/data/{widget_type}",
                           headers={"Authorization": f"Bearer {tok}"})
            assert r.status_code == 403, f"{widget_type} should return 403 for vendedor"

    def test_top_clientes(self, client, setup_test_db):
        _make_user("admin", "a@test.cl")
        v = _make_user("vendedor", "v@test.cl")
        _seed_data(v.id)
        tok = _token(client, "a@test.cl")
        r = client.get("/api/dashboard/data/top_clientes",
                       headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_top_productos(self, client, setup_test_db):
        _make_user("admin", "a@test.cl")
        tok = _token(client, "a@test.cl")
        r = client.get("/api/dashboard/data/top_productos",
                       headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_unknown_widget_type_returns_404(self, client, setup_test_db):
        _make_user("admin", "a@test.cl")
        tok = _token(client, "a@test.cl")
        r = client.get("/api/dashboard/data/no_existe",
                       headers={"Authorization": f"Bearer {tok}"})
        assert r.status_code == 404
