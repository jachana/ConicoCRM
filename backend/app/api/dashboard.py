# backend/app/api/dashboard.py
import json
from collections import defaultdict
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.api.auth import get_current_user
from app.database import get_db
from app.models.cliente import Cliente
from app.models.cotizacion import Cotizacion
from app.models.dashboard_layout import DashboardLayout
from app.models.nota_venta import NotaVenta, NotaVentaLinea
from app.models.producto import Producto
from app.models.user import User
from app.models.user import User as UserModel
from app.schemas.dashboard_layout import (
    CotizacionesAbiertasOut,
    CreatePresetPayload,
    DashboardSummaryOut,
    EstadoCount,
    LayoutPayload,
    NVPorCobrarItem,
    NVPorCobrarOut,
    PresetOut,
    PresetPayload,
    StockCriticoItem,
    TopClienteItem,
    TopProductoItem,
    VendedorMetricaItem,
    VentasPeriodoOut,
    VentasPeriodoSerie,
)

router = APIRouter()


def _layout_to_preset(layout: DashboardLayout) -> PresetOut:
    payload = LayoutPayload(**json.loads(layout.layout_json))
    return PresetOut(slot=layout.slot, name=layout.name, layout=payload, updated_at=layout.updated_at)


def _get_presets_for_role(db: Session, role: str) -> list[DashboardLayout]:
    rows = db.query(DashboardLayout).filter_by(role=role).order_by(DashboardLayout.slot).all()
    if not rows and role == "subadmin":
        rows = db.query(DashboardLayout).filter_by(role="admin").order_by(DashboardLayout.slot).all()
    return rows


