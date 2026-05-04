"""
Tests for CAF Upload API Endpoints

Tests cover:
- POST /api/onboarding/cafs: multi-file upload with validation
- GET /api/onboarding/cafs: list CAFs for empresa
- GET /api/onboarding/cafs/{caf_id}: single CAF details
- Admin-only access control
- Error handling (invalid XML, overlap, missing empresa)
- Idempotency (duplicate upload detection)
- Mixed results (some files pass, some fail)
"""

import io
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.models.caf import CAF
from app.models.empresa import Empresa
from app.models.user import User


# Test fixtures

@pytest.fixture
def client():
    """FastAPI test client."""
    return TestClient(app)


@pytest.fixture
def empresa(db: Session) -> Empresa:
    """Create test empresa."""
    empresa = Empresa(
        rut="76.389.753-K",
        nombre="Test Empresa",
    )
    db.add(empresa)
    db.commit()
    return empresa


@pytest.fixture
def another_empresa(db: Session) -> Empresa:
    """Create another test empresa."""
    empresa = Empresa(
        rut="12.345.678-9",
        nombre="Another Empresa",
    )
    db.add(empresa)
    db.commit()
    return empresa


@pytest.fixture
def admin_user(db: Session, empresa: Empresa) -> User:
    """Create admin user linked to empresa."""
    user = User(
        email="admin@test.com",
        name="Admin User",
        hashed_password="dummy_hash",
        role="admin",
        is_active=True,
        empresa_id=empresa.id,
    )
    db.add(user)
    db.commit()
    return user


@pytest.fixture
def admin_user_no_empresa(db: Session) -> User:
    """Create admin user with no empresa_id."""
    user = User(
        email="admin_no_empresa@test.com",
        name="Admin No Empresa",
        hashed_password="dummy_hash",
        role="admin",
        is_active=True,
    )
    db.add(user)
    db.commit()
    return user


@pytest.fixture
def admin_user_another_empresa(db: Session, another_empresa: Empresa) -> User:
    """Create admin user linked to another_empresa."""
    user = User(
        email="admin2@test.com",
        name="Admin User 2",
        hashed_password="dummy_hash",
        role="admin",
        is_active=True,
        empresa_id=another_empresa.id,
    )
    db.add(user)
    db.commit()
    return user


@pytest.fixture
def non_admin_user(db: Session, empresa: Empresa) -> User:
    """Create non-admin user."""
    user = User(
        email="user@test.com",
        name="Test User",
        hashed_password="dummy_hash",
        role="user",
        is_active=True,
        empresa_id=empresa.id,
    )
    db.add(user)
    db.commit()
    return user


# Valid CAF XML samples

VALID_CAF_XML_33 = """<?xml version="1.0" encoding="UTF-8"?>
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

VALID_CAF_XML_39 = """<?xml version="1.0" encoding="UTF-8"?>
<AUTORIZACION>
  <CAF version="1.0">
    <DA>
      <PERIODO>202412</PERIODO>
      <RUT_EMISOR>76.389.753-K</RUT_EMISOR>
      <TIPO_FOLIOS>
        <TIPO_FOLIO>
          <TIPO>39</TIPO>
          <DESDE>101</DESDE>
          <HASTA>200</HASTA>
          <FOLIO_VIGENCIA>2024-12-31</FOLIO_VIGENCIA>
        </TIPO_FOLIO>
      </TIPO_FOLIOS>
    </DA>
    <FRMA>SIGNATURE_BASE64_ENCODED_VALUE_HERE</FRMA>
  </CAF>
</AUTORIZACION>
"""

VALID_CAF_XML_39_OVERLAP = """<?xml version="1.0" encoding="UTF-8"?>
<AUTORIZACION>
  <CAF version="1.0">
    <DA>
      <PERIODO>202412</PERIODO>
      <RUT_EMISOR>76.389.753-K</RUT_EMISOR>
      <TIPO_FOLIOS>
        <TIPO_FOLIO>
          <TIPO>39</TIPO>
          <DESDE>150</DESDE>
          <HASTA>250</HASTA>
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
      <RUT_EMISOR>76.389.753-K
"""

INVALID_XML_MISSING_RUT = """<?xml version="1.0" encoding="UTF-8"?>
<AUTORIZACION>
  <CAF version="1.0">
    <DA>
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


# ============================================================================
# Tests
# ============================================================================

