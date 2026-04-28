from typing import Literal
from pydantic import BaseModel


AtajoBusqueda = Literal["ctrl_k", "ctrl_p", "ctrl_shift_f", "alt_s"]


DEFAULTS: dict = {
    "busqueda_boton_visible": True,
    "busqueda_atajo": "ctrl_k",
    "sidebar_hidden": [],
}


class PreferenciasOut(BaseModel):
    busqueda_boton_visible: bool
    busqueda_atajo: AtajoBusqueda
    sidebar_hidden: list[str]


class PreferenciasUpdate(BaseModel):
    busqueda_boton_visible: bool | None = None
    busqueda_atajo: AtajoBusqueda | None = None
    sidebar_hidden: list[str] | None = None


def merge_with_defaults(stored: dict | None) -> dict:
    return {**DEFAULTS, **(stored or {})}
