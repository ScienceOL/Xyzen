"""add unique constraint to file_knowledge_set_link

Revision ID: a1b2c3d4e5f6
Revises: d8382cb0b992
Create Date: 2026-02-14 18:00:00.000000

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "d8382cb0b992"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Remove any existing duplicates before adding the constraint
    # Use DISTINCT ON (PostgreSQL) since MIN(uuid) is not supported
    op.execute("""
        DELETE FROM fileknowledgesetlink
        WHERE id NOT IN (
            SELECT DISTINCT ON (file_id, knowledge_set_id) id
            FROM fileknowledgesetlink
            ORDER BY file_id, knowledge_set_id, created_at ASC
        )
    """)
    op.create_unique_constraint(
        "uq_file_knowledge_set_link",
        "fileknowledgesetlink",
        ["file_id", "knowledge_set_id"],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("uq_file_knowledge_set_link", "fileknowledgesetlink", type_="unique")
