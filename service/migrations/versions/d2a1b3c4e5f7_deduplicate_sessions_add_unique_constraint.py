"""deduplicate sessions and add unique constraint on (user_id, agent_id)

Revision ID: d2a1b3c4e5f7
Revises: c9f1d2e3b4a5
Create Date: 2026-02-19 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d2a1b3c4e5f7"
down_revision: Union[str, Sequence[str], None] = "c9f1d2e3b4a5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Deduplicate sessions and add partial unique index on (user_id, agent_id)."""

    # Step 1: For each (user_id, agent_id) group with duplicates, pick the keeper
    # (the one with the most recent updated_at). Build a temp table of duplicates.
    op.execute("""
        CREATE TEMP TABLE _dup_sessions AS
        SELECT s.id AS dup_id, keeper.id AS keeper_id
        FROM session s
        JOIN (
            SELECT DISTINCT ON (user_id, agent_id) id, user_id, agent_id
            FROM session
            WHERE agent_id IS NOT NULL
            ORDER BY user_id, agent_id, updated_at DESC
        ) keeper
            ON s.user_id = keeper.user_id
            AND s.agent_id = keeper.agent_id
            AND s.id != keeper.id
        WHERE s.agent_id IS NOT NULL
    """)

    # Step 2: Migrate topics from duplicate sessions to their keepers
    op.execute("""
        UPDATE topic
        SET session_id = d.keeper_id
        FROM _dup_sessions d
        WHERE topic.session_id = d.dup_id
    """)

    # Step 3: Migrate session-MCP links (ignore conflicts for composite PK)
    op.execute("""
        INSERT INTO sessionmcpserverlink (session_id, mcp_server_id)
        SELECT d.keeper_id, l.mcp_server_id
        FROM sessionmcpserverlink l
        JOIN _dup_sessions d ON l.session_id = d.dup_id
        ON CONFLICT DO NOTHING
    """)
    op.execute("""
        DELETE FROM sessionmcpserverlink
        USING _dup_sessions d
        WHERE sessionmcpserverlink.session_id = d.dup_id
    """)

    # Step 4: Migrate chat_share records
    op.execute("""
        UPDATE chatshare
        SET session_id = d.keeper_id
        FROM _dup_sessions d
        WHERE chatshare.session_id = d.dup_id
    """)

    # Step 5: Migrate consume records
    op.execute("""
        UPDATE consumerecord
        SET session_id = d.keeper_id
        FROM _dup_sessions d
        WHERE consumerecord.session_id = d.dup_id
    """)

    # Step 6: Delete duplicate sessions
    op.execute("""
        DELETE FROM session
        USING _dup_sessions d
        WHERE session.id = d.dup_id
    """)

    # Cleanup temp table
    op.execute("DROP TABLE _dup_sessions")

    # Step 7: Add partial unique index (NULL agent_id rows are excluded)
    op.create_index(
        "ix_session_user_id_agent_id_unique",
        "session",
        ["user_id", "agent_id"],
        unique=True,
        postgresql_where="agent_id IS NOT NULL",
    )


def downgrade() -> None:
    """Remove the unique index."""
    op.drop_index("ix_session_user_id_agent_id_unique", table_name="session")
