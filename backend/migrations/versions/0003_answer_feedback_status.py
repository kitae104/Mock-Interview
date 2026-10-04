"""answer feedback status

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-04
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "interview_answers",
        sa.Column("feedback_status", sa.String(length=10), server_default="NONE", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("interview_answers", "feedback_status")
