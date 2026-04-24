from datetime import date
from typing import Literal
from fastapi import APIRouter

from app.models.tarea import Tarea

router = APIRouter()


def prioridad_derivada(t: Tarea) -> Literal["vencida", "hoy", "futura"]:
    today = date.today()
    if t.estado == "pendiente" and t.due_date < today:
        return "vencida"
    if t.due_date == today:
        return "hoy"
    return "futura"


def serialize_tarea(t: Tarea) -> dict:
    return {
        "id": t.id,
        "titulo": t.titulo,
        "descripcion": t.descripcion,
        "due_date": t.due_date,
        "estado": t.estado,
        "motivo_descarte": t.motivo_descarte,
        "origen": t.origen,
        "tipo_regla": t.tipo_regla,
        "prioridad_derivada": prioridad_derivada(t),
        "asignado_id": t.asignado_id,
        "asignado_nombre": t.asignado.name if t.asignado else "",
        "creado_por_id": t.creado_por_id,
        "cliente_id": t.cliente_id,
        "empresa_id": t.empresa_id,
        "cotizacion_id": t.cotizacion_id,
        "nota_venta_id": t.nota_venta_id,
        "factura_id": t.factura_id,
        "producto_id": t.producto_id,
        "completada_at": t.completada_at,
        "created_at": t.created_at,
        "updated_at": t.updated_at,
    }
