"""Compliance test for period filtering in LibroService."""
import pytest
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from app.models.empresa import Empresa
from app.models.dte_emision import DteEmision
from app.services.libro_service import LibroService


def test_generar_libro_ventas_filters_by_period(db: Session):
    """CRITICAL: Verify that generar_libro_ventas only counts DTEs from the target period."""
    empresa = Empresa(nombre="Period Filter Test")
    db.add(empresa)
    db.commit()
    db.refresh(empresa)
    
    # Create DTEs for May and June
    dte_may = DteEmision(
        tipo="033", factura_id=1,
        monto_neto=100000, monto_iva=19000, monto_total=119000,
        estado="aceptado",
        created_at=datetime(2026, 5, 15, tzinfo=timezone.utc)
    )
    dte_june = DteEmision(
        tipo="039", boleta_id=1,
        monto_neto=50000, monto_iva=9500, monto_total=59500,
        estado="aceptado",
        created_at=datetime(2026, 6, 15, tzinfo=timezone.utc)
    )
    db.add_all([dte_may, dte_june])
    db.commit()
    
    # Generate libros
    libro_may = LibroService.generar_libro_ventas(db, empresa.id, "2026-05")
    libro_june = LibroService.generar_libro_ventas(db, empresa.id, "2026-06")
    
    # Period filtering MUST work: each libro should only count its period's DTEs
    assert libro_may.total_registros == 1, \
        f"May libro should have 1 DTE, got {libro_may.total_registros} (period filtering missing)"
    assert libro_may.monto_total == 119000, \
        f"May monto should be 119000, got {libro_may.monto_total}"
    
    assert libro_june.total_registros == 1, \
        f"June libro should have 1 DTE, got {libro_june.total_registros} (period filtering missing)"
    assert libro_june.monto_total == 59500, \
        f"June monto should be 59500, got {libro_june.monto_total}"
