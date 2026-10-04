import uuid
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.interviews.models  # noqa: F401  (테이블 등록)
import app.users.models  # noqa: F401  (테이블 등록)
from app.ai.providers import Message, ModelError, get_chat_model
from app.core.config import Settings, get_settings
from app.core.db import Base, get_db
from app.main import app

TEST_SECRET = "test-secret-for-unit-tests-only-32bytes-long"
TEST_PASSWORD = "password123"


def test_settings() -> Settings:
    return Settings(
        database_url="sqlite://",
        jwt_secret=TEST_SECRET,
        jwt_access_token_validity_seconds=600,
    )


@pytest.fixture
def db_session_factory() -> Iterator[sessionmaker[Session]]:
    """테스트마다 새 인메모리 SQLite. StaticPool 로 모든 세션이 같은 연결(같은 DB)을 씁니다."""
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    yield sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    engine.dispose()


class UnavailableModel:
    """기본 AI 모델: 테스트가 실제 AI 를 부르지 않도록 항상 실패합니다. 필요한 테스트는 가짜 모델로 바꿔 끼웁니다."""

    def complete(self, system: str, messages: list[Message]) -> str:
        raise ModelError("테스트에서는 AI 를 부르지 않습니다.")


@pytest.fixture
def client(db_session_factory: sessionmaker[Session]) -> Iterator[TestClient]:
    def override_get_db() -> Iterator[Session]:
        with db_session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_settings] = test_settings
    app.dependency_overrides[get_chat_model] = UnavailableModel
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def unique_email(prefix: str = "user") -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12]}@example.com"


@pytest.fixture
def auth_headers(client: TestClient) -> dict[str, str]:
    """고유한 사용자로 가입·로그인하고 {"Authorization": "Bearer ..."} 를 돌려줍니다."""
    email = unique_email()
    res = client.post("/api/auth/signup", json={"email": email, "password": TEST_PASSWORD, "name": "테스트"})
    assert res.status_code == 201, res.text
    res = client.post("/api/auth/login", json={"email": email, "password": TEST_PASSWORD})
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['accessToken']}"}
