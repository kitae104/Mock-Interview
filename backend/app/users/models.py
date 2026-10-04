import enum
from datetime import datetime

from sqlalchemy import Enum, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, BigIntPk, UtcDateTime, utcnow


class Role(enum.StrEnum):
    USER = "USER"
    ADMIN = "ADMIN"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(BigIntPk, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    password: Mapped[str] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(50))
    # 이름(USER/ADMIN)을 문자열로 저장합니다 (Spring 의 EnumType.STRING 과 같음).
    role: Mapped[Role] = mapped_column(Enum(Role, native_enum=False, length=20), default=Role.USER)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime(), default=utcnow)
