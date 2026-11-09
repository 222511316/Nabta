"""Follow-up: plant tasks with in-app reminders, dated notes, and research consent (US18, US19, US22).

Revision ID: 0006_followup
Revises: 0005_plant_reports
Create Date: 2026-10-27 20:53:42.526723

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0006_followup'
down_revision: Union[str, Sequence[str], None] = '0005_plant_reports'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('notes',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('plant_id', sa.Integer(), nullable=False),
    sa.Column('noted_on', sa.Date(), nullable=False),
    sa.Column('body', sa.Text(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['plant_id'], ['plants.id'], name=op.f('fk_notes_plant_id_plants'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_notes'))
    )
    with op.batch_alter_table('notes', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_notes_plant_id'), ['plant_id'], unique=False)

    op.create_table('tasks',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('plant_id', sa.Integer(), nullable=False),
    sa.Column('observation_id', sa.Integer(), nullable=True),
    sa.Column('pest_key', sa.String(length=40), nullable=True),
    sa.Column('title', sa.String(length=120), nullable=False),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('due_on', sa.Date(), nullable=True),
    sa.Column('done_at', sa.DateTime(), nullable=True),
    sa.Column('reminded_at', sa.DateTime(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['observation_id'], ['observations.id'], name=op.f('fk_tasks_observation_id_observations'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['plant_id'], ['plants.id'], name=op.f('fk_tasks_plant_id_plants'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_tasks'))
    )
    with op.batch_alter_table('tasks', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_tasks_plant_id'), ['plant_id'], unique=False)

    with op.batch_alter_table('notifications', schema=None) as batch_op:
        batch_op.add_column(sa.Column('task_id', sa.Integer(), nullable=True))
        batch_op.alter_column('case_id',
               existing_type=sa.INTEGER(),
               nullable=True)
        batch_op.create_foreign_key(batch_op.f('fk_notifications_task_id_tasks'), 'tasks', ['task_id'], ['id'], ondelete='CASCADE')
        # Notifications can now be task reminders too.
        batch_op.drop_constraint(op.f('ck_notifications_kind_valid'), type_='check')
        batch_op.create_check_constraint(
            op.f('ck_notifications_kind_valid'),
            "kind IN ('question_asked', 'grower_replied', 'feedback_sent', 'task_due')",
        )

    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('research_consent', sa.Boolean(), server_default=sa.text('0'), nullable=False))
        batch_op.add_column(sa.Column('research_consent_at', sa.DateTime(), nullable=True))



def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('research_consent_at')
        batch_op.drop_column('research_consent')

    # Task reminders have no case and can't exist before this revision; their tasks are dropped below.
    # (Without this the downgrade failed on any database with a reminder: supervisor review DEF-02 tests.)
    op.execute("DELETE FROM notifications WHERE kind = 'task_due'")

    with op.batch_alter_table('notifications', schema=None) as batch_op:
        batch_op.drop_constraint(op.f('ck_notifications_kind_valid'), type_='check')
        batch_op.create_check_constraint(
            op.f('ck_notifications_kind_valid'), "kind IN ('question_asked', 'grower_replied', 'feedback_sent')"
        )
        batch_op.drop_constraint(batch_op.f('fk_notifications_task_id_tasks'), type_='foreignkey')
        batch_op.alter_column('case_id',
               existing_type=sa.INTEGER(),
               nullable=False)
        batch_op.drop_column('task_id')

    with op.batch_alter_table('tasks', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_tasks_plant_id'))

    op.drop_table('tasks')
    with op.batch_alter_table('notes', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_notes_plant_id'))

    op.drop_table('notes')