class TestPostCAFUpload:
    """Test POST /api/onboarding/cafs endpoint."""

    def test_upload_single_valid_caf(
        self,
        client: TestClient,
        admin_user: User,
        empresa: Empresa,
        db: Session,
    ):
        """Test uploading a single valid CAF XML file."""
        from app.api.auth import get_current_user
        client.app.dependency_overrides[get_current_user] = lambda: admin_user

        files = [
            ("files", ("caf_33.xml", io.BytesIO(VALID_CAF_XML_33.encode("utf-8")), "application/xml")),
        ]

        response = client.post("/api/onboarding/cafs/", files=files)

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["total_files"] == 1
        assert data["processed"] == 1
        assert len(data["results"]) == 1

        result = data["results"][0]
        assert result["filename"] == "caf_33.xml"
        assert result["valid"] is True
        assert result["tipo_dte"] == "33"
        assert result["num_inicio"] == 1
        assert result["num_fin"] == 100
        assert result["rut_emisor"] == "76.389.753-K"
        assert result["message"] == "CAF cargado exitosamente"
        assert result["caf_id"] is not None

        saved_caf = db.query(CAF).filter(CAF.id == result["caf_id"]).first()
        assert saved_caf is not None
        assert saved_caf.empresa_id == empresa.id
        assert saved_caf.tipo_dte == "33"
        assert saved_caf.num_inicio == 1
        assert saved_caf.num_fin == 100

    def test_upload_multiple_valid_cafs(
        self,
        client: TestClient,
        admin_user: User,
        db: Session,
    ):
        """Test uploading multiple valid CAF XML files."""
        from app.api.auth import get_current_user
        client.app.dependency_overrides[get_current_user] = lambda: admin_user

        files = [
            ("files", ("caf_33.xml", io.BytesIO(VALID_CAF_XML_33.encode("utf-8")), "application/xml")),
            ("files", ("caf_39.xml", io.BytesIO(VALID_CAF_XML_39.encode("utf-8")), "application/xml")),
        ]

        response = client.post("/api/onboarding/cafs/", files=files)

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["total_files"] == 2
        assert data["processed"] == 2
        assert len(data["results"]) == 2

        for result in data["results"]:
            assert result["valid"] is True
            assert result["caf_id"] is not None

    def test_upload_invalid_xml_format(
        self,
        client: TestClient,
        admin_user: User,
    ):
        """Test uploading invalid XML file."""
        from app.api.auth import get_current_user
        client.app.dependency_overrides[get_current_user] = lambda: admin_user

        files = [
            ("files", ("caf_invalid.xml", io.BytesIO(INVALID_XML_MALFORMED.encode("utf-8")), "application/xml")),
        ]

        response = client.post("/api/onboarding/cafs/", files=files)

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is False
        assert len(data["results"]) == 1
        assert data["results"][0]["valid"] is False
        assert len(data["results"][0]["errors"]) > 0

    def test_upload_non_xml_file(
        self,
        client: TestClient,
        admin_user: User,
    ):
        """Test uploading non-XML file (should be rejected)."""
        from app.api.auth import get_current_user
        client.app.dependency_overrides[get_current_user] = lambda: admin_user

        files = [
            ("files", ("document.txt", io.BytesIO(b"This is not XML"), "text/plain")),
        ]

        response = client.post("/api/onboarding/cafs/", files=files)

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is False
        assert data["results"][0]["valid"] is False
        assert any("XML" in err for err in data["results"][0]["errors"])

    def test_upload_mixed_results(
        self,
        client: TestClient,
        admin_user: User,
        db: Session,
    ):
        """Test uploading multiple files with mixed results."""
        from app.api.auth import get_current_user
        client.app.dependency_overrides[get_current_user] = lambda: admin_user

        files = [
            ("files", ("caf_33.xml", io.BytesIO(VALID_CAF_XML_33.encode("utf-8")), "application/xml")),
            ("files", ("caf_invalid.xml", io.BytesIO(INVALID_XML_MALFORMED.encode("utf-8")), "application/xml")),
            ("files", ("caf_39.xml", io.BytesIO(VALID_CAF_XML_39.encode("utf-8")), "application/xml")),
        ]

        response = client.post("/api/onboarding/cafs/", files=files)

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["total_files"] == 3
        assert data["processed"] == 2
        assert len(data["results"]) == 3

        assert data["results"][0]["valid"] is True
        assert data["results"][1]["valid"] is False
        assert data["results"][2]["valid"] is True

    def test_upload_user_without_empresa_returns_400(
        self,
        client: TestClient,
        admin_user_no_empresa: User,
    ):
        """Admin user not linked to any empresa gets 400."""
        from app.api.auth import get_current_user
        client.app.dependency_overrides[get_current_user] = lambda: admin_user_no_empresa

        files = [
            ("files", ("caf_33.xml", io.BytesIO(VALID_CAF_XML_33.encode("utf-8")), "application/xml")),
        ]

        response = client.post("/api/onboarding/cafs/", files=files)

        assert response.status_code == 400
        assert "empresa" in response.json()["detail"].lower()

    def test_upload_unauthorized_non_admin(
        self,
        client: TestClient,
        non_admin_user: User,
    ):
        """Test upload by non-admin user (should fail)."""
        from app.api.auth import get_current_user
        client.app.dependency_overrides[get_current_user] = lambda: non_admin_user

        files = [
            ("files", ("caf_33.xml", io.BytesIO(VALID_CAF_XML_33.encode("utf-8")), "application/xml")),
        ]

        response = client.post("/api/onboarding/cafs/", files=files)

        assert response.status_code == 403
        assert "admin" in response.json()["detail"].lower()

    def test_upload_duplicate_caf(
        self,
        client: TestClient,
        admin_user: User,
        db: Session,
    ):
        """Test uploading the same CAF twice (idempotency check)."""
        from app.api.auth import get_current_user
        client.app.dependency_overrides[get_current_user] = lambda: admin_user

        files = [
            ("files", ("caf_33.xml", io.BytesIO(VALID_CAF_XML_33.encode("utf-8")), "application/xml")),
        ]

        response1 = client.post("/api/onboarding/cafs/", files=files)
        assert response1.status_code == 200
        assert response1.json()["processed"] == 1
        first_caf_id = response1.json()["results"][0]["caf_id"]

        files = [
            ("files", ("caf_33.xml", io.BytesIO(VALID_CAF_XML_33.encode("utf-8")), "application/xml")),
        ]
        response2 = client.post("/api/onboarding/cafs/", files=files)

        assert response2.status_code == 200
        data = response2.json()
        assert data["processed"] == 1
        assert data["results"][0]["valid"] is True
        assert data["results"][0]["caf_id"] == first_caf_id
        assert "existe" in data["results"][0]["message"].lower()

    def test_upload_overlap_detection(
        self,
        client: TestClient,
        admin_user: User,
        db: Session,
    ):
        """Test overlap detection."""
        from app.api.auth import get_current_user
        client.app.dependency_overrides[get_current_user] = lambda: admin_user

        files1 = [
            ("files", ("caf_39.xml", io.BytesIO(VALID_CAF_XML_39.encode("utf-8")), "application/xml")),
        ]
        response1 = client.post("/api/onboarding/cafs/", files=files1)
        assert response1.status_code == 200
        assert response1.json()["processed"] == 1

        files2 = [
            ("files", ("caf_39_overlap.xml", io.BytesIO(VALID_CAF_XML_39_OVERLAP.encode("utf-8")), "application/xml")),
        ]
        response2 = client.post("/api/onboarding/cafs/", files=files2)

        assert response2.status_code == 200
        data = response2.json()
        assert data["processed"] == 0
        assert data["results"][0]["valid"] is False
        assert any("superpone" in err.lower() for err in data["results"][0]["errors"])

    def test_upload_to_different_empresa_no_overlap(
        self,
        client: TestClient,
        admin_user: User,
        admin_user_another_empresa: User,
        db: Session,
    ):
        """Test that overlaps only apply to the same empresa (two different admin users)."""
        from app.api.auth import get_current_user

        # Upload CAF as first admin (empresa 1)
        client.app.dependency_overrides[get_current_user] = lambda: admin_user
        files1 = [
            ("files", ("caf_39.xml", io.BytesIO(VALID_CAF_XML_39.encode("utf-8")), "application/xml")),
        ]
        response1 = client.post("/api/onboarding/cafs/", files=files1)
        assert response1.status_code == 200
        assert response1.json()["processed"] == 1

        # Upload same range as second admin (empresa 2) — should work
        client.app.dependency_overrides[get_current_user] = lambda: admin_user_another_empresa
        files2 = [
            ("files", ("caf_39.xml", io.BytesIO(VALID_CAF_XML_39.encode("utf-8")), "application/xml")),
        ]
        response2 = client.post("/api/onboarding/cafs/", files=files2)

        assert response2.status_code == 200
        assert response2.json()["processed"] == 1


