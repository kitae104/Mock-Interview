"""지표 판정과 "판정 문장" 만들기 (docs/PLAN.md 4·5장).

기준 구간은 모두 thresholds.py 에 있습니다. 이 파일은 그 구간으로 판정(좋음/보통/주의)을 내고,
화면에 보여 줄 기준 범위 문구와 LLM 에 넘길 판정 문장("말하기 속도: 조금 빠름(분당 340음절, 기준 250~330)")을 만듭니다.
LLM 에는 지표 원값이 아니라 이 문장을 넘깁니다.
"""

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any

from app.interviews.models import QuestionCategory
from app.interviews.speech_metrics import _band
from app.interviews.thresholds import (
    BLINK_BANDS,
    DURATION_GOOD_SECONDS,
    FACE_VISIBLE_BANDS,
    FILLER_BANDS,
    FIRST_SPEECH_BANDS,
    GAZE_BANDS,
    GESTURE_BANDS,
    GOOD,
    HAND_MOTION_BANDS,
    HEAD_MOTION_BANDS,
    NA,
    PACE_BANDS,
    POSTURE_BANDS,
    SHOULDER_TILT_BANDS,
    SILENCE_BANDS,
    SMILE_BANDS,
)

Bands = list[tuple[float, str, str]]


@dataclass(frozen=True)
class Spec:
    """판정 항목 하나: 이름, 지표 키, 구간, 값·기준 범위 표기."""

    name: str
    field: str
    bands: Bands
    #: True 면 "상한 이하", False 면 "상한 미만" 이 그 구간입니다 (speech_metrics 의 판정과 같은 방향).
    inclusive: bool
    show: Callable[[float], str]
    #: 기준 범위 숫자에 붙이는 단위. scale 이 100 이면 비율을 퍼센트로 보여 줍니다.
    suffix: str = ""
    scale: float = 1.0


def _n(value: float) -> str:
    return f"{value:.1f}".rstrip("0").rstrip(".")


def _percent(value: float) -> str:
    return f"{value * 100:.0f}%"


SPEECH_SPECS: dict[str, Spec] = {
    "pace": Spec("말하기 속도", "syllablesPerMinute", PACE_BANDS, False, lambda v: f"분당 {v:.0f}음절"),
    "firstSpeech": Spec("첫 발화까지", "firstSpeechSeconds", FIRST_SPEECH_BANDS, True, lambda v: f"{_n(v)}초", "초"),
    "silence": Spec("2초 이상 침묵", "silenceCount", SILENCE_BANDS, True, lambda v: f"{v:.0f}회", "회"),
    "filler": Spec("군말", "fillerPerMinute", FILLER_BANDS, True, lambda v: f"분당 {_n(v)}회", "회/분"),
}

NONVERBAL_SPECS: dict[str, Spec] = {
    "faceVisible": Spec("얼굴 보임", "faceVisibleRatio", FACE_VISIBLE_BANDS, False, _percent, "%", 100),
    "gaze": Spec("카메라 응시", "gazeAtCameraRatio", GAZE_BANDS, False, _percent, "%", 100),
    "headMotion": Spec(
        "머리 흔들림", "headMotionDegPerSec", HEAD_MOTION_BANDS, False, lambda v: f"초당 {_n(v)}도", "도/초"
    ),
    "shoulderTilt": Spec("어깨 기울기", "shoulderTiltDeg", SHOULDER_TILT_BANDS, False, lambda v: f"{_n(v)}도", "도"),
    "posture": Spec("자세 흐트러짐", "postureCollapseRatio", POSTURE_BANDS, False, _percent, "%", 100),
    "smile": Spec("미소", "smileRatio", SMILE_BANDS, False, _percent, "%", 100),
    "blink": Spec("눈 깜빡임", "blinksPerMinute", BLINK_BANDS, False, lambda v: f"분당 {_n(v)}회", "회/분"),
    "gesture": Spec("손 제스처", "gesturesPerMinute", GESTURE_BANDS, False, lambda v: f"분당 {_n(v)}회", "회/분"),
    "handMotion": Spec(
        "손 움직임", "handMotionIndex", HAND_MOTION_BANDS, False, lambda v: f"{_n(v)}어깨폭/초", "어깨폭/초"
    ),
}

