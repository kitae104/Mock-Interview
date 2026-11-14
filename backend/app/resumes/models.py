from datetime import datetime
from typing import Any

from sqlalchemy import JSON, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, BigIntPk, UtcDateTime, utcnow


class Resume(Base):
    """이력서 (docs/PLAN.md 12.1). 섹션 내용은 content JSON 하나에 담습니다."""

    __tablename__ = "resumes"
    __table_args__ = (Index("ix_resumes_user_id_updated_at", "user_id", "updated_at"),)

    id: Mapped[int] = mapped_column(BigIntPk, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigIntPk, ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(100))
    target_role: Mapped[str] = mapped_column(String(100), default="")
    content: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    review: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(UtcDateTime(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime(), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UtcDateTime(), default=utcnow)
