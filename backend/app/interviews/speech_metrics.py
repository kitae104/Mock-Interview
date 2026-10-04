"""말하기 지표 계산 (docs/PLAN.md 4장).
단어별 시각과 녹음 길이만으로 계산하는 순수 함수라서 같은 입력은 항상 같은 값을 냅니다.

- compute_speech_metrics: 답변 시간, 음절 수, 분당 음절 수, 첫 발화 시각, 침묵, 군말, 무음 여부
- judge_speech: 계산한 지표를 좋음/보통/주의로 판정 (기준은 thresholds.py)

판정(라벨)은 DB 에 저장하지 않고 응답을 만들 때 현재 기준으로 계산합니다.
기준을 바꾸면 지난 기록도 새 기준으로 보입니다.
"""

import re
from collections.abc import Mapping, Sequence
from typing import Any

from app.interviews.models import QuestionCategory
from app.interviews.thresholds import (
    DURATION_GOOD_SECONDS,
    FAIR,
    FILLER_BANDS,
    FILLERS_SOFT,
    FILLERS_STRICT,
    FIRST_SPEECH_BANDS,
    GOOD,
    MIN_SPAN_SECONDS,
    MIN_SYLLABLES,
    NA,
    NO_SPEECH_PROB,
    PACE_BANDS,
    POOR,
    SILENCE_BANDS,
    SILENCE_MIN_SECONDS,
    SOFT_FILLER_GAP_SECONDS,
)

#: 단어 하나: {"w": 단어, "s": 시작(초), "e": 끝(초)}. DB 의 answers.words 와 같은 모양입니다.
Word = Mapping[str, Any]

_HANGUL = re.compile(r"[가-힣]")
_LATIN_WORD = re.compile(r"[A-Za-z]+")
_DIGIT = re.compile(r"\d")
_NOT_WORD_CHAR = re.compile(r"[^\w가-힣]")


def count_syllables(text: str) -> int:
    """한글 음절 수 + 영문 단어 수 × 2(추정) + 숫자 자릿수."""
    return len(_HANGUL.findall(text)) + 2 * len(_LATIN_WORD.findall(text)) + len(_DIGIT.findall(text))


def _normalize(word: str) -> str:
    """문장부호를 뺀 단어 ("음," → "음")."""
    return _NOT_WORD_CHAR.sub("", word)


def count_fillers(words: Sequence[Word]) -> dict[str, int]:
    """군말을 단어별로 셉니다 (PLAN 4.2).

    확실한 군말(음, 어 …)은 모두 세고, 정상적으로도 쓰이는 말(저, 그, 이제 …)은 뒤에 SOFT_FILLER_GAP_SECONDS 이상 쉬거나
    바로 뒤 단어도 군말일 때만 셉니다 ("저는", "그 프로젝트에서" 같은 정상 쓰임을 피하려는 것).
    """
    counts: dict[str, int] = {}
    tokens = [_normalize(str(w["w"])) for w in words]
    for i, token in enumerate(tokens):
        if token in FILLERS_STRICT:
            counts[token] = counts.get(token, 0) + 1
        elif token in FILLERS_SOFT and i + 1 < len(words):
            gap_after = float(words[i + 1]["s"]) - float(words[i]["e"])
            next_is_filler = tokens[i + 1] in FILLERS_STRICT or tokens[i + 1] in FILLERS_SOFT
            if gap_after >= SOFT_FILLER_GAP_SECONDS or next_is_filler:
                counts[token] = counts.get(token, 0) + 1
    return counts


def find_silences(words: Sequence[Word]) -> list[float]:
    """인접 단어 사이가 SILENCE_MIN_SECONDS 이상 빈 구간들의 길이(초). 맨 앞(첫 발화 전)과 맨 끝은 세지 않습니다."""
    gaps = (float(b["s"]) - float(a["e"]) for a, b in zip(words, words[1:], strict=False))
    return [g for g in gaps if g >= SILENCE_MIN_SECONDS]


def is_no_speech(words: Sequence[Word], no_speech_probs: Sequence[float] = ()) -> bool:
    """사실상 말을 하지 않았는가: 인식된 단어가 없거나, 음절이 너무 적거나, 모든 구간이 "말 없음"으로 판단됨."""
    if not words:
        return True
    if count_syllables(" ".join(str(w["w"]) for w in words)) < MIN_SYLLABLES:
        return True
    return bool(no_speech_probs) and all(p >= NO_SPEECH_PROB for p in no_speech_probs)


def _round(value: float | None, digits: int = 2) -> float | None:
    return None if value is None else round(value, digits)


