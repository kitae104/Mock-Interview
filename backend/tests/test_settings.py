import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_short_jwt_secret_is_rejected():
    with pytest.raises(ValidationError, match="32바이트"):
        Settings(jwt_secret="too-short")


def test_cors_origins_are_split():
    settings = Settings(cors_allowed_origins="http://a.test, http://b.test,")
    assert settings.cors_origins == ["http://a.test", "http://b.test"]
