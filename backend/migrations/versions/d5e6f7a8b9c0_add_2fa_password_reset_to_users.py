"""add 2FA + password reset columns to users

Revision ID: d5e6f7a8b9c0
Revises: c4d5e6f7a8b9
Create Date: 2026-04-30 18:00:00.000000

Adds totp_secret, totp_enabled, totp_recovery_codes (hashed list),
password_reset_token_hash, password_reset_expires_at to users for W1-07.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "d5e6f7a8b9c0"
down_revision: Union[str, Sequence[str], None] = "c4d5e6f7a8b9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("totp_secret", sa.String(length=64), nullable=True))
        batch.add_column(
            sa.Column(
                "totp_enabled",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("false"),
            )
        )
        batch.add_column(sa.Column("totp_recovery_codes", sa.JSON(), nullable=True))
        batch.add_column(sa.Column("password_reset_token_hash", sa.String(length=128), nullable=True))
        batch.add_column(sa.Column("password_reset_expires_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_column("password_reset_expires_at")
        batch.drop_column("password_reset_token_hash")
        batch.drop_column("totp_recovery_codes")
        batch.drop_column("totp_enabled")
        batch.drop_column("totp_secret")
