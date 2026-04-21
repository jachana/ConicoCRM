from __future__ import annotations
import xml.etree.ElementTree as ET
from datetime import date
from decimal import Decimal

_NS = "http://www.sii.cl/SiiDte"
_SUPPORTED_TIPOS = {33, 34}


def _find(elem: ET.Element, tag: str) -> ET.Element | None:
    result = elem.find(f"{{{_NS}}}{tag}")
    if result is None:
        result = elem.find(tag)
    return result


def _text(elem: ET.Element, tag: str) -> str | None:
    child = _find(elem, tag)
    if child is None or not child.text:
        return None
    return child.text.strip()


def _decimal(elem: ET.Element, tag: str, default: str = "0") -> Decimal:
    val = _text(elem, tag)
    return Decimal(val) if val else Decimal(default)


def _find_all(elem: ET.Element, tag: str) -> list[ET.Element]:
    results = elem.findall(f"{{{_NS}}}{tag}")
    if not results:
        results = elem.findall(tag)
    return results


def parse_dte_xml(xml_content: str | bytes) -> dict:
    content = xml_content if isinstance(xml_content, bytes) else xml_content.encode()
    try:
        root = ET.fromstring(content)
    except ET.ParseError as exc:
        raise ValueError(f"XML inválido: {exc}") from exc

    doc = _find(root, "Documento")
    if doc is None:
        doc = root.find(f".//{{{_NS}}}Documento") or root.find(".//Documento")
    if doc is None:
        raise ValueError("Elemento <Documento> no encontrado")

    encab = _find(doc, "Encabezado")
    if encab is None:
        raise ValueError("Elemento <Encabezado> no encontrado")

    id_doc = _find(encab, "IdDoc")
    receptor = _find(encab, "Receptor")
    totales = _find(encab, "Totales")

    if id_doc is None or receptor is None or totales is None:
        raise ValueError("Estructura DTE incompleta (falta IdDoc, Receptor o Totales)")

    tipo_str = _text(id_doc, "TipoDTE")
    if not tipo_str:
        raise ValueError("TipoDTE no encontrado")
    tipo_dte = int(tipo_str)
    if tipo_dte not in _SUPPORTED_TIPOS:
        raise ValueError(f"TipoDTE {tipo_dte} no soportado (solo 33 y 34)")

    folio_str = _text(id_doc, "Folio")
    if not folio_str:
        raise ValueError("Folio no encontrado")

    fecha_str = _text(id_doc, "FchEmis")
    if not fecha_str:
        raise ValueError("FchEmis no encontrado")

    fch_venc_str = _text(id_doc, "FchVenc")

    rut_receptor = _text(receptor, "RUTRecep")
    if not rut_receptor:
        raise ValueError("RUTRecep no encontrado")

    mnt_neto = _decimal(totales, "MntNeto")
    iva = _decimal(totales, "IVA")
    mnt_total = _decimal(totales, "MntTotal")
    tasa_iva = _decimal(totales, "TasaIVA", default="19") / Decimal("100")

    apply_iva = tipo_dte == 33
    lineas = []
    for det in _find_all(doc, "Detalle"):
        nro_str = _text(det, "NroLinDet")
        descripcion = _text(det, "NmbItem") or ""
        qty_str = _text(det, "QtyItem") or "1"
        cantidad = int(Decimal(qty_str))
        valor_neto = _decimal(det, "PrcItem")
        total_neto = _decimal(det, "MontoItem")
        linea_iva = (total_neto * tasa_iva).quantize(Decimal("1")) if apply_iva else Decimal("0")
        linea_total = total_neto + linea_iva

        lineas.append({
            "orden": int(nro_str) if nro_str else len(lineas) + 1,
            "descripcion": descripcion,
            "cantidad": cantidad,
            "valor_neto": valor_neto,
            "total_neto": total_neto,
            "iva": linea_iva,
            "total": linea_total,
        })

    return {
        "tipo_dte": tipo_dte,
        "numero": int(folio_str),
        "fecha": date.fromisoformat(fecha_str),
        "fecha_vencimiento": date.fromisoformat(fch_venc_str) if fch_venc_str else None,
        "rut_receptor": rut_receptor,
        "correo_receptor": _text(receptor, "CorreoRecep"),
        "total_neto": mnt_neto,
        "total_iva": iva,
        "total": mnt_total,
        "lineas": lineas,
    }
