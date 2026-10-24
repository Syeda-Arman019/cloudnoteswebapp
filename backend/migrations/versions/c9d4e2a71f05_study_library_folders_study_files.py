"""Study Library: folders + study_files (uploads metadata)

Purely additive — existing tables and rows are untouched, so every current
user, note, category and tag is preserved.

Revision ID: c9d4e2a71f05
Revises: 7b34f7726b72
Create Date: 2026-10-23 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c9d4e2a71f05'
down_revision = '7b34f7726b72'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'folders',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('parent_id', sa.Integer(), nullable=True),
        sa.Column('name', sa.String(length=80), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['parent_id'], ['folders.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'parent_id', 'name', name='uq_folders_user_parent_name'),
    )
    with op.batch_alter_table('folders', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_folders_user_id'), ['user_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_folders_parent_id'), ['parent_id'], unique=False)
        batch_op.create_index('ix_folders_user_parent', ['user_id', 'parent_id'], unique=False)

    op.create_table(
        'study_files',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('folder_id', sa.Integer(), nullable=True),
        sa.Column('original_name', sa.String(length=255), nullable=False),
        sa.Column('stored_name', sa.String(length=64), nullable=False),
        sa.Column('extension', sa.String(length=16), nullable=False),
        sa.Column('mime_type', sa.String(length=120), nullable=False),
        sa.Column('size_bytes', sa.BigInteger(), nullable=False),
        sa.Column('is_pinned', sa.Boolean(), nullable=False),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.Column('last_accessed_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['folder_id'], ['folders.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('stored_name', name='uq_study_files_stored_name'),
    )
    with op.batch_alter_table('study_files', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_study_files_user_id'), ['user_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_study_files_folder_id'), ['folder_id'], unique=False)
        batch_op.create_index('ix_study_files_user_deleted', ['user_id', 'deleted_at'], unique=False)
        batch_op.create_index('ix_study_files_user_folder', ['user_id', 'folder_id'], unique=False)
        batch_op.create_index('ix_study_files_user_pinned', ['user_id', 'is_pinned'], unique=False)
        batch_op.create_index('ix_study_files_user_accessed', ['user_id', 'last_accessed_at'], unique=False)


def downgrade():
    with op.batch_alter_table('study_files', schema=None) as batch_op:
        batch_op.drop_index('ix_study_files_user_accessed')
        batch_op.drop_index('ix_study_files_user_pinned')
        batch_op.drop_index('ix_study_files_user_folder')
        batch_op.drop_index('ix_study_files_user_deleted')
        batch_op.drop_index(batch_op.f('ix_study_files_folder_id'))
        batch_op.drop_index(batch_op.f('ix_study_files_user_id'))

    op.drop_table('study_files')
    with op.batch_alter_table('folders', schema=None) as batch_op:
        batch_op.drop_index('ix_folders_user_parent')
        batch_op.drop_index(batch_op.f('ix_folders_parent_id'))
        batch_op.drop_index(batch_op.f('ix_folders_user_id'))

    op.drop_table('folders')
