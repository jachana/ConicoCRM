"""CAF (Comprobante de Autorización de Folios) XML parsing and validation service."""
from __future__ import annotations

import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.x509 import Certificate
import base64

if TYPE_CHECKING:
    from sqlalchemy.orm import Session


@dataclass
class ValidationReport:
    """Structured validation report for CAF XML."""
    valid: bool
    tipo_dte: str | None = None
    num_inicio: int | None = None
    num_fin: int | None = None
    rut_emisor: str | None = None
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        """Convert report to dictionary."""
        return {
            "valid": self.valid,
            "tipo_dte": self.tipo_dte,
            "num_inicio": self.num_inicio,
            "num_fin": self.num_fin,
            "rut_emisor": self.rut_emisor,
            "errors": self.errors,
            "warnings": self.warnings,
        }


def parse_caf_xml(xml_content: str | bytes) -> dict:
    """
    Parse CAF XML and extract essential fields.

    Extracts:
    - RUT_EMISOR: Taxpayer ID
    - TIPO_DTE: Document type (33, 34, 39, 41, 52, 56, 61)
    - FOLIO_INICIO/FIN: Folio range for each type
    - FRMA: Digital signature

    Args:
        xml_content: XML content as string or bytes

    Returns:
        Dictionary with parsed CAF data structure:
        {
            "rut_emisor": "XX.XXX.XXX-K",
            "tipos_folios": [
                {
                    "tipo_dte": "33",
                    "folio_inicio": 1,
                    "folio_fin": 100,
                    "folio_vigencia": "2024-12-31"
                },
                ...
            ],
            "firma": "SIGNATURE_BASE64"
        }

    Raises:
        ValueError: If XML is malformed or missing required elements
    """
    # Ensure content is bytes for ElementTree
    content = xml_content if isinstance(xml_content, bytes) else xml_content.encode('utf-8')

    try:
        root = ET.fromstring(content)
    except ET.ParseError as exc:
        raise ValueError(f"XML inválido: {exc}") from exc

    # Find AUTORIZACION root
    autorizacion = root.find(".//AUTORIZACION")
    if autorizacion is None and root.tag.endswith("AUTORIZACION"):
        autorizacion = root
    if autorizacion is None:
        raise ValueError("Elemento <AUTORIZACION> no encontrado en el XML")

    # Find CAF element
    caf = autorizacion.find(".//CAF")
    if caf is None:
        raise ValueError("Elemento <CAF> no encontrado")

    # Find DA (Datos de Autorización)
    da = caf.find(".//DA")
    if da is None:
        raise ValueError("Elemento <DA> no encontrado")

    # Extract RUT_EMISOR
    rut_emisor_elem = da.find("RUT_EMISOR")
    if rut_emisor_elem is None or not rut_emisor_elem.text:
        raise ValueError("RUT_EMISOR no encontrado")
    rut_emisor = rut_emisor_elem.text.strip()

    # Extract TIPO_FOLIOS
    tipos_folios_elem = da.find("TIPO_FOLIOS")
    if tipos_folios_elem is None:
        raise ValueError("TIPO_FOLIOS no encontrado")

    tipos_folios = []
    tipo_folio_elems = tipos_folios_elem.findall("TIPO_FOLIO")
    if not tipo_folio_elems:
        raise ValueError("No se encontraron elementos TIPO_FOLIO")

    for tipo_folio in tipo_folio_elems:
        tipo_elem = tipo_folio.find("TIPO")
        desde_elem = tipo_folio.find("DESDE")
        hasta_elem = tipo_folio.find("HASTA")
        folio_vigencia_elem = tipo_folio.find("FOLIO_VIGENCIA")

        if tipo_elem is None or desde_elem is None or hasta_elem is None:
            raise ValueError("Elemento TIPO_FOLIO incompleto (falta TIPO, DESDE o HASTA)")

        try:
            tipo_str = tipo_elem.text.strip() if tipo_elem.text else ""
            folio_inicio = int(desde_elem.text.strip()) if desde_elem.text else 0
            folio_fin = int(hasta_elem.text.strip()) if hasta_elem.text else 0
        except (ValueError, TypeError) as exc:
            raise ValueError(f"Valores numéricos inválidos en TIPO_FOLIO: {exc}") from exc

        if folio_fin <= folio_inicio:
            raise ValueError(f"HASTA ({folio_fin}) debe ser mayor que DESDE ({folio_inicio})")

        folio_vigencia = folio_vigencia_elem.text.strip() if folio_vigencia_elem is not None and folio_vigencia_elem.text else None

        tipos_folios.append({
            "tipo_dte": tipo_str,
            "folio_inicio": folio_inicio,
            "folio_fin": folio_fin,
            "folio_vigencia": folio_vigencia,
        })

    # Extract FRMA (signature)
    frma_elem = caf.find(".//FRMA")
    firma = frma_elem.text.strip() if frma_elem is not None and frma_elem.text else ""

    return {
        "rut_emisor": rut_emisor,
        "tipos_folios": tipos_folios,
        "firma": firma,
    }


