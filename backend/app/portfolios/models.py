from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, BigIntPk, UtcDateTime, utcnow


class PortfolioProject(Base):
    """포트폴리오 프로젝트 한 건 (docs/PLAN.md 12.3)."""

    __tablename__ = "portfolio_projects"
    __table_args__ = (Index("ix_portfolio_projects_user_id_updated_at", "user_id", "updated_at"),)

    id: Mapped[int] = mapped_column(BigIntPk, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigIntPk, ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(100))
    summary: Mapped[str] = mapped_column(String(200), default="")
    role: Mapped[str] = mapped_column(String(100), default="")
    period: Mapped[str] = mapped_column(String(50), default="")
    team_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tech_stack: Mapped[list[str]] = mapped_column(JSON, default=list)
    description: Mapped[str] = mapped_column(Text, default="")
    achievements: Mapped[str] = mapped_column(Text, default="")
    github_url: Mapped[str] = mapped_column(String(300), default="")
    demo_url: Mapped[str] = mapped_column(String(300), default="")
    featured: Mapped[bool] = mapped_column(Boolean, default=False)
    assist: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    assisted_at: Mapped[datetime | None] = mapped_column(UtcDateTime(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime(), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UtcDateTime(), default=utcnow)
