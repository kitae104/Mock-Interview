"""모의 면접의 바꿀 수 있는 기준을 모아 둔 곳 (docs/PLAN.md).

질문 구성표(6.1)는 여기에 있고, 말하기·비언어 판정 구간과 점수 가중치(4.4, 5.3, 6.2)는
해당 단계에서 이 파일에 추가합니다.
운영 한도(질문 수 범위, 답변 시간, 하루 한도 등)는 환경 변수로 바꾸는 core/config.py 의 Settings 에 있습니다.
"""

from app.interviews.models import QuestionCategory as C

# 질문 수별 구성(순서대로). 앞쪽은 쉬운 질문으로 긴장을 풀고, 중간에 직무·경험·상황을 점점 깊게, 끝에 인성·마무리.
QUESTION_PLAN: dict[int, list[C]] = {
    3: [C.SELF_INTRO, C.JOB_KNOWLEDGE, C.SITUATION],
    4: [C.SELF_INTRO, C.JOB_KNOWLEDGE, C.EXPERIENCE, C.SITUATION],
    5: [C.SELF_INTRO, C.MOTIVATION, C.JOB_KNOWLEDGE, C.EXPERIENCE, C.SITUATION],
    6: [C.SELF_INTRO, C.MOTIVATION, C.JOB_KNOWLEDGE, C.EXPERIENCE, C.SITUATION, C.PERSONALITY],
    7: [C.SELF_INTRO, C.MOTIVATION, C.JOB_KNOWLEDGE, C.EXPERIENCE, C.SITUATION, C.PERSONALITY, C.CLOSING],
    8: [
        C.SELF_INTRO,
        C.MOTIVATION,
        C.JOB_KNOWLEDGE,
        C.JOB_KNOWLEDGE,
        C.EXPERIENCE,
        C.SITUATION,
        C.PERSONALITY,
        C.CLOSING,
    ],
    9: [
        C.SELF_INTRO,
        C.MOTIVATION,
        C.JOB_KNOWLEDGE,
        C.JOB_KNOWLEDGE,
        C.EXPERIENCE,
        C.EXPERIENCE,
        C.SITUATION,
        C.PERSONALITY,
        C.CLOSING,
    ],
    10: [
        C.SELF_INTRO,
        C.MOTIVATION,
        C.JOB_KNOWLEDGE,
        C.JOB_KNOWLEDGE,
        C.EXPERIENCE,
        C.EXPERIENCE,
        C.SITUATION,
        C.SITUATION,
        C.PERSONALITY,
        C.CLOSING,
    ],
}

_FILLER_CYCLE = [C.JOB_KNOWLEDGE, C.EXPERIENCE, C.SITUATION, C.PERSONALITY]


def planned_categories(count: int) -> list[C]:
    """질문 수에 맞는 구성. 구성표에 없는 수(설정으로 범위를 넓힌 경우)는 자기소개로 시작해 순서대로 채웁니다."""
    if count in QUESTION_PLAN:
        return list(QUESTION_PLAN[count])
    return [C.SELF_INTRO, *[_FILLER_CYCLE[i % len(_FILLER_CYCLE)] for i in range(count - 1)]]
