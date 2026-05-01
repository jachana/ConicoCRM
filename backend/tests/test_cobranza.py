import pytest
from datetime import date, timedelta
from unittest.mock import patch
from app.models.empresa import Empresa
from app.models.cobranza_config import CobranzaConfig
from app.models.factura import Factura
from app.models.cliente import Cliente
from app.tasks.cobranza import enviar_recordatorios_automaticos, _procesar_empresa
from app.database import SessionLocal


@pytest.fixture
def db_session():
    """Fixture for database session."""
    session = SessionLocal()
    yield session
    session.rollback()
    session.close()


@pytest.fixture
def empresa(db_session):
    """Create a test empresa."""
    empresa = Empresa(
        nombre="Test Empresa",
        razon_social="Test Empresa S.A.",
        rut="12345678-9",
    )
    db_session.add(empresa)
    db_session.commit()
    return empresa


@pytest.fixture
def cobranza_config(db_session, empresa):
    """Create a test cobranza config."""
    config = CobranzaConfig(
        empresa_id=empresa.id,
        dias_frecuencia=7,
    )
    db_session.add(config)
    db_session.commit()
    return config


@pytest.fixture
def cliente(db_session, empresa):
    """Create a test cliente."""
    cliente = Cliente(
        nombre="Test Cliente",
        rut="98765432-1",
        email="cliente@example.com",
        empresa_id=empresa.id,
    )
    db_session.add(cliente)
    db_session.commit()
    return cliente


@pytest.fixture
def factura_overdue(db_session, empresa, cliente):
    """Create an overdue factura that should trigger a reminder."""
    factura = Factura(
        numero=1001,
        empresa_id=empresa.id,
        cliente_id=cliente.id,
        estado="emitida",
        fecha=date.today() - timedelta(days=20),
        fecha_vencimiento=date.today() - timedelta(days=10),
        total=100000,
        exclude_recordatorio=False,
        ultimo_recordatorio=None,
    )
    db_session.add(factura)
    db_session.commit()
    return factura


class TestEnviarRecordatorios:
    """Test suite for automatic invoice reminders."""

    @patch("app.tasks.cobranza.enviar_recordatorio")
    def test_enviar_recordatorio_basico(self, mock_email, db_session, empresa, cobranza_config, factura_overdue, cliente):
        """Test basic task execution with one overdue invoice."""
        enviar_recordatorios_automaticos()
        mock_email.assert_called_once()
        call_args = mock_email.call_args
        assert call_args[0][0] == cliente.email
        assert "Recordatorio de Pago" in call_args[0][1]
        assert "1001" in call_args[0][2]
        db_session.refresh(factura_overdue)
        assert factura_overdue.ultimo_recordatorio == date.today()

    @patch("app.tasks.cobranza.enviar_recordatorio")
    def test_excluded_skipped(self, mock_email, db_session, empresa, cobranza_config):
        """Test that excluded facturas are not reminded."""
        factura = Factura(
            numero=1002,
            empresa_id=empresa.id,
            cliente_id=None,
            estado="emitida",
            fecha=date.today() - timedelta(days=20),
            fecha_vencimiento=date.today() - timedelta(days=10),
            total=100000,
            exclude_recordatorio=True,
            ultimo_recordatorio=None,
        )
        db_session.add(factura)
        db_session.commit()
        enviar_recordatorios_automaticos()
        mock_email.assert_not_called()

    @patch("app.tasks.cobranza.enviar_recordatorio")
    def test_no_config_skipped(self, mock_email, db_session):
        """Test that empresas without CobranzaConfig are skipped."""
        emp = Empresa(nombre="No Config Empresa", razon_social="NoCfg S.A.", rut="55555555-5")
        db_session.add(emp)
        db_session.commit()
        enviar_recordatorios_automaticos()
        mock_email.assert_not_called()

    @patch("app.tasks.cobranza.enviar_recordatorio")
    def test_pagada_parcial_included(self, mock_email, db_session, empresa, cobranza_config, cliente):
        """Test that partially paid invoices can receive reminders."""
        factura = Factura(
            numero=3001,
            empresa_id=empresa.id,
            cliente_id=cliente.id,
            estado="pagada_parcial",
            fecha=date.today() - timedelta(days=20),
            fecha_vencimiento=date.today() - timedelta(days=10),
            total=100000,
            exclude_recordatorio=False,
            ultimo_recordatorio=None,
        )
        db_session.add(factura)
        db_session.commit()
        enviar_recordatorios_automaticos()
        mock_email.assert_called_once()

    @patch("app.tasks.cobranza.enviar_recordatorio")
    def test_no_client_email(self, mock_email, db_session, empresa, cobranza_config):
        """Test handling of facturas with missing client email."""
        factura = Factura(
            numero=4001,
            empresa_id=empresa.id,
            cliente_id=None,
            estado="emitida",
            fecha=date.today() - timedelta(days=20),
            fecha_vencimiento=date.today() - timedelta(days=10),
            total=100000,
            exclude_recordatorio=False,
            ultimo_recordatorio=None,
            correo=None,
        )
        db_session.add(factura)
        db_session.commit()
        enviar_recordatorios_automaticos()
        mock_email.assert_not_called()

    @patch("app.tasks.cobranza.enviar_recordatorio")
    def test_already_reminded_today(self, mock_email, db_session, empresa, cobranza_config, cliente):
        """Test that reminders are not sent if already sent today."""
        factura = Factura(
            numero=1003,
            empresa_id=empresa.id,
            cliente_id=cliente.id,
            estado="emitida",
            fecha=date.today() - timedelta(days=20),
            fecha_vencimiento=date.today() - timedelta(days=10),
            total=100000,
            exclude_recordatorio=False,
            ultimo_recordatorio=date.today(),
        )
        db_session.add(factura)
        db_session.commit()
        enviar_recordatorios_automaticos()
        mock_email.assert_not_called()

    @patch("app.tasks.cobranza.enviar_recordatorio")
    def test_not_yet_overdue(self, mock_email, db_session, empresa, cobranza_config, cliente):
        """Test that not-yet-overdue facturas are not reminded."""
        factura = Factura(
            numero=6001,
            empresa_id=empresa.id,
            cliente_id=cliente.id,
            estado="emitida",
            fecha=date.today() - timedelta(days=5),
            fecha_vencimiento=date.today() + timedelta(days=5),
            total=100000,
            exclude_recordatorio=False,
            ultimo_recordatorio=None,
        )
        db_session.add(factura)
        db_session.commit()
        enviar_recordatorios_automaticos()
        mock_email.assert_not_called()
