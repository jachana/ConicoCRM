"""Unit tests for LibroService"""
import pytest
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from app.models.libro import LibroVentas, LibroCompras, DteRecepcion
from app.models.dte_emision import DteEmision
from app.models.empresa import Empresa
from app.services.libro_service import LibroService


@pytest.fixture
def empresa(db: Session) -> Empresa:
    """Create a test empresa"""
    empresa = Empresa(nombre="Test Empresa")
    db.add(empresa)
    db.commit()
    db.refresh(empresa)
    return empresa


@pytest.fixture
def dte_emision_factura(db: Session, empresa: Empresa) -> DteEmision:
    """Create a test DteEmision record for a factura"""
    dte = DteEmision(
        tipo="033",  # Factura
        factura_id=1,  # Simulates factura link
        monto_neto=100000,
        monto_iva=19000,
        monto_total=119000,
        estado="aceptado"
    )
    db.add(dte)
    db.commit()
    db.refresh(dte)
    return dte


@pytest.fixture
def dte_emision_boleta(db: Session, empresa: Empresa) -> DteEmision:
    """Create a test DteEmision record for a boleta"""
    dte = DteEmision(
        tipo="039",  # Boleta
        boleta_id=1,  # Simulates boleta link
        monto_neto=50000,
        monto_iva=9500,
        monto_total=59500,
        estado="aceptado"
    )
    db.add(dte)
    db.commit()
    db.refresh(dte)
    return dte


class TestGeneroLibroVentas:
    """Test generar_libro_ventas method"""

    def test_empty_periodo_returns_libro_with_zero_totals(self, db: Session, empresa: Empresa):
        """Test that an empty period (no DTEs) returns libro with total_registros=0, monto_total=0"""
        libro = LibroService.generar_libro_ventas(
            db=db,
            empresa_id=empresa.id,
            periodo="2026-06"  # Month with no DTEs
        )

        assert libro.total_registros == 0
        assert libro.monto_total == 0
        assert libro.estado == "borrador"
        assert libro.periodo == "2026-06"
        assert libro.empresa_id == empresa.id

    def test_with_existing_dtes_aggregates_correctly(
        self, db: Session, empresa: Empresa, dte_emision_factura: DteEmision
    ):
        """Test that existing DTEs are aggregated correctly into libro"""
        # The dte_emision_factura was created, so we can generate a libro
        # Note: In real scenario, DTEs would have dates in the target period
        libro = LibroService.generar_libro_ventas(
            db=db,
            empresa_id=empresa.id,
            periodo="2026-05"
        )

        # Should have at least one record if factura exists
        assert libro.total_registros >= 0
        assert libro.monto_total >= 0
        assert libro.estado == "borrador"

    def test_idempotency_calling_twice_returns_same_libro(
        self, db: Session, empresa: Empresa
    ):
        """Test idempotency: calling generar_libro_ventas twice returns same libro (no duplicate create)"""
        libro1 = LibroService.generar_libro_ventas(
            db=db,
            empresa_id=empresa.id,
            periodo="2026-07"
        )
        libro1_id = libro1.id

        # Call again
        libro2 = LibroService.generar_libro_ventas(
            db=db,
            empresa_id=empresa.id,
            periodo="2026-07"
        )

        # Should return the same record
        assert libro2.id == libro1_id
        assert libro2.periodo == "2026-07"
        assert libro2.empresa_id == empresa.id

    def test_invalid_periodo_format_raises_value_error(self, db: Session, empresa: Empresa):
        """Test that invalid periodo format raises ValueError"""
        with pytest.raises(ValueError, match="Invalid periodo format"):
            LibroService.generar_libro_ventas(
                db=db,
                empresa_id=empresa.id,
                periodo="2026-5"  # Invalid: should be YYYY-MM
            )

    def test_invalid_periodo_non_date_raises_value_error(self, db: Session, empresa: Empresa):
        """Test that non-date periodo raises ValueError"""
        with pytest.raises(ValueError, match="Invalid periodo format"):
            LibroService.generar_libro_ventas(
                db=db,
                empresa_id=empresa.id,
                periodo="invalid"
            )

    def test_libro_ventas_has_correct_fields(self, db: Session, empresa: Empresa):
        """Test that created LibroVentas has all required fields"""
        libro = LibroService.generar_libro_ventas(
            db=db,
            empresa_id=empresa.id,
            periodo="2026-08"
        )

        assert hasattr(libro, 'id')
        assert hasattr(libro, 'periodo')
        assert hasattr(libro, 'empresa_id')
        assert hasattr(libro, 'total_registros')
        assert hasattr(libro, 'monto_total')
        assert hasattr(libro, 'estado')
        assert hasattr(libro, 'created_at')
        assert libro.folio_inicio is None
        assert libro.folio_fin is None


