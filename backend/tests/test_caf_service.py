"""Tests for CAF XML parsing and validation service.

Tests cover:
- XML parsing and field extraction
- Folio range overlap detection
- Signature validation (basic structure)
- Error handling for malformed XML
- Validation report generation
"""
from __future__ import annotations

import pytest
from sqlalchemy.orm import Session

from app.models.caf import CAF
from app.models.empresa import Empresa
from app.services.caf_service import (
    ValidationReport,
    check_overlap,
    parse_caf_xml,
    validate_caf,
    validate_signature,
)


# Sample CAF XML fixtures
VALID_CAF_XML = """<?xml version="1.0" encoding="UTF-8"?>
<AUTORIZACION>
  <CAF version="1.0">
    <DA>
      <PERIODO>202412</PERIODO>
      <RUT_EMISOR>76.389.753-K</RUT_EMISOR>
      <TIPO_FOLIOS>
        <TIPO_FOLIO>
          <TIPO>33</TIPO>
          <DESDE>1</DESDE>
          <HASTA>100</HASTA>
          <FOLIO_VIGENCIA>2024-12-31</FOLIO_VIGENCIA>
        </TIPO_FOLIO>
      </TIPO_FOLIOS>
    </DA>
    <FRMA>SIGNATURE_BASE64_ENCODED_VALUE_HERE</FRMA>
  </CAF>
</AUTORIZACION>
"""

VALID_CAF_XML_MULTIPLE_TIPOS = """<?xml version="1.0" encoding="UTF-8"?>
<AUTORIZACION>
  <CAF version="1.0">
    <DA>
      <PERIODO>202412</PERIODO>
      <RUT_EMISOR>76.389.753-K</RUT_EMISOR>
      <TIPO_FOLIOS>
        <TIPO_FOLIO>
          <TIPO>33</TIPO>
          <DESDE>1</DESDE>
          <HASTA>100</HASTA>
          <FOLIO_VIGENCIA>2024-12-31</FOLIO_VIGENCIA>
        </TIPO_FOLIO>
        <TIPO_FOLIO>
          <TIPO>39</TIPO>
          <DESDE>201</DESDE>
          <HASTA>500</HASTA>
          <FOLIO_VIGENCIA>2024-12-31</FOLIO_VIGENCIA>
        </TIPO_FOLIO>
      </TIPO_FOLIOS>
    </DA>
    <FRMA>SIGNATURE_BASE64_ENCODED_VALUE_HERE</FRMA>
  </CAF>
</AUTORIZACION>
"""

INVALID_XML_MALFORMED = """<?xml version="1.0" encoding="UTF-8"?>
<AUTORIZACION>
  <CAF version="1.0">
    <DA>
      <RUT_EMISOR>76.389.753-K</RUT_EMISOR>
"""

INVALID_XML_MISSING_AUTORIZACION = """<?xml version="1.0" encoding="UTF-8"?>
<ROOT>
  <SOMETHING>value</SOMETHING>
</ROOT>
"""

INVALID_XML_MISSING_RUT = """<?xml version="1.0" encoding="UTF-8"?>
<AUTORIZACION>
  <CAF version="1.0">
    <DA>
      <PERIODO>202412</PERIODO>
      <TIPO_FOLIOS>
        <TIPO_FOLIO>
          <TIPO>33</TIPO>
          <DESDE>1</DESDE>
          <HASTA>100</HASTA>
        </TIPO_FOLIO>
      </TIPO_FOLIOS>
    </DA>
    <FRMA>SIGNATURE</FRMA>
  </CAF>
</AUTORIZACION>
"""

INVALID_XML_INVALID_FOLIO_RANGE = """<?xml version="1.0" encoding="UTF-8"?>
<AUTORIZACION>
  <CAF version="1.0">
    <DA>
      <PERIODO>202412</PERIODO>
      <RUT_EMISOR>76.389.753-K</RUT_EMISOR>
      <TIPO_FOLIOS>
        <TIPO_FOLIO>
          <TIPO>33</TIPO>
          <DESDE>100</DESDE>
          <HASTA>50</HASTA>
        </TIPO_FOLIO>
      </TIPO_FOLIOS>
    </DA>
    <FRMA>SIGNATURE</FRMA>
  </CAF>
</AUTORIZACION>
"""