def compute_speech_metrics(
    words: Sequence[Word],
    *,
    audio_seconds: float,
    max_answer_seconds: int,
    timed_out: bool = False,
    no_speech_probs: Sequence[float] = (),
) -> dict[str, Any]:
    """한 답변의 말하기 지표. 키는 응답 JSON 과 같은 camelCase 입니다 (DB 에도 이 모양으로 저장).

    무음(noSpeech)이면 단어·음절·침묵·군말을 모두 0 으로, 속도·첫 발화는 null 로 돌려줍니다.
    """
    no_speech = is_no_speech(words, no_speech_probs)
    base: dict[str, Any] = {
        "answerSeconds": _round(max(audio_seconds, 0.0)),
        "maxAnswerSeconds": max_answer_seconds,
        "timedOut": timed_out,
        "noSpeech": no_speech,
    }
    if no_speech:
        return {
            **base,
            "wordCount": 0,
            "syllableCount": 0,
            "firstSpeechSeconds": None,
            "speechSpanSeconds": None,
            "syllablesPerMinute": None,
            "silenceCount": 0,
            "silenceTotalSeconds": 0.0,
            "longestSilenceSeconds": 0.0,
            "fillerCount": 0,
            "fillerPerMinute": None,
            "fillerBreakdown": {},
        }

    syllables = count_syllables(" ".join(str(w["w"]) for w in words))
    first = float(words[0]["s"])
    span = float(words[-1]["e"]) - first
    # 말한 구간이 너무 짧으면 분당 값이 크게 튀므로 계산하지 않습니다.
    per_minute_ok = span >= MIN_SPAN_SECONDS
    silences = find_silences(words)
    fillers = count_fillers(words)
    filler_count = sum(fillers.values())
    return {
        **base,
        "wordCount": len(words),
        "syllableCount": syllables,
        "firstSpeechSeconds": _round(first),
        "speechSpanSeconds": _round(span),
        "syllablesPerMinute": _round(syllables / (span / 60), 1) if per_minute_ok else None,
        "silenceCount": len(silences),
        "silenceTotalSeconds": round(sum(silences), 2),
        "longestSilenceSeconds": round(max(silences), 2) if silences else 0.0,
        "fillerCount": filler_count,
        "fillerPerMinute": _round(filler_count / (span / 60), 1) if per_minute_ok else None,
        "fillerBreakdown": fillers,
    }


# ---- 판정 ----


def _verdict(level: str, label: str) -> dict[str, str]:
    return {"level": level, "label": label}


def _band(value: float | None, bands: list[tuple[float, str, str]], *, upper_inclusive: bool) -> dict[str, str]:
    if value is None:
        return _verdict(NA, "측정 불가")
    for upper, level, label in bands:
        if value <= upper if upper_inclusive else value < upper:
            return _verdict(level, label)
    return _verdict(NA, "측정 불가")  # 마지막 구간이 inf 라 실제로는 도달하지 않음


def _duration_verdict(seconds: float, timed_out: bool, category: QuestionCategory) -> dict[str, str]:
    low, high = DURATION_GOOD_SECONDS[category]
    if timed_out:
        return _verdict(POOR, "시간 초과")
    if seconds < low / 2:
        return _verdict(POOR, "너무 짧음")
    if seconds < low:
        return _verdict(FAIR, "짧은 편")
    if seconds <= high:
        return _verdict(GOOD, "적정")
    return _verdict(FAIR, "긴 편")


def judge_speech(metrics: Mapping[str, Any], category: QuestionCategory) -> dict[str, dict[str, str]]:
    """말하기 지표를 항목별로 판정합니다: pace, duration, firstSpeech, silence, filler. 무음이면 모두 측정 불가."""
    if metrics.get("noSpeech"):
        unavailable = _verdict(NA, "측정 불가")
        return {key: dict(unavailable) for key in ("pace", "duration", "firstSpeech", "silence", "filler")}
    return {
        "pace": _band(metrics.get("syllablesPerMinute"), PACE_BANDS, upper_inclusive=False),
        "duration": _duration_verdict(
            float(metrics.get("answerSeconds") or 0), bool(metrics.get("timedOut")), category
        ),
        "firstSpeech": _band(metrics.get("firstSpeechSeconds"), FIRST_SPEECH_BANDS, upper_inclusive=True),
        "silence": _band(metrics.get("silenceCount"), SILENCE_BANDS, upper_inclusive=True),
        "filler": _band(metrics.get("fillerPerMinute"), FILLER_BANDS, upper_inclusive=True),
    }
