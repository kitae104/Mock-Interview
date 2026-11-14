"""career documents (resumes, cover letters, portfolio projects)

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-14
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

BIGINT = sa.BigInteger().with_variant(sa.Integer(), "sqlite")


def _owner_columns(table: str) -> list:
    return [
        sa.Column("id", BIGINT, nullable=False),
        sa.Column("user_id", BIGINT, nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f(f"fk_{table}_user_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f(f"pk_{table}")),
    ]


def _time_columns() -> list:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "resumes",
        *_owner_columns("resumes"),
        sa.Column("title", sa.String(length=100), nullable=False),
        sa.Column("target_role", sa.String(length=100), nullable=False),
        sa.Column("content", sa.JSON(), nullable=False),
        sa.Column("review", sa.JSON(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        *_time_columns(),
    )
    op.create_index("ix_resumes_user_id_updated_at", "resumes", ["user_id", "updated_at"])

    op.create_table(
        "cover_letters",
        *_owner_columns("cover_letters"),
        sa.Column("title", sa.String(length=100), nullable=False),
        sa.Column("company", sa.String(length=100), nullable=False),
        sa.Column("target_role", sa.String(length=100), nullable=False),
        sa.Column("job_posting", sa.Text(), nullable=True),
        sa.Column("items", sa.JSON(), nullable=False),
        sa.Column("review", sa.JSON(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        *_time_columns(),
    )
    op.create_index("ix_cover_letters_user_id_updated_at", "cover_letters", ["user_id", "updated_at"])

    op.create_table(
        "portfolio_projects",
        *_owner_columns("portfolio_projects"),
        sa.Column("title", sa.String(length=100), nullable=False),
        sa.Column("summary", sa.String(length=200), nullable=False),
        sa.Column("role", sa.String(length=100), nullable=False),
        sa.Column("period", sa.String(length=50), nullable=False),
        sa.Column("team_size", sa.Integer(), nullable=True),
        sa.Column("tech_stack", sa.JSON(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("achievements", sa.Text(), nullable=False),
        sa.Column("github_url", sa.String(length=300), nullable=False),
        sa.Column("demo_url", sa.String(length=300), nullable=False),
        sa.Column("featured", sa.Boolean(), nullable=False),
        sa.Column("assist", sa.JSON(), nullable=True),
        sa.Column("assisted_at", sa.DateTime(timezone=True), nullable=True),
        *_time_columns(),
    )
    op.create_index("ix_portfolio_projects_user_id_updated_at", "portfolio_projects", ["user_id", "updated_at"])


def downgrade() -> None:
    op.drop_index("ix_portfolio_projects_user_id_updated_at", table_name="portfolio_projects")
    op.drop_table("portfolio_projects")
    op.drop_index("ix_cover_letters_user_id_updated_at", table_name="cover_letters")
    op.drop_table("cover_letters")
    op.drop_index("ix_resumes_user_id_updated_at", table_name="resumes")
    op.drop_table("resumes")
