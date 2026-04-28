"""Full data seed for Conico.
Run inside backend container:
  docker-compose exec backend python scripts/seed_all.py
"""
import sys, os, random
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import openpyxl
from app.database import SessionLocal
from app.models.user import User
from app.models.empresa import Empresa
from app.models.cliente import Cliente
from app.models.producto import Producto
from app.models.empleado import Empleado
from app.models.cotizacion import Cotizacion, CotizacionLinea
from app.models.nota_venta import NotaVenta, NotaVentaLinea
from app.models.factura import Factura, FacturaLinea
from app.models.proveedor import Proveedor
from app.models.orden_compra import OrdenCompra, OrdenCompraLinea
from app.models.pago import Pago
from app.models.nota_credito import NotaCredito, NotaCreditoLinea
from app.models.nota_debito import NotaDebito, NotaDebitoLinea
from app.models.guia_despacho import GuiaDespacho, GuiaDespachoLinea
from app.models.boleta import Boleta, BoletaLinea
from app.core.security import get_password_hash

DATA_DIR = os.environ.get("DATA_SEED_DIR", "/data_seed")

# ── Excel helpers ─────────────────────────────────────────────────────────────

HAS_DATA_DIR = os.path.isdir(DATA_DIR)

def xlsx_find(fragment):
    if not HAS_DATA_DIR:
        raise FileNotFoundError(f"DATA_DIR '{DATA_DIR}' not mounted")
    for f in os.listdir(DATA_DIR):
        if fragment.lower() in f.lower() and f.endswith(".xlsx"):
            return os.path.join(DATA_DIR, f)
    raise FileNotFoundError(f"No xlsx matching '{fragment}' in {DATA_DIR}")

def xlsx_rows(fragment, header_row=3):
    path = xlsx_find(fragment)
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.worksheets[0]
    raw = list(ws.iter_rows(min_row=header_row, values_only=True))
    wb.close()
    if not raw:
        return []
    headers = [str(h).strip() if h else f"_col{i}" for i, h in enumerate(raw[0])]
    rows = []
    for row in raw[1:]:
        if all(v is None for v in row):
            continue
        rows.append(dict(zip(headers, row)))
    return rows

