import pytest
from pydantic import BaseModel

from app.ai.providers import Message, ModelError
from app.ai.structured import complete_json, extract_json


class Answer(BaseModel):
    value: int


class ScriptedModel:
    """미리 정한 응답을 차례로 돌려주고 받은 메시지를 기록합니다."""

    def __init__(self, *replies: str) -> None:
        self.replies = list(replies)
        self.systems: list[str] = []
        self.calls: list[list[Message]] = []

    def complete(self, system: str, messages: list[Message]) -> str:
        self.systems.append(system)
        self.calls.append([dict(m) for m in messages])
        return self.replies.pop(0)


def test_extract_json_plain_fenced_and_surrounded():
    assert extract_json('{"a": 1}') == {"a": 1}
    assert extract_json('```json\n{"a": 1}\n```') == {"a": 1}
    assert extract_json('결과입니다.\n{"a": {"b": 2}}\n끝') == {"a": {"b": 2}}


@pytest.mark.parametrize("text", ["", "그냥 문장", "{깨진 json", "[1, 2]"])
def test_extract_json_rejects_non_objects(text):
    with pytest.raises(ValueError):
        extract_json(text)


def test_payload_is_sent_as_a_json_user_message():
    model = ScriptedModel('{"value": 3}')
    assert complete_json(model, "시스템", {"text": '안녕\n"인용"'}, Answer).value == 3
    assert model.systems == ["시스템"]
    (message,) = model.calls[0]
    assert message["role"] == "user"
    assert message["content"] == '<입력>\n{"text": "안녕\\n\\"인용\\""}\n</입력>'


def test_retries_once_with_the_error_and_previous_answer():
    model = ScriptedModel("JSON 아님", '{"value": 1}')
    assert complete_json(model, "s", {}, Answer).value == 1
    assert [m["role"] for m in model.calls[1]] == ["user", "assistant", "user"]
    assert model.calls[1][1]["content"] == "JSON 아님"
    assert "JSON 형식 오류" in model.calls[1][2]["content"]


def test_schema_violation_is_retried_and_error_names_only_the_field():
    model = ScriptedModel('{"value": "비밀 사용자 텍스트"}', '{"value": 2}')
    assert complete_json(model, "s", {}, Answer).value == 2
    feedback = model.calls[1][2]["content"]
    assert "value" in feedback and "비밀 사용자 텍스트" not in feedback


def test_gives_up_after_the_retry():
    model = ScriptedModel("나쁨", "또 나쁨")
    with pytest.raises(ModelError):
        complete_json(model, "s", {}, Answer)
    assert len(model.calls) == 2


def test_retries_can_be_disabled():
    model = ScriptedModel("나쁨")
    with pytest.raises(ModelError):
        complete_json(model, "s", {}, Answer, retries=0)
    assert len(model.calls) == 1


def test_validate_hook_can_transform_or_force_a_retry():
    def check(result: Answer) -> Answer:
        if result.value < 10:
            raise ValueError("10 이상이어야 합니다")
        return Answer(value=result.value * 2)

    model = ScriptedModel('{"value": 1}', '{"value": 10}')
    assert complete_json(model, "s", {}, Answer, validate=check).value == 20
    assert "10 이상이어야 합니다" in model.calls[1][2]["content"]


def test_model_error_is_not_swallowed():
    class Failing:
        def complete(self, system, messages):
            raise ModelError("연결 실패")

    with pytest.raises(ModelError, match="연결 실패"):
        complete_json(Failing(), "s", {}, Answer)
