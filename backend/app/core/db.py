from collections.abc import Iterator
from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends
from sqlalchemy import BigInteger, DateTime, Integer, MetaData, create_engine
from sqlalchemy.engine import Dialect
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.types import TypeDecorator

from app.core.config import get_settings

# 제약 조건 이름을 고정해 Alembic 마이그레이션이 DB 마다 같은 이름을 쓰게 합니다.
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

# PostgreSQL 에서는 bigint, 테스트용 SQLite 에서는 자동 증가가 되는 INTEGER 로 만듭니다.
BigIntPk = BigInteger().with_variant(Integer(), "sqlite")


class UtcDateTime(TypeDecorator[datetime]):
    """항상 UTC(시간대 포함)로 저장·조회하는 시각 컬럼. SQLite 처럼 시간대를 잃는 DB 에서도 UTC 로 돌려줍니다."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        if value is not None and value.tzinfo is None:
            raise ValueError("시간대가 없는 datetime 은 저장할 수 없습니다. datetime.now(UTC) 를 쓰세요.")
        return value.astimezone(UTC) if value is not None else None

    def process_result_value(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        if value is None:
            return None
        return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def utcnow() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


engine = create_engine(get_settings().database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """요청마다 세션 하나. 커밋은 서비스 함수가 하고, 커밋하지 않은 변경은 요청이 끝날 때 롤백됩니다."""
    with SessionLocal() as session:
        yield session


# 라우터에서 세션을 받을 때: def handler(db: DbSession)
DbSession = Annotated[Session, Depends(get_db)]