INVALID_XML_MISSING_FRMA = """<?xml version="1.0" encoding="UTF-8"?>
<AUTORIZACION>
  <CAF version="1.0">
    <DA>
      <PERIODO>202412</PERIODO>
      <RUT_EMISOR>76.389.753-K</RUT_EMISOR>
      <TIPO_FOLIOS>
        <TIPO_FOLIO>
          <TIPO>33</TIPO>
          <DESDE>1</DESDE>
          <HASTA>100</HASTA>
        </TIPO_FOLIO>
      </TIPO_FOLIOS>
    </DA>
  </CAF>
</AUTORIZACION>
"""


# Tests
class TestParseCafXml:
    """Test XML parsing functionality."""

    def test_parse_valid_caf_xml(self):
        """Test parsing a valid CAF XML file."""
        result = parse_caf_xml(VALID_CAF_XML)

        assert result["rut_emisor"] == "76.389.753-K"
        assert len(result["tipos_folios"]) == 1
        assert result["tipos_folios"][0]["tipo_dte"] == "33"
        assert result["tipos_folios"][0]["folio_inicio"] == 1
        assert result["tipos_folios"][0]["folio_fin"] == 100
        assert result["tipos_folios"][0]["folio_vigencia"] == "2024-12-31"
        assert result["firma"] == "SIGNATURE_BASE64_ENCODED_VALUE_HERE"

    def test_parse_caf_xml_multiple_tipos(self):
        """Test parsing CAF XML with multiple DTE types."""
        result = parse_caf_xml(VALID_CAF_XML_MULTIPLE_TIPOS)

        assert result["rut_emisor"] == "76.389.753-K"
        assert len(result["tipos_folios"]) == 2

        assert result["tipos_folios"][0]["tipo_dte"] == "33"
        assert result["tipos_folios"][0]["folio_inicio"] == 1
        assert result["tipos_folios"][0]["folio_fin"] == 100

        assert result["tipos_folios"][1]["tipo_dte"] == "39"
        assert result["tipos_folios"][1]["folio_inicio"] == 201
        assert result["tipos_folios"][1]["folio_fin"] == 500

    def test_parse_caf_xml_bytes_input(self):
        """Test parsing with bytes input."""
        result = parse_caf_xml(VALID_CAF_XML.encode('utf-8'))

        assert result["rut_emisor"] == "76.389.753-K"
        assert len(result["tipos_folios"]) == 1

    def test_parse_malformed_xml(self):
        """Test error handling for malformed XML."""
        with pytest.raises(ValueError, match="XML inválido"):
            parse_caf_xml(INVALID_XML_MALFORMED)

    def test_parse_missing_autorizacion(self):
        """Test error when AUTORIZACION element is missing."""
        with pytest.raises(ValueError, match="AUTORIZACION.*no encontrado"):
            parse_caf_xml(INVALID_XML_MISSING_AUTORIZACION)

    def test_parse_missing_rut_emisor(self):
        """Test error when RUT_EMISOR is missing."""
        with pytest.raises(ValueError, match="RUT_EMISOR.*no encontrado"):
            parse_caf_xml(INVALID_XML_MISSING_RUT)

    def test_parse_invalid_folio_range(self):
        """Test error when HASTA is not greater than DESDE."""
        with pytest.raises(ValueError, match="HASTA.*debe ser mayor que DESDE"):
            parse_caf_xml(INVALID_XML_INVALID_FOLIO_RANGE)


class TestValidateSignature:
    """Test signature validation functionality."""

    def test_validate_signature_valid_structure(self):
        """Test signature validation with valid structure."""
        result = validate_signature(VALID_CAF_XML, "")
        assert result is True

    def test_validate_signature_missing_frma(self):
        """Test signature validation with missing FRMA element."""
        result = validate_signature(INVALID_XML_MISSING_FRMA, "")
        assert result is False

    def test_validate_signature_malformed_xml(self):
        """Test signature validation with malformed XML."""
        result = validate_signature(INVALID_XML_MALFORMED, "")
        assert result is False


