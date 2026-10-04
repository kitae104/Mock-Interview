"""점수 계산 (docs/PLAN.md 6.2). 같은 입력은 항상 같은 점수가 나오도록 서버가 계산합니다.

- 내용·구조성 점수만 LLM 이 매기고(0~100), 전달력·비언어는 지표 판정에서 계산합니다.
  LLM 이 산술이나 편향으로 점수를 흔들 수 없습니다.
- 가중치와 판정 점수는 thresholds.py 의 상수입니다.
"""

from collections.abc import Iterable, Mapping

from app.interviews.thresholds import ANSWER_WEIGHTS, NA, VERDICT_SCORES


def verdict_score(verdicts: Mapping[str, Mapping[str, str]], keys: Iterable[str]) -> int | None:
    """판정들의 평균 점수(0~100). 측정 불가(NA)는 뺍니다. 점수를 낼 항목이 하나도 없으면 None."""
    values = [
        VERDICT_SCORES[verdicts[key]["level"]] for key in keys if key in verdicts and verdicts[key]["level"] != NA
    ]
    return round(100 * sum(values) / len(values)) if values else None


def combine(scores: Mapping[str, int | None]) -> tuple[int, dict[str, int]]:
    """영역별 점수(0~100, 없으면 None)를 가중 평균으로 합칩니다. 돌려주는 값: (총점, 실제로 쓴 가중치)."""
    used = {key: weight for key, weight in ANSWER_WEIGHTS.items() if scores.get(key) is not None}
    total = sum(used.values())
    if total == 0:
        return 0, {}
    value = sum((scores[key] or 0) * weight for key, weight in used.items()) / total
    return round(value), used


def clamp_score(value: float | int) -> int:
    return max(0, min(100, round(value)))
