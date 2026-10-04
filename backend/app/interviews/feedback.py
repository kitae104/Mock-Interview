"""답변별 피드백과 종합 리포트 만들기 (docs/PLAN.md 6.2, 6.3).

- 지표 원값은 LLM 에 넘기지 않습니다. judgement.py 가 기준 구간으로 판정 문장을 만들어 넘깁니다.
- 내용·구조성 점수만 LLM 이 매기고, 전달력·비언어 점수와 총점·종합 점수·영역별 평균은 서버가 계산합니다 (scoring.py).
- 이 모듈은 DB 를 다루지 않습니다. 호출하는 쪽(service.py)이 읽기 트랜잭션을 끝낸 뒤 부르고 결과를 저장합니다.
"""

from collections.abc import Mapping
from statistics import mean
from typing import Any

from app.ai.providers import ChatModel
from app.ai.structured import complete_json
from app.core.db import utcnow
from app.interviews import prompts, scoring
from app.interviews.judgement import (
    NONVERBAL_SPECS,
    SPEECH_SPECS,
    good_range,
    judge_nonverbal,
    judge_value,
    nonverbal_sentences,
    speech_sentences,
)
from app.interviews.models import Interview, InterviewAnswer, InterviewQuestion
from app.interviews.nonverbal import NonverbalMetrics
from app.interviews.prompts import GeneratedFeedback, GeneratedReport
from app.interviews.speech_metrics import judge_speech
from app.interviews.thresholds import DELIVERY_SCORED, NONVERBAL_SCORED

NO_ANSWER_SUMMARY = "답변이 인식되지 않았습니다. 마이크 설정을 확인하거나 다시 연습해 보세요."
NO_ANSWER_TIP = "마이크가 켜져 있는지 확인하고, 질문에 결론 한 문장이라도 소리 내어 말해 보세요."
AREAS = ("content", "structure", "delivery", "nonverbal")


def is_empty_answer(answer: InterviewAnswer) -> bool:
    """사실상 말하지 않은 답변. 이런 답변은 LLM 을 부르지 않고 고정 문구로 처리합니다."""
    return bool((answer.speech_metrics or {}).get("noSpeech")) or not answer.transcript.strip()


def _nonverbal_view(
    interview: Interview, answer: InterviewAnswer
) -> tuple[Mapping[str, Any] | None, dict[str, dict[str, str]] | None, bool]:
    """(지표, 판정, 신뢰할 수 있는지). 분석을 끈 면접이거나 지표가 없으면 (None, None, False)."""
    if not interview.nonverbal_enabled or not answer.nonverbal_metrics:
        return None, None, False
    metrics = answer.nonverbal_metrics
    return metrics, judge_nonverbal(metrics), NonverbalMetrics.model_validate(metrics).is_reliable()


def make_answer_feedback(
    model: ChatModel, interview: Interview, question: InterviewQuestion, answer: InterviewAnswer
) -> tuple[dict[str, Any], int]:
    """답변 하나의 피드백(JSON 으로 저장할 dict)과 총점(0~100)을 만듭니다. 모델 호출이 실패하면 ModelError."""
    speech_metrics = answer.speech_metrics or {}
    speech_verdicts = judge_speech(speech_metrics, question.category)
    speech_lines = speech_sentences(speech_metrics, speech_verdicts, question.category)
    nv_metrics, nv_verdicts, reliable = _nonverbal_view(interview, answer)
    nv_lines = nonverbal_sentences(nv_metrics, nv_verdicts) if nv_metrics and nv_verdicts and reliable else None
    judgements = {"speech": speech_lines, "nonverbal": nv_lines}

    if is_empty_answer(answer):
        feedback = {
            "noSpeech": True,
            "scores": {"content": 0, "structure": 0, "delivery": None, "nonverbal": None},
            "summary": NO_ANSWER_SUMMARY,
            "strengths": [],
            "improvements": [{"point": "답변 없음", "suggestion": NO_ANSWER_TIP}],
            "speechComment": "",
            "nonverbalComment": None,
            "betterAnswer": "",
            "judgements": judgements,
            "weights": {},
        }
        return feedback, 0

    payload = prompts.feedback_payload(
        field=interview.field,
        level=interview.level,
        question={
            "text": question.text,
            "category": question.category.value,
            "intent": question.intent,
            "expectedPoints": question.expected_points or [],
        },
        job_posting=interview.job_posting,
        transcript=answer.transcript,
        speech_judgements=speech_lines,
        nonverbal_judgements=nv_lines,
        max_answer_seconds=interview.max_answer_seconds,
    )
    generated = complete_json(model, prompts.FEEDBACK_SYSTEM_PROMPT, payload, GeneratedFeedback)

    delivery = scoring.verdict_score(speech_verdicts, DELIVERY_SCORED)
    nonverbal = scoring.verdict_score(nv_verdicts, NONVERBAL_SCORED) if nv_verdicts and reliable else None
    scores = {
        "content": generated.scores.content,
        "structure": generated.scores.structure,
        "delivery": delivery,
        "nonverbal": nonverbal,
    }
    total, weights = scoring.combine(scores)
    feedback = {
        "noSpeech": False,
        "scores": scores,
        "summary": generated.summary,
        "strengths": generated.strengths,
        "improvements": [i.model_dump(by_alias=True) for i in generated.improvements],
        "speechComment": generated.speech_comment,
        "nonverbalComment": generated.nonverbal_comment if nv_lines else None,
        "betterAnswer": generated.better_answer,
        "judgements": judgements,
        "weights": weights,
    }
    return feedback, total


