"""add_fecha_vencimiento_to_cafs

Revision ID: i3j4k5l6m7n8
Revises: h2i3j4k5l6m7
Create Date: 2026-05-04 00:00:00.000000

Adds fecha_vencimiento (nullable Date) to cafs table and backfills from
archivo_xml using parse_caf_xml to extract FOLIO_VIGENCIA.
"""
import os
import sys
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import text

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
try:
    from app.services.caf_service import parse_caf_xml as _parse_caf_xml
except ImportError:
    _parse_caf_xml = None

revision: str = 'i3j4k5l6m7n8'
down_revision: Union[str, Sequence[str], None] = 'h2i3j4k5l6m7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('cafs', sa.Column('fecha_vencimiento', sa.Date(), nullable=True))

    # Backfill from archivo_xml
    if _parse_caf_xml is None:
        return
    bind = op.get_bind()
    rows = bind.execute(text("SELECT id, archivo_xml FROM cafs")).fetchall()
    for row in rows:
        try:
            parsed = _parse_caf_xml(row.archivo_xml)
            vigencia = parsed['tipos_folios'][0].get('folio_vigencia') if parsed['tipos_folios'] else None
            if vigencia:
                bind.execute(
                    text("UPDATE cafs SET fecha_vencimiento = :v WHERE id = :id"),
                    {"v": vigencia, "id": row.id}
                )
        except Exception as exc:
            print(f"CAF backfill: skipping row {row.id}: {exc}")


def downgrade() -> None:
    op.drop_column('cafs', 'fecha_vencimiento')