class TestCheckOverlap:
    """Test folio range overlap detection."""

    @pytest.fixture
    def empresa(self, db: Session) -> Empresa:
        """Create a test empresa."""
        empresa = Empresa(
            rut="76.389.753-K",
            nombre="Test Empresa",
        )
        db.add(empresa)
        db.commit()
        return empresa

    def test_no_overlap_different_empresa(self, db: Session, empresa: Empresa):
        """Test no overlap when different empresa."""
        # Create another empresa
        empresa2 = Empresa(rut="77.777.777-7", nombre="Another Empresa")
        db.add(empresa2)
        db.commit()

        # Add CAF for empresa
        caf = CAF(
            empresa_id=empresa.id,
            tipo_dte="33",
            num_inicio=1,
            num_fin=100,
            archivo_xml="<xml></xml>",
        )
        db.add(caf)
        db.commit()

        # Check overlap for empresa2 should return False
        result = check_overlap(db, empresa2.id, "33", 50, 150)
        assert result is False

    def test_no_overlap_different_tipo_dte(self, db: Session, empresa: Empresa):
        """Test no overlap when different DTE type."""
        caf = CAF(
            empresa_id=empresa.id,
            tipo_dte="33",
            num_inicio=1,
            num_fin=100,
            archivo_xml="<xml></xml>",
        )
        db.add(caf)
        db.commit()

        # Check overlap for different tipo_dte should return False
        result = check_overlap(db, empresa.id, "39", 50, 150)
        assert result is False

    def test_no_overlap_adjacent_ranges(self, db: Session, empresa: Empresa):
        """Test no overlap for adjacent ranges (100 and 101-200)."""
        caf = CAF(
            empresa_id=empresa.id,
            tipo_dte="33",
            num_inicio=1,
            num_fin=100,
            archivo_xml="<xml></xml>",
        )
        db.add(caf)
        db.commit()

        # Adjacent range should not overlap
        result = check_overlap(db, empresa.id, "33", 101, 200)
        assert result is False

    def test_overlap_identical_ranges(self, db: Session, empresa: Empresa):
        """Test overlap detection for identical ranges."""
        caf = CAF(
            empresa_id=empresa.id,
            tipo_dte="33",
            num_inicio=100,
            num_fin=200,
            archivo_xml="<xml></xml>",
        )
        db.add(caf)
        db.commit()

        # Same range should overlap
        result = check_overlap(db, empresa.id, "33", 100, 200)
        assert result is True

    def test_overlap_partial_overlap_start(self, db: Session, empresa: Empresa):
        """Test overlap when new range overlaps at start."""
        caf = CAF(
            empresa_id=empresa.id,
            tipo_dte="33",
            num_inicio=100,
            num_fin=200,
            archivo_xml="<xml></xml>",
        )
        db.add(caf)
        db.commit()

        # New range 50-150 overlaps with existing 100-200
        result = check_overlap(db, empresa.id, "33", 50, 150)
        assert result is True

    def test_overlap_partial_overlap_end(self, db: Session, empresa: Empresa):
        """Test overlap when new range overlaps at end."""
        caf = CAF(
            empresa_id=empresa.id,
            tipo_dte="33",
            num_inicio=100,
            num_fin=200,
            archivo_xml="<xml></xml>",
        )
        db.add(caf)
        db.commit()

        # New range 150-250 overlaps with existing 100-200
        result = check_overlap(db, empresa.id, "33", 150, 250)
        assert result is True

    def test_overlap_contained_range(self, db: Session, empresa: Empresa):
        """Test overlap when new range is contained within existing."""
        caf = CAF(
            empresa_id=empresa.id,
            tipo_dte="33",
            num_inicio=100,
            num_fin=200,
            archivo_xml="<xml></xml>",
        )
        db.add(caf)
        db.commit()

        # New range 120-180 is contained in 100-200
        result = check_overlap(db, empresa.id, "33", 120, 180)
        assert result is True

    def test_overlap_contains_existing(self, db: Session, empresa: Empresa):
        """Test overlap when new range contains existing."""
        caf = CAF(
            empresa_id=empresa.id,
            tipo_dte="33",
            num_inicio=100,
            num_fin=200,
            archivo_xml="<xml></xml>",
        )
        db.add(caf)
        db.commit()

        # New range 50-250 contains existing 100-200
        result = check_overlap(db, empresa.id, "33", 50, 250)
        assert result is True


