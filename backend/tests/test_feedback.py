"""답변별 피드백과 종합 리포트 (docs/PLAN.md 8장 ⑥)."""

import json

import pytest
from sqlalchemy import select

from app.ai.providers import get_chat_model
from app.ai.speech import Transcription, get_speech_to_text
from app.interviews.judgement import good_range, reference_for, speech_sentences
from app.interviews.models import Interview, InterviewAnswer, InterviewStatus, QuestionCategory
from app.interviews.scoring import combine, verdict_score
from app.interviews.speech_metrics import judge_speech
from app.interviews.thresholds import ANSWER_WEIGHTS
from app.main import app
from tests.fake_ai import FakeAi, feedback_json
from tests.test_answers import NONVERBAL, FakeSTT, add_interview, send, signup
from tests.test_answers import reset_rate_limiter as _reset_rate_limiter  # noqa: F401  (autouse)


@pytest.fixture
def ai(client) -> FakeAi:
    fake = FakeAi()
    app.dependency_overrides[get_chat_model] = lambda: fake
    return fake


@pytest.fixture
def stt(client) -> FakeSTT:
    fake = FakeSTT()
    app.dependency_overrides[get_speech_to_text] = lambda: fake
    return fake


@pytest.fixture
def owner(client, db_session_factory):
    headers, user_id = signup(client)
    return headers, add_interview(db_session_factory, user_id)


def stored_answers(db_session_factory) -> list[InterviewAnswer]:
    with db_session_factory() as db:
        return list(db.scalars(select(InterviewAnswer).order_by(InterviewAnswer.id)))


def finish(client, owner):
    headers, interview = owner
    return client.post(f"/api/interviews/{interview['id']}/finish", headers=headers)


def answer_all(client, owner, **kwargs):
    for index in range(3):
        assert send(client, owner, index, **kwargs).status_code == 201


# ---- 답변별 피드백 (답변 업로드 끝에서 만듦) ----


def test_upload_creates_feedback_with_server_computed_scores(client, owner, stt, ai):
    res = send(client, owner, 0)
    assert res.status_code == 201, res.text
    body = res.json()

    assert body["feedbackStatus"] == "DONE"
    feedback = body["feedback"]
    assert feedback["summary"] == "핵심은 전달했지만 사례가 부족합니다."
    assert feedback["strengths"] == ["결론을 먼저 말했습니다."]
    assert feedback["improvements"][0]["point"] == "구체적인 사례가 없습니다."
    assert feedback["betterAnswer"].startswith("저는 백엔드")
    scores = feedback["scores"]
    assert scores["content"] == 80 and scores["structure"] == 70  # LLM 이 매긴 점수
    assert 0 <= scores["delivery"] <= 100  # 말하기 판정에서 서버가 계산
    assert scores["nonverbal"] is None  # 비언어 지표를 보내지 않음
    # 가중치: 비언어를 뺀 나머지(50+20+20)로 100점 환산
    assert feedback["weights"] == {"content": 50, "structure": 20, "delivery": 20}
    expected = round((80 * 50 + 70 * 20 + scores["delivery"] * 20) / 90)
    assert body["score"] == expected


def test_llm_receives_judgement_sentences_not_raw_metrics(client, owner, stt, ai):
    send(client, owner, 0)
    (payload,) = ai.payloads("feedback")

    assert payload["transcript"].startswith("음 저는 백엔드")
    assert payload["question"]["intent"] == "의도1" and payload["question"]["category"] == "SELF_INTRO"
    assert payload["level"] == "신입" and payload["field"] == "백엔드 개발자"
    lines = payload["speechJudgements"]
    pace = next(line for line in lines if line.startswith("말하기 속도:"))
    assert "기준 250~330" in pace and "음절" in pace  # "말하기 속도: 조금 빠름(분당 380음절, 기준 250~330)" 모양
    assert any(line.startswith("답변 시간:") and "기준 40~90초" in line for line in lines)
    assert any(line.startswith("2초 이상 침묵: 가끔(1회, 기준 0회 이하)") for line in lines)
    # 지표 원값(키 이름)을 그대로 넘기지 않는다
    text = json.dumps(payload, ensure_ascii=False)
    for raw_key in ("syllablesPerMinute", "fillerPerMinute", "silenceCount", "speechSpanSeconds"):
        assert raw_key not in text
    assert payload["nonverbalJudgements"] is None


