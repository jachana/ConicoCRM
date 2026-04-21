"""Reportes — JSON endpoints for Ventas, Cobranza, and Inventario."""
from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.models.empresa import Empresa
from app.models.factura import Factura
from app.models.movimiento_inventario import MovimientoInventario
from app.models.pago import Pago
from app.models.producto import Producto
from app.models.user import User

router = APIRouter()

_ZERO = Decimal("0")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _validate_dates(date_from: date, date_to: date) -> None:
    if date_from > date_to:
        raise HTTPException(422, detail="date_from debe ser anterior a date_to")


def _sum_pagos_for_ids(db: Session, factura_ids: list[int]) -> Decimal:
    if not factura_ids:
        return _ZERO
    result = db.query(func.sum(Pago.monto)).filter(Pago.factura_id.in_(factura_ids)).scalar()
    return Decimal(str(result)) if result is not None else _ZERO


# ---------------------------------------------------------------------------
# GET /ventas
# ---------------------------------------------------------------------------

@router.get("/ventas")
def reporte_ventas(
    date_from: date = Query(...),
    date_to: date = Query(...),
    perms: tuple[User, Session] = require_permission("facturas", "view"),
):
    _validate_dates(date_from, date_to)
    current_user, db = perms

    base_q = (
        db.query(Factura)
        .filter(
            Factura.fecha >= date_from,
            Factura.fecha <= date_to,
            Factura.estado != "anulada",
        )
    )
    if current_user.role == "vendedor":
        base_q = base_q.filter(Factura.vendedor_id == current_user.id)

    facturas = base_q.all()

    # --- KPIs core ---
    factura_ids = [f.id for f in facturas]
    total_vendido = sum((f.total for f in facturas), _ZERO)
    num_facturas = len(facturas)
    ticket_promedio = (total_vendido / num_facturas) if num_facturas else _ZERO

    total_pagado = _sum_pagos_for_ids(db, factura_ids)
    total_por_cobrar = total_vendido - total_pagado
    if total_por_cobrar < _ZERO:
        total_por_cobrar = _ZERO

    # --- Variación vs período anterior ---
    duration_days = (date_to - date_from).days + 1
    prev_to = date_from - timedelta(days=1)
    prev_from = prev_to - timedelta(days=duration_days - 1)

    prev_q = db.query(func.sum(Factura.total)).filter(
        Factura.fecha >= prev_from,
        Factura.fecha <= prev_to,
        Factura.estado != "anulada",
    )
    if current_user.role == "vendedor":
        prev_q = prev_q.filter(Factura.vendedor_id == current_user.id)
    prev_total_raw = prev_q.scalar()
    prev_total = Decimal(str(prev_total_raw)) if prev_total_raw else _ZERO

    if prev_total == _ZERO:
        variacion = 0.0
    else:
        variacion = float(((total_vendido - prev_total) / prev_total) * 100)

    # --- Ventas diarias ---
    daily_map: dict[date, Decimal] = {}
    for f in facturas:
        daily_map[f.fecha] = daily_map.get(f.fecha, _ZERO) + f.total
    ventas_diarias = [
        {"fecha": str(d), "monto": float(m)}
        for d, m in sorted(daily_map.items())
    ]

    # --- Top clientes ---
    cliente_map: dict[int, dict] = {}
    for f in facturas:
        if f.cliente_id is None:
            continue
        entry = cliente_map.setdefault(
            f.cliente_id,
            {
                "cliente_id": f.cliente_id,
                "nombre": f.cliente.nombre if f.cliente else "",
                "total": _ZERO,
                "num_facturas": 0,
            },
        )
        entry["total"] += f.total
        entry["num_facturas"] += 1
    top_clientes = sorted(cliente_map.values(), key=lambda x: x["total"], reverse=True)[:10]
    for c in top_clientes:
        c["total"] = float(c["total"])

    # --- Por vendedor (admin only; vendedor only sees themselves) ---
    vendedor_map: dict[int, dict] = {}
    for f in facturas:
        if f.vendedor_id is None:
            continue
        entry = vendedor_map.setdefault(
            f.vendedor_id,
            {
                "vendedor_id": f.vendedor_id,
                "nombre": f.vendedor.name if f.vendedor else "",
                "total": _ZERO,
                "num_facturas": 0,
            },
        )
        entry["total"] += f.total
        entry["num_facturas"] += 1
    por_vendedor = sorted(vendedor_map.values(), key=lambda x: x["total"], reverse=True)
    for v in por_vendedor:
        v["total"] = float(v["total"])

    return {
        "kpis": {
            "total_vendido": float(total_vendido),
            "num_facturas": num_facturas,
            "ticket_promedio": float(ticket_promedio),
            "total_por_cobrar": float(total_por_cobrar),
            "variacion_vs_periodo_anterior": round(variacion, 2),
        },
        "ventas_diarias": ventas_diarias,
        "top_clientes": top_clientes,
        "por_vendedor": por_vendedor,
    }


# ---------------------------------------------------------------------------
# GET /cobranza
# ---------------------------------------------------------------------------

