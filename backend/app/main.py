from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.core.logging import configure_logging
from app.core.observability import init_sentry
from app.core.request_logger import RequestLoggerMiddleware
from app.api import auth, users
from app.api import health as health_api
from app.api import proveedores
from app.api import productos
from app.api import clientes
from app.api import empresas
from app.api import config
from app.api import cotizaciones
from app.api import nota_ventas
from app.api import facturas
from app.api import boletas
from app.api import guias_despacho
from app.api import empleados
from app.api import empleados_documentos
from app.api import empleados_vacaciones
from app.api import ordenes_compra
from app.api import inventario
from app.api import dashboard
from app.api import pagos
from app.api import aprobaciones
from app.api import aprobaciones_margen
from app.api import solicitudes_descuento
from app.api import cobranza
from app.api import dte
from app.api import facturas_compra
from app.api import reportes
from app.api import tags
from app.api import tipos_producto
from app.api import bancos_receptores
from app.api import sedes_despacho
from app.api import empresa_logo
from app.api import config_logo
from app.api import marcas
from app.api import aprobaciones_costo
from app.api import productos_documentos
from app.api import nota_ventas_adjuntos
from app.api import facturas_adjuntos
from app.api import listas_precios
from app.api import tareas as tareas_api
from app.api import reglas_tarea as reglas_tarea_api
from app.api import search as search_api
from app.api import auditoria as auditoria_api
from app.api import timeline as timeline_api
from app.api import notifications as notifications_api
from app.api import oportunidades as oportunidades_api
from app.api import onboarding_payments
from app.api import onboarding_clientes_empresas
from app.api import onboarding_bodegas_sedes
from app.api import onboarding_cafs
from app.api import cafs
from app.api import onboarding_usuarios
from app.api import onboarding_stock
from app.api import onboarding_categorias
from app.api import onboarding_nv
from app.api import onboarding_cotizaciones
from app.api import onboarding_facturas
from app.api import onboarding_precios_especiales
from app.api import onboarding_oc
from app.api import onboarding_nc
from app.api import onboarding_guias_despacho
from app.api import onboarding_tareas
from app.api import libros as libros_api
from app.api import dte_recepcion as dte_recepcion_api
from app.api import nota_alerta as nota_alerta_api
from app.middleware.audit_context import AuditContextMiddleware
from app.services.auditoria import register_listeners as register_audit_listeners
from app.utils.search import set_unaccent_available

# W1-06 — observability bootstrap. Order matters:
#   1. Logging configured first so subsequent init steps log structurally.
#   2. Sentry initialized (no-op if DSN empty).
#   3. RequestLoggerMiddleware added BEFORE CORS/auth so unauthenticated
#      requests (401s, 403s) still produce an access log line.
configure_logging()
init_sentry()

app = FastAPI(title="Conico PMS")


@app.on_event("startup")
def _ensure_unaccent() -> None:
    """Install the unaccent PostgreSQL extension if not already present.

    Safety net alongside the Alembic migration: if the migration hasn't run
    yet or the DB user lacks CREATE EXTENSION rights, degrade gracefully to
    plain ilike instead of returning 500 on every search.
    Only runs on PostgreSQL — SQLite (tests) uses a conftest mock instead.
    """
    import logging
    from sqlalchemy import text
    from app.database import engine
    logger = logging.getLogger(__name__)
    if engine.dialect.name != "postgresql":
        return
    try:
        with engine.connect() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS unaccent"))
            conn.commit()
        set_unaccent_available(True)
    except Exception as exc:
        logger.warning("unaccent extension unavailable — searches will be case-insensitive only: %s", exc)
        set_unaccent_available(False)

# Note on middleware order: Starlette/FastAPI runs middlewares LIFO relative
# to add order, so the LAST add_middleware wraps the OUTERMOST. We add the
# request logger LAST so it sees every response (including CORS-rejected ones)
# and assigns a request_id at the very entry of the stack.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Order (Starlette LIFO → outer wraps inner): RequestLogger → AuditContext → CORS → app.
# Add CORS first, AuditContext second, RequestLogger last so the request_id
# log line is the outermost wrapper and audit context is set before any handler.
app.add_middleware(AuditContextMiddleware)
app.add_middleware(RequestLoggerMiddleware)
register_audit_listeners()

