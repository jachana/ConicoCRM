from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel, Field, model_validator
from typing import Self
from app.schemas.empresa import EmpresaRef
from app.schemas.sede_despacho import SedeDespachoRef
from app.schemas.metodo_pago import METODOS_PAGO, validate_metodo_plazo


class NotaVentaLineaCreate(BaseModel):
    orden: int
    producto_id: int | None = None
    sku: str | None = None
    descripcion: str
    formato: str | None = None
    cantidad: int = Field(1, gt=0)
    valor_neto: Decimal = Field(Decimal("0"), ge=0)


class NotaVentaLineaOut(NotaVentaLineaCreate):
    id: int
    total_neto: Decimal
    iva: Decimal
    total: Decimal
    margen: Decimal | None = None
    model_config = {"from_attributes": True}


class NotaVentaCreate(BaseModel):
    cliente_id: int
    vendedor_id: int | None = None
    contacto: str | None = None
    fecha: date | None = None
    nota: str | None = None
    correo: str | None = None
    empresa_id: int | None = None
    lineas: list[NotaVentaLineaCreate] = []
    sede_despacho_id: int | None = None
    retiro_en_conico: bool = False
    terminos_pago: str | None = None
    metodo_pago: str | None = None
    plazo_dias: int = 0
    numero_oc_cliente: str | None = None

    @model_validator(mode="after")
    def check_plazo_metodo(self) -> Self:
        validate_metodo_plazo(self.metodo_pago, self.plazo_dias)
        return self


class NotaVentaUpdate(BaseModel):
    cliente_id: int | None = None
    vendedor_id: int | None = None
    contacto: str | None = None
    fecha: date | None = None
    nota: str | None = None
    correo: str | None = None
    empresa_id: int | None = None
    sede_despacho_id: int | None = None
    retiro_en_conico: bool | None = None
    terminos_pago: str | None = None
    metodo_pago: str | None = None
    plazo_dias: int | None = None
    numero_oc_cliente: str | None = None

    @model_validator(mode="after")
    def check_plazo_metodo(self) -> Self:
        if self.metodo_pago is not None and self.plazo_dias is not None:
            validate_metodo_plazo(self.metodo_pago, self.plazo_dias)
        elif self.metodo_pago is not None and self.metodo_pago not in METODOS_PAGO:
            raise ValueError(f"metodo_pago inválido. Opciones: {sorted(METODOS_PAGO)}")
        return self


class EstadoCambio(BaseModel):
    estado: str


class ClienteMinOut(BaseModel):
    id: int
    nombre: str
    rut: str | None = None
    email: str | None = None
    telefono: str | None = None
    model_config = {"from_attributes": True}


class VendedorMinOut(BaseModel):
    id: int
    name: str
    email: str
    model_config = {"from_attributes": True}


class CotizacionRef(BaseModel):
    id: int
    numero: int
    model_config = {"from_attributes": True}


class NotaVentaOut(BaseModel):
    id: int
    numero: int
    cotizacion_id: int | None = None
    factura_id: int | None = None
    cliente_id: int
    vendedor_id: int | None = None
    empresa_id: int | None = None
    contacto: str | None = None
    fecha: date
    estado: str
    nota: str | None = None
    correo: str | None = None
    total_neto: Decimal
    total_iva: Decimal
    total: Decimal
    created_at: datetime
    updated_at: datetime
    cliente: ClienteMinOut | None = None
    vendedor: VendedorMinOut | None = None
    empresa: EmpresaRef | None = None
    cotizacion: CotizacionRef | None = None
    lineas: list[NotaVentaLineaOut] = []
    sede_despacho_id: int | None = None
    sede_despacho: SedeDespachoRef | None = None
    retiro_en_conico: bool = False
    terminos_pago: str | None = None
    metodo_pago: str | None = None
    plazo_dias: int = 0
    numero_oc_cliente: str | None = None
    is_locked: bool = False
    model_config = {"from_attributes": True}


class NotaVentaListOut(BaseModel):
    id: int
    numero: int
    cotizacion_id: int | None = None
    factura_id: int | None = None
    cliente_id: int
    vendedor_id: int | None = None
    empresa_id: int | None = None
    contacto: str | None = None
    fecha: date
    estado: str
    correo: str | None = None
    total_neto: Decimal
    total_iva: Decimal
    total: Decimal
    created_at: datetime
    updated_at: datetime
    cliente: ClienteMinOut | None = None
    vendedor: VendedorMinOut | None = None
    empresa: EmpresaRef | None = None
    sede_despacho_id: int | None = None
    retiro_en_conico: bool = False
    terminos_pago: str | None = None
    metodo_pago: str | None = None
    plazo_dias: int = 0
    is_locked: bool = False
    model_config = {"from_attributes": True}
