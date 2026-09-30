"""sla window persistence: the rolling SLA sample window and the short error-budget burn-rate
history are now persisted in full, not just their derived scalar averages, so a restart's next
tick produces exactly the same calculation an uninterrupted process would have produced

Revision ID: b7d4f8a2c1e6
Revises: f3c9a1d7e2b4
Create Date: 2026-09-29 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b7d4f8a2c1e6'
down_revision: Union[str, Sequence[str], None] = 'f3c9a1d7e2b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # nullable: a row written before this migration has no persisted window to restore, and
    # falls back to the previous single-value-seed behavior (see simulator.py's restore path)
    op.add_column('game_sessions', sa.Column('sla_window_json', sa.Text(), nullable=True))
    op.add_column('game_sessions', sa.Column('error_budget_history_json', sa.Text(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('game_sessions', 'error_budget_history_json')
    op.drop_column('game_sessions', 'sla_window_json')
