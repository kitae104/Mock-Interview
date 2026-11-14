from datetime import datetime
from typing import Any

from sqlalchemy import JSON, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, BigIntPk, UtcDateTime, utcnow


class CoverLetter(Base):
    """자기소개서 (docs/PLAN.md 12.2). 문항·답변 목록은 items JSON 에 담습니다."""

    __tablename__ = "cover_letters"
    __table_args__ = (Index("ix_cover_letters_user_id_updated_at", "user_id", "updated_at"),)

    id: Mapped[int] = mapped_column(BigIntPk, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigIntPk, ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(100))
    company: Mapped[str] = mapped_column(String(100), default="")
    target_role: Mapped[str] = mapped_column(String(100), default="")
    job_posting: Mapped[str | None] = mapped_column(Text, nullable=True)
    items: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    review: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(UtcDateTime(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime(), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UtcDateTime(), default=utcnow)
