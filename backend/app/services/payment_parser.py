"""Payment import parser with comprehensive validation."""
from __future__ import annotations

import io
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Optional

import openpyxl


REQUIRED_COLUMNS = ("fecha_pago", "rut_cliente", "monto", "medio_pago", "referencia", "folio_documento", "tipo_documento")
VALID_PAYMENT_METHODS = ("efectivo", "transferencia", "cheque", "tarjeta", "otro")
VALID_DOCUMENT_TYPES = ("factura", "boleta", "nota_credito", "nota_debito", "guia_despacho")


class ParseError(Exception):
    """Raised when the file cannot be parsed (structure/format issue)."""
    pass


@dataclass(frozen=True)
class ParsedPayment:
    """Validated payment row."""
    fila: int
    fecha_pago: datetime
    rut_cliente: str
    rut_cliente_raw: str
    monto: Decimal
    medio_pago: str
    referencia: str
    folio_documento: str
    tipo_documento: str


@dataclass
class ErrorDetail:
    """Error details for a single row."""
    fila: int
    motivo: str
    valores_raw: dict[str, str]


@dataclass
class ParseResult:
    """Result of parsing a payment import file."""
    validas: list[ParsedPayment] = field(default_factory=list)
    invalidas: list[ErrorDetail] = field(default_factory=list)


def _normalizar_rut(rut_raw: str) -> str:
    """Strip dots and spaces, uppercase, keep digits and hyphen+DV."""
    if not rut_raw:
        return ""
    return rut_raw.replace(".", "").replace(" ", "").upper()


def _validar_rut_modulo11(rut: str) -> bool:
    """Validate Chilean RUT using módulo 11 algorithm."""
    if not rut:
        return False
    cleaned = rut.replace(".", "").replace(" ", "").upper()
    if "-" not in cleaned:
        return False
    cuerpo, dv = cleaned.rsplit("-", 1)
    if not cuerpo.isdigit() or len(cuerpo) < 7:
        return False
    if dv not in "0123456789K":
        return False
    factores = (2, 3, 4, 5, 6, 7)
    suma = sum(int(d) * factores[i % 6] for i, d in enumerate(reversed(cuerpo)))
    resto = 11 - (suma % 11)
    if resto == 11:
        esperado = "0"
    elif resto == 10:
        esperado = "K"
    else:
        esperado = str(resto)
    return dv == esperado


def _str(val) -> str:
    """Convert value to string and strip whitespace."""
    if val is None:
        return ""
    return str(val).strip()


def _parse_date(val: str | None) -> Optional[datetime]:
    """Parse date value. Accepts various formats."""
    if not val:
        return None
    date_str = _str(val)
    if not date_str:
        return None

    # Try common date formats
    formats = [
        "%Y-%m-%d",
        "%d-%m-%Y",
        "%d/%m/%Y",
        "%Y/%m/%d",
        "%d.%m.%Y",
        "%Y.%m.%d",
    ]

    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt)
        except ValueError:
            continue

    return None


def _parse_decimal(val: str | None) -> Optional[Decimal]:
    """Parse decimal value from string."""
    if val is None:
        return None
    val_str = _str(val)
    if not val_str:
        return None

    try:
        # str() conversion is critical: openpyxl returns floats, and
        # Decimal(100.1) -> '100.0999...', but Decimal(str(100.1)) -> '100.1'
        return Decimal(val_str)
    except (InvalidOperation, AttributeError):
        return None