_DURATION_NAME = "답변 시간"


def _number(value: float, spec: Spec) -> str:
    return _n(value * spec.scale)


def good_range(spec: Spec) -> str:
    """GOOD 구간을 "250~330", "3초 이하", "90% 이상" 같은 문구로 만듭니다. 구간 경계는 thresholds.py 에서 옵니다."""
    lower = 0.0
    for upper, level, _ in spec.bands:
        if level == GOOD:
            if upper == float("inf"):
                return f"{_number(lower, spec)}{spec.suffix} 이상"
            if spec.bands[0][1] == GOOD:  # 첫 구간이 GOOD: 0 부터 상한까지
                return f"{_number(upper, spec)}{spec.suffix} {'이하' if spec.inclusive else '미만'}"
            return f"{_number(lower, spec)}~{_number(upper, spec)}{spec.suffix}"
        lower = upper
    return ""


def duration_reference(category: QuestionCategory) -> str:
    low, high = DURATION_GOOD_SECONDS[category]
    return f"{_n(low)}~{_n(high)}초"


def reference_for(key: str, category: QuestionCategory) -> str | None:
    """판정 항목의 "기준 범위" 문구. 화면의 표에서 값 옆에 보여 줍니다."""
    if key == "duration":
        return duration_reference(category)
    spec = SPEECH_SPECS.get(key) or NONVERBAL_SPECS.get(key)
    return good_range(spec) if spec else None


def judge_nonverbal(metrics: Mapping[str, Any]) -> dict[str, dict[str, str]]:
    """비언어 지표를 항목별로 판정합니다. 값이 없는(측정하지 못한) 항목은 측정 불가."""
    return {
        key: _band(metrics.get(spec.field), spec.bands, upper_inclusive=spec.inclusive)
        for key, spec in NONVERBAL_SPECS.items()
    }


def judge_value(key: str, value: float | None) -> dict[str, str]:
    """평균 같은 집계값 하나를 같은 기준으로 판정합니다 (종합 리포트의 지표 카드)."""
    spec = SPEECH_SPECS.get(key) or NONVERBAL_SPECS[key]
    return _band(value, spec.bands, upper_inclusive=spec.inclusive)


def _line(name: str, verdict: Mapping[str, str], value: str | None, reference: str | None) -> str:
    if verdict["level"] == NA or value is None:
        return f"{name}: 측정 불가"
    detail = value if not reference else f"{value}, 기준 {reference}"
    return f"{name}: {verdict['label']}({detail})"


def speech_sentences(
    metrics: Mapping[str, Any], verdicts: Mapping[str, Mapping[str, str]], category: QuestionCategory
) -> list[str]:
    """말하기 판정 문장 목록. 예: "말하기 속도: 조금 빠름(분당 340음절, 기준 250~330)"."""
    lines = []
    for key in ("pace", "duration", "firstSpeech", "silence", "filler"):
        verdict = verdicts[key]
        if key == "duration":
            seconds = float(metrics.get("answerSeconds") or 0)
            suffix = ", 시간 초과로 자동 종료" if metrics.get("timedOut") else ""
            lines.append(_line(_DURATION_NAME, verdict, f"{_n(seconds)}초{suffix}", duration_reference(category)))
            continue
        spec = SPEECH_SPECS[key]
        raw = metrics.get(spec.field)
        lines.append(_line(spec.name, verdict, None if raw is None else spec.show(float(raw)), good_range(spec)))
    return lines


def nonverbal_sentences(metrics: Mapping[str, Any], verdicts: Mapping[str, Mapping[str, str]]) -> list[str]:
    """비언어 판정 문장 목록 (참고값). 점수에 쓰지 않는 항목도 설명에는 포함합니다."""
    lines = []
    for key, spec in NONVERBAL_SPECS.items():
        raw = metrics.get(spec.field)
        lines.append(_line(spec.name, verdicts[key], None if raw is None else spec.show(float(raw)), good_range(spec)))
    return lines
