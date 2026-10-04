import time

import jwt

from tests.conftest import TEST_PASSWORD, TEST_SECRET, unique_email


def signup(client, email: str, password: str = TEST_PASSWORD, name: str = "홍길동"):
    return client.post("/api/auth/signup", json={"email": email, "password": password, "name": name})


def test_signup_login_and_fetch_me(client):
    res = signup(client, "  User@Example.com ", name="  홍길동  ")
    assert res.status_code == 201
    user = res.json()
    assert user["email"] == "user@example.com"  # 앞뒤 공백 제거 + 소문자
    assert user["name"] == "홍길동"
    assert user["role"] == "USER"
    assert set(user) == {"id", "email", "name", "role", "createdAt"}
    assert user["createdAt"].endswith("Z")
    assert "password" not in user

    res = client.post("/api/auth/login", json={"email": "USER@example.com", "password": TEST_PASSWORD})
    assert res.status_code == 200
    token = res.json()
    assert token["tokenType"] == "Bearer"
    assert token["expiresIn"] == 600
    assert token["user"]["email"] == "user@example.com"

    claims = jwt.decode(token["accessToken"], TEST_SECRET, algorithms=["HS256"])
    assert claims["sub"] == "user@example.com"
    assert claims["role"] == "USER"
    assert claims["exp"] - claims["iat"] == 600

    res = client.get("/api/users/me", headers={"Authorization": f"Bearer {token['accessToken']}"})
    assert res.status_code == 200
    assert res.json()["name"] == "홍길동"


def test_duplicate_signup_is_conflict(client):
    email = unique_email("dup")
    assert signup(client, email).status_code == 201
    res = signup(client, email.upper())
    assert res.status_code == 409
    assert res.json()["message"] == "이미 가입된 이메일입니다."


def test_invalid_signup_returns_field_errors(client):
    res = client.post("/api/auth/signup", json={"email": "not-an-email", "password": "short", "name": ""})
    assert res.status_code == 400
    body = res.json()
    assert body["status"] == 400
    assert body["message"] == "입력값을 확인해 주세요."
    assert body["errors"] == {
        "email": "올바른 이메일 형식이 아닙니다.",
        "password": "비밀번호는 8~64자여야 합니다.",
        "name": "이름을 입력해 주세요.",
    }


def test_missing_and_null_fields_use_not_blank_messages(client):
    res = client.post("/api/auth/signup", json={"email": None})
    assert res.status_code == 400
    assert res.json()["errors"] == {
        "email": "이메일을 입력해 주세요.",
        "password": "비밀번호를 입력해 주세요.",
        "name": "이름을 입력해 주세요.",
    }


def test_name_too_long(client):
    res = signup(client, unique_email(), name="가" * 51)
    assert res.status_code == 400
    assert res.json()["errors"] == {"name": "이름은 50자 이하여야 합니다."}


def test_password_over_bcrypt_limit_is_bad_request(client):
    res = signup(client, unique_email("long"), password="가" * 30)  # 30자 = 90바이트
    assert res.status_code == 400
    assert res.json()["message"] == "비밀번호가 너무 깁니다. 영문 72자, 한글 24자 이내로 입력해 주세요."


def test_wrong_password_is_unauthorized(client):
    email = unique_email("wrong")
    assert signup(client, email).status_code == 201
    res = client.post("/api/auth/login", json={"email": email, "password": "nope-nope"})
    assert res.status_code == 401
    assert res.json()["message"] == "이메일 또는 비밀번호가 올바르지 않습니다."


def test_unknown_email_is_unauthorized(client):
    res = client.post("/api/auth/login", json={"email": unique_email("none"), "password": TEST_PASSWORD})
    assert res.status_code == 401
    assert res.json()["message"] == "이메일 또는 비밀번호가 올바르지 않습니다."


def test_me_with_auth_headers(client, auth_headers):
    res = client.get("/api/users/me", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["role"] == "USER"


def test_me_without_token_is_unauthorized(client):
    res = client.get("/api/users/me")
    assert res.status_code == 401
    assert res.json()["message"] == "인증이 필요합니다."


def test_me_with_invalid_token_is_unauthorized(client):
    res = client.get("/api/users/me", headers={"Authorization": "Bearer not-a-jwt"})
    assert res.status_code == 401


def test_me_with_expired_token_is_unauthorized(client, auth_headers):
    email = client.get("/api/users/me", headers=auth_headers).json()["email"]
    now = int(time.time())
    expired = jwt.encode({"sub": email, "role": "USER", "iat": now - 20, "exp": now - 10}, TEST_SECRET)
    res = client.get("/api/users/me", headers={"Authorization": f"Bearer {expired}"})
    assert res.status_code == 401
    assert res.json()["message"] == "인증이 필요합니다."


def test_me_for_deleted_user_is_unauthorized(client):
    now = int(time.time())
    token = jwt.encode({"sub": unique_email("ghost"), "role": "USER", "iat": now, "exp": now + 60}, TEST_SECRET)
    assert client.get("/api/users/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401