class TestValidateCaf:
    """Test full CAF validation pipeline."""

    @pytest.fixture
    def empresa(self, db: Session) -> Empresa:
        """Create a test empresa."""
        empresa = Empresa(
            rut="76.389.753-K",
            nombre="Test Empresa",
        )
        db.add(empresa)
        db.commit()
        return empresa

    def test_validate_caf_valid(self, db: Session, empresa: Empresa):
        """Test validation of a valid CAF."""
        report = validate_caf(db, VALID_CAF_XML, empresa.id)

        assert report.valid is True
        assert report.tipo_dte == "33"
        assert report.num_inicio == 1
        assert report.num_fin == 100
        assert report.rut_emisor == "76.389.753-K"
        assert len(report.errors) == 0

    def test_validate_caf_malformed_xml(self, db: Session, empresa: Empresa):
        """Test validation with malformed XML."""
        report = validate_caf(db, INVALID_XML_MALFORMED, empresa.id)

        assert report.valid is False
        assert len(report.errors) > 0
        assert "XML inválido" in report.errors[0]

    def test_validate_caf_with_overlap(self, db: Session, empresa: Empresa):
        """Test validation detects overlapping folio ranges."""
        # Add existing CAF
        caf = CAF(
            empresa_id=empresa.id,
            tipo_dte="33",
            num_inicio=50,
            num_fin=150,
            archivo_xml="<xml></xml>",
        )
        db.add(caf)
        db.commit()

        # Try to validate CAF that overlaps
        report = validate_caf(db, VALID_CAF_XML, empresa.id)

        assert report.valid is False
        assert len(report.errors) > 0
        assert "superpone" in report.errors[0]

    def test_validate_caf_multiple_tipos_one_overlaps(self, db: Session, empresa: Empresa):
        """Test validation with multiple DTE types where one overlaps."""
        # Add existing CAF for tipo 39
        caf = CAF(
            empresa_id=empresa.id,
            tipo_dte="39",
            num_inicio=250,
            num_fin=400,
            archivo_xml="<xml></xml>",
        )
        db.add(caf)
        db.commit()

        # Validate CAF with both 33 and 39, where 39 overlaps
        report = validate_caf(db, VALID_CAF_XML_MULTIPLE_TIPOS, empresa.id)

        assert report.valid is False
        assert len(report.errors) > 0
        # Should have error about tipo 39 overlap
        assert any("39" in error for error in report.errors)

    def test_validate_caf_missing_frma(self, db: Session, empresa: Empresa):
        """Test validation with missing FRMA (signature)."""
        report = validate_caf(db, INVALID_XML_MISSING_FRMA, empresa.id)

        assert report.valid is False
        assert len(report.errors) > 0
        assert "Firma digital" in report.errors[0]

    def test_validation_report_to_dict(self):
        """Test ValidationReport.to_dict() method."""
        report = ValidationReport(
            valid=True,
            tipo_dte="33",
            num_inicio=1,
            num_fin=100,
            rut_emisor="76.389.753-K",
        )

        result = report.to_dict()

        assert result["valid"] is True
        assert result["tipo_dte"] == "33"
        assert result["num_inicio"] == 1
        assert result["num_fin"] == 100
        assert result["rut_emisor"] == "76.389.753-K"
        assert result["errors"] == []
        assert result["warnings"] == []

    def test_validation_report_with_errors_and_warnings(self):
        """Test ValidationReport with errors and warnings."""
        report = ValidationReport(
            valid=False,
            errors=["Error 1", "Error 2"],
            warnings=["Warning 1"],
        )

        result = report.to_dict()

        assert result["valid"] is False
        assert result["errors"] == ["Error 1", "Error 2"]
        assert result["warnings"] == ["Warning 1"]
