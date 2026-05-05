"""
Tests for the Celery daily CAF alert email task.

Covers:
- Empresa with alert CAF → admin receives email
- Empresa with no alert CAFs → no email sent
- vigente=False CAF → not included in alerts
- Non-admin users don't receive email
- Multiple admins each receive one email
- Multiple alert CAFs are consolidated into a single email per admin
"""

from datetime import date, timedelta
from unittest.mock import patch

import pytest

from app.models.caf import CAF
from app.models.empresa import Empresa
from app.models.user import User
from app.tasks.caf import send_caf_alerts_email, _procesar_empresa_caf, _get_alert_cafs


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_empresa(db, nombre="Test Empresa", rut="76.001.001-1"):
    empresa = Empresa(nombre=nombre, rut=rut)
    db.add(empresa)
    db.flush()
    return empresa


def _make_user(db, empresa_id, role="admin", email="admin@test.cl"):
    user = User(
        email=email,
        name="Test Admin",
        hashed_password="dummy_hash",
        role=role,
        is_active=True,
        empresa_id=empresa_id,
    )
    db.add(user)
    db.flush()
    return user


def _make_caf(
    db,
    empresa_id,
    tipo_dte="33",
    num_inicio=1,
    num_fin=100,
    consumido=0,
    vigente=True,
    fecha_vencimiento=None,
):
    caf = CAF(
        empresa_id=empresa_id,
        tipo_dte=tipo_dte,
        num_inicio=num_inicio,
        num_fin=num_fin,
        archivo_xml="<dummy/>",
        vigente=vigente,
        consumido=consumido,
        fecha_vencimiento=fecha_vencimiento,
    )
    db.add(caf)
    db.flush()
    return caf


# ---------------------------------------------------------------------------
# Unit tests for helpers
# ---------------------------------------------------------------------------

class TestGetAlertCafs:
    def test_low_stock_caf_included(self, db):
        empresa = _make_empresa(db)
        _make_caf(db, empresa.id, consumido=95)  # 95% consumed → low stock
        db.commit()

        alerts = _get_alert_cafs(db, empresa.id)
        assert len(alerts) == 1

    def test_expiring_soon_caf_included(self, db):
        empresa = _make_empresa(db)
        soon = date.today() + timedelta(days=10)
        _make_caf(db, empresa.id, consumido=0, fecha_vencimiento=soon)
        db.commit()

        alerts = _get_alert_cafs(db, empresa.id)
        assert len(alerts) == 1

    def test_vigente_false_excluded(self, db):
        empresa = _make_empresa(db)
        _make_caf(db, empresa.id, consumido=95, vigente=False)
        db.commit()

        alerts = _get_alert_cafs(db, empresa.id)
        assert len(alerts) == 0

    def test_healthy_caf_excluded(self, db):
        empresa = _make_empresa(db)
        _make_caf(db, empresa.id, consumido=50)  # 50% → not low stock
        db.commit()

        alerts = _get_alert_cafs(db, empresa.id)
        assert len(alerts) == 0

    def test_mixed_cafs(self, db):
        empresa = _make_empresa(db)
        _make_caf(db, empresa.id, tipo_dte="33", consumido=95)      # alert
        _make_caf(db, empresa.id, tipo_dte="34", consumido=50)      # healthy
        _make_caf(db, empresa.id, tipo_dte="39", consumido=95, vigente=False)  # excluded
        db.commit()

        alerts = _get_alert_cafs(db, empresa.id)
        assert len(alerts) == 1
        assert alerts[0].tipo_dte == "33"


# ---------------------------------------------------------------------------
# Unit tests for _procesar_empresa_caf
# ---------------------------------------------------------------------------

