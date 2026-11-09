"""Plant reports: AI-written summaries of a plant's history, with the model that wrote them.

Revision ID: 0005_plant_reports
Revises: 0004_familiarity
Create Date: 2026-10-18 18:41:27.305486

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0005_plant_reports'
down_revision: Union[str, Sequence[str], None] = '0004_familiarity'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('plant_reports',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('plant_id', sa.Integer(), nullable=False),
    sa.Column('content', sa.JSON(), nullable=False),
    sa.Column('model', sa.String(length=80), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['plant_id'], ['plants.id'], name=op.f('fk_plant_reports_plant_id_plants'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_plant_reports'))
    )
    with op.batch_alter_table('plant_reports', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_plant_reports_plant_id'), ['plant_id'], unique=False)



def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('plant_reports', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_plant_reports_plant_id'))

    op.drop_table('plant_reports')
