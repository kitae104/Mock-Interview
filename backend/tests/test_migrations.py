from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect

BACKEND_DIR = Path(__file__).resolve().parent.parent


def upgraded_inspector(tmp_path):
    url = f"sqlite:///{tmp_path / 'migrate.db'}"
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", url)
    command.upgrade(config, "head")
    engine = create_engine(url)
    return engine, inspect(engine)


def test_alembic_upgrade_creates_users_table(tmp_path):
    engine, inspector = upgraded_inspector(tmp_path)
    try:
        assert "users" in inspector.get_table_names()
        columns = {c["name"] for c in inspector.get_columns("users")}
        assert columns == {"id", "email", "password", "name", "role", "created_at"}
    finally:
        engine.dispose()


def test_alembic_upgrade_creates_interview_tables(tmp_path):
    engine, inspector = upgraded_inspector(tmp_path)
    try:
        assert {"interviews", "interview_questions", "interview_answers"} <= set(inspector.get_table_names())

        def columns(table: str) -> set[str]:
            return {c["name"] for c in inspector.get_columns(table)}

        assert columns("interviews") == {
            "id", "user_id", "title", "field", "level", "question_count", "job_posting", "status",
            "max_answer_seconds", "prep_seconds", "nonverbal_enabled", "consented_at", "consent_version",
            "baseline", "overall_score", "report", "report_generated_at", "created_at", "started_at", "completed_at",
        }  # fmt: skip
        assert columns("interview_questions") == {
            "id", "interview_id", "seq", "category", "text", "intent", "expected_points",
        }  # fmt: skip
        assert columns("interview_answers") == {
            "id", "question_id", "interview_id", "transcript", "words", "language", "audio_seconds",
            "client_seconds", "timed_out", "speech_metrics", "nonverbal_metrics", "feedback", "score",
            "feedback_generated_at", "created_at",
        }  # fmt: skip

        # 질문은 면접 안에서 번호가 겹치지 않고, 질문 하나에 답변 하나만 둘 수 있다
        question_uniques = [u["column_names"] for u in inspector.get_unique_constraints("interview_questions")]
        assert ["interview_id", "seq"] in question_uniques
        answer_uniques = [u["column_names"] for u in inspector.get_unique_constraints("interview_answers")]
        assert ["question_id"] in answer_uniques
        index_names = {i["name"] for i in inspector.get_indexes("interviews")}
        assert "ix_interviews_user_id_created_at" in index_names
    finally:
        engine.dispose()