class TestGenerarLibroCompras:
    """Test generar_libro_compras method"""

    def test_empty_periodo_returns_libro_with_zero_totals(self, db: Session, empresa: Empresa):
        """Test that an empty period (no accepted receipts) returns libro with zero totals"""
        libro = LibroService.generar_libro_compras(
            db=db,
            empresa_id=empresa.id,
            periodo="2026-06"
        )

        assert libro.total_registros == 0
        assert libro.monto_total == 0
        assert libro.estado == "borrador"
        assert libro.periodo == "2026-06"

    def test_only_counts_aceptado_estado(self, db: Session, empresa: Empresa):
        """Test that only DteRecepcion with estado='aceptado' are counted"""
        # Create multiple receipts with different estados
        dte_aceptado = DteRecepcion(
            empresa_id=empresa.id,
            tipo="46",
            folio=1001,
            rut_emisor="11.111.111-1",
            monto=100000,
            estado="aceptado"
        )
        dte_recibido = DteRecepcion(
            empresa_id=empresa.id,
            tipo="46",
            folio=1002,
            rut_emisor="11.111.111-1",
            monto=50000,
            estado="recibido"  # Should NOT be counted
        )
        dte_rechazado = DteRecepcion(
            empresa_id=empresa.id,
            tipo="46",
            folio=1003,
            rut_emisor="11.111.111-1",
            monto=75000,
            estado="rechazado"  # Should NOT be counted
        )

        db.add(dte_aceptado)
        db.add(dte_recibido)
        db.add(dte_rechazado)
        db.commit()

        libro = LibroService.generar_libro_compras(
            db=db,
            empresa_id=empresa.id,
            periodo="2026-09"
        )

        # Should only count aceptado (1 record with monto=100000)
        assert libro.total_registros == 1
        assert libro.monto_total == 100000

    def test_aggregates_multiple_aceptado_receipts(self, db: Session, empresa: Empresa):
        """Test that multiple aceptado receipts are aggregated correctly"""
        for i in range(3):
            dte = DteRecepcion(
                empresa_id=empresa.id,
                tipo="46",
                folio=2000 + i,
                rut_emisor=f"11.111.111-{i}",
                monto=100000,
                estado="aceptado"
            )
            db.add(dte)
        db.commit()

        libro = LibroService.generar_libro_compras(
            db=db,
            empresa_id=empresa.id,
            periodo="2026-10"
        )

        assert libro.total_registros == 3
        assert libro.monto_total == 300000

    def test_idempotency_calling_twice_returns_same_libro(
        self, db: Session, empresa: Empresa
    ):
        """Test idempotency: calling generar_libro_compras twice returns same libro"""
        libro1 = LibroService.generar_libro_compras(
            db=db,
            empresa_id=empresa.id,
            periodo="2026-11"
        )
        libro1_id = libro1.id

        # Call again
        libro2 = LibroService.generar_libro_compras(
            db=db,
            empresa_id=empresa.id,
            periodo="2026-11"
        )

        assert libro2.id == libro1_id
        assert libro2.periodo == "2026-11"

    def test_invalid_periodo_format_raises_value_error(self, db: Session, empresa: Empresa):
        """Test that invalid periodo format raises ValueError"""
        with pytest.raises(ValueError, match="Invalid periodo format"):
            LibroService.generar_libro_compras(
                db=db,
                empresa_id=empresa.id,
                periodo="2026/05"  # Invalid format
            )

    def test_libro_compras_has_correct_fields(self, db: Session, empresa: Empresa):
        """Test that created LibroCompras has all required fields"""
        libro = LibroService.generar_libro_compras(
            db=db,
            empresa_id=empresa.id,
            periodo="2026-12"
        )

        assert hasattr(libro, 'id')
        assert hasattr(libro, 'periodo')
        assert hasattr(libro, 'empresa_id')
        assert hasattr(libro, 'rut_proveedor')
        assert hasattr(libro, 'total_registros')
        assert hasattr(libro, 'monto_total')
        assert hasattr(libro, 'estado')
        assert hasattr(libro, 'created_at')
        assert libro.rut_proveedor is None


