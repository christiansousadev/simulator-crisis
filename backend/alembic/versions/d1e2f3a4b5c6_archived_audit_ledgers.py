"""archived audit ledgers

Revision ID: d1e2f3a4b5c6
Revises: fef99a15e754
Create Date: 2026-10-15 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'd1e2f3a4b5c6'
down_revision: Union[str, Sequence[str], None] = 'fef99a15e754'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'archived_audit_ledgers',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('session_id', sa.String(length=36), nullable=False),
        sa.Column('archived_at', sa.DateTime(), nullable=True),
        sa.Column('final_tick', sa.Integer(), nullable=False),
        sa.Column('final_status', sa.String(length=20), nullable=False),
        sa.Column('final_budget', sa.Float(), nullable=False),
        sa.Column('event_count', sa.Integer(), nullable=False),
        sa.Column('incident_count', sa.Integer(), nullable=False),
        sa.Column('ledger_checksum', sa.String(length=64), nullable=False),
        sa.Column('summary_json', sa.Text(), nullable=False),
    )
    op.create_index('ix_archived_audit_ledgers_session_id', 'archived_audit_ledgers', ['session_id'])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_archived_audit_ledgers_session_id', table_name='archived_audit_ledgers')
    op.drop_table('archived_audit_ledgers')
