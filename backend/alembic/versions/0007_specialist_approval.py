"""Specialist approval: a specialist sees review cases only once the Nabta team has approved the account
(FR03, FR12, NFR05, NFR06; supervisor review OBS-14).

Existing specialist accounts start pending (approved_at stays empty): the team approves its own with
`python -m app.cli approve-specialist --email ...`. Growers ignore the column.

Revision ID: 0007_specialist_approval
Revises: 0006_followup
Create Date: 2026-11-08 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0007_specialist_approval'
down_revision: Union[str, Sequence[str], None] = '0006_followup'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('approved_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('approved_at')
