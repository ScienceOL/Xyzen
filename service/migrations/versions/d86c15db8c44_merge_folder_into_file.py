"""Merge folder into file

Revision ID: d86c15db8c44
Revises: 68c03283fcbd
Create Date: 2026-02-10 11:03:00.245712

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "d86c15db8c44"
down_revision: Union[str, Sequence[str], None] = "68c03283fcbd"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Merge folder table into file table."""

    # 1. Add new columns to file table (is_dir with server_default so existing rows get false)
    op.add_column("file", sa.Column("is_dir", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("file", sa.Column("parent_id", sa.Uuid(), nullable=True))
    op.create_index(op.f("ix_file_is_dir"), "file", ["is_dir"], unique=False)
    op.create_index(op.f("ix_file_parent_id"), "file", ["parent_id"], unique=False)

    # 2. Alter storage_key and content_type to nullable (directories won't have these)
    op.alter_column("file", "storage_key", existing_type=sa.VARCHAR(), nullable=True)
    op.alter_column("file", "content_type", existing_type=sa.VARCHAR(length=100), nullable=True)

    # 3. Migrate folder data into file table BEFORE dropping the folder table
    op.execute("""
        INSERT INTO file (
            id, user_id, original_filename, storage_key, content_type,
            file_size, scope, category, file_hash, is_deleted,
            message_id, status, is_dir, parent_id,
            created_at, updated_at, deleted_at
        )
        SELECT
            id, user_id, name, NULL, NULL,
            0, 'private', 'others', NULL, is_deleted,
            NULL, 'confirmed', true, parent_id,
            created_at, updated_at, deleted_at
        FROM folder
    """)

    # 4. Copy existing folder_id to parent_id for files that had a folder
    op.execute("""
        UPDATE file SET parent_id = folder_id WHERE folder_id IS NOT NULL
    """)

    # 5. Drop folder_id column and its index
    op.drop_index(op.f("ix_file_folder_id"), table_name="file")
    op.drop_column("file", "folder_id")

    # 6. Replace unique index on storage_key with partial unique index (NULL-safe)
    op.drop_index(op.f("ix_file_storage_key"), table_name="file")
    op.execute("""
        CREATE UNIQUE INDEX ix_file_storage_key ON file (storage_key) WHERE storage_key IS NOT NULL
    """)

    # 7. Drop folder table and its indexes
    op.drop_index(op.f("ix_folder_id"), table_name="folder")
    op.drop_index(op.f("ix_folder_is_deleted"), table_name="folder")
    op.drop_index(op.f("ix_folder_parent_id"), table_name="folder")
    op.drop_index(op.f("ix_folder_user_id"), table_name="folder")
    op.drop_table("folder")

    # 8. Remove server_default on is_dir (keep default in model only)
    op.alter_column("file", "is_dir", server_default=None)


def downgrade() -> None:
    """Reverse: recreate folder table, migrate data back, restore columns."""

    # 1. Recreate folder table
    op.create_table(
        "folder",
        sa.Column("user_id", sa.VARCHAR(), autoincrement=False, nullable=False),
        sa.Column("parent_id", sa.UUID(), autoincrement=False, nullable=True),
        sa.Column("name", sa.VARCHAR(length=255), autoincrement=False, nullable=False),
        sa.Column("is_deleted", sa.BOOLEAN(), autoincrement=False, nullable=False),
        sa.Column("id", sa.UUID(), autoincrement=False, nullable=False),
        sa.Column("created_at", postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=False),
        sa.Column("updated_at", postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=False),
        sa.Column("deleted_at", postgresql.TIMESTAMP(timezone=True), autoincrement=False, nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("folder_pkey")),
    )
    op.create_index(op.f("ix_folder_id"), "folder", ["id"], unique=False)
    op.create_index(op.f("ix_folder_is_deleted"), "folder", ["is_deleted"], unique=False)
    op.create_index(op.f("ix_folder_parent_id"), "folder", ["parent_id"], unique=False)
    op.create_index(op.f("ix_folder_user_id"), "folder", ["user_id"], unique=False)

    # 2. Migrate directory rows back to folder table
    op.execute("""
        INSERT INTO folder (id, user_id, parent_id, name, is_deleted, created_at, updated_at, deleted_at)
        SELECT id, user_id, parent_id, original_filename, is_deleted, created_at, updated_at, deleted_at
        FROM file
        WHERE is_dir = true
    """)

    # 3. Add folder_id column back to file
    op.add_column("file", sa.Column("folder_id", sa.UUID(), autoincrement=False, nullable=True))
    op.create_index(op.f("ix_file_folder_id"), "file", ["folder_id"], unique=False)

    # 4. Copy parent_id back to folder_id for non-directory files
    op.execute("""
        UPDATE file SET folder_id = parent_id WHERE is_dir = false AND parent_id IS NOT NULL
    """)

    # 5. Delete directory rows from file table
    op.execute("DELETE FROM file WHERE is_dir = true")

    # 6. Drop partial unique index, recreate standard unique index on storage_key
    op.execute("DROP INDEX IF EXISTS ix_file_storage_key")
    op.create_index(op.f("ix_file_storage_key"), "file", ["storage_key"], unique=True)

    # 7. Alter storage_key and content_type back to NOT NULL
    op.alter_column("file", "storage_key", existing_type=sa.VARCHAR(), nullable=False)
    op.alter_column("file", "content_type", existing_type=sa.VARCHAR(length=100), nullable=False)

    # 8. Drop new columns
    op.drop_index(op.f("ix_file_parent_id"), table_name="file")
    op.drop_index(op.f("ix_file_is_dir"), table_name="file")
    op.drop_column("file", "parent_id")
    op.drop_column("file", "is_dir")