class TestGetCAFsList:
    """Test GET /api/onboarding/cafs endpoint."""

    def test_list_cafs_empty(
        self,
        client: TestClient,
        admin_user: User,
    ):
        """Test listing CAFs when none exist."""
        from app.api.auth import get_current_user
        client.app.dependency_overrides[get_current_user] = lambda: admin_user

        response = client.get("/api/onboarding/cafs/")

        assert response.status_code == 200
        data = response.json()
        assert data["count"] == 0
        assert data["cafs"] == []

    def test_list_cafs_with_data(
        self,
        client: TestClient,
        admin_user: User,
        empresa: Empresa,
        db: Session,
    ):
        """Test listing CAFs with existing data."""
        from app.api.auth import get_current_user
        client.app.dependency_overrides[get_current_user] = lambda: admin_user

        caf = CAF(
            empresa_id=empresa.id,
            tipo_dte="33",
            num_inicio=1,
            num_fin=100,
            archivo_xml=VALID_CAF_XML_33,
            vigente=True,
            consumido=25,
        )
        db.add(caf)
        db.commit()

        response = client.get("/api/onboarding/cafs/")

        assert response.status_code == 200
        data = response.json()
        assert data["count"] == 1
        assert len(data["cafs"]) == 1

        caf_data = data["cafs"][0]
        assert caf_data["tipo_dte"] == "33"
        assert caf_data["num_inicio"] == 1
        assert caf_data["num_fin"] == 100
        assert caf_data["total_folios"] == 100
        assert caf_data["consumido"] == 25
        assert caf_data["folios_restantes"] == 75
        assert caf_data["porcentaje_consumido"] == 25.0
        assert caf_data["vigente"] is True

    def test_list_cafs_user_without_empresa_returns_400(
        self,
        client: TestClient,
        admin_user_no_empresa: User,
    ):
        """Admin user not linked to empresa gets 400."""
        from app.api.auth import get_current_user
        client.app.dependency_overrides[get_current_user] = lambda: admin_user_no_empresa

        response = client.get("/api/onboarding/cafs/")

        assert response.status_code == 400

    def test_list_cafs_unauthorized(
        self,
        client: TestClient,
        non_admin_user: User,
    ):
        """Test listing CAFs as non-admin."""
        from app.api.auth import get_current_user
        client.app.dependency_overrides[get_current_user] = lambda: non_admin_user

        response = client.get("/api/onboarding/cafs/")

        assert response.status_code == 403


