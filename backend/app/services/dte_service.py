import hmac
import hashlib
from datetime import date
import httpx
from sqlalchemy.orm import Session

from app.models.factura import Factura
from app.models.factura_compra import FacturaCompra
from app.models.nota_credito import NotaCredito
from app.models.nota_debito import NotaDebito
from app.models.boleta import Boleta
from app.models.guia_despacho import GuiaDespacho
from app.models.system_config import SystemConfig


def _get_config(db: Session) -> dict:
    return {r.key: r.value for r in db.query(SystemConfig).all()}


class DteService:
    def __init__(self, api_key: str, api_url: str, webhook_secret: str):
        self.api_key = api_key
        self.api_url = api_url.rstrip("/")
        self.webhook_secret = webhook_secret

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}

    def _emisor(self, cfg: dict) -> dict:
        return {
            "rut": cfg.get("rut_emisor", ""),
            "razon_social": cfg.get("razon_social_emisor", ""),
            "giro": cfg.get("giro_emisor", ""),
            "direccion": cfg.get("direccion_emisor", ""),
            "ciudad": cfg.get("ciudad_emisor", "Santiago"),
            "comuna": cfg.get("comuna_emisor", ""),
        }

    def build_factura_payload(self, factura: Factura, db: Session) -> dict:
        cfg = _get_config(db)
        receptor = {}
        if factura.cliente:
            receptor = {
                "rut": factura.cliente.rut or "",
                "razon_social": factura.cliente.nombre,
                "giro": "",
                "direccion": factura.cliente.direccion_despacho or "",
                "ciudad": factura.cliente.comuna or "",
                "comuna": factura.cliente.comuna or "",
            }
        detalle = [
            {
                "nombre": l.descripcion,
                "cantidad": float(l.cantidad),
                "precio_unitario": int(l.valor_neto),
                "descuento_porcentaje": 0,
            }
            for l in factura.lineas
        ]
        tipo_int = int(factura.tipo_dte or "033")
        if tipo_int == 34:
            totales: dict = {
                "monto_exento": int(factura.total_neto),
                "monto_total": int(factura.total),
            }
        else:
            totales = {
                "monto_neto": int(factura.total_neto),
                "tasa_iva": 19,
                "iva": int(factura.total_iva),
                "monto_total": int(factura.total),
            }
        payload = {
            "tipo_dte": tipo_int,
            "fecha_emision": (factura.fecha or date.today()).isoformat(),
            "emisor": self._emisor(cfg),
            "receptor": receptor,
            "detalle": detalle,
            "totales": totales,
        }

        if factura.referencias_docs:
            payload["referencias"] = [
                {
                    "tipo": ref["tipo"],
                    "folio": ref["folio"],
                    "fecha": ref.get("fecha", ""),
                    "razon": ref.get("razon", ""),
                }
                for ref in factura.referencias_docs
                if ref.get("tipo") and ref.get("folio")
            ]

        return payload

    def build_nc_payload(self, nc: NotaCredito, db: Session) -> dict:
        cfg = _get_config(db)
        receptor = {}
        if nc.cliente:
            receptor = {
                "rut": nc.cliente.rut or "",
                "razon_social": nc.cliente.nombre,
                "giro": "",
                "direccion": nc.cliente.direccion_despacho or "",
                "ciudad": nc.cliente.comuna or "",
                "comuna": nc.cliente.comuna or "",
            }
        detalle = [
            {
                "nombre": l.descripcion,
                "cantidad": float(l.cantidad),
                "precio_unitario": int(l.precio_unitario),
                "descuento_porcentaje": 0,
            }
            for l in nc.lineas
        ]
        return {
            "tipo_dte": 61,
            "fecha_emision": (nc.fecha or date.today()).isoformat(),
            "razon": nc.razon,
            "emisor": self._emisor(cfg),
            "receptor": receptor,
            "detalle": detalle,
            "totales": {
                "monto_neto": int(nc.monto_neto),
                "tasa_iva": 19,
                "iva": int(nc.monto_iva),
                "monto_total": int(nc.monto_total),
            },
        }

    def build_nd_payload(self, nd: NotaDebito, db: Session) -> dict:
        cfg = _get_config(db)
        receptor = {}
        if nd.cliente:
            receptor = {
                "rut": nd.cliente.rut or "",
                "razon_social": nd.cliente.nombre,
                "giro": "",
                "direccion": nd.cliente.direccion_despacho or "",
                "ciudad": nd.cliente.comuna or "",
                "comuna": nd.cliente.comuna or "",
            }
        detalle = [
            {
                "nombre": l.descripcion,
                "cantidad": float(l.cantidad),
                "precio_unitario": int(l.precio_unitario),
                "descuento_porcentaje": 0,
            }
            for l in nd.lineas
        ]
        return {
            "tipo_dte": 56,
            "fecha_emision": (nd.fecha or date.today()).isoformat(),
            "razon": nd.razon,
            "emisor": self._emisor(cfg),
            "receptor": receptor,
            "detalle": detalle,
            "totales": {
                "monto_neto": int(nd.monto_neto),
                "tasa_iva": 19,
                "iva": int(nd.monto_iva),
                "monto_total": int(nd.monto_total),
            },
        }

    def build_boleta_payload(self, boleta: Boleta, db: Session) -> dict:
        cfg = _get_config(db)
        if boleta.cliente:
            receptor = {
                "rut": boleta.cliente.rut or "",
                "razon_social": boleta.cliente.nombre,
                "giro": "",
                "direccion": getattr(boleta.cliente, "direccion_despacho", "") or "",
                "ciudad": getattr(boleta.cliente, "comuna", "") or "",
                "comuna": getattr(boleta.cliente, "comuna", "") or "",
            }
        else:
            receptor = {
                "rut": boleta.rut_receptor or "66666666-6",
                "razon_social": boleta.nombre_receptor or "Consumidor Final",
                "giro": "",
                "direccion": "",
                "ciudad": "",
                "comuna": "",
            }

        detalle = [
            {
                "nombre": l.descripcion,
                "cantidad": float(l.cantidad),
                "precio_unitario": int(l.precio_unitario),
                "descuento_porcentaje": float(l.descuento_pct or 0),
                "exenta": bool(l.exenta),
            }
            for l in boleta.lineas
        ]

        payload = {
            "tipo_dte": int(boleta.tipo_dte),
            "fecha_emision": (boleta.fecha or date.today()).isoformat(),
            "emisor": self._emisor(cfg),
            "receptor": receptor,
            "detalle": detalle,
            "totales": {
                "monto_neto": int(boleta.total_neto),
                "tasa_iva": 19 if boleta.tipo_dte == "39" else 0,
                "iva": int(boleta.total_iva),
                "monto_total": int(boleta.total),
            },
        }

        if boleta.patente_vehiculo:
            payload["referencias"] = [
                {"tipo": "PATENTE", "valor": boleta.patente_vehiculo}
            ]

        return payload

    def build_guia_payload(self, guia: GuiaDespacho, db: Session) -> dict:
        """Construye el payload Lioren para Guía de Despacho DTE 52.

        Field names ind_traslado / destino son hipótesis (LOW confidence — A2/A3 en RESEARCH.md).
        TODO(W1-05-sandbox): validar contra Lioren sandbox antes de merge a producción.
        Si Lioren retorna 422 por campos faltantes (Res. 154 SII: RUTChofer, Patente, FchSalida),
        extender modelo GuiaDespacho con esos campos opcionales (A4).
        """
        cfg = _get_config(db)
        receptor: dict = {}
        if guia.cliente:
            receptor = {
                "rut": guia.cliente.rut or "",
                "razon_social": guia.cliente.nombre,
                "giro": "",
                "direccion": getattr(guia.cliente, "direccion_despacho", "") or "",
                "ciudad": getattr(guia.cliente, "comuna", "") or "",
                "comuna": getattr(guia.cliente, "comuna", "") or "",
            }

        detalle = [
            {
                "nombre": l.descripcion,
                "cantidad": float(l.cantidad),
                "precio_unitario": int(l.precio_unitario),  # bruto, igual que boleta (A1)
                "descuento_porcentaje": float(l.descuento_pct or 0),
                "exenta": bool(l.exenta),
            }
            for l in guia.lineas
        ]

        payload = {
            "tipo_dte": 52,
            "fecha_emision": (guia.fecha or date.today()).isoformat(),
            "emisor": self._emisor(cfg),
            "receptor": receptor,
            "detalle": detalle,
            "totales": {
                "monto_neto": int(guia.total_neto),
                "tasa_iva": 19,
                "iva": int(guia.total_iva),
                "monto_total": int(guia.total),
            },
            # Campos específicos DTE 52 — nombres [ASSUMED, validar sandbox Lioren]:
            "ind_traslado": guia.motivo_traslado,  # 1..9
            "destino": {
                "direccion": guia.direccion_destino or "",
                "comuna": guia.comuna_destino or "",
            },
        }
        return payload

    def build_factura_compra_payload(self, fc: FacturaCompra, db: Session) -> dict:
        cfg = _get_config(db)
        receptor: dict = {}
        if fc.proveedor:
            receptor = {
                "rut": fc.proveedor.rut or "",
                "razon_social": fc.proveedor.nombre,
                "giro": "",
                "direccion": "",
                "ciudad": "",
                "comuna": "",
            }
        detalle = [
            {
                "nombre": l.descripcion,
                "cantidad": float(l.cantidad),
                "precio_unitario": int(l.valor_neto),
                "descuento_porcentaje": 0,
            }
            for l in fc.lineas
        ]
        return {
            "tipo_dte": 46,
            "fecha_emision": (fc.fecha or date.today()).isoformat(),
            "emisor": self._emisor(cfg),
            "receptor": receptor,
            "detalle": detalle,
            "totales": {
                "monto_neto": int(fc.total_neto),
                "tasa_iva": 19,
                "iva": int(fc.total_iva),
                "monto_total": int(fc.total),
            },
        }

    def emit(self, payload: dict) -> dict:
        resp = httpx.post(
            f"{self.api_url}/documentos",
            json=payload,
            headers=self._headers(),
            timeout=30.0,
        )
        resp.raise_for_status()
        return resp.json()

    def check_status(self, track_id: str) -> dict:
        resp = httpx.get(
            f"{self.api_url}/documentos/{track_id}/estado",
            headers=self._headers(),
            timeout=15.0,
        )
        resp.raise_for_status()
        return resp.json()

    def validate_webhook_signature(self, body: bytes, signature: str) -> bool:
        expected = hmac.new(
            self.webhook_secret.encode(), body, hashlib.sha256
        ).hexdigest()
        return hmac.compare_digest(expected, signature)


def get_dte_service() -> DteService:
    from app.config import settings
    return DteService(
        api_key=settings.lioren_api_key,
        api_url=settings.lioren_api_url,
        webhook_secret=settings.lioren_webhook_secret,
    )
