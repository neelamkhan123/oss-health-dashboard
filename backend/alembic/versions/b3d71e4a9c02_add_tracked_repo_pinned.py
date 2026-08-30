"""add tracked_repos.pinned

Revision ID: b3d71e4a9c02
Revises: f6ca8340a659
Create Date: 2026-08-30 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b3d71e4a9c02'
down_revision: Union[str, None] = 'f6ca8340a659'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # server_default, not just the model-side default: existing rows need a
    # value for the NOT NULL to hold, and every one of them is "not pinned".
    op.add_column(
        'tracked_repos',
        sa.Column('pinned', sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column('tracked_repos', 'pinned')
