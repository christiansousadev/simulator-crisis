"""incident forensic facts: point-in-time tech debt and accrued surcharge, frozen at the moment
they actually happened, so the postmortem/AI-auditor pipeline never has to reconstruct an
incident's past from the session's current state

Revision ID: e5b6c8d1a9f0
Revises: c4a7e91f3b2d
Create Date: 2026-09-29 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'e5b6c8d1a9f0'
down_revision: Union[str, Sequence[str], None] = 'c4a7e91f3b2d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # nullable / server-defaulted so ALTER TABLE ADD COLUMN succeeds against an already-populated
    # table, and an incident row written before this migration restores as "unknown" (None) rather
    # than a fabricated guess -- see _build_incident_dossier's handling of these being null
    op.add_column('incidents', sa.Column('tech_debt_at_creation', sa.Integer(), nullable=True))
    op.add_column('incidents', sa.Column('tech_debt_at_resolution', sa.Integer(), nullable=True))
    op.add_column('incidents', sa.Column('accrued_surcharge', sa.Numeric(precision=12, scale=2), nullable=False, server_default='0'))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('incidents', 'accrued_surcharge')
    op.drop_column('incidents', 'tech_debt_at_resolution')
    op.drop_column('incidents', 'tech_debt_at_creation')
