"""add difficulty to career_records

Revision ID: a7d8e9f0b1c2
Revises: f3c9a1d7e2b4
Create Date: 2026-09-29 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a7d8e9f0b1c2'
down_revision: Union[str, Sequence[str], None] = 'f3c9a1d7e2b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('career_records', sa.Column('difficulty', sa.String(length=20), nullable=True, server_default='standard'))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('career_records', 'difficulty')
