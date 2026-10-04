from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.common.errors import register_error_handlers


def assert_error_shape(body: dict, status: int) -> None:
    assert set(body) == {"status", "message", "errors", "timestamp"}
    assert body["status"] == status
    assert body["message"]
    assert body["timestamp"].endswith("Z")


def test_health(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json() == {"status": "UP"}


def test_malformed_json_is_bad_request(client):
    res = client.post("/api/auth/signup", content="{not json", headers={"Content-Type": "application/json"})
    assert res.status_code == 400
    assert_error_shape(res.json(), 400)
    assert res.json()["message"] == "요청 본문을 읽을 수 없습니다. JSON 형식을 확인해 주세요."


def test_missing_body_is_bad_request(client):
    res = client.post("/api/auth/signup")
    assert res.status_code == 400
    assert res.json()["message"] == "요청 본문을 읽을 수 없습니다. JSON 형식을 확인해 주세요."


def test_unknown_path_is_not_found(client):
    res = client.get("/api/nope")
    assert res.status_code == 404
    assert_error_shape(res.json(), 404)
    assert res.json()["message"] == "요청한 경로를 찾을 수 없습니다."


def test_wrong_method_is_method_not_allowed(client):
    res = client.get("/api/auth/login")
    assert res.status_code == 405
    assert_error_shape(res.json(), 405)
    assert res.json()["message"] == "지원하지 않는 요청 방식입니다."


def test_unhandled_error_hides_internals():
    app = FastAPI()
    register_error_handlers(app)

    @app.get("/boom")
    def boom() -> None:
        raise RuntimeError("내부 비밀 정보")

    res = TestClient(app, raise_server_exceptions=False).get("/boom")
    assert res.status_code == 500
    assert_error_shape(res.json(), 500)
    assert "비밀" not in res.text
