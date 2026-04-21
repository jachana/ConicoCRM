"""Reportes — JSON endpoints for Ventas, Cobranza, and Inventario."""
from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.api.deps import require_permission
from app.models.dte_emision import DteEmision
from app.models.factura import Factura, FacturaLinea
from app.models.movimiento_inventario import MovimientoInventario
from app.models.orden_compra import OrdenCompra
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
        .options(joinedload(Factura.cliente), joinedload(Factura.vendedor))
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
        .options(joinedload(Factura.empresa))
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
        if p.stock_actual < p.stock_minimo
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
        .options(joinedload(MovimientoInventario.producto))
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


# ---------------------------------------------------------------------------
# GET /compras
# ---------------------------------------------------------------------------

_OC_PENDING_ESTADOS = {"borrador", "enviada", "pendiente"}

_DTE_LABELS: dict[str, str] = {
    "033": "Factura",
    "061": "Nota Crédito",
    "056": "Nota Débito",
}


@router.get("/compras")
def reporte_compras(
    date_from: date = Query(...),
    date_to: date = Query(...),
    perms: tuple[User, Session] = require_permission("facturas", "view"),
):
    _validate_dates(date_from, date_to)
    _, db = perms

    ocs: list[OrdenCompra] = (
        db.query(OrdenCompra)
        .options(joinedload(OrdenCompra.proveedor))
        .filter(
            OrdenCompra.fecha >= date_from,
            OrdenCompra.fecha <= date_to,
        )
        .all()
    )

    total_comprado = sum((oc.total for oc in ocs), _ZERO)
    num_oc_emitidas = len(ocs)
    num_oc_pendientes = sum(1 for oc in ocs if oc.estado in _OC_PENDING_ESTADOS)

    # --- Por proveedor ---
    prov_map: dict[int, dict] = {}
    for oc in ocs:
        if oc.proveedor_id is None:
            continue
        pid = oc.proveedor_id
        entry = prov_map.setdefault(
            pid,
            {
                "proveedor_id": pid,
                "nombre": oc.proveedor.nombre if oc.proveedor else "",
                "total": _ZERO,
                "num_oc": 0,
            },
        )
        entry["total"] += oc.total
        entry["num_oc"] += 1
    por_proveedor = sorted(prov_map.values(), key=lambda x: x["total"], reverse=True)
    for p in por_proveedor:
        p["total"] = float(p["total"])

    # --- Por estado ---
    estado_map: dict[str, dict] = {}
    for oc in ocs:
        entry = estado_map.setdefault(
            oc.estado,
            {"estado": oc.estado, "count": 0, "total": _ZERO},
        )
        entry["count"] += 1
        entry["total"] += oc.total
    por_estado = sorted(estado_map.values(), key=lambda x: x["count"], reverse=True)
    for e in por_estado:
        e["total"] = float(e["total"])

    return {
        "kpis": {
            "total_comprado": float(total_comprado),
            "num_oc_emitidas": num_oc_emitidas,
            "num_oc_pendientes": num_oc_pendientes,
        },
        "por_proveedor": por_proveedor,
        "por_estado": por_estado,
    }


# ---------------------------------------------------------------------------
# GET /margenes
# ---------------------------------------------------------------------------

