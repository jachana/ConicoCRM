"""Tests for the module registry (app/core/modulos.py)."""
import pytest
from app.core.modulos import (
    CORE_MODULES,
    OPTIONAL_MODULES,
    CATEGORIAS,
    all_modulo_slugs,
    get_modulo,
    modulos_by_categoria,
)


# ---------------------------------------------------------------------------
# Registry coherence
# ---------------------------------------------------------------------------

def test_all_requires_point_to_existing_slugs():
    optional_slugs = frozenset(OPTIONAL_MODULES)
    all_slugs = CORE_MODULES | optional_slugs
    for slug, spec in OPTIONAL_MODULES.items():
        for req in spec.requires:
            assert req in all_slugs, (
                f"{slug}.requires includes unknown slug {req!r}"
            )


def test_no_dependency_cycles():
    """Detect cycles in the requires graph using DFS."""
    def _dfs(slug: str, visited: set[str], stack: set[str]) -> None:
        visited.add(slug)
        stack.add(slug)
        spec = OPTIONAL_MODULES.get(slug)
        if spec:
            for req in spec.requires:
                if req not in OPTIONAL_MODULES:
                    continue
                assert req not in stack, (
                    f"Cycle detected: {slug} -> {req} (stack={sorted(stack)})"
                )
                if req not in visited:
                    _dfs(req, visited, stack)
        stack.discard(slug)

    visited: set[str] = set()
    for slug in OPTIONAL_MODULES:
        if slug not in visited:
            _dfs(slug, visited, set())


def test_all_categories_are_declared():
    cat_set = set(CATEGORIAS)
    for slug, spec in OPTIONAL_MODULES.items():
        assert spec.categoria in cat_set, (
            f"{slug} has unknown categoria {spec.categoria!r}"
        )


def test_categorias_cover_all_modules():
    by_cat = modulos_by_categoria()
    covered = {slug for entries in by_cat.values() for slug, _ in entries}
    assert covered == frozenset(OPTIONAL_MODULES)


# ---------------------------------------------------------------------------
# all_modulo_slugs
# ---------------------------------------------------------------------------

def test_all_modulo_slugs_includes_core_and_optional():
    slugs = all_modulo_slugs()
    assert CORE_MODULES <= slugs
    assert frozenset(OPTIONAL_MODULES) <= slugs


# ---------------------------------------------------------------------------
# get_modulo
# ---------------------------------------------------------------------------

def test_get_modulo_returns_spec():
    spec = get_modulo("facturas")
    assert spec.label == "Facturas"
    assert spec.categoria == "ventas"


def test_get_modulo_raises_on_unknown():
    with pytest.raises(KeyError, match="desconocido"):
        get_modulo("nonexistent_slug_xyz")


# ---------------------------------------------------------------------------
# modulos_by_categoria
# ---------------------------------------------------------------------------

def test_modulos_by_categoria_has_all_categories():
    by_cat = modulos_by_categoria()
    assert set(by_cat.keys()) == set(CATEGORIAS)


def test_modulos_by_categoria_ventas_contains_facturas():
    by_cat = modulos_by_categoria()
    ventas_slugs = [s for s, _ in by_cat["ventas"]]
    assert "facturas" in ventas_slugs
    assert "boletas" in ventas_slugs


# ---------------------------------------------------------------------------
# dependents auto-population
# ---------------------------------------------------------------------------

def test_dependents_populated_from_requires():
    # cotizaciones is required by notas_venta, aprobaciones_descuento
    cot = OPTIONAL_MODULES["cotizaciones"]
    assert "notas_venta" in cot.dependents
    assert "aprobaciones_descuento" in cot.dependents


def test_dependents_not_duplicated():
    for slug, spec in OPTIONAL_MODULES.items():
        assert len(spec.dependents) == len(set(spec.dependents)), (
            f"{slug} has duplicate dependents"
        )


# ---------------------------------------------------------------------------
# Router coverage: key optional-feature routers must have a slug
# ---------------------------------------------------------------------------

EXPECTED_ROUTER_SLUGS = [
    "cotizaciones", "notas_venta", "facturas", "boletas", "guias_despacho",
    "nota_credito", "nota_debito", "proveedores", "ordenes_compra",
    "facturas_compra", "inventario", "listas_precios", "precios_especiales",
    "pagos", "cobranza", "bancos_receptores", "libros", "dte_recepcion",
    "oportunidades", "tareas", "reglas_tareas", "rrhh_empleados",
    "rrhh_vacaciones", "rrhh_documentos", "aprobaciones_descuento",
    "aprobaciones_costo", "aprobaciones_margen",
]


def test_all_router_slugs_registered():
    optional_slugs = frozenset(OPTIONAL_MODULES)
    for slug in EXPECTED_ROUTER_SLUGS:
        assert slug in optional_slugs, f"Router slug {slug!r} missing from OPTIONAL_MODULES"