def test_reliable_nonverbal_is_judged_and_scored(client, owner, stt, ai):
    body = send(client, owner, 0, nonverbal=NONVERBAL).json()
    (payload,) = ai.payloads("feedback")
    lines = payload["nonverbalJudgements"]
    assert any(line.startswith("카메라 응시: 안정적(74%, 기준 70% 이상)") for line in lines)
    assert any(line.startswith("얼굴 보임: 안정적(98%") for line in lines)
    assert all("clientThresholds" not in line for line in lines)

    scores = body["feedback"]["scores"]
    assert scores["nonverbal"] is not None
    assert body["feedback"]["weights"] == ANSWER_WEIGHTS
    # 비언어 판정이 응답에도 들어 있고 기준 범위가 함께 온다
    verdicts = body["nonverbal"]["verdicts"]
    assert verdicts["gaze"] == {"level": "GOOD", "label": "안정적", "reference": "70% 이상"}
    assert verdicts["gesture"]["level"] == "NA"  # 손이 보이지 않아 측정 불가


def test_unreliable_nonverbal_is_excluded(client, owner, stt, ai):
    body = send(client, owner, 0, nonverbal={**NONVERBAL, "faceVisibleRatio": 0.3}).json()
    (payload,) = ai.payloads("feedback")
    assert payload["nonverbalJudgements"] is None  # 신뢰도가 낮으면 LLM 에도 보내지 않는다
    assert body["feedback"]["scores"]["nonverbal"] is None
    assert body["feedback"]["nonverbalComment"] is None
    assert "nonverbal" not in body["feedback"]["weights"]


def test_nonverbal_is_ignored_when_the_interview_turned_it_off(client, owner, stt, ai, db_session_factory):
    _, interview = owner
    with db_session_factory() as db:
        db.get(Interview, interview["id"]).nonverbal_enabled = False
        db.commit()
    body = send(client, owner, 0, nonverbal=NONVERBAL).json()
    assert ai.payloads("feedback")[0]["nonverbalJudgements"] is None
    assert body["feedback"]["scores"]["nonverbal"] is None


def test_broken_json_is_retried_once(client, owner, stt, ai):
    ai.feedback_replies = ["이건 JSON 이 아닙니다", feedback_json(content=90, structure=60)]
    body = send(client, owner, 0).json()
    assert len(ai.payloads("feedback")) == 2  # 한 번 재시도
    assert body["feedbackStatus"] == "DONE" and body["feedback"]["scores"]["content"] == 90


def test_scores_out_of_range_are_clamped_and_code_fences_are_stripped(client, owner, stt, ai):
    ai.feedback_replies = ["```json\n" + feedback_json(content=150, structure=-5) + "\n```"]
    scores = send(client, owner, 0).json()["feedback"]["scores"]
    assert scores["content"] == 100 and scores["structure"] == 0


def test_feedback_failure_keeps_the_answer_and_marks_it_failed(client, owner, stt, ai, db_session_factory):
    ai.feedback_replies = ["깨진 응답", "또 깨진 응답"]
    res = send(client, owner, 0)
    assert res.status_code == 201  # 답변 저장은 유지
    body = res.json()
    assert body["feedback"] is None and body["score"] is None and body["feedbackStatus"] == "FAILED"
    assert body["transcript"].startswith("음 저는 백엔드") and body["speech"] is not None
    (row,) = stored_answers(db_session_factory)
    assert row.feedback is None and row.feedback_status == "FAILED" and row.transcript


def test_model_outage_does_not_fail_the_upload(client, owner, stt, ai):
    ai.fail = True
    res = send(client, owner, 0)
    assert res.status_code == 201 and res.json()["feedbackStatus"] == "FAILED"


def test_empty_answer_gets_zero_content_and_a_no_answer_feedback(client, owner, db_session_factory):
    silent = Transcription(text="", words=[], duration=12.0, language=None, no_speech_probs=[0.99])
    fake_stt = FakeSTT(silent)
    app.dependency_overrides[get_speech_to_text] = lambda: fake_stt
    ai = FakeAi()
    app.dependency_overrides[get_chat_model] = lambda: ai

    body = send(client, owner, 0, duration_ms=12_000).json()
    assert body["transcript"] == "" and body["speech"]["metrics"]["noSpeech"] is True
    assert body["feedbackStatus"] == "DONE" and body["score"] == 0
    feedback = body["feedback"]
    assert feedback["noSpeech"] is True
    assert feedback["scores"] == {"content": 0, "structure": 0, "delivery": None, "nonverbal": None}
    assert feedback["summary"] == "답변이 인식되지 않았습니다. 마이크 설정을 확인하거나 다시 연습해 보세요."
    assert feedback["improvements"][0]["point"] == "답변 없음"
    assert ai.calls == []  # 빈 답변에는 AI 를 부르지 않는다


