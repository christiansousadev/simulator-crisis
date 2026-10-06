"""merge_heads

Revision ID: fef99a15e754
Revises: a7d8e9f0b1c2, b7d4f8a2c1e6
Create Date: 2026-10-02 19:41:21.231448

"""
from typing import Sequence, Union

# revision identifiers, used by Alembic.
revision: str = 'fef99a15e754'
down_revision: Union[str, Sequence[str], None] = ('a7d8e9f0b1c2', 'b7d4f8a2c1e6')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
