"""
Payment Matcher Service

Handles matching imported payments to documents (facturas/boletas) and applying payments.
Provides:
- Document lookup by folio and type
- Payment application with state transitions
- On-account payment handling
- Overpayment detection
- Idempotency via hash_key
"""

from datetime import date
from decimal import Decimal
from typing import Optional, Tuple

from sqlalchemy.orm import Session

from app.models.boleta import Boleta
from app.models.factura import Factura
from app.models.pago_importado import PagoImportado
from app.models.cliente import Cliente


class PaymentMatcherError(Exception):
    """Base exception for payment matching errors."""
    pass


class DocumentNotFoundError(PaymentMatcherError):
    """Raised when a document cannot be found for matching."""
    pass


class OverpaymentError(PaymentMatcherError):
    """Raised when payment amount exceeds document total."""
    pass


class IdempotencyError(PaymentMatcherError):
    """Raised when attempting to import a duplicate payment."""
    pass


class PaymentMatcher:
    """
    Service to match payments to documents and apply them.

    Handles atomicity via transaction management. All operations should be
    wrapped in a transaction at the API layer.
    """

    def __init__(self, db: Session):
        """
        Initialize payment matcher with database session.

        Args:
            db: SQLAlchemy session for database operations
        """
        self.db = db

    def find_document_by_folio_and_type(
        self,
        folio: str,
        tipo_documento: str,
        cliente_id: Optional[int] = None
    ) -> Tuple[Optional[Factura], Optional[Boleta]]:
        """
        Find invoice or boleta by folio and type.

        Args:
            folio: Document folio (number)
            tipo_documento: Document type ('factura' or 'boleta')
            cliente_id: Optional client ID for narrowing search

        Returns:
            Tuple of (factura, boleta) where at most one is non-None

        Raises:
            ValueError: If tipo_documento is not recognized
        """
        tipo_lower = tipo_documento.lower() if tipo_documento else ""

        if tipo_lower == "factura":
            factura = self.db.query(Factura).filter(
                Factura.numero == int(folio)
            )
            if cliente_id:
                factura = factura.filter(Factura.cliente_id == cliente_id)
            return factura.first(), None

        elif tipo_lower == "boleta":
            boleta = self.db.query(Boleta).filter(
                Boleta.numero == int(folio)
            )
            if cliente_id:
                boleta = boleta.filter(Boleta.cliente_id == cliente_id)
            return None, boleta.first()

        else:
            raise ValueError(f"Unknown document type: {tipo_documento}")

    def get_pending_amount(
        self,
        factura: Optional[Factura] = None,
        boleta: Optional[Boleta] = None
    ) -> Decimal:
        """
        Calculate pending amount for a document.

        Args:
            factura: Factura instance or None
            boleta: Boleta instance or None

        Returns:
            Remaining amount to pay (total - monto_pagado)

        Raises:
            ValueError: If both or neither document provided
        """
        if factura is None and boleta is None:
            raise ValueError("Must provide either factura or boleta")
        if factura is not None and boleta is not None:
            raise ValueError("Provide only one of factura or boleta")

        if factura:
            total = factura.total or Decimal("0")
            paid = factura.monto_pagado or Decimal("0")
        else:
            total = boleta.total or Decimal("0")
            paid = boleta.monto_pagado or Decimal("0")

        return total - paid

    def validate_no_overpayment(
        self,
        payment_amount: Decimal,
        factura: Optional[Factura] = None,
        boleta: Optional[Boleta] = None
    ) -> bool:
        """
        Check if payment + existing payments would exceed document total.

        Args:
            payment_amount: Amount being applied
            factura: Factura instance or None
            boleta: Boleta instance or None

        Returns:
            True if payment is valid (no overpayment)

        Raises:
            OverpaymentError: If sum of payments exceeds total
        """
        pending = self.get_pending_amount(factura, boleta)

        if payment_amount > pending:
            raise OverpaymentError(
                f"Payment amount {payment_amount} exceeds pending amount {pending}"
            )

        return True

    def check_idempotency(self, hash_key: str, exclude_pago_id: Optional[int] = None) -> None:
        """
        Check if payment with same hash_key already exists.

        Args:
            hash_key: SHA256 hash of payment data
            exclude_pago_id: Optional ID of current pago to exclude from check

        Raises:
            IdempotencyError: If payment with same hash_key already imported
        """
        q = self.db.query(PagoImportado).filter(
            PagoImportado.hash_key == hash_key
        )

        # Exclude the current pago if it's already in the DB
        if exclude_pago_id is not None:
            q = q.filter(PagoImportado.id != exclude_pago_id)

        existing = q.first()

        if existing:
            raise IdempotencyError(
                f"Payment with hash_key {hash_key} already imported"
            )

    def apply_payment(
        self,
        pago_importado: PagoImportado,
        factura: Optional[Factura] = None,
        boleta: Optional[Boleta] = None
    ) -> None:
        """
        Apply payment to a document.

        Updates the document's monto_pagado and estado based on whether
        payment fully covers the outstanding amount.

        Args:
            pago_importado: PagoImportado instance to apply
            factura: Factura instance or None
            boleta: Boleta instance or None

        Raises:
            ValueError: If both or neither document provided
            OverpaymentError: If payment exceeds pending amount
        """
        if factura is None and boleta is None:
            raise ValueError("Must provide either factura or boleta")
        if factura is not None and boleta is not None:
            raise ValueError("Provide only one of factura or boleta")

        payment_amount = pago_importado.monto

        # Validate no overpayment
        self.validate_no_overpayment(payment_amount, factura, boleta)

        if factura:
            # Update factura payment tracking
            factura.monto_pagado = (factura.monto_pagado or Decimal("0")) + payment_amount

            # Update estado based on payment status
            if factura.estado != "anulada":  # Never change anulada state
                pending = self.get_pending_amount(factura=factura)
                if pending <= Decimal("0"):
                    factura.estado = "pagada"
                    factura.fecha_pago = pago_importado.fecha_pago
                    factura.metodo_pago = pago_importado.medio_pago
                elif factura.monto_pagado > Decimal("0"):
                    factura.estado = "parcial"

            # Link the imported payment to the factura
            pago_importado.factura_id = factura.id
            pago_importado.factura = factura

        else:  # boleta
            # Update boleta payment tracking
            boleta.monto_pagado = (boleta.monto_pagado or Decimal("0")) + payment_amount

            # Update estado based on payment status
            if boleta.estado != "anulada":
                pending = self.get_pending_amount(boleta=boleta)
                if pending <= Decimal("0"):
                    boleta.estado = "pagada"

            # Link the imported payment to the boleta
            pago_importado.boleta_id = boleta.id
            pago_importado.boleta = boleta

        # Mark as matched
        pago_importado.estado = "matched"

    def handle_on_account_payment(
        self,
        pago_importado: PagoImportado,
        cliente: Optional[Cliente] = None
    ) -> None:
        """
        Register payment without a matched document (pago a cuenta).

        On-account payments are stored for later reconciliation.
        The payment remains in the system but is not linked to a specific
        document. It can later be matched manually or via reconciliation.

        Args:
            pago_importado: PagoImportado instance (folio_documento should be None)
            cliente: Optional Cliente instance for reference

        Raises:
            ValueError: If folio_documento is specified
        """
        if pago_importado.folio_documento:
            raise ValueError(
                "On-account payments must not have folio_documento specified"
            )

        # Mark as on-account (pending manual reconciliation)
        pago_importado.estado = "pending"

        # Store reference in notas if not already there
        if not pago_importado.notas:
            pago_importado.notas = "Pago a cuenta - pendiente de reconciliación"
        elif "Pago a cuenta" not in pago_importado.notas:
            pago_importado.notas += " | Pago a cuenta - pendiente de reconciliación"

    def match_and_apply_payment(
        self,
        pago_importado: PagoImportado
    ) -> Tuple[bool, str]:
        """
        Attempt to match and apply a payment in a single operation.

        This is the main entry point for payment processing. It:
        1. Checks idempotency (hash_key)
        2. Attempts to find matching document (if folio provided)
        3. Validates payment amount
        4. Applies payment or registers as pending if document not found
        5. Updates estado

        The caller should wrap this in a transaction and catch exceptions.

        Args:
            pago_importado: PagoImportado instance to process

        Returns:
            Tuple of (success: bool, message: str)
            - If success: (True, "Pago matched to document X" or "Payment pending...")
            - If error: (False, error message)

        Note:
            On exception, the pago_importado.estado is set to "error" and
            error details are stored in notas. The caller must commit
            or rollback the transaction appropriately.
        """
        try:
            # Step 1: Check idempotency (exclude current pago if it has an ID)
            self.check_idempotency(pago_importado.hash_key, exclude_pago_id=pago_importado.id)

            # Step 2: Try to match document if folio is provided
            if pago_importado.folio_documento and pago_importado.tipo_documento:
                # Attempt to find document
                factura, boleta = self.find_document_by_folio_and_type(
                    folio=pago_importado.folio_documento,
                    tipo_documento=pago_importado.tipo_documento
                )

                if factura is None and boleta is None:
                    # Document not found - mark as pending for reconciliation
                    pago_importado.estado = "pending"
                    if not pago_importado.notas:
                        pago_importado.notas = f"Document {pago_importado.tipo_documento} {pago_importado.folio_documento} not found - pending reconciliation"
                    return True, f"Document {pago_importado.tipo_documento} {pago_importado.folio_documento} not found - registered as pending"

                # Step 3: Validate and apply payment
                if factura:
                    self.validate_no_overpayment(pago_importado.monto, factura=factura)
                    self.apply_payment(pago_importado, factura=factura)
                    return True, f"Pago matched to factura #{factura.numero}"
                else:
                    self.validate_no_overpayment(pago_importado.monto, boleta=boleta)
                    self.apply_payment(pago_importado, boleta=boleta)
                    return True, f"Pago matched to boleta #{boleta.numero}"

            else:
                # No document reference - register as on-account
                self.handle_on_account_payment(pago_importado)
                return True, "Pago a cuenta registered (no document specified)"

        except (DocumentNotFoundError, OverpaymentError, IdempotencyError, ValueError) as e:
            # Mark as error and store details
            pago_importado.estado = "error"
            pago_importado.notas = f"Error: {str(e)}"
            self.db.add(pago_importado)
            return False, str(e)

    def get_match_summary(
        self,
        factura: Optional[Factura] = None,
        boleta: Optional[Boleta] = None
    ) -> dict:
        """
        Get a summary of payment status for a document.

        Args:
            factura: Factura instance or None
            boleta: Boleta instance or None

        Returns:
            Dict with:
            - total: Total amount
            - monto_pagado: Amount paid
            - pendiente: Remaining to pay
            - estado: Current estado
        """
        if factura is None and boleta is None:
            raise ValueError("Must provide either factura or boleta")

        if factura:
            return {
                "total": factura.total,
                "monto_pagado": factura.monto_pagado or Decimal("0"),
                "pendiente": self.get_pending_amount(factura=factura),
                "estado": factura.estado,
                "documento": f"Factura #{factura.numero}"
            }
        else:
            return {
                "total": boleta.total,
                "monto_pagado": boleta.monto_pagado or Decimal("0"),
                "pendiente": self.get_pending_amount(boleta=boleta),
                "estado": boleta.estado,
                "documento": f"Boleta #{boleta.numero}"
            }
