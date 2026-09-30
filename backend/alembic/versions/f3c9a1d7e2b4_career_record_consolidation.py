"""career record consolidation: final tech debt/reputation/incident counts and the scenario's own
outcome/objectives payload, so a concluded run's full picture survives for post-incident/career
history instead of just a handful of scalar columns

Revision ID: f3c9a1d7e2b4
Revises: e5b6c8d1a9f0
Create Date: 2026-09-29 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'f3c9a1d7e2b4'
down_revision: Union[str, Sequence[str], None] = 'e5b6c8d1a9f0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # all nullable: a career_records row written before this migration genuinely has no
    # historical value for these fields, and none is fabricated
    op.add_column('career_records', sa.Column('final_tech_debt', sa.Integer(), nullable=True))
    op.add_column('career_records', sa.Column('final_reputation', sa.Numeric(precision=5, scale=2), nullable=True))
    op.add_column('career_records', sa.Column('incidents_total', sa.Integer(), nullable=True))
    op.add_column('career_records', sa.Column('incidents_resolved', sa.Integer(), nullable=True))
    op.add_column('career_records', sa.Column('scenario_outcome_json', sa.Text(), nullable=True))
    op.add_column('career_records', sa.Column('objectives_json', sa.Text(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('career_records', 'objectives_json')
    op.drop_column('career_records', 'scenario_outcome_json')
    op.drop_column('career_records', 'incidents_resolved')
    op.drop_column('career_records', 'incidents_total')
    op.drop_column('career_records', 'final_reputation')
    op.drop_column('career_records', 'final_tech_debt')