@router.get("/cobranza")
def reporte_cobranza(
    date_from: date = Query(...),
    date_to: date = Query(...),
    perms: tuple[User, Session] = require_permission("facturas", "view"),
):
    _validate_dates(date_from, date_to)
    _, db = perms

    today = date.today()

    facturas = (
        db.query(Factura)
        .filter(
            Factura.fecha >= date_from,
            Factura.fecha <= date_to,
            Factura.estado != "anulada",
        )
        .all()
    )

    factura_ids = [f.id for f in facturas]
    # Build a map of pago totals per factura
    pago_rows = (
        db.query(Pago.factura_id, func.sum(Pago.monto))
        .filter(Pago.factura_id.in_(factura_ids))
        .group_by(Pago.factura_id)
        .all()
    ) if factura_ids else []
    pago_map: dict[int, Decimal] = {fid: Decimal(str(m)) for fid, m in pago_rows}

    total_por_cobrar = _ZERO
    total_vencido = _ZERO
    proximas_a_vencer_7d = _ZERO

    buckets: dict[str, dict] = {
        "d_0_30": {"count": 0, "monto": _ZERO},
        "d_31_60": {"count": 0, "monto": _ZERO},
        "d_61_90": {"count": 0, "monto": _ZERO},
        "d_90_plus": {"count": 0, "monto": _ZERO},
    }

    empresa_map: dict[int, dict] = {}

    for f in facturas:
        saldo = f.total - pago_map.get(f.id, _ZERO)

        if saldo <= _ZERO:
            continue

        total_por_cobrar += saldo

        venc = f.fecha_vencimiento
        if venc is not None:
            if venc < today:
                total_vencido += saldo
                dias_vencida = (today - venc).days
                # Aging bucket (only for overdue)
                if dias_vencida <= 30:
                    buckets["d_0_30"]["count"] += 1
                    buckets["d_0_30"]["monto"] += saldo
                elif dias_vencida <= 60:
                    buckets["d_31_60"]["count"] += 1
                    buckets["d_31_60"]["monto"] += saldo
                elif dias_vencida <= 90:
                    buckets["d_61_90"]["count"] += 1
                    buckets["d_61_90"]["monto"] += saldo
                else:
                    buckets["d_90_plus"]["count"] += 1
                    buckets["d_90_plus"]["monto"] += saldo
            else:
                dias_vencida = 0
                days_until = (venc - today).days
                if 0 <= days_until <= 7:
                    proximas_a_vencer_7d += saldo
        else:
            dias_vencida = 0

        # Aggregate by empresa
        emp_id = f.empresa_id
        if emp_id is not None:
            if emp_id not in empresa_map:
                empresa_map[emp_id] = {
                    "empresa_id": emp_id,
                    "nombre": f.empresa.nombre if f.empresa else "",
                    "saldo": _ZERO,
                    "dias_vencida": dias_vencida,
                }
            else:
                empresa_map[emp_id]["dias_vencida"] = max(
                    empresa_map[emp_id]["dias_vencida"], dias_vencida
                )
            empresa_map[emp_id]["saldo"] += saldo

    # Serialise buckets
    aging_out = {
        k: {"count": v["count"], "monto": float(v["monto"])}
        for k, v in buckets.items()
    }

    por_empresa = [
        {
            "empresa_id": e["empresa_id"],
            "nombre": e["nombre"],
            "saldo": float(e["saldo"]),
            "dias_vencida": e["dias_vencida"],
        }
        for e in sorted(empresa_map.values(), key=lambda x: x["saldo"], reverse=True)
    ]

    return {
        "kpis": {
            "total_por_cobrar": float(total_por_cobrar),
            "total_vencido": float(total_vencido),
            "proximas_a_vencer_7d": float(proximas_a_vencer_7d),
        },
        "aging": aging_out,
        "por_empresa": por_empresa,
    }


# ---------------------------------------------------------------------------
# GET /inventario
# ---------------------------------------------------------------------------

@router.get("/inventario")
def reporte_inventario(
    date_from: date = Query(...),
    date_to: date = Query(...),
    perms: tuple[User, Session] = require_permission("facturas", "view"),
):
    _validate_dates(date_from, date_to)
    _, db = perms

    # --- KPIs: current stock (date range ignored) ---
    productos = db.query(Producto).all()

    valor_total_stock = sum(
        (p.precio_costo * p.stock_actual for p in productos), _ZERO
    )
    bajo_minimo_list = [
        p for p in productos
        if p.stock_minimo is not None and p.stock_actual < p.stock_minimo
    ]
    num_sin_stock = sum(1 for p in productos if p.stock_actual <= 0)

    bajo_minimo_out = [
        {
            "producto_id": p.id,
            "nombre": p.nombre,
            "sku": p.sku,
            "stock_actual": p.stock_actual,
            "stock_minimo": p.stock_minimo,
        }
        for p in bajo_minimo_list
    ]

    # --- Top vendidos: use MovimientoInventario in the date range ---
    date_to_dt_exclusive = date_to + timedelta(days=1)

    movimientos = (
        db.query(MovimientoInventario)
        .filter(
            MovimientoInventario.tipo == "salida",
            MovimientoInventario.created_at >= date_from,
            MovimientoInventario.created_at < date_to_dt_exclusive,
        )
        .all()
    )

    top_map: dict[int, dict] = {}
    for m in movimientos:
        entry = top_map.setdefault(
            m.producto_id,
            {
                "producto_id": m.producto_id,
                "nombre": m.producto.nombre if m.producto else "",
                "cantidad_vendida": 0,
                "monto_total": _ZERO,
            },
        )
        entry["cantidad_vendida"] += m.cantidad
        precio = m.producto.precio_venta if m.producto else _ZERO
        entry["monto_total"] += Decimal(str(m.cantidad)) * precio

    top_vendidos = sorted(top_map.values(), key=lambda x: x["cantidad_vendida"], reverse=True)[:10]
    for t in top_vendidos:
        t["monto_total"] = float(t["monto_total"])

    return {
        "kpis": {
            "valor_total_stock": float(valor_total_stock),
            "num_bajo_minimo": len(bajo_minimo_list),
            "num_sin_stock": num_sin_stock,
        },
        "bajo_minimo": bajo_minimo_out,
        "top_vendidos": top_vendidos,
    }
