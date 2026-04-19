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
from app.api import empleados
from app.api import empleados_documentos

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
app.include_router(empleados.router, prefix="/api/empleados", tags=["rrhh"])
app.include_router(empleados_documentos.router, prefix="/api/empleados", tags=["rrhh"])
