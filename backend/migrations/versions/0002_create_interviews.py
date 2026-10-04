"""create interviews

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-04 18:50:48.388609
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:

    op.create_table(
        "interviews",
        sa.Column("id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), nullable=False),
        sa.Column("user_id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), nullable=False),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column("field", sa.String(length=100), nullable=False),
        sa.Column(
            "level",
            sa.Enum("NEWCOMER", "EXPERIENCED", name="interviewlevel", native_enum=False, length=20),
            nullable=False,
        ),
        sa.Column("question_count", sa.Integer(), nullable=False),
        sa.Column("job_posting", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.Enum("READY", "IN_PROGRESS", "COMPLETED", name="interviewstatus", native_enum=False, length=20),
            nullable=False,
        ),
        sa.Column("max_answer_seconds", sa.Integer(), nullable=False),
        sa.Column("prep_seconds", sa.Integer(), nullable=False),
        sa.Column("nonverbal_enabled", sa.Boolean(), nullable=False),
        sa.Column("consented_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("consent_version", sa.String(length=20), nullable=True),
        sa.Column("baseline", sa.JSON(), nullable=True),
        sa.Column("overall_score", sa.Integer(), nullable=True),
        sa.Column("report", sa.JSON(), nullable=True),
        sa.Column("report_generated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_interviews_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_interviews")),
    )
    with op.batch_alter_table("interviews", schema=None) as batch_op:
        batch_op.create_index("ix_interviews_user_id_created_at", ["user_id", "created_at"], unique=False)

    op.create_table(
        "interview_questions",
        sa.Column("id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), nullable=False),
        sa.Column("interview_id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), nullable=False),
        sa.Column("seq", sa.Integer(), nullable=False),
        sa.Column(
            "category",
            sa.Enum(
                "SELF_INTRO",
                "MOTIVATION",
                "JOB_KNOWLEDGE",
                "EXPERIENCE",
                "SITUATION",
                "PERSONALITY",
                "CLOSING",
                name="questioncategory",
                native_enum=False,
                length=20,
            ),
            nullable=False,
        ),
        sa.Column("text", sa.String(length=500), nullable=False),
        sa.Column("intent", sa.String(length=500), nullable=False),
        sa.Column("expected_points", sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(
            ["interview_id"],
            ["interviews.id"],
            name=op.f("fk_interview_questions_interview_id_interviews"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_interview_questions")),
        sa.UniqueConstraint("interview_id", "seq", name=op.f("uq_interview_questions_interview_id")),
    )
    op.create_table(
        "interview_answers",
        sa.Column("id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), nullable=False),
        sa.Column("question_id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), nullable=False),
        sa.Column("interview_id", sa.BigInteger().with_variant(sa.Integer(), "sqlite"), nullable=False),
        sa.Column("transcript", sa.Text(), nullable=False),
        sa.Column("words", sa.JSON(), nullable=False),
        sa.Column("language", sa.String(length=10), nullable=True),
        sa.Column("audio_seconds", sa.Float(), nullable=False),
        sa.Column("client_seconds", sa.Float(), nullable=True),
        sa.Column("timed_out", sa.Boolean(), nullable=False),
        sa.Column("speech_metrics", sa.JSON(), nullable=False),
        sa.Column("nonverbal_metrics", sa.JSON(), nullable=True),
        sa.Column("feedback", sa.JSON(), nullable=True),
        sa.Column("score", sa.Integer(), nullable=True),
        sa.Column("feedback_generated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["interview_id"],
            ["interviews.id"],
            name=op.f("fk_interview_answers_interview_id_interviews"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["question_id"],
            ["interview_questions.id"],
            name=op.f("fk_interview_answers_question_id_interview_questions"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_interview_answers")),
        sa.UniqueConstraint("question_id", name=op.f("uq_interview_answers_question_id")),
    )
    with op.batch_alter_table("interview_answers", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_interview_answers_interview_id"), ["interview_id"], unique=False)


def downgrade() -> None:

    with op.batch_alter_table("interview_answers", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_interview_answers_interview_id"))

    op.drop_table("interview_answers")
    op.drop_table("interview_questions")
    with op.batch_alter_table("interviews", schema=None) as batch_op:
        batch_op.drop_index("ix_interviews_user_id_created_at")

    op.drop_table("interviews")