# Health endpoints — no prefix, no auth.
app.include_router(health_api.router)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(proveedores.router, prefix="/api/proveedores", tags=["proveedores"])
app.include_router(productos.router, prefix="/api/productos", tags=["catálogo"])
app.include_router(clientes.router, prefix="/api/clientes", tags=["clientes"])
app.include_router(empresas.router, prefix="/api/empresas", tags=["empresas"])
app.include_router(config.router, prefix="/api/config", tags=["config"])
app.include_router(config_logo.router, prefix="/api/config", tags=["config"])
app.include_router(cotizaciones.router, prefix="/api/cotizaciones", tags=["cotizaciones"])
app.include_router(nota_alerta_api.router, prefix="/api/cotizaciones", tags=["cotizaciones"])
app.include_router(nota_ventas.router, prefix="/api/nota_ventas", tags=["nota_ventas"])
app.include_router(facturas.router, prefix="/api/facturas", tags=["facturas"])
app.include_router(boletas.router, prefix="/api/boletas", tags=["boletas"])
app.include_router(guias_despacho.router, prefix="/api/guias-despacho", tags=["guias-despacho"])
app.include_router(empleados.router, prefix="/api/empleados", tags=["rrhh"])
app.include_router(empleados_documentos.router, prefix="/api/empleados", tags=["rrhh"])
app.include_router(empleados_vacaciones.router, prefix="/api/empleados", tags=["rrhh"])
app.include_router(ordenes_compra.router, prefix="/api/ordenes-compra", tags=["ordenes_compra"])
app.include_router(inventario.router, prefix="/api/inventario", tags=["inventario"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["dashboard"])
app.include_router(pagos.router, prefix="/api/pagos", tags=["pagos"])
app.include_router(aprobaciones.router, prefix="/api/aprobaciones", tags=["aprobaciones"])
app.include_router(aprobaciones_margen.router, prefix="/api/aprobaciones_margen", tags=["aprobaciones_margen"])
app.include_router(solicitudes_descuento.router, prefix="/api/solicitudes-descuento", tags=["solicitudes_descuento"])
app.include_router(cobranza.router, prefix="/api/cobranza", tags=["cobranza"])
app.include_router(dte.router, prefix="/api/dte", tags=["dte"])
app.include_router(facturas_compra.router, prefix="/api/facturas-compra", tags=["facturas_compra"])
app.include_router(reportes.router, prefix="/api/reportes", tags=["reportes"])
app.include_router(tags.router, prefix="/api/tags", tags=["tags"])
app.include_router(tipos_producto.router, prefix="/api/tipos-producto", tags=["catálogo"])
app.include_router(bancos_receptores.router, prefix="/api/bancos-receptores", tags=["config"])
app.include_router(sedes_despacho.router, prefix="/api/sedes-despacho", tags=["empresas"])
app.include_router(empresa_logo.router, prefix="/api/empresas", tags=["empresas"])
app.include_router(marcas.router, prefix="/api/marcas", tags=["catálogo"])
app.include_router(aprobaciones_costo.router, prefix="/api/aprobaciones-costo", tags=["aprobaciones"])
app.include_router(productos_documentos.router, prefix="/api/productos", tags=["catálogo"])
app.include_router(nota_ventas_adjuntos.router, prefix="/api/nota_ventas", tags=["nota_ventas"])
app.include_router(facturas_adjuntos.router, prefix="/api/facturas", tags=["facturas"])
app.include_router(listas_precios.router, prefix="/api/listas-precios", tags=["listas_precios"])
app.include_router(reglas_tarea_api.router, prefix="/api")
app.include_router(tareas_api.router, prefix="/api/tareas", tags=["tareas"])
app.include_router(search_api.router, prefix="/api/search", tags=["search"])
app.include_router(auditoria_api.router, prefix="/api/auditoria", tags=["auditoria"])
app.include_router(timeline_api.router, prefix="/api", tags=["timeline"])
app.include_router(notifications_api.router, prefix="/api/notifications", tags=["notifications"])
app.include_router(oportunidades_api.router, prefix="/api/oportunidades", tags=["oportunidades"])
app.include_router(onboarding_payments.router, prefix="/api/onboarding/payments", tags=["onboarding"])
app.include_router(onboarding_clientes_empresas.router, prefix="/api/onboarding/clientes_empresas", tags=["onboarding"])
app.include_router(onboarding_bodegas_sedes.router, prefix="/api/onboarding/bodegas-sedes", tags=["onboarding"])
app.include_router(onboarding_cafs.router, prefix="/api/onboarding/cafs", tags=["onboarding"])
app.include_router(cafs.router, prefix="/api/cafs", tags=["cafs"])
app.include_router(onboarding_usuarios.router, prefix="/api/onboarding/usuarios", tags=["onboarding"])
app.include_router(onboarding_stock.router, prefix="/api/onboarding/stock", tags=["onboarding"])
app.include_router(onboarding_categorias.router, prefix="/api/onboarding/categorias", tags=["onboarding"])
app.include_router(onboarding_nv.router, prefix="/api/onboarding/nv-abiertas", tags=["onboarding"])
app.include_router(onboarding_cotizaciones.router, prefix="/api/onboarding/cotizaciones-abiertas", tags=["onboarding"])
app.include_router(onboarding_facturas.router, prefix="/api/onboarding/facturas-historicas", tags=["onboarding"])
app.include_router(onboarding_precios_especiales.router, prefix="/api/onboarding/precios-especiales", tags=["onboarding"])
app.include_router(onboarding_oc.router, prefix="/api/onboarding/oc-historicas", tags=["onboarding"])
app.include_router(onboarding_nc.router, prefix="/api/onboarding/nc-nd-historicas", tags=["onboarding"])
app.include_router(onboarding_guias_despacho.router, prefix="/api/onboarding/guias-despacho-historicas", tags=["onboarding"])
app.include_router(onboarding_tareas.router, prefix="/api/onboarding/tareas", tags=["onboarding"])
app.include_router(libros_api.router, prefix="/api/libros", tags=["libros"])
app.include_router(dte_recepcion_api.router, prefix="/api/dte_recepcion", tags=["dte_recepcion"])