@router.get("/layout/{role}", response_model=list[PresetOut])
def list_presets(
    role: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return [_layout_to_preset(l) for l in _get_presets_for_role(db, role)]


@router.post("/layout/{role}", response_model=PresetOut, status_code=201)
def create_preset(
    role: str,
    body: CreatePresetPayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo admin puede crear dashboards")
    existing = db.query(DashboardLayout).filter_by(role=role).all()
    if len(existing) >= 5:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Máximo 5 dashboards por rol")
    used_slots = {l.slot for l in existing}
    slot = next(s for s in range(1, 6) if s not in used_slots)
    layout = DashboardLayout(
        role=role, slot=slot, name=body.name,
        layout_json='{"widgets": []}',
        updated_by=current_user.id,
        updated_at=datetime.now(timezone.utc),
    )
    db.add(layout)
    db.commit()
    db.refresh(layout)
    return _layout_to_preset(layout)


@router.put("/layout/{role}/{slot}", response_model=PresetOut)
def save_preset(
    role: str,
    slot: int,
    body: PresetPayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo admin puede editar el layout")
    layout = db.query(DashboardLayout).filter_by(role=role, slot=slot).first()
    if layout is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dashboard no encontrado")
    layout.name = body.name
    layout.layout_json = body.layout.model_dump_json()
    layout.updated_by = current_user.id
    layout.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(layout)
    return _layout_to_preset(layout)


@router.delete("/layout/{role}/{slot}", status_code=204)
def delete_preset(
    role: str,
    slot: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Solo admin puede eliminar dashboards")
    layout = db.query(DashboardLayout).filter_by(role=role, slot=slot).first()
    if not layout:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dashboard no encontrado")
    count = db.query(DashboardLayout).filter_by(role=role).count()
    if count <= 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No se puede eliminar el único dashboard")
    db.delete(layout)
    db.commit()


# ── helpers ──────────────────────────────────────────────────────────────────

def _vendor_filter(q, model, current_user: User):
    if current_user.role == "vendedor":
        q = q.filter(model.vendedor_id == current_user.id)
    return q


def _date_filter(q, model, date_from: date | None, date_to: date | None):
    if date_from:
        q = q.filter(model.fecha >= date_from)
    if date_to:
        q = q.filter(model.fecha <= date_to)
    return q


# ── data handlers ─────────────────────────────────────────────────────────────

_VALID_GRANULARITIES = {"day", "week", "month", "year"}


def _period_key(d: date, granularity: str) -> str:
    if granularity == "day":
        return d.strftime("%Y-%m-%d")
    if granularity == "week":
        iso = d.isocalendar()
        return f"{iso[0]}-W{iso[1]:02d}"
    if granularity == "year":
        return d.strftime("%Y")
    return d.strftime("%Y-%m")


def _data_ventas_periodo(db, current_user, date_from, date_to, limit, granularity="month"):
    if granularity not in _VALID_GRANULARITIES:
        granularity = "month"
    q = db.query(NotaVenta).filter(NotaVenta.estado.in_(["pagada", "entregada", "despachada"]))
    q = _vendor_filter(q, NotaVenta, current_user)
    q = _date_filter(q, NotaVenta, date_from, date_to)
    nvs = q.all()
    total = sum(float(nv.total) for nv in nvs)
    by_period: dict[str, float] = defaultdict(float)
    for nv in nvs:
        by_period[_period_key(nv.fecha, granularity)] += float(nv.total)
    series = [VentasPeriodoSerie(periodo=k, monto=v) for k, v in sorted(by_period.items())]
    return VentasPeriodoOut(total=total, series=series)


def _data_cotizaciones_abiertas(db, current_user, date_from, date_to, limit):
    q = db.query(Cotizacion).filter(Cotizacion.estado.in_(["abierta", "no_definido"]))
    q = _vendor_filter(q, Cotizacion, current_user)
    q = _date_filter(q, Cotizacion, date_from, date_to)
    cots = q.all()
    by_estado: dict[str, int] = defaultdict(int)
    for c in cots:
        by_estado[c.estado] += 1
    por_estado = [EstadoCount(estado=k, count=v) for k, v in by_estado.items()]
    return CotizacionesAbiertasOut(total=len(cots), por_estado=por_estado)


def _data_top_clientes(db, current_user, date_from, date_to, limit):
    q = db.query(NotaVenta)
    q = _vendor_filter(q, NotaVenta, current_user)
    q = _date_filter(q, NotaVenta, date_from, date_to)
    nvs = q.all()
    by_cliente: dict[int, float] = defaultdict(float)
    for nv in nvs:
        by_cliente[nv.cliente_id] += float(nv.total)
    top = sorted(by_cliente.items(), key=lambda x: x[1], reverse=True)[:limit]
    result = []
    for cid, total in top:
        cli = db.get(Cliente, cid)
        if cli:
            result.append(TopClienteItem(cliente_id=cid, nombre=cli.nombre, total=total))
    return result


def _data_top_productos(db, current_user, date_from, date_to, limit):
    q = db.query(NotaVenta)
    q = _vendor_filter(q, NotaVenta, current_user)
    q = _date_filter(q, NotaVenta, date_from, date_to)
    nv_ids = [nv.id for nv in q.all()]
    if not nv_ids:
        return []
    lineas = db.query(NotaVentaLinea).filter(
        NotaVentaLinea.nv_id.in_(nv_ids),
        NotaVentaLinea.producto_id.isnot(None),
    ).all()
    by_prod: dict[int, tuple[int, float]] = defaultdict(lambda: (0, 0.0))
    for ln in lineas:
        qty, tot = by_prod[ln.producto_id]
        by_prod[ln.producto_id] = (qty + ln.cantidad, tot + float(ln.total))
    top = sorted(by_prod.items(), key=lambda x: x[1][1], reverse=True)[:limit]
    result = []
    for pid, (qty, tot) in top:
        p = db.get(Producto, pid)
        if p:
            result.append(TopProductoItem(
                producto_id=pid, nombre=p.nombre, sku=p.sku, cantidad=qty, total=tot
            ))
    return result


def _data_stock_critico(db, current_user, date_from, date_to, limit):
    productos = db.query(Producto).filter(
        Producto.stock_actual < Producto.stock_minimo
    ).order_by(Producto.stock_actual.asc()).limit(limit).all()
    return [
        StockCriticoItem(
            producto_id=p.id, nombre=p.nombre, sku=p.sku,
            stock_actual=p.stock_actual, stock_minimo=p.stock_minimo,
        )
        for p in productos
    ]


def _data_nv_por_cobrar(db, current_user, date_from, date_to, limit):
    q = db.query(NotaVenta).filter(NotaVenta.estado.in_(["pendiente", "despachada"]))
    q = _vendor_filter(q, NotaVenta, current_user)
    nvs = q.options(joinedload(NotaVenta.cliente)).order_by(NotaVenta.numero.desc()).limit(limit).all()
    total_monto = sum(float(nv.total) for nv in nvs)
    items = [
        NVPorCobrarItem(
            numero=nv.numero,
            cliente=nv.cliente.nombre if nv.cliente else str(nv.cliente_id),
            total=float(nv.total),
        )
        for nv in nvs
    ]
    count_q = db.query(func.count(NotaVenta.id)).filter(
        NotaVenta.estado.in_(["pendiente", "despachada"])
    )
    if current_user.role == "vendedor":
        count_q = count_q.filter(NotaVenta.vendedor_id == current_user.id)
    return NVPorCobrarOut(total_monto=total_monto, count=count_q.scalar() or 0, items=items)


def _data_cotizaciones_por_vendedor(db, current_user, date_from, date_to, limit):
    q = db.query(Cotizacion)
    q = _date_filter(q, Cotizacion, date_from, date_to)
    cots = q.all()
    by_v: dict[int, tuple[int, float]] = defaultdict(lambda: (0, 0.0))
    for c in cots:
        cnt, tot = by_v[c.vendedor_id]
        by_v[c.vendedor_id] = (cnt + 1, tot + float(c.total))
    top = sorted(by_v.items(), key=lambda x: x[1][1], reverse=True)[:limit]
    result = []
    for vid, (cnt, tot) in top:
        u = db.get(UserModel, vid)
        if u:
            result.append(VendedorMetricaItem(vendedor_id=vid, nombre=u.name, total=tot, count=cnt))
    return result


def _data_ventas_por_vendedor(db, current_user, date_from, date_to, limit):
    q = db.query(NotaVenta)
    q = _date_filter(q, NotaVenta, date_from, date_to)
    nvs = q.all()
    by_v: dict[int, tuple[int, float]] = defaultdict(lambda: (0, 0.0))
    for nv in nvs:
        if nv.vendedor_id is None:
            continue
        cnt, tot = by_v[nv.vendedor_id]
        by_v[nv.vendedor_id] = (cnt + 1, tot + float(nv.total))
    top = sorted(by_v.items(), key=lambda x: x[1][1], reverse=True)[:limit]
    result = []
    for vid, (cnt, tot) in top:
        u = db.get(UserModel, vid)
        if u:
            result.append(VendedorMetricaItem(vendedor_id=vid, nombre=u.name, total=tot, count=cnt))
    return result


# ── data router ───────────────────────────────────────────────────────────────

_ADMIN_ONLY = {"cotizaciones_por_vendedor", "ventas_por_vendedor"}

_DATA_HANDLERS = {
    "ventas_periodo": _data_ventas_periodo,
    "cotizaciones_abiertas": _data_cotizaciones_abiertas,
    "top_clientes": _data_top_clientes,
    "top_productos": _data_top_productos,
    "stock_critico": _data_stock_critico,
    "nv_por_cobrar": _data_nv_por_cobrar,
    "cotizaciones_por_vendedor": _data_cotizaciones_por_vendedor,
    "ventas_por_vendedor": _data_ventas_por_vendedor,
}


@router.get("/summary", response_model=DashboardSummaryOut)
def get_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Quick KPIs for dashboard hero strip — today/yesterday/this-month vs last-month."""
    today = date.today()
    yesterday = date.fromordinal(today.toordinal() - 1)
    month_start = today.replace(day=1)
    if month_start.month == 1:
        prev_month_start = month_start.replace(year=month_start.year - 1, month=12)
    else:
        prev_month_start = month_start.replace(month=month_start.month - 1)
    prev_month_end = date.fromordinal(month_start.toordinal() - 1)

    sold_states = ["pagada", "entregada", "despachada"]

    def _sum_count(start: date, end: date) -> tuple[float, int]:
        q = db.query(NotaVenta).filter(
            NotaVenta.estado.in_(sold_states),
            NotaVenta.fecha >= start,
            NotaVenta.fecha <= end,
        )
        q = _vendor_filter(q, NotaVenta, current_user)
        rows = q.all()
        return sum(float(nv.total) for nv in rows), len(rows)

    ventas_hoy, hoy_count = _sum_count(today, today)
    ventas_ayer, _ = _sum_count(yesterday, yesterday)
    ventas_mes, mes_count = _sum_count(month_start, today)
    ventas_mes_anterior, _ = _sum_count(prev_month_start, prev_month_end)

    pend_q = db.query(NotaVenta).filter(NotaVenta.estado.in_(["pendiente", "despachada"]))
    pend_q = _vendor_filter(pend_q, NotaVenta, current_user)
    pend_rows = pend_q.all()
    nv_pendientes_count = len(pend_rows)
    nv_pendientes_monto = sum(float(nv.total) for nv in pend_rows)

    cot_q = db.query(func.count(Cotizacion.id)).filter(
        Cotizacion.estado.in_(["abierta", "no_definido"])
    )
    if current_user.role == "vendedor":
        cot_q = cot_q.filter(Cotizacion.vendedor_id == current_user.id)
    cotizaciones_abiertas_count = cot_q.scalar() or 0

    stock_critico_count = (
        db.query(func.count(Producto.id))
        .filter(Producto.stock_actual < Producto.stock_minimo)
        .scalar()
        or 0
    )

    return DashboardSummaryOut(
        ventas_hoy=ventas_hoy,
        ventas_hoy_count=hoy_count,
        ventas_ayer=ventas_ayer,
        ventas_mes=ventas_mes,
        ventas_mes_count=mes_count,
        ventas_mes_anterior=ventas_mes_anterior,
        nv_pendientes_count=nv_pendientes_count,
        nv_pendientes_monto=nv_pendientes_monto,
        cotizaciones_abiertas_count=cotizaciones_abiertas_count,
        stock_critico_count=stock_critico_count,
    )


@router.get("/data/{widget_type}")
def get_widget_data(
    widget_type: str,
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    limit: int = Query(10, ge=1, le=100),
    granularity: str | None = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if widget_type not in _DATA_HANDLERS:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Widget '{widget_type}' no existe")
    if widget_type in _ADMIN_ONLY and current_user.role == "vendedor":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sin permisos")
    handler = _DATA_HANDLERS[widget_type]
    if widget_type == "ventas_periodo":
        return handler(db, current_user, date_from, date_to, limit, granularity or "month")
    return handler(db, current_user, date_from, date_to, limit)
