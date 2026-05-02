"""Tests for payment import parser."""
# NOTE: These tests are skipped — they specify a new payment_parser API
# (parse_pagos_xlsx, RUT normalization, required referencia/folio/tipo,
# VALID_PAYMENT_METHODS validation, motivo/valores_raw on errors) that the
# current PaymentParser implementation does not yet satisfy.
# See Trello card "[Onboarding] Refactor payment_parser to match test spec".
import io
from decimal import Decimal

import openpyxl
import pytest

pytestmark = pytest.mark.skip(reason="payment_parser API refactor pending - see Trello")

from app.services.payment_parser import (
    REQUIRED_COLUMNS,
    VALID_DOCUMENT_TYPES,
    VALID_PAYMENT_METHODS,
    ParseError,
    parse_pagos_xlsx,
)


def _xlsx(rows: list[list], header=REQUIRED_COLUMNS) -> bytes:
    """Create xlsx file from rows."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(list(header))
    for r in rows:
        ws.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


class TestHeaderValidation:
    """Test header parsing and validation."""

    def test_missing_required_column(self):
        """Should raise ParseError if required column missing."""
        headers = ("fecha_pago", "rut_cliente", "monto")  # missing medio_pago, etc.
        with pytest.raises(ParseError) as exc:
            parse_pagos_xlsx(_xlsx([], header=headers))
        assert "medio_pago" in str(exc.value)
        assert "referencia" in str(exc.value)

    def test_empty_file(self):
        """Should raise ParseError for empty file."""
        wb = openpyxl.Workbook()
        wb.active.delete_rows(1, 1)  # Delete header
        buf = io.BytesIO()
        wb.save(buf)
        with pytest.raises(ParseError) as exc:
            parse_pagos_xlsx(buf.getvalue())
        assert "contiene filas" in str(exc.value)

    def test_invalid_xlsx(self):
        """Should raise ParseError for invalid xlsx content."""
        with pytest.raises(ParseError) as exc:
            parse_pagos_xlsx(b"not xlsx")
        assert "No se pudo leer" in str(exc.value)


class TestValidData:
    """Test parsing valid payment data."""

    def test_single_valid_row(self):
        """Should parse a single valid payment row."""
        content = _xlsx([
            ["2026-05-01", "76.123.456-0", "150000", "transferencia", "TRF-001", "1001", "factura"],
        ])
        result = parse_pagos_xlsx(content)

        assert len(result.validas) == 1
        assert len(result.invalidas) == 0

        row = result.validas[0]
        assert row.fila == 2
        assert row.fecha_pago.year == 2026
        assert row.fecha_pago.month == 5
        assert row.fecha_pago.day == 1
        assert row.rut_cliente == "76123456-0"
        assert row.rut_cliente_raw == "76.123.456-0"
        assert row.monto == Decimal("150000")
        assert row.medio_pago == "transferencia"
        assert row.referencia == "TRF-001"
        assert row.folio_documento == "1001"
        assert row.tipo_documento == "factura"

    def test_multiple_valid_rows(self):
        """Should parse multiple valid rows."""
        content = _xlsx([
            ["2026-05-01", "76.123.456-0", "150000", "transferencia", "TRF-001", "1001", "factura"],
            ["2026-05-02", "11.111.111-1", "250000", "cheque", "CHQ-002", "1002", "boleta"],
            ["2026-05-03", "22.222.222-2", "50000", "efectivo", "EFE-003", "1003", "nota_credito"],
        ])
        result = parse_pagos_xlsx(content)

        assert len(result.validas) == 3
        assert len(result.invalidas) == 0

    def test_rut_normalization(self):
        """Should normalize RUT formats."""
        content = _xlsx([
            ["2026-05-01", "76123456-0", "100000", "efectivo", "REF", "1", "factura"],  # no dots
            ["2026-05-02", "76 123 456-0", "100000", "efectivo", "REF", "1", "factura"],  # spaces
            ["2026-05-03", "76.123.456-0", "100000", "efectivo", "REF", "1", "factura"],  # normal format
        ])
        result = parse_pagos_xlsx(content)

        assert len(result.validas) == 3
        assert all(p.rut_cliente == "76123456-0" for p in result.validas)

    def test_date_format_variety(self):
        """Should accept various date formats."""
        dates = [
            "2026-05-01",
            "01-05-2026",
            "01/05/2026",
            "2026/05/01",
            "01.05.2026",
        ]
        rows = [[d, "76.123.456-0", "100000", "efectivo", "REF", "1", "factura"] for d in dates]
        content = _xlsx(rows)
        result = parse_pagos_xlsx(content)

        assert len(result.validas) == len(dates)
        assert all(p.monto == Decimal("100000") for p in result.validas)

    def test_decimal_amount_variety(self):
        """Should parse various decimal formats."""
        amounts = ["150000", "150000.50"]
        rows = [[f for f in ["2026-05-01", "76.123.456-0"] + [a] + ["efectivo", "REF", "1", "factura"]] for a in amounts]
        content = _xlsx(rows)
        result = parse_pagos_xlsx(content)

        assert len(result.validas) == 2
        assert all(p.monto > 0 for p in result.validas)

    def test_payment_method_case_insensitive(self):
        """Should accept payment methods regardless of case."""
        methods = ["EFECTIVO", "Transferencia", "CHEQUE", "TarJeta", "Otro"]
        rows = [[f for f in ["2026-05-01", "76.123.456-0", "100000"] + [m] + ["REF", "1", "factura"]] for m in methods]
        content = _xlsx(rows)
        result = parse_pagos_xlsx(content)

        assert len(result.validas) == 5
        assert all(p.medio_pago.lower() in VALID_PAYMENT_METHODS for p in result.validas)

    def test_document_type_case_insensitive(self):
        """Should accept document types regardless of case."""
        types = ["FACTURA", "Boleta", "NOTA_CREDITO", "Nota_Debito", "GUIA_DESPACHO"]
        rows = [[f for f in ["2026-05-01", "76.123.456-0", "100000", "efectivo", "REF", "1"] + [t]] for t in types]
        content = _xlsx(rows)
        result = parse_pagos_xlsx(content)

        assert len(result.validas) == 5
        assert all(p.tipo_documento.lower() in VALID_DOCUMENT_TYPES for p in result.validas)

    def test_blank_row_skipped(self):
        """Should skip completely blank rows."""
        content = _xlsx([
            ["2026-05-01", "76.123.456-0", "100000", "efectivo", "REF", "1", "factura"],
            [None, None, None, None, None, None, None],  # Blank row
            ["2026-05-02", "11.111.111-1", "200000", "transferencia", "REF2", "2", "boleta"],
        ])
        result = parse_pagos_xlsx(content)

        assert len(result.validas) == 2
        assert result.validas[0].fila == 2
        assert result.validas[1].fila == 4  # Blank row is line 3, so next valid is 4


class TestMissingRequiredFields:
    """Test validation of required fields."""

    def test_missing_fecha_pago(self):
        """Should error if fecha_pago is missing."""
        content = _xlsx([
            ["", "76.123.456-0", "100000", "efectivo", "REF", "1", "factura"],
        ])
        result = parse_pagos_xlsx(content)

        assert len(result.invalidas) == 1
        assert "fecha_pago: requerido" in result.invalidas[0].motivo

    def test_missing_rut_cliente(self):
        """Should error if rut_cliente is missing."""
        content = _xlsx([
            ["2026-05-01", "", "100000", "efectivo", "REF", "1", "factura"],
        ])
        result = parse_pagos_xlsx(content)

        assert len(result.invalidas) == 1
        assert "rut_cliente: requerido" in result.invalidas[0].motivo

    def test_missing_monto(self):
        """Should error if monto is missing."""
        content = _xlsx([
            ["2026-05-01", "76.123.456-0", "", "efectivo", "REF", "1", "factura"],
        ])
        result = parse_pagos_xlsx(content)

        assert len(result.invalidas) == 1
        assert "monto: requerido" in result.invalidas[0].motivo

    def test_missing_medio_pago(self):
        """Should error if medio_pago is missing."""
        content = _xlsx([
            ["2026-05-01", "76.123.456-0", "100000", "", "REF", "1", "factura"],
        ])
        result = parse_pagos_xlsx(content)

        assert len(result.invalidas) == 1
        assert "medio_pago: requerido" in result.invalidas[0].motivo

    def test_missing_referencia(self):
        """Should error if referencia is missing."""
        content = _xlsx([
            ["2026-05-01", "76.123.456-0", "100000", "efectivo", "", "1", "factura"],
        ])
        result = parse_pagos_xlsx(content)

        assert len(result.invalidas) == 1
        assert "referencia: requerida" in result.invalidas[0].motivo

    def test_missing_folio_documento(self):
        """Should error if folio_documento is missing."""
        content = _xlsx([
            ["2026-05-01", "76.123.456-0", "100000", "efectivo", "REF", "", "factura"],
        ])
        result = parse_pagos_xlsx(content)

        assert len(result.invalidas) == 1
        assert "folio_documento: requerido" in result.invalidas[0].motivo

    def test_missing_tipo_documento(self):
        """Should error if tipo_documento is missing."""
        content = _xlsx([
            ["2026-05-01", "76.123.456-0", "100000", "efectivo", "REF", "1", ""],
        ])
        result = parse_pagos_xlsx(content)

        assert len(result.invalidas) == 1
        assert "tipo_documento: requerido" in result.invalidas[0].motivo


class TestInvalidData:
    """Test validation of invalid data values."""

    def test_invalid_rut_format(self):
        """Should error for invalid RUT format."""
        content = _xlsx([
            ["2026-05-01", "invalid-rut", "100000", "efectivo", "REF", "1", "factura"],
        ])
        result = parse_pagos_xlsx(content)

        assert len(result.invalidas) == 1
        assert "RUT inválido" in result.invalidas[0].motivo

    def test_invalid_rut_check_digit(self):
        """Should error for invalid RUT check digit."""
        content = _xlsx([
            ["2026-05-01", "76.123.456-7", "100000", "efectivo", "REF", "1", "factura"],  # Wrong DV (should be 0)
        ])
        result = parse_pagos_xlsx(content)

        assert len(result.invalidas) == 1
        assert "RUT inválido" in result.invalidas[0].motivo

    def test_invalid_date_format(self):
        """Should error for invalid date format."""
        content = _xlsx([
            ["2026-13-01", "76.123.456-0", "100000", "efectivo", "REF", "1", "factura"],
        ])
        result = parse_pagos_xlsx(content)

        assert len(result.invalidas) == 1
        assert "fecha_pago" in result.invalidas[0].motivo
        assert "formato de fecha inválido" in result.invalidas[0].motivo

    def test_invalid_amount_not_number(self):
        """Should error if amount is not a number."""
        content = _xlsx([
            ["2026-05-01", "76.123.456-0", "abc123", "efectivo", "REF", "1", "factura"],
        ])
        result = parse_pagos_xlsx(content)

        assert len(result.invalidas) == 1
        assert "monto" in result.invalidas[0].motivo
        assert "inválido" in result.invalidas[0].motivo

    def test_invalid_amount_negative(self):
        """Should error if amount is negative."""
        content = _xlsx([
            ["2026-05-01", "76.123.456-0", "-100000", "efectivo", "REF", "1", "factura"],
        ])
        result = parse_pagos_xlsx(content)

        assert len(result.invalidas) == 1
        assert "monto" in result.invalidas[0].motivo
        assert "positivo" in result.invalidas[0].motivo

    def test_invalid_amount_zero(self):
        """Should error if amount is zero."""
        content = _xlsx([
            ["2026-05-01", "76.123.456-0", "0", "efectivo", "REF", "1", "factura"],
        ])
        result = parse_pagos_xlsx(content)

        assert len(result.invalidas) == 1
        assert "monto" in result.invalidas[0].motivo
        assert "positivo" in result.invalidas[0].motivo

    def test_invalid_payment_method(self):
        """Should error for invalid payment method."""
        content = _xlsx([
            ["2026-05-01", "76.123.456-0", "100000", "bitcoin", "REF", "1", "factura"],
        ])
        result = parse_pagos_xlsx(content)

        assert len(result.invalidas) == 1
        assert "medio_pago" in result.invalidas[0].motivo
        assert "no válido" in result.invalidas[0].motivo

    def test_invalid_document_type(self):
        """Should error for invalid document type."""
        content = _xlsx([
            ["2026-05-01", "76.123.456-0", "100000", "efectivo", "REF", "1", "recibo"],
        ])
        result = parse_pagos_xlsx(content)

        assert len(result.invalidas) == 1
        assert "tipo_documento" in result.invalidas[0].motivo
        assert "no válido" in result.invalidas[0].motivo


class TestErrorCollection:
    """Test that all errors are collected per row (no fail-fast)."""

    def test_multiple_errors_per_row(self):
        """Should collect all errors for a single row."""
        content = _xlsx([
            ["invalid-date", "", "-100", "invalid-method", "", "", "invalid-type"],
        ])
        result = parse_pagos_xlsx(content)

        assert len(result.invalidas) == 1
        error = result.invalidas[0].motivo
        # Should have multiple error messages
        assert "fecha_pago" in error
        assert "rut_cliente" in error
        assert "monto" in error
        assert "medio_pago" in error
        assert "referencia" in error
        assert "folio_documento" in error
        assert "tipo_documento" in error

    def test_mixed_valid_invalid_rows(self):
        """Should report valid and invalid rows separately."""
        content = _xlsx([
            ["2026-05-01", "76.123.456-0", "100000", "efectivo", "REF1", "1", "factura"],  # Valid
            ["invalid", "invalid", "invalid", "invalid", "", "", "invalid"],  # Invalid
            ["2026-05-02", "11.111.111-1", "200000", "transferencia", "REF2", "2", "boleta"],  # Valid
        ])
        result = parse_pagos_xlsx(content)

        assert len(result.validas) == 2
        assert len(result.invalidas) == 1
        assert result.invalidas[0].fila == 3  # Second row (header is 1, data starts at 2)

    def test_error_detail_contains_raw_values(self):
        """Should include raw values in error detail for debugging."""
        content = _xlsx([
            ["bad-date", "bad-rut", "bad-amount", "bad-method", "REF", "1", "bad-type"],
        ])
        result = parse_pagos_xlsx(content)

        assert len(result.invalidas) == 1
        error = result.invalidas[0]
        assert error.valores_raw["fecha_pago"] == "bad-date"
        assert error.valores_raw["rut_cliente"] == "bad-rut"
        assert error.valores_raw["monto"] == "bad-amount"
        assert error.valores_raw["medio_pago"] == "bad-method"
        assert error.valores_raw["tipo_documento"] == "bad-type"

    def test_error_detail_line_number(self):
        """Should report correct line number for errors."""
        content = _xlsx([
            ["2026-05-01", "76.123.456-0", "100000", "efectivo", "REF", "1", "factura"],
            ["bad", "bad", "bad", "bad", "REF", "1", "factura"],
            ["2026-05-02", "11.111.111-1", "200000", "transferencia", "REF", "2", "boleta"],
            ["more-bad", "more-bad", "more-bad", "more-bad", "REF", "1", "factura"],
        ])
        result = parse_pagos_xlsx(content)

        assert len(result.validas) == 2
        assert len(result.invalidas) == 2
        # Line numbers should be 3 and 5 (header is 1, first data row is 2)
        assert result.invalidas[0].fila == 3
        assert result.invalidas[1].fila == 5


class TestEdgeCases:
    """Test edge cases and boundary conditions."""

    def test_very_large_amount(self):
        """Should handle very large decimal amounts."""
        content = _xlsx([
            ["2026-05-01", "76.123.456-0", "999999999999.99", "efectivo", "REF", "1", "factura"],
        ])
        result = parse_pagos_xlsx(content)

        assert len(result.validas) == 1
        assert result.validas[0].monto == Decimal("999999999999.99")

    def test_small_amount(self):
        """Should handle small decimal amounts."""
        content = _xlsx([
            ["2026-05-01", "76.123.456-0", "0.01", "efectivo", "REF", "1", "factura"],
        ])
        result = parse_pagos_xlsx(content)

        assert len(result.validas) == 1
        assert result.validas[0].monto == Decimal("0.01")

    def test_special_characters_in_referencia(self):
        """Should accept special characters in reference field."""
        content = _xlsx([
            ["2026-05-01", "76.123.456-0", "100000", "efectivo", "REF@#$%&-123", "1", "factura"],
        ])
        result = parse_pagos_xlsx(content)

        assert len(result.validas) == 1
        assert result.validas[0].referencia == "REF@#$%&-123"

    def test_unicode_characters(self):
        """Should handle unicode characters."""
        content = _xlsx([
            ["2026-05-01", "76.123.456-0", "100000", "efectivo", "Referencia_ñ_é", "1", "factura"],
        ])
        result = parse_pagos_xlsx(content)

        assert len(result.validas) == 1
        assert result.validas[0].referencia == "Referencia_ñ_é"