def parse_pagos_xlsx(content: bytes) -> ParseResult:
    """
    Parse payment import file.

    Args:
        content: Raw xlsx file bytes

    Returns:
        ParseResult with validas and invalidas lists

    Raises:
        ParseError: If file cannot be read or header is malformed
    """
    try:
        wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    except Exception as e:  # noqa: BLE001 — surface as ParseError
        raise ParseError(f"No se pudo leer el archivo xlsx: {e}")

    try:
        ws = wb.active
        rows = [list(row) for row in ws.iter_rows(values_only=True)]
    finally:
        wb.close()

    if not rows:
        raise ParseError("El archivo no contiene filas")

    # Validate header
    header = [_str(h).lower() for h in rows[0]]
    missing = [c for c in REQUIRED_COLUMNS if c not in header]
    if missing:
        raise ParseError(
            f"Columnas requeridas no encontradas: {missing}. Columnas encontradas: {header}"
        )

    def get(row: list, col: str) -> str:
        """Get column value safely."""
        if col not in header:
            return ""
        i = header.index(col)
        return _str(row[i]) if i < len(row) else ""

    result = ParseResult()
    seen_refs: dict[str, int] = {}

    for idx, raw in enumerate(rows[1:], start=2):
        # Collect raw values for error reporting
        valores_raw = {
            "fecha_pago": get(raw, "fecha_pago"),
            "rut_cliente": get(raw, "rut_cliente"),
            "monto": get(raw, "monto"),
            "medio_pago": get(raw, "medio_pago"),
            "referencia": get(raw, "referencia"),
            "folio_documento": get(raw, "folio_documento"),
            "tipo_documento": get(raw, "tipo_documento"),
        }

        # Skip completely blank rows
        if not any(valores_raw.values()):
            continue

        errors = []

        # Validate required fields
        if not valores_raw["fecha_pago"]:
            errors.append("fecha_pago: requerido")
        if not valores_raw["rut_cliente"]:
            errors.append("rut_cliente: requerido")
        if not valores_raw["monto"]:
            errors.append("monto: requerido")
        if not valores_raw["medio_pago"]:
            errors.append("medio_pago: requerido")
        if not valores_raw["referencia"]:
            errors.append("referencia: requerida")
        if not valores_raw["folio_documento"]:
            errors.append("folio_documento: requerido")
        if not valores_raw["tipo_documento"]:
            errors.append("tipo_documento: requerido")

        # Validate fecha_pago
        fecha_pago = None
        if valores_raw["fecha_pago"]:
            fecha_pago = _parse_date(valores_raw["fecha_pago"])
            if fecha_pago is None:
                errors.append(f"fecha_pago: formato de fecha inválido '{valores_raw['fecha_pago']}'")

        # Validate rut_cliente
        rut_norm = None
        if valores_raw["rut_cliente"]:
            rut_norm = _normalizar_rut(valores_raw["rut_cliente"])
            if not _validar_rut_modulo11(rut_norm):
                errors.append(f"rut_cliente: RUT inválido '{valores_raw['rut_cliente']}'")

        # Validate monto
        monto = None
        if valores_raw["monto"]:
            monto = _parse_decimal(valores_raw["monto"])
            if monto is None:
                errors.append(f"monto: valor decimal inválido '{valores_raw['monto']}'")
            elif monto <= 0:
                errors.append(f"monto: debe ser positivo (recibido {monto})")

        # Validate medio_pago
        if valores_raw["medio_pago"]:
            medio_norm = valores_raw["medio_pago"].strip().lower()
            if medio_norm not in VALID_PAYMENT_METHODS:
                errors.append(
                    f"medio_pago: '{valores_raw['medio_pago']}' no válido. "
                    f"Aceptados: {', '.join(VALID_PAYMENT_METHODS)}"
                )

        # Validate tipo_documento
        if valores_raw["tipo_documento"]:
            tipo_norm = valores_raw["tipo_documento"].strip().lower()
            if tipo_norm not in VALID_DOCUMENT_TYPES:
                errors.append(
                    f"tipo_documento: '{valores_raw['tipo_documento']}' no válido. "
                    f"Aceptados: {', '.join(VALID_DOCUMENT_TYPES)}"
                )

        # If there are errors, add to invalidas list
        if errors:
            result.invalidas.append(
                ErrorDetail(
                    fila=idx,
                    motivo="; ".join(errors),
                    valores_raw=valores_raw,
                )
            )
            continue

        # If all validations pass, create ParsedPayment
        result.validas.append(
            ParsedPayment(
                fila=idx,
                fecha_pago=fecha_pago,  # type: ignore
                rut_cliente=rut_norm,  # type: ignore
                rut_cliente_raw=valores_raw["rut_cliente"],
                monto=monto,  # type: ignore
                medio_pago=valores_raw["medio_pago"].strip().lower(),
                referencia=valores_raw["referencia"],
                folio_documento=valores_raw["folio_documento"],
                tipo_documento=valores_raw["tipo_documento"].strip().lower(),
            )
        )

        # Track reference for duplicate detection (optional; can be extended later)
        ref_key = f"{rut_norm}|{valores_raw['folio_documento']}|{valores_raw['tipo_documento']}"
        if ref_key in seen_refs:
            # Overwrite with duplicate warning if needed, but collect all for now
            pass
        seen_refs[ref_key] = idx

    return result