# ---- 종합 리포트 ----


def _item(key: str, values: list[float]) -> dict[str, Any]:
    """평균 하나와 그 판정·기준 범위·이름. 값이 없으면 측정 불가."""
    spec = SPEECH_SPECS.get(key) or NONVERBAL_SPECS[key]
    value = round(mean(values), 2) if values else None
    return {"name": spec.name, "value": value, "verdict": judge_value(key, value), "reference": good_range(spec)}


def _sentence(key: str, item: Mapping[str, Any]) -> str:
    spec = SPEECH_SPECS.get(key) or NONVERBAL_SPECS[key]
    if item["value"] is None:
        return f"평균 {spec.name}: 측정 불가"
    return f"평균 {spec.name}: {item['verdict']['label']}({spec.show(item['value'])}, 기준 {item['reference']})"


def _values(rows: list[Mapping[str, Any]], field: str) -> list[float]:
    return [float(r[field]) for r in rows if r.get(field) is not None]


def aggregates(interview: Interview) -> dict[str, Any]:
    """서버가 계산하는 지표 집계. LLM 출력과 상관없이 그대로 저장해 화면에 보여 줍니다."""
    speech_rows, nonverbal_rows = [], []
    for question in interview.questions:
        answer = question.answer
        if answer is None:
            continue
        if not (answer.speech_metrics or {}).get("noSpeech"):
            speech_rows.append(answer.speech_metrics)
        metrics, _, reliable = _nonverbal_view(interview, answer)
        if metrics and reliable:  # 신뢰도가 낮은 답변은 평균에서 뺍니다.
            nonverbal_rows.append(metrics)

    speech = {
        key: _item(key, _values(speech_rows, SPEECH_SPECS[key].field)) for key in ("pace", "firstSpeech", "filler")
    }
    nonverbal = (
        {
            key: _item(key, _values(nonverbal_rows, NONVERBAL_SPECS[key].field))
            for key in ("faceVisible", "gaze", "headMotion", "posture", "smile")
        }
        if nonverbal_rows
        else None
    )
    return {
        "speech": speech,
        "nonverbal": nonverbal,
        "silenceCount": sum(int(r.get("silenceCount") or 0) for r in speech_rows),
        "silenceSeconds": round(sum(float(r.get("silenceTotalSeconds") or 0) for r in speech_rows), 1),
    }


def make_report(model: ChatModel, interview: Interview) -> dict[str, Any]:
    """종합 리포트(JSON 으로 저장할 dict). 모든 질문의 피드백이 있어야 합니다. 모델 호출 실패는 ModelError.

    종합 점수와 영역별 점수는 서버가 답변별 점수의 평균으로 계산합니다.
    """
    answered = [(q, q.answer) for q in interview.questions if q.answer is not None and q.answer.feedback]
    scores = [a.score or 0 for _, a in answered]
    overall = round(mean(scores)) if scores else 0
    category_scores = {}
    for area in AREAS:
        values = [a.feedback["scores"][area] for _, a in answered if (a.feedback["scores"].get(area) is not None)]
        category_scores[area] = round(mean(values)) if values else None

    stats = aggregates(interview)
    aggregate_lines = [_sentence(k, v) for k, v in stats["speech"].items()]
    aggregate_lines.append(f"2초 이상 침묵: 총 {stats['silenceCount']}회, {stats['silenceSeconds']}초")
    if stats["nonverbal"]:
        aggregate_lines += [_sentence(k, v) for k, v in stats["nonverbal"].items()]

    payload = {
        "field": interview.field,
        "level": prompts.LEVEL_LABEL[interview.level],
        "jobPosting": (interview.job_posting or "")[:1500] or None,
        "answeredCount": len(answered),
        "questionCount": len(interview.questions),
        # 답변 원문은 보내지 않고 질문별 요약만 보냅니다.
        "questions": [
            {
                "seq": q.seq,
                "category": q.category.value,
                "text": q.text,
                "score": a.score,
                "scores": a.feedback["scores"],
                "summary": a.feedback.get("summary", ""),
                "strengths": a.feedback.get("strengths", []),
                "improvements": [i.get("point", "") for i in a.feedback.get("improvements", [])],
                "speechJudgements": a.feedback.get("judgements", {}).get("speech", []),
            }
            for q, a in answered
        ],
        "aggregateJudgements": aggregate_lines,
        "categoryScores": category_scores,
    }
    generated = complete_json(model, prompts.REPORT_SYSTEM_PROMPT, payload, GeneratedReport)

    valid_seqs = {q.seq for q in interview.questions}
    improvements = [
        {
            "point": i.point,
            "suggestion": i.suggestion,
            "evidenceSeqs": sorted({s for s in i.evidence_seqs if s in valid_seqs}),
        }
        for i in generated.top_improvements
    ]
    return {
        "overallScore": overall,
        "summary": generated.summary,
        "categoryScores": category_scores,
        "topStrengths": generated.top_strengths,
        "topImprovements": improvements,
        "practicePlan": generated.practice_plan,
        "speechSummary": generated.speech_summary,
        "nonverbalSummary": generated.nonverbal_summary if stats["nonverbal"] else None,
        "aggregates": stats,
        "answeredCount": len(answered),
        "questionCount": len(interview.questions),
        "generatedAt": utcnow().isoformat(),
    }