@router.get("/margenes")
def reporte_margenes(
    date_from: date = Query(...),
    date_to: date = Query(...),
    perms: tuple[User, Session] = require_permission("facturas", "view"),
):
    _validate_dates(date_from, date_to)
    current_user, db = perms

    base_q = (
        db.query(Factura)
        .options(joinedload(Factura.lineas))
        .filter(
            Factura.fecha >= date_from,
            Factura.fecha <= date_to,
            Factura.estado != "anulada",
        )
    )
    if current_user.role == "vendedor":
        base_q = base_q.filter(Factura.vendedor_id == current_user.id)

    facturas: list[Factura] = base_q.all()

    # --- Por factura ---
    por_factura_list: list[dict] = []
    all_factura_margen_pcts: list[float] = []

    # --- Por producto (grouped by producto_id) ---
    prod_map: dict[int, dict] = {}

    for f in facturas:
        lineas_con_margen = [ln for ln in f.lineas if ln.margen is not None]
        total_neto_f = sum((ln.valor_neto for ln in f.lineas), _ZERO)
        margen_total = sum(
            (ln.margen * ln.valor_neto for ln in lineas_con_margen), _ZERO
        )
        if total_neto_f > _ZERO:
            margen_pct_f = float(margen_total / total_neto_f * 100)
        else:
            margen_pct_f = 0.0

        all_factura_margen_pcts.append(margen_pct_f)
        por_factura_list.append(
            {
                "factura_id": f.id,
                "numero": f.numero,
                "total": float(f.total),
                "margen_total": float(margen_total),
                "margen_pct": round(margen_pct_f, 2),
            }
        )

        # Aggregate per producto (producto_id)
        for ln in f.lineas:
            if ln.margen is None:
                continue
            if ln.producto_id is None:
                continue
            key = ln.producto_id
            entry = prod_map.setdefault(
                key,
                {
                    "producto_id": ln.producto_id,
                    "nombre": ln.descripcion,
                    "cantidad_vendida": 0,
                    "precio_venta_sum": _ZERO,
                    "precio_venta_count": 0,
                    "margen_pct_sum": Decimal("0"),
                    "margen_pct_count": 0,
                },
            )
            entry["cantidad_vendida"] += ln.cantidad
            if ln.cantidad > 0:
                entry["precio_venta_sum"] += ln.valor_neto / ln.cantidad
                entry["precio_venta_count"] += 1
            entry["margen_pct_sum"] += ln.margen * 100
            entry["margen_pct_count"] += 1

    # Flatten por_producto
    por_producto: list[dict] = []
    for entry in prod_map.values():
        avg_venta = (
            float(entry["precio_venta_sum"] / entry["precio_venta_count"])
            if entry["precio_venta_count"] > 0
            else 0.0
        )
        avg_margen = (
            float(entry["margen_pct_sum"] / entry["margen_pct_count"])
            if entry["margen_pct_count"] > 0
            else 0.0
        )
        por_producto.append(
            {
                "producto_id": entry["producto_id"],
                "nombre": entry["nombre"],
                "cantidad_vendida": entry["cantidad_vendida"],
                "precio_costo_promedio": 0.0,
                "precio_venta_promedio": round(avg_venta, 2),
                "margen_pct": round(avg_margen, 2),
            }
        )
    por_producto.sort(key=lambda x: x["margen_pct"], reverse=True)

    # --- KPIs ---
    margen_promedio_pct = (
        sum(all_factura_margen_pcts) / len(all_factura_margen_pcts)
        if all_factura_margen_pcts
        else 0.0
    )
    mejor_producto = por_producto[0] if por_producto else None
    peor_producto = por_producto[-1] if por_producto else None

    kpis: dict = {
        "margen_promedio_pct": round(margen_promedio_pct, 2),
        "mejor_producto": (
            {"nombre": mejor_producto["nombre"], "margen_pct": mejor_producto["margen_pct"]}
            if mejor_producto
            else None
        ),
        "peor_producto": (
            {"nombre": peor_producto["nombre"], "margen_pct": peor_producto["margen_pct"]}
            if peor_producto
            else None
        ),
    }

    return {
        "kpis": kpis,
        "por_producto": por_producto,
        "por_factura": por_factura_list,
    }


# ---------------------------------------------------------------------------
# GET /dte
# ---------------------------------------------------------------------------

_DTE_PENDING_ESTADOS = {"pendiente", "procesando"}


@router.get("/dte")
def reporte_dte(
    date_from: date = Query(...),
    date_to: date = Query(...),
    perms: tuple[User, Session] = require_permission("facturas", "view"),
):
    _validate_dates(date_from, date_to)
    _, db = perms

    date_to_exclusive = date_to + timedelta(days=1)

    emisiones: list[DteEmision] = (
        db.query(DteEmision)
        .filter(
            DteEmision.created_at >= date_from,
            DteEmision.created_at < date_to_exclusive,
        )
        .all()
    )

    total_emitidos = len(emisiones)
    aceptadas = sum(1 for e in emisiones if e.estado == "aceptada")
    rechazadas = sum(1 for e in emisiones if e.estado == "rechazada")
    pendientes = sum(1 for e in emisiones if e.estado in _DTE_PENDING_ESTADOS)

    # --- Por tipo ---
    tipo_map: dict[str, dict] = {}
    for e in emisiones:
        entry = tipo_map.setdefault(
            e.tipo,
            {
                "tipo": e.tipo,
                "label": _DTE_LABELS.get(e.tipo, e.tipo),
                "count": 0,
                "aceptadas": 0,
            },
        )
        entry["count"] += 1
        if e.estado == "aceptada":
            entry["aceptadas"] += 1
    por_tipo = sorted(tipo_map.values(), key=lambda x: x["count"], reverse=True)

    # --- Emisiones list ---
    emisiones_out: list[dict] = []
    for e in emisiones:
        detalle_rechazo: str | None = None
        if e.estado == "rechazada" and e.respuesta_sii is not None:
            detalle_rechazo = e.respuesta_sii.get("detalle")
        emisiones_out.append(
            {
                "id": e.id,
                "tipo": e.tipo,
                "folio": e.folio,
                "estado": e.estado,
                "monto_total": e.monto_total,
                "created_at": e.created_at.date().isoformat(),
                "detalle_rechazo": detalle_rechazo,
            }
        )

    return {
        "kpis": {
            "total_emitidos": total_emitidos,
            "aceptadas": aceptadas,
            "rechazadas": rechazadas,
            "pendientes": pendientes,
        },
        "por_tipo": por_tipo,
        "emisiones": emisiones_out,
    }