class TestGetSingleCAF:
    """Test GET /api/onboarding/cafs/{caf_id} endpoint."""

    def test_get_single_caf(
        self,
        client: TestClient,
        admin_user: User,
        empresa: Empresa,
        db: Session,
    ):
        """Test retrieving a single CAF."""
        from app.api.auth import get_current_user
        client.app.dependency_overrides[get_current_user] = lambda: admin_user

        caf = CAF(
            empresa_id=empresa.id,
            tipo_dte="39",
            num_inicio=101,
            num_fin=200,
            archivo_xml=VALID_CAF_XML_39,
            vigente=True,
            consumido=50,
        )
        db.add(caf)
        db.commit()

        response = client.get(f"/api/onboarding/cafs/{caf.id}")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == caf.id
        assert data["tipo_dte"] == "39"
        assert data["num_inicio"] == 101
        assert data["num_fin"] == 200
        assert data["total_folios"] == 100
        assert data["consumido"] == 50
        assert data["folios_restantes"] == 50
        assert data["porcentaje_consumido"] == 50.0

    def test_get_nonexistent_caf(
        self,
        client: TestClient,
        admin_user: User,
    ):
        """Test retrieving nonexistent CAF."""
        from app.api.auth import get_current_user
        client.app.dependency_overrides[get_current_user] = lambda: admin_user

        response = client.get("/api/onboarding/cafs/99999")

        assert response.status_code == 404

    def test_get_caf_unauthorized(
        self,
        client: TestClient,
        non_admin_user: User,
        empresa: Empresa,
        db: Session,
    ):
        """Test retrieving CAF as non-admin."""
        from app.api.auth import get_current_user
        client.app.dependency_overrides[get_current_user] = lambda: non_admin_user

        caf = CAF(
            empresa_id=empresa.id,
            tipo_dte="33",
            num_inicio=1,
            num_fin=100,
            archivo_xml=VALID_CAF_XML_33,
        )
        db.add(caf)
        db.commit()

        response = client.get(f"/api/onboarding/cafs/{caf.id}")

        assert response.status_code == 403
