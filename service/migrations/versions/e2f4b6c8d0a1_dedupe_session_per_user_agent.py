"""dedupe sessions per user-agent and enforce uniqueness

Revision ID: e2f4b6c8d0a1
Revises: c9f1d2e3b4a5
Create Date: 2026-02-19 12:30:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e2f4b6c8d0a1"
down_revision: Union[str, Sequence[str], None] = "c9f1d2e3b4a5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Dedupe existing sessions and enforce one session per (user, agent)."""
    # Rank sessions by "activity recency" per (user_id, agent_id).
    # Canonical session = latest topic activity; fallback to session.updated_at.
    op.execute(
        """
        CREATE TEMP TABLE _session_dedupe_ranked AS
        WITH topic_activity AS (
            SELECT
                t.session_id,
                MAX(t.updated_at) AS latest_topic_updated_at
            FROM topic t
            GROUP BY t.session_id
        )
        SELECT
            s.id AS session_id,
            s.user_id,
            s.agent_id,
            ROW_NUMBER() OVER (
                PARTITION BY s.user_id, s.agent_id
                ORDER BY
                    COALESCE(ta.latest_topic_updated_at, s.updated_at) DESC,
                    s.created_at DESC,
                    s.id DESC
            ) AS rank_in_group
        FROM "session" s
        LEFT JOIN topic_activity ta ON ta.session_id = s.id;
        """
    )

    # Build old->canonical mapping for duplicate rows only.
    op.execute(
        """
        CREATE TEMP TABLE _session_merge_map AS
        SELECT
            losing.session_id AS old_session_id,
            winner.session_id AS canonical_session_id
        FROM _session_dedupe_ranked losing
        JOIN _session_dedupe_ranked winner
          ON losing.user_id = winner.user_id
         AND losing.agent_id IS NOT DISTINCT FROM winner.agent_id
         AND winner.rank_in_group = 1
        WHERE losing.rank_in_group > 1;
        """
    )

    # Re-point related records before deleting duplicate sessions.
    op.execute(
        """
        UPDATE topic t
        SET session_id = m.canonical_session_id
        FROM _session_merge_map m
        WHERE t.session_id = m.old_session_id;
        """
    )
    op.execute(
        """
        UPDATE consumerecord c
        SET session_id = m.canonical_session_id
        FROM _session_merge_map m
        WHERE c.session_id = m.old_session_id;
        """
    )
    op.execute(
        """
        UPDATE chatshare cs
        SET session_id = m.canonical_session_id
        FROM _session_merge_map m
        WHERE cs.session_id = m.old_session_id;
        """
    )

    # sessionmcpserverlink has a composite primary key; merge links with upsert.
    op.execute(
        """
        INSERT INTO sessionmcpserverlink (session_id, mcp_server_id)
        SELECT DISTINCT
            m.canonical_session_id,
            sml.mcp_server_id
        FROM sessionmcpserverlink sml
        JOIN _session_merge_map m ON sml.session_id = m.old_session_id
        WHERE m.canonical_session_id IS NOT NULL
          AND sml.mcp_server_id IS NOT NULL
        ON CONFLICT (session_id, mcp_server_id) DO NOTHING;
        """
    )
    op.execute(
        """
        DELETE FROM sessionmcpserverlink sml
        USING _session_merge_map m
        WHERE sml.session_id = m.old_session_id;
        """
    )

    # Delete duplicate sessions after references are moved.
    op.execute(
        """
        DELETE FROM "session" s
        USING _session_merge_map m
        WHERE s.id = m.old_session_id;
        """
    )

    # Enforce one active row per (user_id, agent_id) for non-default agents.
    op.create_index(
        "uq_session_user_agent_nonnull",
        "session",
        ["user_id", "agent_id"],
        unique=True,
        postgresql_where=sa.text("agent_id IS NOT NULL"),
    )
    # Enforce one default-agent session per user (agent_id is NULL).
    op.create_index(
        "uq_session_user_default_agent",
        "session",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("agent_id IS NULL"),
    )


def downgrade() -> None:
    """Drop uniqueness indexes."""
    op.drop_index("uq_session_user_default_agent", table_name="session")
    op.drop_index("uq_session_user_agent_nonnull", table_name="session")
