"""Analysis familiarity: how much the photo looks like the training photos, and why a result
is unclear ("unfamiliar" or "uncertain") (US10, R03).

Revision ID: 0004_familiarity
Revises: 0003_reviews
Create Date: 2026-10-18 18:05:52.949155

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0004_familiarity'
down_revision: Union[str, Sequence[str], None] = '0003_reviews'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('analyses', schema=None) as batch_op:
        batch_op.add_column(sa.Column('familiarity', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('unclear_reason', sa.String(length=20), nullable=True))
        batch_op.create_check_constraint(
            op.f('ck_analyses_unclear_reason_valid'), "unclear_reason IN ('unfamiliar', 'uncertain')"
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('analyses', schema=None) as batch_op:
        batch_op.drop_constraint(op.f('ck_analyses_unclear_reason_valid'), type_='check')
        batch_op.drop_column('unclear_reason')
        batch_op.drop_column('familiarity')
