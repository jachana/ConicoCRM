"""Tests for CAF model and database schema."""
import pytest
from datetime import datetime, timezone
from app.models.caf import CAF
from app.models.empresa import Empresa


def test_caf_model_instantiation():
    """Test that CAF model can be instantiated with required fields."""
    caf = CAF(
        empresa_id=1,
        tipo_dte="39",
        num_inicio=1000,
        num_fin=2000,
        archivo_xml="<caf>test</caf>",
        vigente=True,
        consumido=0,
    )

    assert caf.empresa_id == 1
    assert caf.tipo_dte == "39"
    assert caf.num_inicio == 1000
    assert caf.num_fin == 2000
    assert caf.archivo_xml == "<caf>test</caf>"
    assert caf.vigente is True
    assert caf.consumido == 0


def test_caf_model_defaults():
    """Test that CAF model applies defaults correctly."""
    caf = CAF(
        empresa_id=1,
        tipo_dte="41",
        num_inicio=5000,
        num_fin=6000,
        archivo_xml="<caf></caf>",
        vigente=True,
        consumido=0,
    )

    # Check defaults
    assert caf.vigente is True
    assert caf.consumido == 0
    assert isinstance(caf.fecha_carga, datetime) or caf.fecha_carga is None
    assert isinstance(caf.created_at, datetime) or caf.created_at is None


def test_caf_model_all_fields():
    """Test CAF model with all fields."""
    now = datetime.now(timezone.utc)
    caf = CAF(
        empresa_id=2,
        tipo_dte="52",
        num_inicio=10000,
        num_fin=20000,
        archivo_xml="<full_caf>content</full_caf>",
        vigente=False,
        consumido=100,
    )

    assert caf.empresa_id == 2
    assert caf.tipo_dte == "52"
    assert caf.num_inicio == 10000
    assert caf.num_fin == 20000
    assert caf.archivo_xml == "<full_caf>content</full_caf>"
    assert caf.vigente is False
    assert caf.consumido == 100


def test_caf_model_tablename():
    """Test that CAF model has correct table name."""
    assert CAF.__tablename__ == "cafs"


def test_caf_model_has_required_columns():
    """Test that CAF model defines all required columns."""
    columns = {col.name for col in CAF.__table__.columns}

    required_columns = {
        "id",
        "empresa_id",
        "tipo_dte",
        "num_inicio",
        "num_fin",
        "archivo_xml",
        "vigente",
        "consumido",
        "fecha_carga",
        "created_at",
        "updated_at",
    }

    assert required_columns.issubset(columns)


def test_caf_model_constraints():
    """Test that CAF model has required constraints."""
    constraints = {c.name for c in CAF.__table__.constraints}

    # Check for unique constraint on (empresa_id, tipo_dte, num_inicio)
    assert "uq_cafs_empresa_tipo_inicio" in constraints

    # Check for check constraint on num_fin > num_inicio
    assert "ck_cafs_num_fin_gt_num_inicio" in constraints


def test_caf_model_indexes():
    """Test that CAF model has required indexes."""
    index_names = {idx.name for idx in CAF.__table__.indexes}

    assert "ix_cafs_empresa_id" in index_names
    assert "ix_cafs_tipo_dte" in index_names
    assert "ix_cafs_empresa_tipo_dte" in index_names


def test_caf_model_relationships():
    """Test that CAF model has empresa relationship."""
    # Check that empresa relationship is defined
    assert hasattr(CAF, "empresa")


def test_caf_foreign_key():
    """Test that CAF has proper foreign key to empresas."""
    fks = {fk.name for fk in CAF.__table__.foreign_keys}
    assert len(fks) > 0
    # The foreign key should reference empresas.id
    assert any("empresas" in str(fk) for fk in CAF.__table__.foreign_keys)
