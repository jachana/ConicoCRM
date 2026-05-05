from __future__ import annotations
from dataclasses import dataclass, field


CORE_MODULES: frozenset[str] = frozenset({
    "catalogo",
    "clientes",
    "empresas",
    "usuarios",
    "dashboard",
})


@dataclass
class ModuloSpec:
    label: str
    categoria: str
    requires: list[str] = field(default_factory=list)
    dependents: list[str] = field(default_factory=list)


OPTIONAL_MODULES: dict[str, ModuloSpec] = {
    # ventas
    "cotizaciones":           ModuloSpec("Cotizaciones",             "ventas"),
    "notas_venta":            ModuloSpec("Notas de Venta",           "ventas",    requires=["cotizaciones"]),
    "facturas":               ModuloSpec("Facturas",                 "ventas",    requires=["notas_venta"]),
    "boletas":                ModuloSpec("Boletas",                  "ventas"),
    "guias_despacho":         ModuloSpec("Guías de Despacho",        "ventas",    requires=["notas_venta"]),
    "nota_credito":           ModuloSpec("Notas de Crédito",         "ventas",    requires=["facturas"]),
    "nota_debito":            ModuloSpec("Notas de Débito",          "ventas",    requires=["facturas"]),
    # compras
    "proveedores":            ModuloSpec("Proveedores",              "compras"),
    "ordenes_compra":         ModuloSpec("Órdenes de Compra",        "compras",   requires=["proveedores"]),
    "facturas_compra":        ModuloSpec("Facturas de Compra",       "compras",   requires=["proveedores", "ordenes_compra"]),
    # inventario_precios
    "inventario":             ModuloSpec("Inventario",               "inventario_precios"),
    "listas_precios":         ModuloSpec("Listas de Precios",        "inventario_precios", requires=["inventario"]),
    "precios_especiales":     ModuloSpec("Precios Especiales",       "inventario_precios", requires=["listas_precios"]),
    # finanzas
    "pagos":                  ModuloSpec("Pagos",                    "finanzas",  requires=["facturas"]),
    "cobranza":               ModuloSpec("Cobranza",                 "finanzas",  requires=["facturas"]),
    "bancos_receptores":      ModuloSpec("Bancos Receptores",        "finanzas",  requires=["cobranza"]),
    "libros":                 ModuloSpec("Libros Contables",         "finanzas",  requires=["facturas", "boletas"]),
    # dte_sii
    "dte_recepcion":          ModuloSpec("DTE Recepción",            "dte_sii",   requires=["facturas"]),
    # crm
    "oportunidades":          ModuloSpec("Oportunidades",            "crm"),
    "tareas":                 ModuloSpec("Tareas",                   "crm"),
    "reglas_tareas":          ModuloSpec("Reglas de Tareas",         "crm",       requires=["tareas"]),
    # rrhh
    "rrhh_empleados":         ModuloSpec("Empleados",                "rrhh"),
    "rrhh_vacaciones":        ModuloSpec("Vacaciones",               "rrhh",      requires=["rrhh_empleados"]),
    "rrhh_documentos":        ModuloSpec("Documentos RRHH",          "rrhh",      requires=["rrhh_empleados"]),
    # aprobaciones
    "aprobaciones_descuento": ModuloSpec("Aprobaciones Descuento",   "aprobaciones", requires=["cotizaciones"]),
    "aprobaciones_costo":     ModuloSpec("Aprobaciones Costo",       "aprobaciones"),
    "aprobaciones_margen":    ModuloSpec("Aprobaciones Margen",      "aprobaciones"),
}


def _build_dependents() -> None:
    for slug, spec in OPTIONAL_MODULES.items():
        for req in spec.requires:
            if req in OPTIONAL_MODULES:
                OPTIONAL_MODULES[req].dependents.append(slug)


_build_dependents()

_ALL_SLUGS: frozenset[str] = CORE_MODULES | frozenset(OPTIONAL_MODULES)

CATEGORIAS: tuple[str, ...] = (
    "ventas", "compras", "inventario_precios", "finanzas",
    "dte_sii", "crm", "rrhh", "aprobaciones",
)


def all_modulo_slugs() -> frozenset[str]:
    return _ALL_SLUGS


def get_modulo(slug: str) -> ModuloSpec:
    try:
        return OPTIONAL_MODULES[slug]
    except KeyError:
        raise KeyError(f"Módulo desconocido: {slug!r}")


def modulos_by_categoria() -> dict[str, list[tuple[str, ModuloSpec]]]:
    result: dict[str, list[tuple[str, ModuloSpec]]] = {cat: [] for cat in CATEGORIAS}
    for slug, spec in OPTIONAL_MODULES.items():
        result[spec.categoria].append((slug, spec))
    return result
