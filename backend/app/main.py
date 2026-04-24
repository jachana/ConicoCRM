from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.api import auth, users
from app.api import proveedores
from app.api import productos
from app.api import clientes
from app.api import empresas
from app.api import config
from app.api import cotizaciones
from app.api import nota_ventas
from app.api import facturas
from app.api import empleados
from app.api import empleados_documentos
from app.api import empleados_vacaciones
from app.api import ordenes_compra
from app.api import inventario
from app.api import dashboard
from app.api import pagos
from app.api import aprobaciones
from app.api import aprobaciones_margen
from app.api import cobranza
from app.api import dte
from app.api import reportes
from app.api import tags
from app.api import bancos_receptores
from app.api import sedes_despacho
from app.api import marcas
from app.api import aprobaciones_costo
from app.api import productos_documentos
from app.api import listas_precios
from app.api import tareas as tareas_api

app = FastAPI(title="Conico PMS")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(proveedores.router, prefix="/api/proveedores", tags=["proveedores"])
app.include_router(productos.router, prefix="/api/productos", tags=["catálogo"])
app.include_router(clientes.router, prefix="/api/clientes", tags=["clientes"])
app.include_router(empresas.router, prefix="/api/empresas", tags=["empresas"])
app.include_router(config.router, prefix="/api/config", tags=["config"])
app.include_router(cotizaciones.router, prefix="/api/cotizaciones", tags=["cotizaciones"])
app.include_router(nota_ventas.router, prefix="/api/nota_ventas", tags=["nota_ventas"])
app.include_router(facturas.router, prefix="/api/facturas", tags=["facturas"])
app.include_router(empleados.router, prefix="/api/empleados", tags=["rrhh"])
app.include_router(empleados_documentos.router, prefix="/api/empleados", tags=["rrhh"])
app.include_router(empleados_vacaciones.router, prefix="/api/empleados", tags=["rrhh"])
app.include_router(ordenes_compra.router, prefix="/api/ordenes-compra", tags=["ordenes_compra"])
app.include_router(inventario.router, prefix="/api/inventario", tags=["inventario"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["dashboard"])
app.include_router(pagos.router, prefix="/api/pagos", tags=["pagos"])
app.include_router(aprobaciones.router, prefix="/api/aprobaciones", tags=["aprobaciones"])
app.include_router(aprobaciones_margen.router, prefix="/api/aprobaciones_margen", tags=["aprobaciones_margen"])
app.include_router(cobranza.router, prefix="/api/cobranza", tags=["cobranza"])
app.include_router(dte.router, prefix="/api/dte", tags=["dte"])
app.include_router(reportes.router, prefix="/api/reportes", tags=["reportes"])
app.include_router(tags.router, prefix="/api/tags", tags=["tags"])
app.include_router(bancos_receptores.router, prefix="/api/bancos-receptores", tags=["config"])
app.include_router(sedes_despacho.router, prefix="/api/sedes-despacho", tags=["empresas"])
app.include_router(marcas.router, prefix="/api/marcas", tags=["catálogo"])
app.include_router(aprobaciones_costo.router, prefix="/api/aprobaciones-costo", tags=["aprobaciones"])
app.include_router(productos_documentos.router, prefix="/api/productos", tags=["catálogo"])
app.include_router(listas_precios.router, prefix="/api/listas-precios", tags=["listas_precios"])
app.include_router(tareas_api.router, prefix="/api/tareas", tags=["tareas"])
