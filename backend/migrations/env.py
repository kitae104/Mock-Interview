from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool

# 모델 모듈을 모두 import 해야 autogenerate 가 테이블을 찾습니다. 새 도메인을 만들면 여기에 추가하세요.
import app.interviews.models  # noqa: F401
import app.users.models  # noqa: F401
from app.core.config import get_settings
from app.core.db import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def database_url() -> str:
    # 테스트 등에서 alembic Config 에 sqlalchemy.url 을 넣으면 그 값을, 아니면 DATABASE_URL 을 씁니다.
    return config.get_main_option("sqlalchemy.url") or get_settings().database_url


def run_migrations_offline() -> None:
    context.configure(
        url=database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = create_engine(database_url(), poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            render_as_batch=connection.dialect.name == "sqlite",
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
