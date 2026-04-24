from __future__ import annotations

import csv as _csv
import io
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from pathlib import Path

import openpyxl


@dataclass(frozen=True)
class ParsedRow:
    sku: str
    costo_unitario: Decimal


@dataclass
class ParseResult:
    rows: list[ParsedRow]
    filas_invalidas: int


class ParseError(Exception):
    pass


DEFAULT_SKU_COLUMN = "sku"
DEFAULT_COSTO_COLUMN = "costo"


def parse_lista_precios(
    content: bytes,
    filename: str,
    columna_sku: str = DEFAULT_SKU_COLUMN,
    columna_costo: str = DEFAULT_COSTO_COLUMN,
) -> ParseResult:
    ext = Path(filename).suffix.lower()
    if ext == ".csv":
        raw_rows = _read_csv(content)
    elif ext == ".xlsx":
        raw_rows = _read_xlsx(content)
    else:
        raise ParseError(f"Extensión no soportada: {ext}. Use .xlsx o .csv")

    if not raw_rows:
        raise ParseError("El archivo no contiene filas")

    header = [h.strip().lower() if isinstance(h, str) else "" for h in raw_rows[0]]
    sku_col = columna_sku.strip().lower()
    costo_col = columna_costo.strip().lower()
    try:
        sku_idx = header.index(sku_col)
        costo_idx = header.index(costo_col)
    except ValueError:
        raise ParseError(f"Columnas requeridas no encontradas: '{columna_sku}', '{columna_costo}'. Encontradas: {header}")

    rows: list[ParsedRow] = []
    seen: dict[str, int] = {}
    invalid = 0
    for i, raw in enumerate(raw_rows[1:], start=2):
        if len(raw) <= max(sku_idx, costo_idx):
            invalid += 1
            continue
        sku_val = raw[sku_idx]
        costo_val = raw[costo_idx]
        sku = str(sku_val).strip() if sku_val is not None else ""
        if not sku:
            invalid += 1
            continue
        try:
            # str() route is load-bearing: openpyxl returns floats; Decimal(str(100.1)) -> '100.1', Decimal(100.1) -> '100.0999...'
            costo = Decimal(str(costo_val).strip())
        except (InvalidOperation, AttributeError):
            invalid += 1
            continue
        if sku in seen:
            raise ParseError(f"SKU duplicado en el archivo: '{sku}' (filas {seen[sku]} y {i})")
        seen[sku] = i
        rows.append(ParsedRow(sku=sku, costo_unitario=costo))

    return ParseResult(rows=rows, filas_invalidas=invalid)


def _read_csv(content: bytes) -> list[list]:
    text = content.decode("utf-8-sig")
    reader = _csv.reader(io.StringIO(text))
    return [row for row in reader]


def _read_xlsx(content: bytes) -> list[list]:
    wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    try:
        ws = wb.active
        return [list(row) for row in ws.iter_rows(values_only=True)]
    finally:
        wb.close()
