from datetime import date, datetime, timedelta
from decimal import Decimal
from pydantic import BaseModel, computed_field, model_validator
from typing import Self
from app.schemas.empresa import EmpresaRef
from app.schemas.metodo_pago import METODOS_PAGO, validate_metodo_plazo


class CotizacionLineaCreate(BaseModel):
    orden: int
    producto_id: int | None = None
    sku: str | None = None
    descripcion: str
    formato: str | None = None
    cantidad: int = 1
    valor_neto: Decimal = Decimal("0")
    descuento: Decimal = Decimal("0")


class CotizacionLineaOut(CotizacionLineaCreate):
    id: int
    total_neto: Decimal
    iva: Decimal
    total: Decimal
    margen: Decimal | None = None
    model_config = {"from_attributes": True}


class CotizacionCreate(BaseModel):
    cliente_id: int
    vendedor_id: int | None = None
    contacto: str | None = None
    fecha: date | None = None
    estado: str = "no_definido"
    nota: str | None = None
    correo: str | None = None
    empresa_id: int | None = None
    terminos_pago: str | None = None
    validez_dias: int = 5
    metodo_pago: str | None = None
    plazo_dias: int = 0
    lineas: list[CotizacionLineaCreate] = []

    @model_validator(mode="after")
    def check_plazo_metodo(self) -> Self:
        validate_metodo_plazo(self.metodo_pago, self.plazo_dias)
        return self


class CotizacionUpdate(BaseModel):
    cliente_id: int | None = None
    contacto: str | None = None
    fecha: date | None = None
    estado: str | None = None
    nota: str | None = None
    correo: str | None = None
    vendedor_id: int | None = None
    empresa_id: int | None = None
    terminos_pago: str | None = None
    terminos_pago_estado: str | None = None
    validez_dias: int | None = None
    metodo_pago: str | None = None
    plazo_dias: int | None = None

    @model_validator(mode="after")
    def check_plazo_metodo(self) -> Self:
        if self.metodo_pago is not None and self.plazo_dias is not None:
            validate_metodo_plazo(self.metodo_pago, self.plazo_dias)
        elif self.metodo_pago is not None and self.metodo_pago not in METODOS_PAGO:
            raise ValueError(f"metodo_pago inválido. Opciones: {sorted(METODOS_PAGO)}")
        return self


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


class CotizacionOut(BaseModel):
    id: int
    numero: int
    cliente_id: int
    vendedor_id: int
    contacto: str | None = None
    fecha: date
    estado: str
    nota: str | None = None
    terminos_pago: str | None = None
    terminos_pago_estado: str = "aprobado"
    validez_dias: int = 5
    metodo_pago: str | None = None
    plazo_dias: int = 0
    correo: str | None = None
    total_neto: Decimal
    total_iva: Decimal
    total: Decimal
    created_at: datetime
    updated_at: datetime
    cliente: ClienteMinOut | None = None
    vendedor: VendedorMinOut | None = None
    empresa: EmpresaRef | None = None
    lineas: list[CotizacionLineaOut] = []
    is_locked: bool = False
    nv_id: int | None = None

    @computed_field
    @property
    def fecha_expiracion(self) -> date:
        return self.fecha + timedelta(days=self.validez_dias)

    model_config = {"from_attributes": True}


class CotizacionListOut(BaseModel):
    id: int
    numero: int
    cliente_id: int
    vendedor_id: int
    contacto: str | None = None
    fecha: date
    estado: str
    correo: str | None = None
    terminos_pago: str | None = None
    terminos_pago_estado: str = "aprobado"
    validez_dias: int = 5
    metodo_pago: str | None = None
    plazo_dias: int = 0
    total_neto: Decimal
    total_iva: Decimal
    total: Decimal
    margen_total: Decimal | None = None
    created_at: datetime
    updated_at: datetime
    cliente: ClienteMinOut | None = None
    vendedor: VendedorMinOut | None = None
    empresa: EmpresaRef | None = None
    lineas: list[CotizacionLineaOut] = []
    is_locked: bool = False
    model_config = {"from_attributes": True}


class RecotizarOut(BaseModel):
    id: int
    warnings: list[str] = []


class SystemConfigOut(BaseModel):
    key: str
    value: str
    model_config = {"from_attributes": True}


class SystemConfigUpdate(BaseModel):
    updates: dict[str, str]
