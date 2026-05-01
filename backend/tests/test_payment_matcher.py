"""
Unit tests for payment matcher service.

Tests cover:
- Matching payments to facturas and boletas
- Updating saldo_pendiente correctly
- On-account payment handling
- Overpayment detection
- Idempotency via hash_key
- Multiple payments to same document
"""

from datetime import date
from decimal import Decimal

import pytest

from app.models.cliente import Cliente
from app.models.factura import Factura
from app.models.boleta import Boleta
from app.models.pago_importado import PagoImportado
from app.services.payment_matcher import (
    PaymentMatcher,
    OverpaymentError,
    IdempotencyError,
    PaymentMatcherError,
)


@pytest.fixture
def cliente(db):
    """Create a test cliente."""
    c = Cliente(
        nombre="Test Cliente",
        rut="12345678-9",
        email="test@example.com"
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


@pytest.fixture
def factura(db, cliente):
    """Create a test factura with total 10,000."""
    f = Factura(
        numero=1000,
        cliente_id=cliente.id,
        fecha=date.today(),
        total_neto=Decimal("8403.36"),  # 10,000 / 1.19
        total_iva=Decimal("1596.64"),
        total=Decimal("10000.00"),
        estado="emitida",
        monto_pagado=None,
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    return f


@pytest.fixture
def boleta(db, cliente):
    """Create a test boleta with total 5,000."""
    b = Boleta(
        numero=2000,
        cliente_id=cliente.id,
        fecha=date.today(),
        tipo_dte="39",
        total_neto=Decimal("4201.68"),
        total_iva=Decimal("798.32"),
        total=Decimal("5000.00"),
        estado="emitida",
        monto_pagado=Decimal("0"),
    )
    db.add(b)
    db.commit()
    db.refresh(b)
    return b


@pytest.fixture
def payment_importado():
    """Create a payment import record (not yet in DB)."""
    pago = PagoImportado(
        fecha_pago=date.today(),
        rut_cliente="12345678-9",
        monto=Decimal("5000.00"),
        medio_pago="Transferencia",
        referencia="TRX123456",
        folio_documento="1000",
        tipo_documento="factura",
        hash_key="abc123hash",
    )
    return pago


def test_find_document_factura(db, factura):
    """Test finding a factura by folio."""
    matcher = PaymentMatcher(db)
    found_factura, found_boleta = matcher.find_document_by_folio_and_type(
        folio="1000",
        tipo_documento="factura"
    )
    assert found_factura is not None
    assert found_factura.id == factura.id
    assert found_boleta is None


def test_find_document_boleta(db, boleta):
    """Test finding a boleta by folio."""
    matcher = PaymentMatcher(db)
    found_factura, found_boleta = matcher.find_document_by_folio_and_type(
        folio="2000",
        tipo_documento="boleta"
    )
    assert found_boleta is not None
    assert found_boleta.id == boleta.id
    assert found_factura is None


def test_find_document_not_found(db):
    """Test searching for non-existent document."""
    matcher = PaymentMatcher(db)
    found_factura, found_boleta = matcher.find_document_by_folio_and_type(
        folio="9999",
        tipo_documento="factura"
    )
    assert found_factura is None
    assert found_boleta is None


def test_find_document_invalid_type(db):
    """Test with invalid document type."""
    matcher = PaymentMatcher(db)
    with pytest.raises(ValueError, match="Unknown document type"):
        matcher.find_document_by_folio_and_type(
            folio="1000",
            tipo_documento="invalid"
        )


def test_get_pending_amount_factura(db, factura):
    """Test calculating pending amount for factura."""
    matcher = PaymentMatcher(db)
    pending = matcher.get_pending_amount(factura=factura)
    assert pending == Decimal("10000.00")


def test_get_pending_amount_after_partial_payment(db, factura):
    """Test pending amount after partial payment."""
    matcher = PaymentMatcher(db)
    factura.monto_pagado = Decimal("3000.00")
    db.commit()

    pending = matcher.get_pending_amount(factura=factura)
    assert pending == Decimal("7000.00")


def test_get_pending_amount_boleta(db, boleta):
    """Test calculating pending amount for boleta."""
    matcher = PaymentMatcher(db)
    pending = matcher.get_pending_amount(boleta=boleta)
    assert pending == Decimal("5000.00")


def test_validate_no_overpayment_exact_amount(db, factura):
    """Test validation with exact payment amount."""
    matcher = PaymentMatcher(db)
    # Should not raise
    assert matcher.validate_no_overpayment(
        Decimal("10000.00"),
        factura=factura
    ) is True


def test_validate_no_overpayment_partial(db, factura):
    """Test validation with partial payment."""
    matcher = PaymentMatcher(db)
    assert matcher.validate_no_overpayment(
        Decimal("5000.00"),
        factura=factura
    ) is True


def test_validate_no_overpayment_exceeds_total(db, factura):
    """Test that overpayment raises error."""
    matcher = PaymentMatcher(db)
    with pytest.raises(OverpaymentError, match="exceeds pending amount"):
        matcher.validate_no_overpayment(
            Decimal("15000.00"),
            factura=factura
        )


def test_validate_no_overpayment_after_partial(db, factura):
    """Test overpayment validation after partial payment."""
    matcher = PaymentMatcher(db)
    factura.monto_pagado = Decimal("8000.00")
    db.commit()

    # Can pay the remaining 2000
    assert matcher.validate_no_overpayment(
        Decimal("2000.00"),
        factura=factura
    ) is True

    # Cannot pay more than remaining
    with pytest.raises(OverpaymentError):
        matcher.validate_no_overpayment(
            Decimal("3000.00"),
            factura=factura
        )


def test_check_idempotency_no_existing(db, payment_importado):
    """Test idempotency check with no existing payment."""
    matcher = PaymentMatcher(db)
    # Should not raise
    matcher.check_idempotency(payment_importado.hash_key)


def test_check_idempotency_existing_payment(db, payment_importado):
    """Test idempotency check detects duplicate."""
    # Insert payment into DB
    db.add(payment_importado)
    db.commit()

    matcher = PaymentMatcher(db)
    with pytest.raises(IdempotencyError, match="already imported"):
        matcher.check_idempotency(payment_importado.hash_key)


def test_apply_payment_to_factura_full(db, factura):
    """Test applying full payment to factura."""
    pago = PagoImportado(
        fecha_pago=date.today(),
        rut_cliente="12345678-9",
        monto=Decimal("10000.00"),
        medio_pago="Transferencia",
        hash_key="abc123",
        folio_documento="1000",
        tipo_documento="factura",
    )

    matcher = PaymentMatcher(db)
    matcher.apply_payment(pago, factura=factura)

    # Check factura updated
    assert factura.monto_pagado == Decimal("10000.00")
    assert factura.estado == "pagada"
    assert factura.metodo_pago == "Transferencia"

    # Check payment linked
    assert pago.factura_id == factura.id
    assert pago.estado == "matched"


def test_apply_payment_to_factura_partial(db, factura):
    """Test applying partial payment to factura."""
    pago = PagoImportado(
        fecha_pago=date.today(),
        rut_cliente="12345678-9",
        monto=Decimal("3000.00"),
        medio_pago="Cheque",
        hash_key="abc123",
        folio_documento="1000",
        tipo_documento="factura",
    )

    matcher = PaymentMatcher(db)
    matcher.apply_payment(pago, factura=factura)

    assert factura.monto_pagado == Decimal("3000.00")
    assert factura.estado == "parcial"
    assert pago.estado == "matched"


def test_apply_payment_to_boleta(db, boleta):
    """Test applying payment to boleta."""
    pago = PagoImportado(
        fecha_pago=date.today(),
        rut_cliente="12345678-9",
        monto=Decimal("5000.00"),
        medio_pago="Efectivo",
        hash_key="boleta123",
    )

    matcher = PaymentMatcher(db)
    matcher.apply_payment(pago, boleta=boleta)

    assert boleta.monto_pagado == Decimal("5000.00")
    assert boleta.estado == "pagada"
    assert pago.boleta_id == boleta.id
    assert pago.estado == "matched"


def test_apply_payment_multiple_to_same_factura(db, factura):
    """Test applying multiple payments to same factura."""
    matcher = PaymentMatcher(db)

    # First payment
    pago1 = PagoImportado(
        fecha_pago=date.today(),
        rut_cliente="12345678-9",
        monto=Decimal("4000.00"),
        medio_pago="Cheque",
        hash_key="pago1",
    )
    matcher.apply_payment(pago1, factura=factura)
    assert factura.monto_pagado == Decimal("4000.00")

    # Second payment
    pago2 = PagoImportado(
        fecha_pago=date.today(),
        rut_cliente="12345678-9",
        monto=Decimal("6000.00"),
        medio_pago="Transferencia",
        hash_key="pago2",
    )
    matcher.apply_payment(pago2, factura=factura)

    # Both payments applied
    assert factura.monto_pagado == Decimal("10000.00")
    assert factura.estado == "pagada"
    assert pago1.factura_id == factura.id
    assert pago2.factura_id == factura.id


def test_apply_payment_overpayment_raises_error(db, factura):
    """Test that overpayment during apply raises error."""
    pago = PagoImportado(
        fecha_pago=date.today(),
        rut_cliente="12345678-9",
        monto=Decimal("15000.00"),
        medio_pago="Transferencia",
        hash_key="abc123",
    )

    matcher = PaymentMatcher(db)
    with pytest.raises(OverpaymentError):
        matcher.apply_payment(pago, factura=factura)


def test_apply_payment_to_anulada_no_estado_change(db, factura):
    """Test that anulada estado is not changed by payment."""
    factura.estado = "anulada"
    db.commit()

    pago = PagoImportado(
        fecha_pago=date.today(),
        rut_cliente="12345678-9",
        monto=Decimal("5000.00"),
        medio_pago="Transferencia",
        hash_key="abc123",
    )

    matcher = PaymentMatcher(db)
    matcher.apply_payment(pago, factura=factura)

    # Payment applied but estado remains anulada
    assert factura.monto_pagado == Decimal("5000.00")
    assert factura.estado == "anulada"


def test_handle_on_account_payment(db):
    """Test registering on-account payment."""
    pago = PagoImportado(
        fecha_pago=date.today(),
        rut_cliente="12345678-9",
        monto=Decimal("2000.00"),
        medio_pago="Efectivo",
        hash_key="onaccount123",
    )

    matcher = PaymentMatcher(db)
    matcher.handle_on_account_payment(pago)

    assert pago.estado == "pending"
    assert "Pago a cuenta" in pago.notas
    assert "pendiente de reconciliación" in pago.notas


def test_handle_on_account_payment_with_existing_notas(db):
    """Test on-account with existing notes."""
    pago = PagoImportado(
        fecha_pago=date.today(),
        rut_cliente="12345678-9",
        monto=Decimal("2000.00"),
        medio_pago="Efectivo",
        hash_key="onaccount123",
        notas="Original note"
    )

    matcher = PaymentMatcher(db)
    matcher.handle_on_account_payment(pago)

    assert "Original note" in pago.notas
    assert "Pago a cuenta" in pago.notas


def test_handle_on_account_payment_rejects_with_folio(db):
    """Test that on-account payment cannot have folio."""
    pago = PagoImportado(
        fecha_pago=date.today(),
        rut_cliente="12345678-9",
        monto=Decimal("2000.00"),
        medio_pago="Efectivo",
        hash_key="onaccount123",
        folio_documento="1000"
    )

    matcher = PaymentMatcher(db)
    with pytest.raises(ValueError, match="must not have folio_documento"):
        matcher.handle_on_account_payment(pago)


def test_match_and_apply_payment_full_factura(db, factura, cliente):
    """Test complete flow: match and apply full payment to factura."""
    pago = PagoImportado(
        fecha_pago=date.today(),
        rut_cliente=cliente.rut,
        monto=Decimal("10000.00"),
        medio_pago="Transferencia",
        referencia="TRX123",
        folio_documento="1000",
        tipo_documento="factura",
        hash_key="fullpayment123",
    )

    matcher = PaymentMatcher(db)
    success, message = matcher.match_and_apply_payment(pago)

    assert success is True
    assert "factura #1000" in message.lower()
    assert pago.estado == "matched"
    assert factura.monto_pagado == Decimal("10000.00")
    assert factura.estado == "pagada"


def test_match_and_apply_payment_partial(db, factura, cliente):
    """Test match and apply with partial payment."""
    pago = PagoImportado(
        fecha_pago=date.today(),
        rut_cliente=cliente.rut,
        monto=Decimal("3000.00"),
        medio_pago="Cheque",
        folio_documento="1000",
        tipo_documento="factura",
        hash_key="partialpay123",
    )

    matcher = PaymentMatcher(db)
    success, message = matcher.match_and_apply_payment(pago)

    assert success is True
    assert pago.estado == "matched"
    assert factura.estado == "parcial"


def test_match_and_apply_payment_document_not_found(db, cliente):
    """Test payment when document is not found."""
    pago = PagoImportado(
        fecha_pago=date.today(),
        rut_cliente=cliente.rut,
        monto=Decimal("5000.00"),
        medio_pago="Transferencia",
        folio_documento="9999",
        tipo_documento="factura",
        hash_key="notfound123",
    )

    matcher = PaymentMatcher(db)
    success, message = matcher.match_and_apply_payment(pago)

    # Payment marked as pending since document not found
    assert success is True
    assert pago.estado == "pending"
    assert "not found" in message.lower()


def test_match_and_apply_payment_no_folio(db, cliente):
    """Test payment with no document reference (on-account)."""
    pago = PagoImportado(
        fecha_pago=date.today(),
        rut_cliente=cliente.rut,
        monto=Decimal("2000.00"),
        medio_pago="Efectivo",
        hash_key="onaccount123",
    )

    matcher = PaymentMatcher(db)
    success, message = matcher.match_and_apply_payment(pago)

    assert success is True
    assert "Pago a cuenta" in message
    assert pago.estado == "pending"


def test_match_and_apply_payment_idempotency_fails(db, factura, cliente):
    """Test that duplicate hash_key prevents re-import."""
    # First import
    pago1 = PagoImportado(
        fecha_pago=date.today(),
        rut_cliente=cliente.rut,
        monto=Decimal("5000.00"),
        medio_pago="Transferencia",
        folio_documento="1000",
        tipo_documento="factura",
        hash_key="duplicate123",
    )
    db.add(pago1)
    db.commit()

    # Try to import same payment again
    pago2 = PagoImportado(
        fecha_pago=date.today(),
        rut_cliente=cliente.rut,
        monto=Decimal("5000.00"),
        medio_pago="Transferencia",
        folio_documento="1000",
        tipo_documento="factura",
        hash_key="duplicate123",
    )

    matcher = PaymentMatcher(db)
    success, message = matcher.match_and_apply_payment(pago2)

    assert success is False
    assert "already imported" in message
    assert pago2.estado == "error"


def test_match_and_apply_payment_overpayment_error(db, factura, cliente):
    """Test error handling for overpayment."""
    pago = PagoImportado(
        fecha_pago=date.today(),
        rut_cliente=cliente.rut,
        monto=Decimal("15000.00"),
        medio_pago="Transferencia",
        folio_documento="1000",
        tipo_documento="factura",
        hash_key="overpay123",
    )

    matcher = PaymentMatcher(db)
    success, message = matcher.match_and_apply_payment(pago)

    assert success is False
    assert "exceeds pending amount" in message
    assert pago.estado == "error"
    assert "Error:" in pago.notas


def test_match_and_apply_payment_boleta(db, boleta, cliente):
    """Test matching and applying payment to boleta."""
    pago = PagoImportado(
        fecha_pago=date.today(),
        rut_cliente=cliente.rut,
        monto=Decimal("5000.00"),
        medio_pago="Efectivo",
        folio_documento="2000",
        tipo_documento="boleta",
        hash_key="bolpay123",
    )

    matcher = PaymentMatcher(db)
    success, message = matcher.match_and_apply_payment(pago)

    assert success is True
    assert "boleta #2000" in message.lower()
    assert boleta.monto_pagado == Decimal("5000.00")
    assert boleta.estado == "pagada"


def test_get_match_summary_factura(db, factura):
    """Test summary for factura with no payments."""
    matcher = PaymentMatcher(db)
    summary = matcher.get_match_summary(factura=factura)

    assert summary["total"] == Decimal("10000.00")
    assert summary["monto_pagado"] == Decimal("0.00")
    assert summary["pendiente"] == Decimal("10000.00")
    assert summary["estado"] == "emitida"
    assert "Factura #1000" in summary["documento"]


def test_get_match_summary_factura_partial(db, factura):
    """Test summary for partially paid factura."""
    factura.monto_pagado = Decimal("4000.00")
    factura.estado = "parcial"
    db.commit()

    matcher = PaymentMatcher(db)
    summary = matcher.get_match_summary(factura=factura)

    assert summary["monto_pagado"] == Decimal("4000.00")
    assert summary["pendiente"] == Decimal("6000.00")
    assert summary["estado"] == "parcial"


def test_get_match_summary_boleta(db, boleta):
    """Test summary for boleta."""
    matcher = PaymentMatcher(db)
    summary = matcher.get_match_summary(boleta=boleta)

    assert summary["total"] == Decimal("5000.00")
    assert summary["pendiente"] == Decimal("5000.00")
    assert "Boleta #2000" in summary["documento"]
