"""Pure-logic module state calculator for Conico SaaS module gating."""
from __future__ import annotations
from app.core.modulos import OPTIONAL_MODULES

_DTE_SLUGS: frozenset[str] = frozenset({
    "facturas", "boletas", "guias_despacho", "nota_credito", "nota_debito",
})


def compute_effective_modulos(stored: dict[str, bool]) -> dict[str, bool]:
    """Return stored dict extended with dte_emission auto-activated if any DTE doc is on."""
    effective = dict(stored)
    effective["dte_emission"] = any(effective.get(s) for s in _DTE_SLUGS)
    return effective


class ModuloValidationError(Exception):
    def __init__(self, message: str, slug: str) -> None:
        super().__init__(message)
        self.slug = slug


def validate_toggle(current: dict[str, bool], slug: str, target: bool) -> None:
    """Raise ModuloValidationError if toggle would violate dependency constraints.

    Activating: all required parents must already be on.
    Deactivating: no active dependent may exist.
    """
    if slug not in OPTIONAL_MODULES:
        raise KeyError(f"Módulo desconocido: {slug!r}")

    spec = OPTIONAL_MODULES[slug]

    if target:
        for req in spec.requires:
            if req in OPTIONAL_MODULES and not current.get(req, False):
                raise ModuloValidationError(
                    f"No se puede activar '{slug}': requiere '{req}' (está desactivado)",
                    slug=slug,
                )
    else:
        for dep in spec.dependents:
            if current.get(dep, False):
                raise ModuloValidationError(
                    f"No se puede desactivar '{slug}': '{dep}' depende de él (está activo)",
                    slug=slug,
                )


def compute_cascade(
    current: dict[str, bool], slug: str, target: bool
) -> dict[str, bool]:
    """Return diff {slug: bool} representing cascade effect of toggling slug.

    When turning off: recursively turns off every dependent that is currently on.
    When turning on: returns only the slug itself (no auto-on of children).
    """
    if slug not in OPTIONAL_MODULES:
        raise KeyError(f"Módulo desconocido: {slug!r}")

    diff: dict[str, bool] = {slug: target}

    if not target:
        queue = list(OPTIONAL_MODULES[slug].dependents)
        visited: set[str] = {slug}
        while queue:
            dep = queue.pop()
            if dep in visited:
                continue
            visited.add(dep)
            if current.get(dep, False):
                diff[dep] = False
                queue.extend(OPTIONAL_MODULES[dep].dependents)

    return diff
