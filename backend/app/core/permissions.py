from sqlalchemy.orm import Session
from app.models.user import User
from app.models.permission import PermissionOverride

MODULES = [
    "catalogo", "clientes", "proveedores", "empresas", "cotizaciones", "nota_venta",
    "facturas", "ordenes_compra", "inventario", "rrhh", "dashboard", "usuarios",
]
ACTIONS = ["view", "create", "edit", "delete"]

_DEFAULT: dict[str, dict[str, dict[str, bool]]] = {
    "admin": {m: {a: True for a in ACTIONS} for m in MODULES},
    "subadmin": {
        "catalogo":       {"view": True,  "create": True,  "edit": True,  "delete": True},
        "clientes":       {"view": True,  "create": True,  "edit": True,  "delete": True},
        "proveedores":    {"view": True,  "create": True,  "edit": True,  "delete": True},
        "empresas":       {"view": True,  "create": True,  "edit": True,  "delete": True},
        "cotizaciones":   {"view": True,  "create": True,  "edit": True,  "delete": True},
        "nota_venta":     {"view": True,  "create": True,  "edit": True,  "delete": True},
        "facturas":       {"view": True,  "create": True,  "edit": True,  "delete": True},
        "ordenes_compra": {"view": True,  "create": True,  "edit": True,  "delete": True},
        "inventario":     {"view": True,  "create": True,  "edit": True,  "delete": True},
        "dashboard":      {"view": True,  "create": False, "edit": False, "delete": False},
        "rrhh":           {"view": False, "create": False, "edit": False, "delete": False},
        "usuarios":       {"view": False, "create": False, "edit": False, "delete": False},
    },
    "vendedor": {
        "catalogo":       {"view": True,  "create": False, "edit": False, "delete": False},
        "clientes":       {"view": True,  "create": True,  "edit": True,  "delete": False},  # no borrar clientes propios
        "proveedores":    {"view": False, "create": False, "edit": False, "delete": False},
        "empresas":       {"view": True,  "create": False, "edit": False, "delete": False},
        "cotizaciones":   {"view": True,  "create": True,  "edit": True,  "delete": False},
        "nota_venta":     {"view": True,  "create": True,  "edit": True,  "delete": False},
        "facturas":       {"view": True,  "create": False, "edit": False, "delete": False},
        "ordenes_compra": {"view": False, "create": False, "edit": False, "delete": False},
        "inventario":     {"view": False, "create": False, "edit": False, "delete": False},
        "dashboard":      {"view": True,  "create": False, "edit": False, "delete": False},
        "rrhh":           {"view": False, "create": False, "edit": False, "delete": False},
        "usuarios":       {"view": False, "create": False, "edit": False, "delete": False},
    },
}

def has_permission(db: Session, user: User, module: str, action: str) -> bool:
    if user.role == "admin":
        return True
    override = db.query(PermissionOverride).filter_by(
        user_id=user.id, module=module, action=action
    ).first()
    if override is not None:
        return override.allowed
    return _DEFAULT.get(user.role, {}).get(module, {}).get(action, False)

def get_user_permissions(db: Session, user: User) -> dict[str, dict[str, bool]]:
    overrides = {
        (o.module, o.action): o.allowed
        for o in db.query(PermissionOverride).filter_by(user_id=user.id).all()
    }
    result: dict[str, dict[str, bool]] = {}
    for module in MODULES:
        result[module] = {}
        for action in ACTIONS:
            key = (module, action)
            if key in overrides:
                result[module][action] = overrides[key]
            elif user.role == "admin":
                result[module][action] = True
            else:
                result[module][action] = _DEFAULT.get(user.role, {}).get(module, {}).get(action, False)
    return result
