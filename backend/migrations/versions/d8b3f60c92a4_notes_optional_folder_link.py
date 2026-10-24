"""Notes: optional folder_id link into the Study Library hierarchy

Additive — one nullable column + FK (SET NULL) + two indexes. Existing note
rows are untouched (folder_id = NULL).

Revision ID: d8b3f60c92a4
Revises: c9d4e2a71f05
Create Date: 2026-10-23 00:00:01.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd8b3f60c92a4'
down_revision = 'c9d4e2a71f05'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('notes', schema=None) as batch_op:
        batch_op.add_column(sa.Column('folder_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            'fk_notes_folder_id', 'folders', ['folder_id'], ['id'], ondelete='SET NULL'
        )
        batch_op.create_index(batch_op.f('ix_notes_folder_id'), ['folder_id'], unique=False)
        batch_op.create_index('ix_notes_user_folder', ['user_id', 'folder_id'], unique=False)


def downgrade():
    with op.batch_alter_table('notes', schema=None) as batch_op:
        batch_op.drop_index('ix_notes_user_folder')
        batch_op.drop_index(batch_op.f('ix_notes_folder_id'))
        batch_op.drop_constraint('fk_notes_folder_id', type_='foreignkey')
        batch_op.drop_column('folder_id')
