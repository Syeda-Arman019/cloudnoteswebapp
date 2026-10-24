"""classes memberships invitations chat sharing

Revision ID: 436d22b6c72b
Revises: d8b3f60c92a4
Create Date: 2026-10-24 02:10:17.229420

Part 2 of CloudNotes: class collaboration.
  * study_classes      — a class/group (owner + name + description)
  * class_memberships  — unique (class, user) membership with role + last_read_at
  * class_invitations  — hashed join tokens with expiry / use limits / revocation
  * chat_messages      — persistent class chat with reply + tombstone delete
  * chat_attachments   — image/document/voice files, class-scoped
  * shared_class_id    — additive nullable column on notes/folders/study_files;
                         SET NULL on class deletion reverts resources to private.

The migration is purely additive (new tables + nullable columns). Existing
users, notes, categories, tags, folders, files and settings are untouched.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '436d22b6c72b'
down_revision = 'd8b3f60c92a4'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'study_classes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('owner_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=120), nullable=False),
        sa.Column('description', sa.String(length=400), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_study_classes_owner_id', 'study_classes', ['owner_id'], unique=False)

    op.create_table(
        'class_memberships',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('class_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('role', sa.String(length=16), nullable=False),
        sa.Column('last_read_at', sa.DateTime(), nullable=True),
        sa.Column('joined_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['class_id'], ['study_classes.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('class_id', 'user_id', name='uq_class_members_class_user'),
    )
    op.create_index('ix_class_memberships_class_id', 'class_memberships', ['class_id'], unique=False)
    op.create_index('ix_class_members_user', 'class_memberships', ['user_id'], unique=False)
    op.create_index('ix_class_members_class_role', 'class_memberships', ['class_id', 'role'], unique=False)

    op.create_table(
        'class_invitations',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('class_id', sa.Integer(), nullable=False),
        sa.Column('token_hash', sa.String(length=64), nullable=False),
        sa.Column('created_by', sa.Integer(), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
        sa.Column('max_uses', sa.Integer(), nullable=True),
        sa.Column('use_count', sa.Integer(), nullable=False),
        sa.Column('revoked_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['class_id'], ['study_classes.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_class_invitations_token_hash', 'class_invitations', ['token_hash'], unique=False)
    op.create_index('ix_class_invitations_class', 'class_invitations', ['class_id'], unique=False)

    op.create_table(
        'chat_messages',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('class_id', sa.Integer(), nullable=False),
        sa.Column('sender_id', sa.Integer(), nullable=False),
        sa.Column('reply_to_id', sa.Integer(), nullable=True),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('is_deleted', sa.Boolean(), nullable=False),
        sa.Column('edited_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['class_id'], ['study_classes.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['sender_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['reply_to_id'], ['chat_messages.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_chat_messages_class_created', 'chat_messages', ['class_id', 'created_at'], unique=False)
    op.create_index('ix_chat_messages_class_id', 'chat_messages', ['class_id'], unique=False)
    op.create_index('ix_chat_messages_sender', 'chat_messages', ['sender_id'], unique=False)
    op.create_index('ix_chat_messages_reply_to_id', 'chat_messages', ['reply_to_id'], unique=False)

    op.create_table(
        'chat_attachments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('message_id', sa.Integer(), nullable=True),
        sa.Column('class_id', sa.Integer(), nullable=False),
        sa.Column('uploader_id', sa.Integer(), nullable=False),
        sa.Column('original_name', sa.String(length=255), nullable=False),
        sa.Column('stored_name', sa.String(length=64), nullable=False),
        sa.Column('mime_type', sa.String(length=120), nullable=False),
        sa.Column('size_bytes', sa.BigInteger(), nullable=False),
        sa.Column('kind', sa.String(length=16), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['message_id'], ['chat_messages.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['class_id'], ['study_classes.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['uploader_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('stored_name', name='uq_chat_attachments_stored_name'),
    )
    op.create_index('ix_chat_attachments_message', 'chat_attachments', ['message_id'], unique=False)
    op.create_index('ix_chat_attachments_class', 'chat_attachments', ['class_id'], unique=False)
    op.create_index('ix_chat_attachments_pending', 'chat_attachments', ['message_id', 'created_at'], unique=False)

    with op.batch_alter_table('folders', schema=None) as batch_op:
        batch_op.add_column(sa.Column('shared_class_id', sa.Integer(), nullable=True))
        batch_op.create_index('ix_folders_shared_class_id', ['shared_class_id'], unique=False)
        batch_op.create_foreign_key(
            'fk_folders_shared_class_id', 'study_classes',
            ['shared_class_id'], ['id'], ondelete='SET NULL',
        )

    with op.batch_alter_table('notes', schema=None) as batch_op:
        batch_op.add_column(sa.Column('shared_class_id', sa.Integer(), nullable=True))
        batch_op.create_index('ix_notes_shared_class_id', ['shared_class_id'], unique=False)
        batch_op.create_foreign_key(
            'fk_notes_shared_class_id', 'study_classes',
            ['shared_class_id'], ['id'], ondelete='SET NULL',
        )

    with op.batch_alter_table('study_files', schema=None) as batch_op:
        batch_op.add_column(sa.Column('shared_class_id', sa.Integer(), nullable=True))
        batch_op.create_index('ix_study_files_shared_class', ['shared_class_id'], unique=False)
        batch_op.create_foreign_key(
            'fk_study_files_shared_class_id', 'study_classes',
            ['shared_class_id'], ['id'], ondelete='SET NULL',
        )


def downgrade():
    with op.batch_alter_table('study_files', schema=None) as batch_op:
        batch_op.drop_constraint('fk_study_files_shared_class_id', type_='foreignkey')
        batch_op.drop_index('ix_study_files_shared_class')
        batch_op.drop_column('shared_class_id')

    with op.batch_alter_table('notes', schema=None) as batch_op:
        batch_op.drop_constraint('fk_notes_shared_class_id', type_='foreignkey')
        batch_op.drop_index('ix_notes_shared_class_id')
        batch_op.drop_column('shared_class_id')

    with op.batch_alter_table('folders', schema=None) as batch_op:
        batch_op.drop_constraint('fk_folders_shared_class_id', type_='foreignkey')
        batch_op.drop_index('ix_folders_shared_class_id')
        batch_op.drop_column('shared_class_id')

    op.drop_index('ix_chat_attachments_pending', table_name='chat_attachments')
    op.drop_index('ix_chat_attachments_class', table_name='chat_attachments')
    op.drop_index('ix_chat_attachments_message', table_name='chat_attachments')
    op.drop_table('chat_attachments')

    op.drop_index('ix_chat_messages_reply_to_id', table_name='chat_messages')
    op.drop_index('ix_chat_messages_class_id', table_name='chat_messages')
    op.drop_index('ix_chat_messages_sender', table_name='chat_messages')
    op.drop_index('ix_chat_messages_class_created', table_name='chat_messages')
    op.drop_table('chat_messages')

    op.drop_index('ix_class_invitations_class', table_name='class_invitations')
    op.drop_index('ix_class_invitations_token_hash', table_name='class_invitations')
    op.drop_table('class_invitations')

    op.drop_index('ix_class_members_class_role', table_name='class_memberships')
    op.drop_index('ix_class_members_user', table_name='class_memberships')
    op.drop_index('ix_class_memberships_class_id', table_name='class_memberships')
    op.drop_table('class_memberships')

    op.drop_index('ix_study_classes_owner_id', table_name='study_classes')
    op.drop_table('study_classes')