def test_overwriting_an_answer_replaces_the_feedback(client, owner, stt, ai):
    send(client, owner, 0)
    ai.feedback_replies = [feedback_json(content=10, structure=10)]
    res = send(client, owner, 0)
    assert res.status_code == 200
    assert res.json()["feedback"]["scores"]["content"] == 10 and len(ai.payloads("feedback")) == 2


def test_rate_limit_during_feedback_does_not_fail_the_upload(client, owner, stt, ai):
    from tests.test_answers import use_settings

    use_settings(interview_ai_rate_per_minute=1)  # 음성 인식이 한도를 다 써서 피드백은 호출 한도에 걸린다
    res = send(client, owner, 0)
    assert res.status_code == 201 and res.json()["feedbackStatus"] == "FAILED"
    assert ai.calls == []


# ---- 종합 리포트 (finish) ----


def test_finish_builds_the_report(client, owner, stt, ai, db_session_factory):
    answer_all(client, owner)
    ai.calls.clear()
    res = finish(client, owner)
    assert res.status_code == 200, res.text
    body = res.json()

    assert body["status"] == "COMPLETED" and body["completedAt"] is not None
    report = body["report"]
    assert report["summary"] == "전반적으로 안정적인 답변이었습니다."
    assert report["topStrengths"] == ["a", "b", "c"]  # 최대 3개
    assert [i["point"] for i in report["topImprovements"]] == ["사례 보강", "군말 줄이기"]
    assert report["topImprovements"][0]["evidenceSeqs"] == [1]  # 없는 질문 번호(99)는 버린다
    assert report["practicePlan"] == ["첫 문장에 결론 말하기", "STAR 구조로 사례 정리하기"]
    assert report["answeredCount"] == 3 and report["questionCount"] == 3
    assert report["generatedAt"]

    # 종합 점수와 영역별 점수는 서버가 계산한다 (답변 점수의 평균)
    scores = [q["answer"]["score"] for q in body["questions"]]
    assert body["overallScore"] == report["overallScore"] == round(sum(scores) / 3)
    assert report["categoryScores"]["content"] == 80 and report["categoryScores"]["structure"] == 70
    assert report["categoryScores"]["nonverbal"] is None
    # 지표 집계
    pace = report["aggregates"]["speech"]["pace"]
    assert (
        pace["name"] == "말하기 속도"
        and pace["reference"] == "250~330"
        and pace["verdict"]["level"] in {"GOOD", "FAIR", "POOR"}
    )
    assert report["aggregates"]["silenceCount"] == 3 and report["aggregates"]["silenceSeconds"] == 9.0
    assert report["aggregates"]["nonverbal"] is None

    # AI 는 리포트만 불렀다(피드백은 이미 있음). 답변 원문은 보내지 않는다.
    assert ai.kinds() == ["report"]
    (payload,) = ai.payloads("report")
    assert "transcript" not in json.dumps(payload) and "백엔드 백엔드" not in json.dumps(payload, ensure_ascii=False)
    assert len(payload["questions"]) == 3 and payload["questions"][0]["summary"]
    assert any(line.startswith("평균 말하기 속도:") for line in payload["aggregateJudgements"])

    with db_session_factory() as db:
        row = db.get(Interview, owner[1]["id"])
        assert row.overall_score == body["overallScore"] and row.report_generated_at is not None


def test_report_includes_nonverbal_aggregates_when_reliable(client, owner, stt, ai):
    answer_all(client, owner, nonverbal=NONVERBAL)
    report = finish(client, owner).json()["report"]
    nonverbal = report["aggregates"]["nonverbal"]
    assert nonverbal["gaze"]["value"] == 0.74 and nonverbal["gaze"]["verdict"]["level"] == "GOOD"
    assert report["nonverbalSummary"] == "참고값 기준으로 시선이 안정적입니다."
    assert report["categoryScores"]["nonverbal"] is not None