def dec(val, default=Decimal("0")):
    if val is None:
        return default
    try:
        return Decimal(str(val)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except Exception:
        return default

def to_int(val, default=0):
    if val is None:
        return default
    try:
        return int(val)
    except Exception:
        return default

# ── Chilean fake data ─────────────────────────────────────────────────────────

NOMBRES = ["Carlos","Ana","Pedro","María","Juan","Sofía","Diego","Valentina",
           "Andrés","Camila","Felipe","Daniela","Rodrigo","Fernanda","Sebastián",
           "Javiera","Matías","Constanza","Nicolás","Isidora","Francisco","Antonia"]
APELLIDOS = ["González","Muñoz","Rodríguez","López","Martínez","García","Hernández",
             "Pérez","Torres","Flores","Soto","Castro","Ramírez","Morales","Fuentes",
             "Reyes","Vega","Vargas","Contreras","Medina","Pizarro","Bravo","Rojas"]
COMUNAS = ["Santiago","Providencia","Las Condes","Ñuñoa","Vitacura","La Florida",
           "Maipú","Pudahuel","Rancagua","Valparaíso","Viña del Mar","Concepción",
           "Antofagasta","Iquique","Temuco","Calama","Copiapó","La Serena"]
FORMAS_PAGO = ["Transferencia","Cheque","Contado","30 días","60 días","Crédito 30 días"]
CAPTACION = ["Referido","Web","LinkedIn","Llamada","Feria","Otro"]
CARGOS = ["Vendedor","Bodeguero","Administración","Contadora","Gerente","Chofer","Asistente de ventas"]

def _rut_dv(n):
    r, m = 0, 2
    for d in reversed(str(n)):
        r += int(d) * m
        m = m % 7 + 2
    dv = 11 - (r % 11)
    return "0" if dv == 11 else "K" if dv == 10 else str(dv)

def gen_rut():
    n = random.randint(5_000_000, 25_000_000)
    return f"{n}-{_rut_dv(n)}"

def gen_nombre():
    return f"{random.choice(NOMBRES)} {random.choice(APELLIDOS)}"

def gen_email(nombre):
    slug = nombre.lower().replace(" ", ".").replace("á","a").replace("é","e").replace("í","i").replace("ó","o").replace("ú","u")
    domain = random.choice(["gmail.com","yahoo.com","empresa.cl","outlook.com","hotmail.com"])
    return f"{slug}{random.randint(1,99)}@{domain}"

def rand_date(days_ago_max=365, days_ago_min=0):
    return date.today() - timedelta(days=random.randint(days_ago_min, days_ago_max))

# ── Seed functions ────────────────────────────────────────────────────────────

def seed_users(db):
    if db.query(User).count():
        print("  users: already present, skipping")
        return db.query(User).all()
    entries = [
        ("admin@conico.cl",          "Administrador",      "admin"),
        ("carlos.mendoza@conico.cl", "Carlos Mendoza",     "vendedor"),
        ("ana.garcia@conico.cl",     "Ana García",         "vendedor"),
        ("pedro.soto@conico.cl",     "Pedro Soto",         "vendedor"),
        ("subadmin@conico.cl",       "Sub Administrador",  "subadmin"),
    ]
    users = []
    for email, name, role in entries:
        u = User(email=email, name=name,
                 hashed_password=get_password_hash("changeme123"), role=role)
        db.add(u)
        users.append(u)
    db.flush()
    print(f"  users: {len(users)} created")
    return users

SECTORES = ["Minería", "Construcción", "Automotriz", "Industrial", "Agricultura", "Transporte", "Logística"]

def _gen_empresas(db, n=30):
    NOMBRES_EMP = ["Comin","Transporte","Minera","Constructora","Automotriz","Servicios","Comercial","Industrial"]
    SUFIJOS = ["SpA","Ltda.","S.A.","y Cía."]
    for _ in range(n):
        nombre = f"{random.choice(NOMBRES_EMP)} {random.choice(APELLIDOS)} {random.choice(SUFIJOS)}"
        db.add(Empresa(
            nombre=nombre,
            razon_social=nombre,
            rut=gen_rut(),
            sector=random.choice(SECTORES),
        ))
    db.flush()
    print(f"  empresas: {n} generated (no Excel)")

def seed_empresas(db):
    if db.query(Empresa).count():
        print("  empresas: already present, skipping")
        return db.query(Empresa).all()
    try:
        rows = xlsx_rows("Empresas", header_row=3)
    except FileNotFoundError:
        _gen_empresas(db)
        return db.query(Empresa).all()
    created = 0
    for row in rows:
        rut = row.get("Nombre")          # Nombre col holds the RUT
        nombre = row.get("Razón Social") or row.get("Razon Social")
        if not nombre or not isinstance(nombre, str) or len(nombre.strip()) < 2:
            continue
        nota = row.get("Nota Cobranza") or row.get("Nota cobranza")
        ubicacion = None
        for k, v in zip(row.keys(), row.values()):
            if "ubicaci" in k.lower() and v:
                ubicacion = str(v)
        db.add(Empresa(
            nombre=nombre.strip(),
            razon_social=nombre.strip(),
            rut=str(rut).strip() if rut else None,
            sector=row.get("Sector"),
            nota_cobranza=str(nota).strip() if nota else None,
            ubicacion=ubicacion,
        ))
        created += 1
    db.flush()
    print(f"  empresas: {created} created from Excel")
    return db.query(Empresa).all()

PRODUCTOS_GEN = [
    ("Aceite Motor 15W40 20L", "ACE001", "Balde", 45000, 32000),
    ("Aceite Motor 5W30 4L", "ACE002", "Envase", 18000, 12000),
    ("Grasa Multipropósito 18kg", "GRA001", "Tarro", 35000, 24000),
    ("Lubricante Cadena 1L", "LUB001", "Envase", 8500, 5500),
    ("Filtro de Aceite", "FIL001", "Unidad", 4500, 2800),
    ("Detergente Industrial 25kg", "DET001", "Saco", 28000, 19000),
    ("Aceite Hidráulico 68 20L", "HID001", "Balde", 42000, 29000),
    ("Aceite Transmisión ATF 4L", "ATF001", "Envase", 16000, 10500),
    ("Grasa Cálcica 18kg", "GRA002", "Tarro", 32000, 22000),
    ("Refrigerante 5L", "REF001", "Envase", 12000, 7500),
]

def _gen_productos(db):
    for nombre, sku, fmt, venta, costo in PRODUCTOS_GEN:
        db.add(Producto(nombre=nombre, sku=sku, formato=fmt,
                        precio_venta=Decimal(str(venta)),
                        precio_costo=Decimal(str(costo)),
                        stock_actual=random.randint(0, 50), stock_minimo=5))
    db.flush()
    print(f"  productos: {len(PRODUCTOS_GEN)} generated (no Excel)")

def seed_productos(db):
    already = db.query(Producto).count()
    if already:
        print(f"  productos: {already} already present, updating stock only")
        _update_stock(db)
        return db.query(Producto).all()

    try:
        rows = xlsx_rows("precios", header_row=3)
    except FileNotFoundError:
        _gen_productos(db)
        return db.query(Producto).all()

    created = 0
    for row in rows:
        nombre = row.get("Name")
        if not nombre or not isinstance(nombre, str) or len(nombre.strip()) < 2:
            continue
        sku = str(row.get("SKU")).strip() if row.get("SKU") else None
        fmt = row.get("Formato")
        if fmt and str(fmt).lower() in ("no definido", "none"):
            fmt = None
        db.add(Producto(
            nombre=nombre.strip(),
            sku=sku,
            formato=str(fmt).strip() if fmt else None,
            precio_venta=dec(row.get("Precio Venta")),
            precio_costo=dec(row.get("Costo")),
            stock_minimo=5,
        ))
        created += 1
    db.flush()
    print(f"  productos: {created} created")
    _update_stock(db)
    return db.query(Producto).all()

def _update_stock(db):
    try:
        rows = xlsx_rows("INVENTARIO", header_row=3)
    except FileNotFoundError:
        print("  stock: INVENTARIO file not found, skipping")
        return
    updated = 0
    for row in rows:
        sku = str(row.get("SKU")).strip() if row.get("SKU") else None
        if not sku or sku == "None":
            continue
        stock = to_int(row.get("STOCK"))
        p = db.query(Producto).filter_by(sku=sku).first()
        if p:
            p.stock_actual = stock
            updated += 1
    print(f"  stock: {updated} products updated")

def seed_clientes(db, empresas):
    if db.query(Cliente).count():
        print("  clientes: already present, skipping")
        return db.query(Cliente).all()
    empresa_ids = [e.id for e in empresas]
    created = 0
    for _ in range(80):
        nombre = gen_nombre()
        eid = random.choice(empresa_ids) if empresa_ids and random.random() > 0.35 else None
        db.add(Cliente(
            nombre=nombre,
            rut=gen_rut(),
            email=gen_email(nombre),
            telefono=f"+569{random.randint(10000000, 99999999)}",
            direccion_despacho=f"Av. {random.choice(APELLIDOS)} {random.randint(100, 9999)}",
            empresa_id=eid,
            forma_pago=random.choice(FORMAS_PAGO),
            despacho_o_retiro=random.choice(["despacho", "retiro"]),
            comuna=random.choice(COMUNAS),
            ultimo_contacto=rand_date(180),
            forma_captacion=random.choice(CAPTACION),
            es_nuevo=random.random() < 0.2,
        ))
        created += 1
    db.flush()
    print(f"  clientes: {created} created")
    return db.query(Cliente).all()

def seed_empleados(db):
    if db.query(Empleado).count():
        print("  empleados: already present, skipping")
        return
    for _ in range(12):
        db.add(Empleado(
            nombre=gen_nombre(),
            cargo=random.choice(CARGOS),
            sueldo_base=Decimal(str(random.randint(500, 2000) * 1000)),
            fecha_ingreso=rand_date(2000, 30),
            is_active=random.random() > 0.1,
        ))
    db.flush()
    print("  empleados: 12 created")

def _lineas_for(productos, n=None):
    if n is None:
        n = random.randint(1, 5)
    items = random.sample(productos, min(n, len(productos)))
    lineas, total_neto = [], Decimal("0")
    for i, prod in enumerate(items):
        qty = random.randint(1, 10)
        precio = prod.precio_venta if prod.precio_venta else Decimal("50000")
        line_neto = (precio * qty).quantize(Decimal("1"))
        iva = (line_neto * Decimal("0.19")).quantize(Decimal("1"))
        margen = None
        if prod.precio_costo and precio and precio > 0:
            margen = ((precio - prod.precio_costo) / precio).quantize(
                Decimal("0.00000001"), rounding=ROUND_HALF_UP)
        lineas.append(dict(
            orden=i + 1,
            producto_id=prod.id,
            sku=prod.sku,
            descripcion=prod.nombre,
            formato=prod.formato,
            cantidad=qty,
            valor_neto=precio,
            total_neto=line_neto,
            iva=iva,
            total=line_neto + iva,
            margen=margen,
        ))
        total_neto += line_neto
    total_iva = (total_neto * Decimal("0.19")).quantize(Decimal("1"))
    return lineas, total_neto, total_iva

def seed_cotizaciones(db, clientes, vendedores, empresas, productos):
    if db.query(Cotizacion).count():
        print("  cotizaciones: already present, skipping")
        return db.query(Cotizacion).all()
    ESTADOS = ["aprobada", "aprobada", "rechazada", "no_definido", "no_definido"]
    numero, created, cotizaciones = 12001, 0, []
    for _ in range(60):
        cliente = random.choice(clientes)
        vendedor = random.choice(vendedores)
        empresa = random.choice(empresas) if random.random() > 0.4 else None
        lineas, total_neto, total_iva = _lineas_for(productos)
        cot = Cotizacion(
            numero=numero,
            cliente_id=cliente.id,
            vendedor_id=vendedor.id,
            empresa_id=empresa.id if empresa else None,
            fecha=rand_date(400),
            estado=random.choice(ESTADOS),
            total_neto=total_neto,
            total_iva=total_iva,
            total=total_neto + total_iva,
        )
        db.add(cot); db.flush()
        for l in lineas:
            db.add(CotizacionLinea(cotizacion_id=cot.id, **l))
        cotizaciones.append(cot)
        numero += 1; created += 1
    db.flush()
    print(f"  cotizaciones: {created} created")
    return cotizaciones

def seed_notas_venta(db, cotizaciones, clientes, vendedores, empresas, productos):
    if db.query(NotaVenta).count():
        print("  nota_ventas: already present, skipping")
        return db.query(NotaVenta).all()
    aprobadas = [c for c in cotizaciones if c.estado == "aprobada"]
    numero, notas = 21001, []

    for cot in aprobadas:
        ESTADOS_NV = ["entregada", "entregada", "pendiente", "cancelada"]
        nv = NotaVenta(
            numero=numero,
            cotizacion_id=cot.id,
            cliente_id=cot.cliente_id,
            empresa_id=cot.empresa_id,
            vendedor_id=cot.vendedor_id,
            fecha=cot.fecha + timedelta(days=random.randint(1, 7)),
            estado=random.choice(ESTADOS_NV),
            total_neto=cot.total_neto,
            total_iva=cot.total_iva,
            total=cot.total,
        )
        db.add(nv); db.flush()
        for cl in db.query(CotizacionLinea).filter_by(cotizacion_id=cot.id).all():
            db.add(NotaVentaLinea(
                nv_id=nv.id, orden=cl.orden, producto_id=cl.producto_id,
                sku=cl.sku, descripcion=cl.descripcion, formato=cl.formato,
                cantidad=cl.cantidad, valor_neto=cl.valor_neto,
                total_neto=cl.total_neto, iva=cl.iva, total=cl.total, margen=cl.margen,
            ))
        notas.append(nv); numero += 1

    # 10 direct notas (no cotizacion)
    for _ in range(10):
        cliente = random.choice(clientes)
        vendedor = random.choice(vendedores)
        lineas, total_neto, total_iva = _lineas_for(productos, n=random.randint(1, 4))
        nv = NotaVenta(
            numero=numero,
            cliente_id=cliente.id,
            vendedor_id=vendedor.id,
            fecha=rand_date(200),
            estado="entregada",
            total_neto=total_neto,
            total_iva=total_iva,
            total=total_neto + total_iva,
        )
        db.add(nv); db.flush()
        for l in lineas:
            db.add(NotaVentaLinea(nv_id=nv.id, **l))
        notas.append(nv); numero += 1

    db.flush()
    print(f"  nota_ventas: {len(notas)} created")
    return notas

def seed_facturas(db, notas):
    if db.query(Factura).count():
        print("  facturas: already present, skipping")
        return
    entregadas = [n for n in notas if n.estado == "entregada"]
    numero, created = 59001, 0
    for nv in entregadas:
        ESTADOS_F = ["emitida", "pagada", "pagada", "vencida"]
        estado = random.choice(ESTADOS_F)
        fecha = nv.fecha + timedelta(days=random.randint(1, 5))
        f = Factura(
            numero=numero,
            nv_id=nv.id,
            cliente_id=nv.cliente_id,
            empresa_id=nv.empresa_id,
            vendedor_id=nv.vendedor_id,
            fecha=fecha,
            fecha_vencimiento=fecha + timedelta(days=30),
            estado=estado,
            total_neto=nv.total_neto,
            total_iva=nv.total_iva,
            total=nv.total,
            fecha_pago=fecha + timedelta(days=random.randint(1, 30)) if estado == "pagada" else None,
            monto_pagado=nv.total if estado == "pagada" else None,
            metodo_pago=random.choice(["Transferencia", "Cheque", "Efectivo"]) if estado == "pagada" else None,
        )
        db.add(f); db.flush()
        for nl in db.query(NotaVentaLinea).filter_by(nv_id=nv.id).all():
            db.add(FacturaLinea(
                factura_id=f.id, orden=nl.orden, producto_id=nl.producto_id,
                sku=nl.sku, descripcion=nl.descripcion, formato=nl.formato,
                cantidad=nl.cantidad, valor_neto=nl.valor_neto,
                total_neto=nl.total_neto, iva=nl.iva, total=nl.total, margen=nl.margen,
            ))
        numero += 1; created += 1
    db.flush()
    print(f"  facturas: {created} created")

NOMBRES_PROV = [
    "Lubricantes del Norte",
    "Distribuidora Pacífico",
    "Química Industrial Copiapó",
    "Aceites y Grasas del Sur",
    "Suministros Mineros Atacama",
    "Comercial Petroandina",
    "Importadora TechLub",
    "Proveedora Nacional de Lubricantes",
]

RAZONES_NC = [
    "Devolución de mercadería",
    "Error en precio",
    "Descuento acordado",
    "Producto defectuoso",
    "Devolución parcial",
    "Ajuste comercial",
    "Exceso en facturación",
    "Bonificación especial",
]

RAZONES_ND = [
    "Diferencia de precio no facturada",
    "Gastos de flete adicional",
    "Recargo por mora",
    "Ajuste por cambio de tipo de cambio",
    "Intereses por pago atrasado",
]


def seed_proveedores(db):
    if db.query(Proveedor).count():
        print("  proveedores: already present, skipping")
        return db.query(Proveedor).all()
    created = 0
    for nombre in NOMBRES_PROV:
        contacto = gen_nombre()
        db.add(Proveedor(
            nombre=nombre,
            rut=gen_rut(),
            contacto=contacto,
            email=gen_email(contacto),
            telefono=f"+562{random.randint(20000000, 29999999)}",
        ))
        created += 1
    db.flush()
    print(f"  proveedores: {created} created")
    return db.query(Proveedor).all()


def seed_ordenes_compra(db, proveedores, productos):
    if db.query(OrdenCompra).count():
        print("  ordenes_compra: already present, skipping")
        return db.query(OrdenCompra).all()
    ESTADOS_OC = ["borrador", "borrador", "enviada", "enviada", "recibida"]
    numero, created, ordenes = 80001, 0, []
    for _ in range(15):
        proveedor = random.choice(proveedores)
        n_lineas = random.randint(1, 4)
        items = random.sample(productos, min(n_lineas, len(productos)))
        total_neto = Decimal("0")
        linea_data = []
        for i, prod in enumerate(items):
            qty = random.randint(5, 50)
            precio = prod.precio_costo if prod.precio_costo else Decimal("30000")
            line_neto = (precio * qty).quantize(Decimal("1"))
            iva = (line_neto * Decimal("0.19")).quantize(Decimal("1"))
            total_neto += line_neto
            linea_data.append(dict(
                orden=i + 1,
                producto_id=prod.id,
                sku=prod.sku,
                descripcion=prod.nombre,
                cantidad=qty,
                cantidad_recibida=qty if random.random() > 0.5 else 0,
                valor_neto=precio,
                total_neto=line_neto,
                iva=iva,
                total=line_neto + iva,
            ))
        total_iva = (total_neto * Decimal("0.19")).quantize(Decimal("1"))
        fecha = rand_date(300)
        oc = OrdenCompra(
            numero=numero,
            proveedor_id=proveedor.id,
            fecha=fecha,
            fecha_entrega_esperada=fecha + timedelta(days=random.randint(7, 30)),
            estado=random.choice(ESTADOS_OC),
            total_neto=total_neto,
            total_iva=total_iva,
            total=total_neto + total_iva,
        )
        db.add(oc); db.flush()
        for ld in linea_data:
            db.add(OrdenCompraLinea(orden_compra_id=oc.id, **ld))
        ordenes.append(oc)
        numero += 1; created += 1
    db.flush()
    print(f"  ordenes_compra: {created} created")
    return ordenes


def seed_pagos(db, facturas, admin_user):
    if db.query(Pago).count():
        print("  pagos: already present, skipping")
        return
    pagadas = [f for f in facturas if f.estado == "pagada"]
    created = 0
    for f in pagadas:
        monto = f.monto_pagado if f.monto_pagado else f.total
        db.add(Pago(
            factura_id=f.id,
            fecha=f.fecha_pago if f.fecha_pago else f.fecha,
            monto=monto,
            metodo_pago=f.metodo_pago if f.metodo_pago else "Transferencia",
            registrado_por_id=admin_user.id,
        ))
        created += 1
    db.flush()
    print(f"  pagos: {created} created")


def seed_notas_credito(db, clientes):
    if db.query(NotaCredito).count():
        print("  notas_credito: already present, skipping")
        return
    numero, created = 70001, 0
    for razon in RAZONES_NC:
        cliente = random.choice(clientes)
        monto_neto = Decimal(str(random.randint(10, 500) * 1000))
        monto_iva = (monto_neto * Decimal("0.19")).quantize(Decimal("1"))
        monto_total = monto_neto + monto_iva
        nc = NotaCredito(
            numero=numero,
            fecha=rand_date(200),
            cliente_id=cliente.id,
            razon=razon,
            monto_neto=monto_neto,
            monto_iva=monto_iva,
            monto_total=monto_total,
        )
        db.add(nc); db.flush()
        n_lineas = random.randint(1, 3)
        for i in range(n_lineas):
            precio_unit = (monto_neto / n_lineas).quantize(Decimal("1"))
            db.add(NotaCreditoLinea(
                nota_credito_id=nc.id,
                orden=i + 1,
                descripcion=razon,
                cantidad=Decimal("1"),
                precio_unitario=precio_unit,
                subtotal=precio_unit,
            ))
        numero += 1; created += 1
    db.flush()
    print(f"  notas_credito: {created} created")


def seed_notas_debito(db, clientes):
    if db.query(NotaDebito).count():
        print("  notas_debito: already present, skipping")
        return
    numero, created = 75001, 0
    for razon in RAZONES_ND:
        cliente = random.choice(clientes)
        monto_neto = Decimal(str(random.randint(5, 200) * 1000))
        monto_iva = (monto_neto * Decimal("0.19")).quantize(Decimal("1"))
        monto_total = monto_neto + monto_iva
        nd = NotaDebito(
            numero=numero,
            fecha=rand_date(180),
            cliente_id=cliente.id,
            razon=razon,
            monto_neto=monto_neto,
            monto_iva=monto_iva,
            monto_total=monto_total,
        )
        db.add(nd); db.flush()
        n_lineas = random.randint(1, 2)
        for i in range(n_lineas):
            precio_unit = (monto_neto / n_lineas).quantize(Decimal("1"))
            db.add(NotaDebitoLinea(
                nota_debito_id=nd.id,
                orden=i + 1,
                descripcion=razon,
                cantidad=Decimal("1"),
                precio_unitario=precio_unit,
                subtotal=precio_unit,
            ))
        numero += 1; created += 1
    db.flush()
    print(f"  notas_debito: {created} created")


def seed_guias_despacho(db, clientes, empresas, productos):
    if db.query(GuiaDespacho).count():
        print("  guias_despacho: already present, skipping")
        return
    # motivo_traslado: 1=venta, 2=compra, 3=consignación, 5=traslado
    MOTIVOS = [1, 1, 1, 2, 3, 5]
    numero, created = 65001, 0
    for _ in range(10):
        cliente = random.choice(clientes)
        empresa = random.choice(empresas) if random.random() > 0.4 else None
        n_lineas = random.randint(1, 4)
        items = random.sample(productos, min(n_lineas, len(productos)))
        total_neto = Decimal("0")
        linea_data = []
        for i, prod in enumerate(items):
            qty = Decimal(str(random.randint(1, 10)))
            precio = prod.precio_venta if prod.precio_venta else Decimal("50000")
            line_neto = (precio * qty).quantize(Decimal("1"))
            iva = (line_neto * Decimal("0.19")).quantize(Decimal("1"))
            total_neto += line_neto
            linea_data.append(dict(
                orden=i + 1,
                producto_id=prod.id,
                descripcion=prod.nombre,
                cantidad=qty,
                precio_unitario=precio,
                descuento_pct=Decimal("0"),
                exenta=False,
                total_neto=line_neto,
                iva=iva,
                total_linea=line_neto + iva,
            ))
        total_iva = (total_neto * Decimal("0.19")).quantize(Decimal("1"))
        gd = GuiaDespacho(
            numero=numero,
            fecha=rand_date(300),
            motivo_traslado=random.choice(MOTIVOS),
            direccion_destino=f"Av. {random.choice(APELLIDOS)} {random.randint(100, 9999)}",
            comuna_destino=random.choice(COMUNAS),
            cliente_id=cliente.id,
            empresa_id=empresa.id if empresa else None,
            estado="emitida",
            total_neto=total_neto,
            total_iva=total_iva,
            total=total_neto + total_iva,
        )
        db.add(gd); db.flush()
        for ld in linea_data:
            db.add(GuiaDespachoLinea(guia_despacho_id=gd.id, **ld))
        numero += 1; created += 1
    db.flush()
    print(f"  guias_despacho: {created} created")


def seed_boletas(db, clientes, productos, vendedores):
    if db.query(Boleta).count():
        print("  boletas: already present, skipping")
        return
    TIPOS_DTE = ["39", "39", "39", "41"]
    METODOS = ["efectivo", "efectivo", "debito", "credito", "transferencia"]
    numero, created = 90001, 0
    for _ in range(12):
        cliente = random.choice(clientes) if random.random() > 0.3 else None
        vendedor = random.choice(vendedores)
        tipo = random.choice(TIPOS_DTE)
        n_lineas = random.randint(1, 4)
        items = random.sample(productos, min(n_lineas, len(productos)))
        total_neto = Decimal("0")
        linea_data = []
        for i, prod in enumerate(items):
            qty = Decimal(str(random.randint(1, 5)))
            precio = prod.precio_venta if prod.precio_venta else Decimal("50000")
            exenta = tipo == "41"
            line_neto = (precio * qty).quantize(Decimal("1"))
            iva = Decimal("0") if exenta else (line_neto * Decimal("0.19")).quantize(Decimal("1"))
            total_neto += line_neto
            linea_data.append(dict(
                orden=i + 1,
                producto_id=prod.id,
                descripcion=prod.nombre,
                cantidad=qty,
                precio_unitario=precio,
                descuento_pct=Decimal("0"),
                exenta=exenta,
                total_neto=line_neto,
                iva=iva,
                total_linea=line_neto + iva,
            ))
        total_iva = Decimal("0") if tipo == "41" else (total_neto * Decimal("0.19")).quantize(Decimal("1"))
        total = total_neto + total_iva
        b = Boleta(
            numero=numero,
            fecha=rand_date(200),
            tipo_dte=tipo,
            cliente_id=cliente.id if cliente else None,
            nombre_receptor=cliente.nombre if cliente else None,
            rut_receptor=cliente.rut if cliente else None,
            vendedor_id=vendedor.id,
            metodo_pago=random.choice(METODOS),
            total_neto=total_neto,
            total_iva=total_iva,
            total=total,
            monto_pagado=total,
            estado="emitida",
        )
        db.add(b); db.flush()
        for ld in linea_data:
            db.add(BoletaLinea(boleta_id=b.id, **ld))
        numero += 1; created += 1
    db.flush()
    print(f"  boletas: {created} created")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    db = SessionLocal()
    try:
        print("Seeding Conico database...\n")

        users = seed_users(db)
        admin_user = next((u for u in users if u.role == "admin"), users[0])
        vendedores = [u for u in users if u.role == "vendedor"]
        if not vendedores:
            vendedores = users  # fallback: use any available user

        empresas = seed_empresas(db)
        productos = seed_productos(db)
        clientes = seed_clientes(db, empresas)
        seed_empleados(db)

        cotizaciones = seed_cotizaciones(db, clientes, vendedores, empresas, productos)
        notas = seed_notas_venta(db, cotizaciones, clientes, vendedores, empresas, productos)
        seed_facturas(db, notas)

        facturas = db.query(Factura).all()
        proveedores = seed_proveedores(db)
        seed_ordenes_compra(db, proveedores, productos)
        seed_pagos(db, facturas, admin_user)
        seed_notas_credito(db, clientes)
        seed_notas_debito(db, clientes)
        seed_guias_despacho(db, clientes, empresas, productos)
        seed_boletas(db, clientes, productos, vendedores)

        db.commit()
        print("\nDone.")
        print("Login: admin@conico.cl / changeme123")
    except Exception as exc:
        db.rollback()
        print(f"\nERROR: {exc}")
        import traceback; traceback.print_exc()
        raise
    finally:
        db.close()

if __name__ == "__main__":
    main()
