from fastapi import APIRouter, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import require_modulo, require_permission
from app.models.movimiento_inventario import MovimientoInventario
from app.models.nota_venta import NotaVenta
from app.models.producto import Producto
from app.models.user import User
from app.schemas.nota_venta import NotaVentaOut

router = APIRouter(dependencies=[require_modulo("aprobaciones_costo")])


@router.post("/{nv_id}/aprobar", response_model=NotaVentaOut)
def aprobar_costo(
    nv_id: int,
    perms: tuple[User, Session] = require_permission("nota_venta", "edit"),
):
    current_user, db = perms
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo admin puede aprobar")
    nv = db.get(NotaVenta, nv_id)
    if not nv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="NV no encontrada")
    if nv.estado != "pendiente_aprobacion_costo":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La NV no está pendiente de aprobación de costo")

    # NVs ya no mueven stock — solo facturas/boletas descuentan stock al emitirse.
    nv.estado = "pendiente"
    db.commit()
    from app.api.nota_ventas import _load_nv
    return _load_nv(db, nv_id)