def validate_signature(xml_content: str | bytes, rsapk: str) -> bool:
    """
    Validate SII digital signature in CAF XML.

    NOTE: Full SII signature validation requires access to SII's certificate chain
    and proper RSA-SHA1 with PKCS#1 v1.5 padding. This is a simplified validation
    that checks the signature structure exists.

    In a production system, this should be implemented using the official
    LibreOffice UNO API or the pySII library.

    Args:
        xml_content: CAF XML content
        rsapk: RSA public key string (base64 encoded)

    Returns:
        True if signature is valid (structure check passes)

    Note:
        This is a placeholder implementation. Real SII signature validation requires
        more sophisticated cryptographic verification against SII's root certificates.
    """
    content = xml_content if isinstance(xml_content, bytes) else xml_content.encode('utf-8')

    try:
        root = ET.fromstring(content)
    except ET.ParseError:
        return False

    # Find FRMA element
    autorizacion = root.find(".//AUTORIZACION")
    if autorizacion is None and root.tag.endswith("AUTORIZACION"):
        autorizacion = root
    if autorizacion is None:
        return False

    caf = autorizacion.find(".//CAF")
    if caf is None:
        return False

    frma_elem = caf.find(".//FRMA")
    if frma_elem is None or not frma_elem.text:
        return False

    # For now, just verify the signature element exists and is not empty
    # Real implementation would do actual RSA signature verification
    firma = frma_elem.text.strip()
    return len(firma) > 0


def check_overlap(session: Session, empresa_id: int, tipo_dte: str, num_inicio: int, num_fin: int) -> bool:
    """
    Check if folio range overlaps with existing CAFs.

    Overlaps occur when ranges intersect for the same empresa and tipo_dte.
    Formula: NOT (existing.num_fin < new.num_inicio OR existing.num_inicio > new.num_fin)

    Args:
        session: SQLAlchemy session
        empresa_id: Company ID
        tipo_dte: DTE type (33, 34, 39, 41, 52, 56, 61)
        num_inicio: Start folio number
        num_fin: End folio number

    Returns:
        True if an overlap exists, False otherwise
    """
    from app.models.caf import CAF

    # Check if any existing CAF overlaps with this range
    overlap = session.query(CAF).filter(
        CAF.empresa_id == empresa_id,
        CAF.tipo_dte == tipo_dte,
        # Overlap condition: NOT (existing.num_fin < new.num_inicio OR existing.num_inicio > new.num_fin)
        ~((CAF.num_fin < num_inicio) | (CAF.num_inicio > num_fin))
    ).first()

    return overlap is not None


def validate_caf(session: Session, xml_content: str | bytes, empresa_id: int) -> ValidationReport:
    """
    Orchestrate full CAF validation pipeline.

    Performs:
    1. XML parsing and structure validation
    2. Folio range overlap detection
    3. Signature validation (basic)

    Args:
        session: SQLAlchemy session for database queries
        xml_content: CAF XML content
        empresa_id: Company ID for overlap checking

    Returns:
        ValidationReport with validation results
    """
    from app.models.caf import CAF

    report = ValidationReport(valid=False)

    # Step 1: Parse XML
    try:
        parsed = parse_caf_xml(xml_content)
    except ValueError as exc:
        report.errors.append(str(exc))
        return report
    except Exception as exc:
        report.errors.append(f"Error inesperado al parsear XML: {exc}")
        return report

    report.rut_emisor = parsed["rut_emisor"]

    # Step 2: Validate each folio type
    all_valid = True
    for tipo_folio in parsed["tipos_folios"]:
        tipo_dte = tipo_folio["tipo_dte"]
        num_inicio = tipo_folio["folio_inicio"]
        num_fin = tipo_folio["folio_fin"]

        # Set report fields from first valid tipo (or first in list)
        if report.tipo_dte is None:
            report.tipo_dte = tipo_dte
            report.num_inicio = num_inicio
            report.num_fin = num_fin

        # Check for overlaps
        try:
            if check_overlap(session, empresa_id, tipo_dte, num_inicio, num_fin):
                existing = session.query(CAF).filter(
                    CAF.empresa_id == empresa_id,
                    CAF.tipo_dte == tipo_dte,
                    ~((CAF.num_fin < num_inicio) | (CAF.num_inicio > num_fin))
                ).first()
                if existing:
                    report.errors.append(
                        f"Rango de folios {tipo_dte} ({num_inicio}-{num_fin}) se superpone "
                        f"con CAF existente (folios {existing.num_inicio}-{existing.num_fin})"
                    )
                all_valid = False
        except Exception as exc:
            report.errors.append(f"Error al verificar superposición: {exc}")
            all_valid = False

    # Step 3: Validate signature (basic)
    if parsed["firma"]:
        if not validate_signature(xml_content, ""):
            report.warnings.append("No se pudo validar la firma digital (verificación simplificada)")
    else:
        report.errors.append("Firma digital (FRMA) no encontrada")
        all_valid = False

    report.valid = all_valid and not report.errors
    return report


# Type alias for imports
__all__ = ["ValidationReport", "parse_caf_xml", "validate_signature", "check_overlap", "validate_caf"]
