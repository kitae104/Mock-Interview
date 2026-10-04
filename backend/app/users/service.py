from sqlalchemy import select
from sqlalchemy.orm import Session

from app.users.models import User


def find_by_email(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == email))


def exists_by_email(db: Session, email: str) -> bool:
    return db.scalar(select(User.id).where(User.email == email)) is not None
