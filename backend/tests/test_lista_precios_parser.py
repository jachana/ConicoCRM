import io
from decimal import Decimal
import csv as _csv

import openpyxl
import pytest

from app.services.lista_precios_parser import (
    ParsedRow,
    ParseError,
    parse_lista_precios,
)


def _build_csv(rows, header=("sku", "costo")):
    buf = io.StringIO()
    writer = _csv.writer(buf)
    writer.writerow(header)
    for r in rows:
        writer.writerow(r)
    return buf.getvalue().encode("utf-8")


def _build_xlsx(rows, header=("sku", "costo")):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(list(header))
    for r in rows:
        ws.append(list(r))
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_parse_csv_basic():
    data = _build_csv([("ABC-1", "100.50"), ("XYZ-2", "200")])
    result = parse_lista_precios(data, "precios.csv")
    assert result.rows == [
        ParsedRow(sku="ABC-1", costo_unitario=Decimal("100.50")),
        ParsedRow(sku="XYZ-2", costo_unitario=Decimal("200")),
    ]
    assert result.filas_invalidas == 0


def test_parse_xlsx_basic():
    data = _build_xlsx([("ABC-1", 100.50), ("XYZ-2", 200)])
    result = parse_lista_precios(data, "precios.xlsx")
    skus = [r.sku for r in result.rows]
    assert skus == ["ABC-1", "XYZ-2"]


def test_parse_skips_blank_sku_and_non_numeric_cost():
    data = _build_csv([("", "100"), ("ABC", "not-a-number"), ("XYZ", "50")])
    result = parse_lista_precios(data, "precios.csv")
    assert [r.sku for r in result.rows] == ["XYZ"]
    assert result.filas_invalidas == 2


def test_parse_rejects_duplicate_sku_in_same_file():
    data = _build_csv([("ABC", "100"), ("ABC", "120")])
    with pytest.raises(ParseError) as exc:
        parse_lista_precios(data, "precios.csv")
    assert "ABC" in str(exc.value)


def test_parse_rejects_missing_headers():
    data = _build_csv([("x", "y")], header=("codigo", "precio"))
    with pytest.raises(ParseError) as exc:
        parse_lista_precios(data, "precios.csv")
    assert "sku" in str(exc.value) or "costo" in str(exc.value)


def test_parse_accepts_custom_column_names():
    data = _build_csv([("ABC", "50")], header=("codigo", "precio"))
    result = parse_lista_precios(data, "precios.csv", columna_sku="codigo", columna_costo="precio")
    assert result.rows[0].sku == "ABC"


def test_parse_rejects_unsupported_extension():
    with pytest.raises(ParseError):
        parse_lista_precios(b"irrelevant", "precios.txt")


def test_parse_csv_trailing_blank_line_counts_as_invalid():
    # A trailing blank row gets counted in filas_invalidas — documents
    # current behavior so a future change to skip silently is a conscious choice.
    data = b"sku,costo\nABC,100\nXYZ,50\n\n"
    result = parse_lista_precios(data, "precios.csv")
    assert [r.sku for r in result.rows] == ["ABC", "XYZ"]
    assert result.filas_invalidas == 1


def test_parse_header_only_returns_empty_result():
    data = _build_csv([])  # only the header, no data rows
    result = parse_lista_precios(data, "precios.csv")
    assert result.rows == []
    assert result.filas_invalidas == 0


def test_parse_semicolon_delimited_csv_raises_parse_error():
    # Chilean Excel defaults to ';' — the parser does not auto-detect and will raise.
    # Pinning test: a future csv.Sniffer enhancement should break this and update the assertion.
    data = b"sku;costo\nABC;100\n"
    with pytest.raises(ParseError):
        parse_lista_precios(data, "precios.csv")
