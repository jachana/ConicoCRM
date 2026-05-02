"""
Payment Import Parser

Handles parsing and validation of payment import Excel files with comprehensive
error reporting. Provides:
- Excel file parsing with openpyxl
- Row-level validation with detailed error messages
- Type and format validation
- Spanish column support
"""

from __future__ import annotations

import hashlib
import io
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Optional

import openpyxl


@dataclass(frozen=True)
class ParsedPayment:
    """Single validated payment row."""
    row_num: int
    fecha_pago: date
    rut_cliente: str
    monto: Decimal
    medio_pago: str
    referencia: Optional[str]
    folio_documento: Optional[str]
    tipo_documento: Optional[str]
    hash_key: str


@dataclass(frozen=True)
class InvalidRow:
    """Single invalid payment row with errors."""
    row_num: int
    rut_cliente: Optional[str]  # May be missing
    monto: Optional[Decimal]     # May be missing
    errors: list[str]


@dataclass
class ParseResult:
    """Results from parsing a payment file."""
    valid_rows: list[ParsedPayment]
    invalid_rows: list[InvalidRow]

    @property
    def valid_count(self) -> int:
        return len(self.valid_rows)

    @property
    def invalid_count(self) -> int:
        return len(self.invalid_rows)


class ParseError(Exception):
    """Raised when file format is invalid (not recoverable per-row)."""
    pass


REQUIRED_COLUMNS = frozenset(["fecha_pago", "rut_cliente", "monto", "medio_pago"])
VALID_DOCUMENT_TYPES = frozenset([
    "factura", "boleta", "nota_credito", "nota_debito", "guia_despacho",
    "factura de compra",
])
VALID_PAYMENT_METHODS = frozenset([
    "efectivo", "transferencia", "cheque", "tarjeta", "otro",
])


def parse_pagos_xlsx(content: bytes) -> "ParseResult":
    """Module-level convenience wrapper around PaymentParser.parse()."""
    return PaymentParser.parse(content, "pagos.xlsx")


