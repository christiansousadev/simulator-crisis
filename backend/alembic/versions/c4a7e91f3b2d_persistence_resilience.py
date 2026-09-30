"""persistence resilience: restorable difficulty/scenario/reputation/cooldowns/rng, resumable
incidents, schema versioning, career-record recovery flag

Revision ID: c4a7e91f3b2d
Revises: 8907816f55ab
Create Date: 2026-09-29 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'c4a7e91f3b2d'
down_revision: Union[str, Sequence[str], None] = '8907816f55ab'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # every new column is nullable or carries a server_default so ALTER TABLE ADD COLUMN succeeds
    # against an already-populated sqlite table, and so a session row written before this
    # migration restores with exactly the behavior it had before (see simulator.py's restore path)
    op.add_column('game_sessions', sa.Column('schema_version', sa.Integer(), nullable=False, server_default='1'))
    op.add_column('game_sessions', sa.Column('difficulty', sa.String(length=20), nullable=False, server_default='standard'))
    op.add_column('game_sessions', sa.Column('reputation', sa.Numeric(precision=5, scale=2), nullable=False, server_default='50.00'))
    op.add_column('game_sessions', sa.Column('scenario_id', sa.String(length=50), nullable=True))
    op.add_column('game_sessions', sa.Column('scenario_state_json', sa.Text(), nullable=True))
    op.add_column('game_sessions', sa.Column('mitigation_cooldowns_json', sa.Text(), nullable=True))
    op.add_column('game_sessions', sa.Column('temporary_hazard_effects_json', sa.Text(), nullable=True))
    op.add_column('game_sessions', sa.Column('quiet_ticks', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('game_sessions', sa.Column('random_state_json', sa.Text(), nullable=True))

    op.add_column('incidents', sa.Column('log_lines_json', sa.Text(), nullable=True))
    op.add_column('incidents', sa.Column('root_cause_line_id', sa.String(length=20), nullable=True))
    op.add_column('incidents', sa.Column('triage_wrong_attempts', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('incidents', sa.Column('triage_accuracy', sa.Numeric(precision=4, scale=3), nullable=True))

    op.add_column('career_records', sa.Column('recovered_from_snapshot', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('career_records', 'recovered_from_snapshot')

    op.drop_column('incidents', 'triage_accuracy')
    op.drop_column('incidents', 'triage_wrong_attempts')
    op.drop_column('incidents', 'root_cause_line_id')
    op.drop_column('incidents', 'log_lines_json')

    op.drop_column('game_sessions', 'random_state_json')
    op.drop_column('game_sessions', 'quiet_ticks')
    op.drop_column('game_sessions', 'temporary_hazard_effects_json')
    op.drop_column('game_sessions', 'mitigation_cooldowns_json')
    op.drop_column('game_sessions', 'scenario_state_json')
    op.drop_column('game_sessions', 'scenario_id')
    op.drop_column('game_sessions', 'reputation')
    op.drop_column('game_sessions', 'difficulty')
    op.drop_column('game_sessions', 'schema_version')
