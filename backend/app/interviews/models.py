import enum
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, Enum, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, BigIntPk, UtcDateTime, utcnow


class InterviewStatus(enum.StrEnum):
    READY = "READY"  # 질문 생성됨, 아직 시작 전
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"


class InterviewLevel(enum.StrEnum):
    NEWCOMER = "NEWCOMER"  # 신입
    EXPERIENCED = "EXPERIENCED"  # 경력


class QuestionCategory(enum.StrEnum):
    SELF_INTRO = "SELF_INTRO"  # 자기소개
    MOTIVATION = "MOTIVATION"  # 지원동기
    JOB_KNOWLEDGE = "JOB_KNOWLEDGE"  # 직무 지식
    EXPERIENCE = "EXPERIENCE"  # 경험·성과
    SITUATION = "SITUATION"  # 상황 대처
    PERSONALITY = "PERSONALITY"  # 인성·협업
    CLOSING = "CLOSING"  # 마무리


class Interview(Base):
    __tablename__ = "interviews"
    __table_args__ = (Index("ix_interviews_user_id_created_at", "user_id", "created_at"),)

    id: Mapped[int] = mapped_column(BigIntPk, primary_key=True)
    user_id: Mapped[int] = mapped_column(BigIntPk, ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(120))
    field: Mapped[str] = mapped_column(String(100))
    level: Mapped[InterviewLevel] = mapped_column(Enum(InterviewLevel, native_enum=False, length=20))
    question_count: Mapped[int] = mapped_column(Integer)
    job_posting: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[InterviewStatus] = mapped_column(
        Enum(InterviewStatus, native_enum=False, length=20), default=InterviewStatus.READY
    )
    max_answer_seconds: Mapped[int] = mapped_column(Integer, default=120)
    prep_seconds: Mapped[int] = mapped_column(Integer, default=10)
    nonverbal_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    consented_at: Mapped[datetime | None] = mapped_column(UtcDateTime(), nullable=True)
    consent_version: Mapped[str | None] = mapped_column(String(20), nullable=True)
    baseline: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    overall_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    report: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    report_generated_at: Mapped[datetime | None] = mapped_column(UtcDateTime(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime(), default=utcnow)
    started_at: Mapped[datetime | None] = mapped_column(UtcDateTime(), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(UtcDateTime(), nullable=True)

    questions: Mapped[list["InterviewQuestion"]] = relationship(
        back_populates="interview", cascade="all, delete-orphan", order_by="InterviewQuestion.seq"
    )


class InterviewQuestion(Base):
    __tablename__ = "interview_questions"
    __table_args__ = (UniqueConstraint("interview_id", "seq"),)

    id: Mapped[int] = mapped_column(BigIntPk, primary_key=True)
    interview_id: Mapped[int] = mapped_column(BigIntPk, ForeignKey("interviews.id", ondelete="CASCADE"))
    seq: Mapped[int] = mapped_column(Integer)  # 1부터
    category: Mapped[QuestionCategory] = mapped_column(Enum(QuestionCategory, native_enum=False, length=20))
    text: Mapped[str] = mapped_column(String(500))
    intent: Mapped[str] = mapped_column(String(500))  # 평가 의도. 면접이 끝나기 전에는 응답에서 제외
    expected_points: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)

    interview: Mapped[Interview] = relationship(back_populates="questions")
    answer: Mapped["InterviewAnswer | None"] = relationship(
        back_populates="question", uselist=False, cascade="all, delete-orphan"
    )


class InterviewAnswer(Base):
    __tablename__ = "interview_answers"

    id: Mapped[int] = mapped_column(BigIntPk, primary_key=True)
    question_id: Mapped[int] = mapped_column(
        BigIntPk, ForeignKey("interview_questions.id", ondelete="CASCADE"), unique=True
    )
    # 질문 조인 없이 면접 단위로 모으기 위한 중복 컬럼
    interview_id: Mapped[int] = mapped_column(BigIntPk, ForeignKey("interviews.id", ondelete="CASCADE"), index=True)
    transcript: Mapped[str] = mapped_column(Text, default="")
    words: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    language: Mapped[str | None] = mapped_column(String(10), nullable=True)
    audio_seconds: Mapped[float] = mapped_column(Float, default=0.0)
    client_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    timed_out: Mapped[bool] = mapped_column(Boolean, default=False)
    speech_metrics: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    nonverbal_metrics: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    feedback: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    feedback_generated_at: Mapped[datetime | None] = mapped_column(UtcDateTime(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime(), default=utcnow)

    question: Mapped[InterviewQuestion] = relationship(back_populates="answer")