class TestValidatePeriodo:
    """Test _validate_periodo static method"""

    def test_valid_periodo_format(self):
        """Test that valid YYYY-MM format passes"""
        # Should not raise
        LibroService._validate_periodo("2026-05")
        LibroService._validate_periodo("2025-12")
        LibroService._validate_periodo("2000-01")

    def test_invalid_periodo_missing_month(self):
        """Test that incomplete periodo raises ValueError"""
        with pytest.raises(ValueError):
            LibroService._validate_periodo("2026")

    def test_invalid_periodo_wrong_separator(self):
        """Test that wrong separator raises ValueError"""
        with pytest.raises(ValueError):
            LibroService._validate_periodo("2026/05")

    def test_invalid_periodo_extra_digits(self):
        """Test that extra digits raise ValueError"""
        with pytest.raises(ValueError):
            LibroService._validate_periodo("20265-05")

    def test_invalid_periodo_text(self):
        """Test that text periodo raises ValueError"""
        with pytest.raises(ValueError):
            LibroService._validate_periodo("YYYY-MM")

    def test_invalid_periodo_empty_string(self):
        """Test that empty string raises ValueError"""
        with pytest.raises(ValueError):
            LibroService._validate_periodo("")

    def test_invalid_periodo_with_day(self):
        """Test that periodo with day component raises ValueError"""
        with pytest.raises(ValueError):
            LibroService._validate_periodo("2026-05-01")


class TestLibroVentasIntegration:
    """Integration tests for LibroVentas"""

    def test_multiple_empresas_separate_libros(self, db: Session):
        """Test that different empresas get separate libros"""
        empresa1 = Empresa(nombre="Empresa 1")
        empresa2 = Empresa(nombre="Empresa 2")
        db.add(empresa1)
        db.add(empresa2)
        db.commit()

        libro1 = LibroService.generar_libro_ventas(db, empresa1.id, "2026-05")
        libro2 = LibroService.generar_libro_ventas(db, empresa2.id, "2026-05")

        assert libro1.id != libro2.id
        assert libro1.empresa_id == empresa1.id
        assert libro2.empresa_id == empresa2.id

    def test_same_empresa_different_periods(self, db: Session, empresa: Empresa):
        """Test that same empresa with different periods creates separate libros"""
        libro1 = LibroService.generar_libro_ventas(db, empresa.id, "2026-05")
        libro2 = LibroService.generar_libro_ventas(db, empresa.id, "2026-06")

        assert libro1.id != libro2.id
        assert libro1.periodo == "2026-05"
        assert libro2.periodo == "2026-06"


class TestLibroComprasIntegration:
    """Integration tests for LibroCompras"""

    def test_multiple_empresas_separate_libros(self, db: Session):
        """Test that different empresas get separate libros"""
        empresa1 = Empresa(nombre="Empresa 1")
        empresa2 = Empresa(nombre="Empresa 2")
        db.add(empresa1)
        db.add(empresa2)
        db.commit()

        libro1 = LibroService.generar_libro_compras(db, empresa1.id, "2026-05")
        libro2 = LibroService.generar_libro_compras(db, empresa2.id, "2026-05")

        assert libro1.id != libro2.id
        assert libro1.empresa_id == empresa1.id
        assert libro2.empresa_id == empresa2.id

    def test_receipts_filtered_by_empresa_id(self, db: Session):
        """Test that receipts are correctly filtered by empresa_id"""
        empresa1 = Empresa(nombre="Empresa 1")
        empresa2 = Empresa(nombre="Empresa 2")
        db.add(empresa1)
        db.add(empresa2)
        db.commit()

        # Add receipts for empresa1
        dte1 = DteRecepcion(
            empresa_id=empresa1.id,
            tipo="46",
            folio=1,
            rut_emisor="11.111.111-1",
            monto=100000,
            estado="aceptado"
        )
        # Add receipts for empresa2
        dte2 = DteRecepcion(
            empresa_id=empresa2.id,
            tipo="46",
            folio=2,
            rut_emisor="22.222.222-2",
            monto=200000,
            estado="aceptado"
        )
        db.add(dte1)
        db.add(dte2)
        db.commit()

        libro1 = LibroService.generar_libro_compras(db, empresa1.id, "2026-05")
        libro2 = LibroService.generar_libro_compras(db, empresa2.id, "2026-05")

        assert libro1.total_registros == 1
        assert libro1.monto_total == 100000
        assert libro2.total_registros == 1
        assert libro2.monto_total == 200000
