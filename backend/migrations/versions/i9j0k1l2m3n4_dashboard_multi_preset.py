"""dashboard multi-preset support

Revision ID: i9j0k1l2m3n4
Revises: h8i9j0k1l2m3
Create Date: 2026-04-19 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "i9j0k1l2m3n4"
down_revision: Union[str, None] = "h8i9j0k1l2m3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "dashboard_layouts_new",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("slot", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("name", sa.String(50), nullable=False, server_default="Principal"),
        sa.Column("layout_json", sa.Text(), nullable=False, server_default="'{}'"),
        sa.Column("updated_by", sa.Integer(), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("role", "slot", name="uq_dashboard_role_slot"),
    )
    op.execute(
        """
        INSERT INTO dashboard_layouts_new (role, slot, name, layout_json, updated_by, updated_at)
        SELECT role, 1, 'Principal', layout_json, updated_by, updated_at
        FROM dashboard_layouts
        """
    )
    op.drop_table("dashboard_layouts")
    op.rename_table("dashboard_layouts_new", "dashboard_layouts")


def downgrade() -> None:
    op.create_table(
        "dashboard_layouts_old",
        sa.Column("role", sa.String(20), primary_key=True),
        sa.Column("layout_json", sa.Text(), nullable=False, server_default="'{}'"),
        sa.Column("updated_by", sa.Integer(), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"], ondelete="SET NULL"),
    )
    op.execute(
        """
        INSERT INTO dashboard_layouts_old (role, layout_json, updated_by, updated_at)
        SELECT role, layout_json, updated_by, updated_at
        FROM dashboard_layouts WHERE slot = 1
        """
    )
    op.drop_table("dashboard_layouts")
    op.rename_table("dashboard_layouts_old", "dashboard_layouts")