def test_finish_is_idempotent_and_does_not_call_the_ai_again(client, owner, stt, ai):
    answer_all(client, owner)
    first = finish(client, owner).json()
    ai.calls.clear()
    second = finish(client, owner)
    assert second.status_code == 200 and second.json()["report"] == first["report"]
    assert ai.calls == []


def test_finish_regenerates_failed_feedback_before_the_report(client, owner, stt, ai):
    ai.fail = True
    answer_all(client, owner)  # 피드백 생성은 모두 실패, 답변은 저장됨
    assert all(q["answer"]["feedbackStatus"] == "FAILED" for q in client.get(
        f"/api/interviews/{owner[1]['id']}", headers=owner[0]).json()["questions"])  # fmt: skip

    ai.fail = False
    ai.calls.clear()
    body = finish(client, owner).json()
    assert ai.kinds() == ["feedback"] * 3 + ["report"]
    assert all(q["answer"]["feedbackStatus"] == "DONE" and q["answer"]["score"] is not None for q in body["questions"])
    assert body["report"] is not None


def test_finish_only_regenerates_missing_feedback(client, owner, stt, ai):
    answer_all(client, owner)
    ai.fail = True
    send(client, owner, 1)  # 덮어쓰면서 이 답변만 피드백이 비게 됨
    ai.fail = False
    ai.calls.clear()
    finish(client, owner)
    assert ai.kinds() == ["feedback", "report"]
    assert ai.payloads("feedback")[0]["question"]["text"] == "REST 란?"


def test_finish_returns_502_when_feedback_still_fails_and_can_be_retried(client, owner, stt, ai, db_session_factory):
    ai.fail = True
    answer_all(client, owner)
    res = finish(client, owner)
    assert (
        res.status_code == 502 and res.json()["message"] == "AI 피드백을 만들지 못했습니다. 잠시 후 다시 시도해 주세요."
    )
    with db_session_factory() as db:
        row = db.get(Interview, owner[1]["id"])
        assert row.status == InterviewStatus.COMPLETED and row.report is None  # 면접은 끝난 상태로 남는다

    ai.fail = False
    res = finish(client, owner)
    assert res.status_code == 200 and res.json()["report"] is not None


def test_report_broken_json_is_retried_once(client, owner, stt, ai):
    answer_all(client, owner)
    ai.report_replies = ["깨진 JSON"]
    res = finish(client, owner)
    assert res.status_code == 200 and ai.kinds().count("report") == 2


def test_report_failure_is_502_and_keeps_feedback(client, owner, stt, ai):
    answer_all(client, owner)
    ai.report_replies = ["깨짐 1", "깨짐 2"]
    res = finish(client, owner)
    assert res.status_code == 502
    detail = client.get(f"/api/interviews/{owner[1]['id']}", headers=owner[0]).json()
    assert detail["status"] == "COMPLETED" and detail["report"] is None and detail["overallScore"] is None
    assert all(q["answer"]["feedbackStatus"] == "DONE" for q in detail["questions"])  # 피드백은 유지

    ai.calls.clear()
    assert finish(client, owner).status_code == 200  # 다시 만들기
    assert ai.kinds() == ["report"]  # 피드백은 다시 만들지 않는다


def test_report_includes_empty_answers_as_zero(client, owner, db_session_factory):
    silent = FakeSTT(Transcription(text="", words=[], duration=10.0, language=None, no_speech_probs=[0.99]))
    app.dependency_overrides[get_speech_to_text] = lambda: silent
    ai = FakeAi()
    app.dependency_overrides[get_chat_model] = lambda: ai
    answer_all(client, owner, duration_ms=10_000)
    body = finish(client, owner).json()
    assert body["overallScore"] == 0 and body["report"]["categoryScores"]["content"] == 0
    assert ai.kinds() == ["report"]  # 빈 답변은 피드백에 AI 를 쓰지 않는다


def test_finish_still_requires_every_question_to_be_answered(client, owner, stt, ai):
    send(client, owner, 0)
    res = finish(client, owner)
    assert res.status_code == 409 and ai.kinds() == ["feedback"]  # 리포트는 만들지 않는다


