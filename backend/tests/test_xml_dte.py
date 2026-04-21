from decimal import Decimal
from datetime import date
import pytest
from app.services.xml_dte import parse_dte_xml

SAMPLE_DTE_33 = b"""<?xml version="1.0" encoding="ISO-8859-1"?>
<DTE xmlns="http://www.sii.cl/SiiDte" version="1.0">
  <Documento ID="DTE-33-12345">
    <Encabezado>
      <IdDoc>
        <TipoDTE>33</TipoDTE>
        <Folio>12345</Folio>
        <FchEmis>2024-01-15</FchEmis>
        <FchVenc>2024-02-15</FchVenc>
      </IdDoc>
      <Emisor>
        <RUTEmisor>76543210-K</RUTEmisor>
        <RznSoc>Mi Empresa S.A.</RznSoc>
      </Emisor>
      <Receptor>
        <RUTRecep>98765432-1</RUTRecep>
        <RznSocRecep>Cliente Empresa Ltda.</RznSocRecep>
      </Receptor>
      <Totales>
        <MntNeto>100000</MntNeto>
        <TasaIVA>19</TasaIVA>
        <IVA>19000</IVA>
        <MntTotal>119000</MntTotal>
      </Totales>
    </Encabezado>
    <Detalle>
      <NroLinDet>1</NroLinDet>
      <NmbItem>Producto A</NmbItem>
      <QtyItem>2</QtyItem>
      <PrcItem>50000</PrcItem>
      <MontoItem>100000</MontoItem>
    </Detalle>
  </Documento>
</DTE>"""

SAMPLE_DTE_34 = b"""<?xml version="1.0" encoding="ISO-8859-1"?>
<DTE xmlns="http://www.sii.cl/SiiDte" version="1.0">
  <Documento ID="DTE-34-99">
    <Encabezado>
      <IdDoc>
        <TipoDTE>34</TipoDTE>
        <Folio>99</Folio>
        <FchEmis>2024-03-01</FchEmis>
      </IdDoc>
      <Emisor>
        <RUTEmisor>76543210-K</RUTEmisor>
        <RznSoc>Mi Empresa S.A.</RznSoc>
      </Emisor>
      <Receptor>
        <RUTRecep>11111111-1</RUTRecep>
        <RznSocRecep>Otro Cliente</RznSocRecep>
      </Receptor>
      <Totales>
        <MntExe>50000</MntExe>
        <MntTotal>50000</MntTotal>
      </Totales>
    </Encabezado>
    <Detalle>
      <NroLinDet>1</NroLinDet>
      <NmbItem>Servicio exento</NmbItem>
      <QtyItem>1</QtyItem>
      <PrcItem>50000</PrcItem>
      <MontoItem>50000</MontoItem>
    </Detalle>
  </Documento>
</DTE>"""


def test_parse_dte33_header():
    result = parse_dte_xml(SAMPLE_DTE_33)
    assert result["tipo_dte"] == 33
    assert result["numero"] == 12345
    assert result["fecha"] == date(2024, 1, 15)
    assert result["fecha_vencimiento"] == date(2024, 2, 15)
    assert result["rut_receptor"] == "98765432-1"
    assert result["total_neto"] == Decimal("100000")
    assert result["total_iva"] == Decimal("19000")
    assert result["total"] == Decimal("119000")


def test_parse_dte33_lineas():
    result = parse_dte_xml(SAMPLE_DTE_33)
    assert len(result["lineas"]) == 1
    linea = result["lineas"][0]
    assert linea["orden"] == 1
    assert linea["descripcion"] == "Producto A"
    assert linea["cantidad"] == 2
    assert linea["valor_neto"] == Decimal("50000")
    assert linea["total_neto"] == Decimal("100000")
    assert linea["iva"] == Decimal("19000")
    assert linea["total"] == Decimal("119000")


def test_parse_dte34_no_vencimiento_no_iva():
    result = parse_dte_xml(SAMPLE_DTE_34)
    assert result["tipo_dte"] == 34
    assert result["numero"] == 99
    assert result["fecha_vencimiento"] is None
    assert result["total_neto"] == Decimal("0")
    assert result["total_iva"] == Decimal("0")
    assert result["total"] == Decimal("50000")


def test_parse_dte34_linea_no_iva():
    result = parse_dte_xml(SAMPLE_DTE_34)
    linea = result["lineas"][0]
    assert linea["iva"] == Decimal("0")
    assert linea["total"] == linea["total_neto"]


def test_unsupported_tipo_dte_raises():
    xml = SAMPLE_DTE_33.replace(b"<TipoDTE>33</TipoDTE>", b"<TipoDTE>61</TipoDTE>")
    with pytest.raises(ValueError, match="TipoDTE"):
        parse_dte_xml(xml)


def test_invalid_xml_raises():
    with pytest.raises(ValueError):
        parse_dte_xml(b"not xml at all")


def test_parse_accepts_str_input():
    result = parse_dte_xml(SAMPLE_DTE_33.decode("iso-8859-1"))
    assert result["numero"] == 12345


def test_parse_dte33_nombre_receptor():
    result = parse_dte_xml(SAMPLE_DTE_33)
    assert result["nombre_receptor"] == "Cliente Empresa Ltda."


def test_parse_dte_nombre_receptor_absent():
    xml = SAMPLE_DTE_33.replace(
        b"<RznSocRecep>Cliente Empresa Ltda.</RznSocRecep>", b""
    )
    result = parse_dte_xml(xml)
    assert result["nombre_receptor"] is None
