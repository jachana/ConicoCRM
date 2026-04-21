from decimal import Decimal
import pytest
from app.models.empresa import Empresa

SAMPLE_XML = b"""<?xml version="1.0" encoding="ISO-8859-1"?>
<DTE xmlns="http://www.sii.cl/SiiDte" version="1.0">
  <Documento ID="DTE-33-500">
    <Encabezado>
      <IdDoc>
        <TipoDTE>33</TipoDTE>
        <Folio>500</Folio>
        <FchEmis>2024-06-01</FchEmis>
        <FchVenc>2024-07-01</FchVenc>
      </IdDoc>
      <Emisor><RUTEmisor>76543210-K</RUTEmisor><RznSoc>Conico S.A.</RznSoc></Emisor>
      <Receptor>
        <RUTRecep>12345678-9</RUTRecep>
        <RznSocRecep>Empresa Test</RznSocRecep>
      </Receptor>
      <Totales>
        <MntNeto>200000</MntNeto>
        <TasaIVA>19</TasaIVA>
        <IVA>38000</IVA>
        <MntTotal>238000</MntTotal>
      </Totales>
    </Encabezado>
    <Detalle>
      <NroLinDet>1</NroLinDet>
      <NmbItem>Item Test</NmbItem>
      <QtyItem>1</QtyItem>
      <PrcItem>200000</PrcItem>
      <MontoItem>200000</MontoItem>
    </Detalle>
  </Documento>
</DTE>"""


@pytest.fixture
def empresa_test(db):
    emp = Empresa(nombre="Empresa Test", rut="12345678-9")
    db.add(emp)
    db.commit()
    db.refresh(emp)
    return emp


def test_import_xml_creates_factura(client, admin_token, empresa_test):
    resp = client.post(
        "/api/facturas/import/xml",
        files={"file": ("factura.xml", SAMPLE_XML, "application/xml")},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["numero"] == 500
    assert data["origen"] == "xml"
    assert data["empresa_id"] == empresa_test.id
    assert Decimal(str(data["total"])) == Decimal("238000")


def test_import_xml_upsert_overwrites(client, admin_token, empresa_test):
    client.post(
        "/api/facturas/import/xml",
        files={"file": ("factura.xml", SAMPLE_XML, "application/xml")},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    updated = SAMPLE_XML.replace(b"<MntTotal>238000</MntTotal>", b"<MntTotal>250000</MntTotal>")
    resp = client.post(
        "/api/facturas/import/xml",
        files={"file": ("factura.xml", updated, "application/xml")},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 201
    assert Decimal(str(resp.json()["total"])) == Decimal("250000")


def test_import_xml_unknown_empresa_returns_422(client, admin_token, setup_test_db):
    unknown = SAMPLE_XML.replace(b"<RUTRecep>12345678-9</RUTRecep>", b"<RUTRecep>99999999-9</RUTRecep>")
    resp = client.post(
        "/api/facturas/import/xml",
        files={"file": ("f.xml", unknown, "application/xml")},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 422


def test_bulk_import_creates_two(client, admin_token, empresa_test):
    xml2 = SAMPLE_XML.replace(b"<Folio>500</Folio>", b"<Folio>501</Folio>")
    resp = client.post(
        "/api/facturas/import/xml/bulk",
        files=[
            ("files", ("f1.xml", SAMPLE_XML, "application/xml")),
            ("files", ("f2.xml", xml2, "application/xml")),
        ],
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["creadas"] == 2
    assert data["actualizadas"] == 0
    assert data["errores"] == []


def test_bulk_import_bad_file_collected_as_error(client, admin_token, empresa_test):
    resp = client.post(
        "/api/facturas/import/xml/bulk",
        files=[
            ("files", ("good.xml", SAMPLE_XML, "application/xml")),
            ("files", ("bad.xml", b"not xml", "application/xml")),
        ],
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["creadas"] == 1
    assert len(data["errores"]) == 1
    assert data["errores"][0]["filename"] == "bad.xml"