class TestProcesarEmpresaCaf:
    @patch("app.tasks.caf.enviar_recordatorio")
    def test_alert_caf_sends_email_to_admin(self, mock_email, db):
        empresa = _make_empresa(db)
        _make_user(db, empresa.id, role="admin", email="admin@empresa.cl")
        _make_caf(db, empresa.id, consumido=95)
        db.commit()

        sent = _procesar_empresa_caf(db, empresa)
        assert sent == 1
        mock_email.assert_called_once()
        call_args = mock_email.call_args
        assert call_args[0][0] == "admin@empresa.cl"
        assert "Alerta CAF" in call_args[0][1]
        assert "Tipo DTE 33" in call_args[0][2]

    @patch("app.tasks.caf.enviar_recordatorio")
    def test_no_alert_caf_sends_no_email(self, mock_email, db):
        empresa = _make_empresa(db)
        _make_user(db, empresa.id, role="admin", email="admin@empresa.cl")
        _make_caf(db, empresa.id, consumido=50)  # healthy
        db.commit()

        sent = _procesar_empresa_caf(db, empresa)
        assert sent == 0
        mock_email.assert_not_called()

    @patch("app.tasks.caf.enviar_recordatorio")
    def test_vigente_false_not_included(self, mock_email, db):
        empresa = _make_empresa(db)
        _make_user(db, empresa.id, role="admin", email="admin@empresa.cl")
        _make_caf(db, empresa.id, consumido=95, vigente=False)
        db.commit()

        sent = _procesar_empresa_caf(db, empresa)
        assert sent == 0
        mock_email.assert_not_called()

    @patch("app.tasks.caf.enviar_recordatorio")
    def test_non_admin_does_not_receive_email(self, mock_email, db):
        empresa = _make_empresa(db)
        _make_user(db, empresa.id, role="vendedor", email="vendedor@empresa.cl")
        _make_user(db, empresa.id, role="subadmin", email="subadmin@empresa.cl")
        _make_caf(db, empresa.id, consumido=95)
        db.commit()

        sent = _procesar_empresa_caf(db, empresa)
        assert sent == 0
        mock_email.assert_not_called()

    @patch("app.tasks.caf.enviar_recordatorio")
    def test_multiple_admins_each_get_email(self, mock_email, db):
        empresa = _make_empresa(db)
        _make_user(db, empresa.id, role="admin", email="admin1@empresa.cl")
        _make_user(db, empresa.id, role="admin", email="admin2@empresa.cl")
        _make_caf(db, empresa.id, consumido=95)
        db.commit()

        sent = _procesar_empresa_caf(db, empresa)
        assert sent == 2
        assert mock_email.call_count == 2
        recipients = {c[0][0] for c in mock_email.call_args_list}
        assert recipients == {"admin1@empresa.cl", "admin2@empresa.cl"}

    @patch("app.tasks.caf.enviar_recordatorio")
    def test_multiple_alert_cafs_consolidated_in_one_email(self, mock_email, db):
        empresa = _make_empresa(db)
        _make_user(db, empresa.id, role="admin", email="admin@empresa.cl")
        _make_caf(db, empresa.id, tipo_dte="33", consumido=95)
        soon = date.today() + timedelta(days=5)
        _make_caf(db, empresa.id, tipo_dte="34", consumido=0, fecha_vencimiento=soon)
        db.commit()

        sent = _procesar_empresa_caf(db, empresa)
        assert sent == 1
        mock_email.assert_called_once()
        body = mock_email.call_args[0][2]
        assert "Tipo DTE 33" in body
        assert "Tipo DTE 34" in body

    @patch("app.tasks.caf.enviar_recordatorio")
    def test_no_admin_users_returns_zero(self, mock_email, db):
        empresa = _make_empresa(db)
        # No admin users, only a vendedor
        _make_user(db, empresa.id, role="vendedor", email="vendedor@empresa.cl")
        _make_caf(db, empresa.id, consumido=95)
        db.commit()

        sent = _procesar_empresa_caf(db, empresa)
        assert sent == 0
        mock_email.assert_not_called()

    @patch("app.tasks.caf.enviar_recordatorio")
    def test_expiring_email_body_includes_days(self, mock_email, db):
        empresa = _make_empresa(db)
        _make_user(db, empresa.id, role="admin", email="admin@empresa.cl")
        soon = date.today() + timedelta(days=15)
        _make_caf(db, empresa.id, consumido=0, fecha_vencimiento=soon)
        db.commit()

        _procesar_empresa_caf(db, empresa)
        body = mock_email.call_args[0][2]
        assert "vence en 15 días" in body


# ---------------------------------------------------------------------------
# Integration test: full task invocation
# ---------------------------------------------------------------------------

class TestSendCafAlertsEmailTask:
    @patch("app.tasks.caf.enviar_recordatorio")
    def test_task_sends_email_for_alert_empresa(self, mock_email, db):
        empresa = _make_empresa(db)
        _make_user(db, empresa.id, role="admin", email="admin@empresa.cl")
        _make_caf(db, empresa.id, consumido=95)
        db.commit()

        send_caf_alerts_email()
        mock_email.assert_called_once()

    @patch("app.tasks.caf.enviar_recordatorio")
    def test_task_skips_empresa_with_no_alerts(self, mock_email, db):
        empresa = _make_empresa(db)
        _make_user(db, empresa.id, role="admin", email="admin@empresa.cl")
        _make_caf(db, empresa.id, consumido=10)  # healthy
        db.commit()

        send_caf_alerts_email()
        mock_email.assert_not_called()

    @patch("app.tasks.caf.enviar_recordatorio")
    def test_task_processes_multiple_empresas(self, mock_email, db):
        for i in range(3):
            emp = _make_empresa(db, nombre=f"Empresa {i}", rut=f"76.00{i}.001-1")
            _make_user(db, emp.id, role="admin", email=f"admin{i}@empresa.cl")
            _make_caf(db, emp.id, consumido=95)
        db.commit()

        send_caf_alerts_email()
        assert mock_email.call_count == 3
