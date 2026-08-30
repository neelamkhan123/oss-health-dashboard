"""add repo languages breakdown

Revision ID: f6ca8340a659
Revises: af86509c98d4
Create Date: 2026-08-30 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'f6ca8340a659'
down_revision: Union[str, None] = 'af86509c98d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Nullable, no default/backfill: existing repos read as "no breakdown
    # yet" (the frontend falls back to the single `language` field) until
    # their next sync populates it from GET /repos/{owner}/{name}/languages.
    op.add_column('repos', sa.Column('languages', postgresql.JSONB(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    op.drop_column('repos', 'languages')
