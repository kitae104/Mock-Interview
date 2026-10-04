from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect

BACKEND_DIR = Path(__file__).resolve().parent.parent


def test_alembic_upgrade_creates_users_table(tmp_path):
    url = f"sqlite:///{tmp_path / 'migrate.db'}"
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", url)

    command.upgrade(config, "head")

    engine = create_engine(url)
    try:
        inspector = inspect(engine)
        assert "users" in inspector.get_table_names()
        columns = {c["name"] for c in inspector.get_columns("users")}
        assert columns == {"id", "email", "password", "name", "role", "created_at"}
    finally:
        engine.dispose()