class PaymentParser:
    """Parse and validate payment import Excel files."""

    # Expected column headers (case-insensitive)
    REQUIRED_COLUMNS = {
        "fecha_pago",
        "rut_cliente",
        "monto",
        "medio_pago",
    }

    OPTIONAL_COLUMNS = {
        "referencia",
        "folio_documento",
        "tipo_documento",
    }

    ALL_COLUMNS = REQUIRED_COLUMNS | OPTIONAL_COLUMNS

    @staticmethod
    def parse(content: bytes, filename: str) -> ParseResult:
        """
        Parse and validate a payment import file.

        Args:
            content: File bytes
            filename: Original filename (used to detect format)

        Returns:
            ParseResult with valid and invalid rows

        Raises:
            ParseError: If file format is invalid or headers are missing
        """
        parser = PaymentParser()
        return parser._parse_file(content, filename)

    @staticmethod
    def generate_template() -> bytes:
        """
        Generate Excel template with headers and example row.

        Returns:
            Excel file bytes
        """
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Pagos"

        # Row 1: Header with documentation
        headers = [
            "fecha_pago",
            "rut_cliente",
            "monto",
            "medio_pago",
            "referencia",
            "folio_documento",
            "tipo_documento",
        ]

        documentation = [
            "Fecha del pago (formato: YYYY-MM-DD)",
            "RUT del cliente (ej: 12345678-9)",
            "Monto del pago (número decimal, ej: 50000.00)",
            "Medio de pago (transferencia, cheque, efectivo, etc)",
            "Referencia de transferencia o cheque (opcional)",
            "Número de factura o boleta a pagar (opcional)",
            "Tipo de documento: factura o boleta (opcional)",
        ]

        for col_num, (header, doc) in enumerate(zip(headers, documentation), 1):
            cell = ws.cell(row=1, column=col_num, value=header)
            cell.font = openpyxl.styles.Font(bold=True, size=11)
            cell.fill = openpyxl.styles.PatternFill(start_color="D3D3D3", end_color="D3D3D3", fill_type="solid")

        # Row 2: Documentation row
        for col_num, doc in enumerate(documentation, 1):
            cell = ws.cell(row=2, column=col_num, value=doc)
            cell.font = openpyxl.styles.Font(italic=True, size=9)
            cell.fill = openpyxl.styles.PatternFill(start_color="F0F0F0", end_color="F0F0F0", fill_type="solid")

        # Row 3: Example data
        example = [
            "2026-05-01",
            "12345678-9",
            "50000.00",
            "transferencia",
            "TRX20260501001",
            "1001",
            "factura",
        ]

        for col_num, value in enumerate(example, 1):
            ws.cell(row=3, column=col_num, value=value)

        # Adjust column widths
        ws.column_dimensions['A'].width = 15
        ws.column_dimensions['B'].width = 15
        ws.column_dimensions['C'].width = 15
        ws.column_dimensions['D'].width = 20
        ws.column_dimensions['E'].width = 25
        ws.column_dimensions['F'].width = 15
        ws.column_dimensions['G'].width = 15

        # Save to bytes
        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        return output.getvalue()

    def _parse_file(self, content: bytes, filename: str) -> ParseResult:
        """Internal parse implementation."""
        ext = Path(filename).suffix.lower()
        if ext != ".xlsx":
            raise ParseError(f"Formato no soportado: {ext}. Use .xlsx")

        raw_rows = self._read_xlsx(content)

        if not raw_rows:
            raise ParseError("El archivo está vacío")

        if len(raw_rows) < 3:
            raise ParseError("El archivo debe tener encabezados y al menos una fila de datos")

        # Row 0: headers, Row 1: documentation, Row 2+: data
        header_row = raw_rows[0]
        headers = [
            str(h).strip().lower() if h is not None else ""
            for h in header_row
        ]

        # Find column indices
        col_indices = {}
        for col_name in self.ALL_COLUMNS:
            try:
                col_indices[col_name] = headers.index(col_name)
            except ValueError:
                if col_name in self.REQUIRED_COLUMNS:
                    raise ParseError(
                        f"Columna requerida faltante: '{col_name}'. "
                        f"Columnas encontradas: {[h for h in headers if h]}"
                    )
                col_indices[col_name] = None

        # Parse data rows (skip header row 0 and documentation row 1)
        valid_rows = []
        invalid_rows = []

        for row_num, raw_row in enumerate(raw_rows[2:], start=3):
            result = self._parse_row(
                row_num=row_num,
                raw_row=raw_row,
                col_indices=col_indices
            )

            if result[0] is not None:  # Valid
                valid_rows.append(result[0])
            else:  # Invalid
                invalid_rows.append(result[1])

        return ParseResult(
            valid_rows=valid_rows,
            invalid_rows=invalid_rows,
        )

    def _parse_row(
        self,
        row_num: int,
        raw_row: list,
        col_indices: dict[str, int | None],
    ) -> tuple[Optional[ParsedPayment], Optional[InvalidRow]]:
        """
        Parse and validate a single data row.

        Returns:
            (valid_payment, None) if valid
            (None, invalid_row) if invalid
        """
        errors = []
        extracted = {}

        # Extract all fields
        for col_name in self.ALL_COLUMNS:
            idx = col_indices.get(col_name)
            if idx is None:
                extracted[col_name] = None
            else:
                value = raw_row[idx] if idx < len(raw_row) else None
                extracted[col_name] = value

        # Validate required fields
        rut_cliente = self._validate_rut_cliente(extracted["rut_cliente"], errors)
        monto = self._validate_monto(extracted["monto"], errors)
        fecha_pago = self._validate_fecha_pago(extracted["fecha_pago"], errors)
        medio_pago = self._validate_medio_pago(extracted["medio_pago"], errors)

        if errors:
            return (
                None,
                InvalidRow(
                    row_num=row_num,
                    rut_cliente=rut_cliente,
                    monto=monto,
                    errors=errors,
                )
            )

        # Optional fields (validate if present)
        referencia = self._validate_referencia(extracted["referencia"], errors)
        folio_documento = self._validate_folio_documento(extracted["folio_documento"], errors)
        tipo_documento = self._validate_tipo_documento(extracted["tipo_documento"], errors)

        if errors:
            return (
                None,
                InvalidRow(
                    row_num=row_num,
                    rut_cliente=rut_cliente,
                    monto=monto,
                    errors=errors,
                )
            )

        # Generate hash key for idempotency (same format as PaymentMatcher)
        hash_key = self._generate_hash_key(fecha_pago, rut_cliente, monto, referencia)

        return (
            ParsedPayment(
                row_num=row_num,
                fecha_pago=fecha_pago,
                rut_cliente=rut_cliente,
                monto=monto,
                medio_pago=medio_pago,
                referencia=referencia,
                folio_documento=folio_documento,
                tipo_documento=tipo_documento,
                hash_key=hash_key,
            ),
            None,
        )

    @staticmethod
    def _validate_rut_cliente(value: any, errors: list[str]) -> Optional[str]:
        """Validate and extract RUT cliente."""
        if value is None or str(value).strip() == "":
            errors.append("RUT cliente es requerido")
            return None

        rut = str(value).strip().upper()

        # Basic RUT format check (12345678-9 or 123456789)
        if not rut or len(rut) < 8:
            errors.append(f"RUT cliente inválido: {rut}")
            return None

        return rut

    @staticmethod
    def _validate_monto(value: any, errors: list[str]) -> Optional[Decimal]:
        """Validate and extract monto."""
        if value is None or str(value).strip() == "":
            errors.append("Monto es requerido")
            return None

        try:
            monto = Decimal(str(value).strip())
            if monto <= 0:
                errors.append(f"Monto debe ser mayor a 0: {monto}")
                return None
            return monto
        except (InvalidOperation, ValueError):
            errors.append(f"Monto inválido: {value}")
            return None

    @staticmethod
    def _validate_fecha_pago(value: any, errors: list[str]) -> Optional[date]:
        """Validate and extract fecha_pago."""
        if value is None or str(value).strip() == "":
            errors.append("Fecha de pago es requerida")
            return None

        fecha_str = str(value).strip()

        # Try parsing as date
        try:
            # Handle both datetime objects and strings
            if isinstance(value, date):
                return value

            # Parse ISO format (2026-05-01)
            if len(fecha_str) == 10 and fecha_str[4] == '-' and fecha_str[7] == '-':
                return date.fromisoformat(fecha_str)

            # Try other common formats
            for fmt in ["%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"]:
                try:
                    return date.fromisoformat(fecha_str) if fmt == "%Y-%m-%d" else \
                           date.strptime(fecha_str, fmt).date()
                except ValueError:
                    continue

            errors.append(f"Fecha inválida: {fecha_str}. Use formato YYYY-MM-DD")
            return None
        except Exception as e:
            errors.append(f"Fecha inválida: {fecha_str}. Error: {e}")
            return None

    @staticmethod
    def _validate_medio_pago(value: any, errors: list[str]) -> Optional[str]:
        """Validate and extract medio_pago."""
        if value is None or str(value).strip() == "":
            errors.append("Medio de pago es requerido")
            return None

        medio = str(value).strip()
        if not medio:
            errors.append("Medio de pago no puede estar vacío")
            return None

        return medio

    @staticmethod
    def _validate_referencia(value: any, errors: list[str]) -> Optional[str]:
        """Validate and extract referencia (optional)."""
        if value is None or str(value).strip() == "":
            return None

        return str(value).strip()

    @staticmethod
    def _validate_folio_documento(value: any, errors: list[str]) -> Optional[str]:
        """Validate and extract folio_documento (optional)."""
        if value is None or str(value).strip() == "":
            return None

        folio = str(value).strip()

        # If provided, must be numeric
        try:
            int(folio)
            return folio
        except ValueError:
            errors.append(f"Folio documento debe ser numérico: {folio}")
            return None

    @staticmethod
    def _validate_tipo_documento(value: any, errors: list[str]) -> Optional[str]:
        """Validate and extract tipo_documento (optional)."""
        if value is None or str(value).strip() == "":
            return None

        tipo = str(value).strip().lower()

        # Must be factura or boleta if provided
        if tipo not in ("factura", "boleta", "factura de compra"):
            errors.append(f"Tipo de documento inválido: {tipo}. Use 'factura' o 'boleta'")
            return None

        return tipo

    @staticmethod
    def _generate_hash_key(fecha_pago: date, rut_cliente: str, monto: Decimal, referencia: Optional[str]) -> str:
        """Generate SHA256 hash key for idempotency detection."""
        key_str = f"{fecha_pago}|{rut_cliente}|{monto}|{referencia or ''}"
        return hashlib.sha256(key_str.encode()).hexdigest()

    @staticmethod
    def _read_xlsx(content: bytes) -> list[list]:
        """Read Excel file and return rows as lists."""
        wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        try:
            ws = wb.active
            return [list(row) for row in ws.iter_rows(values_only=True)]
        finally:
            wb.close()