def test_other_users_get_404_for_feedback_and_report(client, owner, stt, ai):
    answer_all(client, owner)
    other, _ = signup(client)
    interview_id = owner[1]["id"]
    assert client.post(f"/api/interviews/{interview_id}/finish", headers=other).status_code == 404
    res = client.post(
        f"/api/interviews/{interview_id}/questions/{owner[1]['questions'][0]}/answer",
        data={"durationMs": "1000"},
        files={"audio": ("a.webm", b"\x1a\x45\xdf\xa3" + b"\x00" * 50, "audio/webm")},
        headers=other,
    )
    assert res.status_code == 404
    assert client.get(f"/api/interviews/{interview_id}", headers=other).status_code == 404
    assert ai.kinds() == ["feedback"] * 3  # 남의 요청에는 AI 를 쓰지 않는다


# ---- 판정 문장·점수 (순수 함수) ----


def sample_metrics(**overrides) -> dict:
    base = {
        "answerSeconds": 60.0, "timedOut": False, "noSpeech": False, "syllablesPerMinute": 380.0,
        "firstSpeechSeconds": 1.0, "silenceCount": 0, "fillerPerMinute": 1.0,
    }  # fmt: skip
    return {**base, **overrides}


def test_speech_sentence_format_with_value_and_reference():
    metrics = sample_metrics(syllablesPerMinute=340.0)
    verdicts = judge_speech(metrics, QuestionCategory.SELF_INTRO)
    lines = speech_sentences(metrics, verdicts, QuestionCategory.SELF_INTRO)
    assert lines[0] == "말하기 속도: 조금 빠름(분당 340음절, 기준 250~330)"
    assert lines[1] == "답변 시간: 적정(60초, 기준 40~90초)"
    assert lines[2] == "첫 발화까지: 바로 시작(1초, 기준 3초 이하)"


def test_speech_sentence_for_unmeasurable_value_and_timeout():
    metrics = sample_metrics(syllablesPerMinute=None, fillerPerMinute=None, timedOut=True, answerSeconds=120.0)
    verdicts = judge_speech(metrics, QuestionCategory.CLOSING)
    lines = speech_sentences(metrics, verdicts, QuestionCategory.CLOSING)
    assert lines[0] == "말하기 속도: 측정 불가"
    assert lines[1].startswith("답변 시간: 시간 초과(120초, 시간 초과로 자동 종료, 기준 15~60초)")
    assert lines[4] == "군말: 측정 불가"


def test_reference_ranges_come_from_the_threshold_bands():
    from app.interviews.judgement import NONVERBAL_SPECS, SPEECH_SPECS

    assert good_range(SPEECH_SPECS["pace"]) == "250~330"
    assert good_range(SPEECH_SPECS["filler"]) == "2회/분 이하" or good_range(SPEECH_SPECS["filler"]).endswith("이하")
    assert good_range(NONVERBAL_SPECS["gaze"]) == "70% 이상"
    assert good_range(NONVERBAL_SPECS["smile"]) == "5~50%"  # 가운데 구간이 적정인 지표
    assert reference_for("duration", QuestionCategory.CLOSING) == "15~60초"
    assert reference_for("nope", QuestionCategory.CLOSING) is None


def test_verdict_score_averages_and_skips_unmeasurable():
    verdicts = {
        "a": {"level": "GOOD", "label": ""},
        "b": {"level": "FAIR", "label": ""},
        "c": {"level": "POOR", "label": ""},
        "d": {"level": "NA", "label": ""},
    }
    assert verdict_score(verdicts, ["a", "b", "c", "d"]) == 60  # (1.0 + 0.6 + 0.2) / 3
    assert verdict_score(verdicts, ["d"]) is None and verdict_score(verdicts, ["x"]) is None


def test_combine_drops_missing_areas_and_rescales_to_100():
    assert combine({"content": 80, "structure": 60, "delivery": 100, "nonverbal": 50}) == (
        round((80 * 50 + 60 * 20 + 100 * 20 + 50 * 10) / 100),
        ANSWER_WEIGHTS,
    )
    total, weights = combine({"content": 80, "structure": 60, "delivery": None, "nonverbal": None})
    assert weights == {"content": 50, "structure": 20} and total == round((80 * 50 + 60 * 20) / 70)
    assert combine({}) == (0, {})
    # 같은 입력은 항상 같은 점수
    assert combine({"content": 71, "structure": 64, "delivery": 88, "nonverbal": None}) == combine(
        {"content": 71, "structure": 64, "delivery": 88, "nonverbal": None}
    )
