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


# ---- 말하기 지표 계산과 판정 (docs/PLAN.md 4장). 예시 초기값이며 실제 사용 데이터를 보고 조정합니다. ----

#: 인접 단어 사이가 이 이상 비면 "침묵" 한 번으로 셉니다(초). 단어 시각의 오차(약 ±0.3초)를 넘는 값.
SILENCE_MIN_SECONDS = 2.0
#: 말한 구간이 이 길이(초)보다 짧으면 분당 음절 수·분당 군말은 계산하지 않습니다.
MIN_SPAN_SECONDS = 5.0
#: 음절이 이보다 적으면 사실상 말을 하지 않은 것으로 봅니다.
MIN_SYLLABLES = 5
#: 인식 구간 모두의 "말이 없을 확률"이 이 이상이면 무음에서 지어낸 문장으로 봅니다.
NO_SPEECH_PROB = 0.8

#: 항상 군말로 세는 말
FILLERS_STRICT = frozenset({"음", "으음", "어", "어어", "아", "에", "뭐랄까", "그니까", "그러니까"})
#: 정상적으로도 쓰이는 말("저는", "그 프로젝트") 이라, 머뭇거릴 때만 군말로 세는 말
FILLERS_SOFT = frozenset({"그", "저", "뭐", "막", "약간", "이제", "좀"})
#: 소프트 군말은 뒤에 이 이상(초) 쉴 때만 군말입니다 (또는 바로 뒤 단어도 군말일 때).
SOFT_FILLER_GAP_SECONDS = 0.3

# 판정 구간. (상한, 수준, 라벨) 의 목록을 앞에서부터 보고 값이 상한 이하(또는 미만)인 첫 항목을 씁니다.
GOOD, FAIR, POOR, NA = "GOOD", "FAIR", "POOR", "NA"

#: 분당 음절 수: 상한 미만
PACE_BANDS: list[tuple[float, str, str]] = [
    (200, POOR, "매우 느림"),
    (250, FAIR, "조금 느림"),
    (330, GOOD, "적정"),
    (380, FAIR, "조금 빠름"),
    (float("inf"), POOR, "매우 빠름"),
]
#: 첫 발화까지(초): 상한 이하
FIRST_SPEECH_BANDS: list[tuple[float, str, str]] = [
    (3.0, GOOD, "바로 시작"),
    (6.0, FAIR, "잠시 생각"),
    (float("inf"), POOR, "시작이 늦음"),
]
#: 2초 이상 침묵 횟수: 상한 이하
SILENCE_BANDS: list[tuple[float, str, str]] = [
    (0, GOOD, "없음"),
    (2, FAIR, "가끔"),
    (float("inf"), POOR, "잦음"),
]
#: 분당 군말: 상한 이하
FILLER_BANDS: list[tuple[float, str, str]] = [
    (2, GOOD, "적음"),
    (5, FAIR, "보통"),
    (float("inf"), POOR, "많음"),
]
#: 질문 유형별 적정 답변 시간(초). (하한, 상한). 하한의 절반 미만은 "너무 짧음", 상한 초과는 "긴 편"
DURATION_GOOD_SECONDS: dict[C, tuple[float, float]] = {
    C.SELF_INTRO: (40, 90),
    C.MOTIVATION: (40, 100),
    C.JOB_KNOWLEDGE: (40, 100),
    C.EXPERIENCE: (60, 110),
    C.SITUATION: (60, 110),
    C.PERSONALITY: (40, 100),
    C.CLOSING: (15, 60),
}
#: 클라이언트 측정 시간이 최대 답변 시간에서 이 정도(초) 안쪽이면 "시간 초과로 자동 종료"로 봅니다.
TIMEOUT_TOLERANCE_SECONDS = 0.5

# 비언어 지표를 점수에 쓸 수 있는지(신뢰도) 기준 (PLAN 5.2)
NONVERBAL_MIN_FACE_RATIO = 0.5
NONVERBAL_MIN_SECONDS = 5.0
NONVERBAL_MIN_COVERAGE = 0.6


# ---- 비언어 판정 구간 (PLAN 5.3) ----
# (상한 미만, 수준, 라벨) 을 아래에서부터 씁니다. 값이 클수록 좋은 지표도 같은 방식입니다.

_INF = float("inf")
#: 얼굴 보임 비율 (0~1)
FACE_VISIBLE_BANDS: list[tuple[float, str, str]] = [
    (0.7, POOR, "자주 화면 밖"),
    (0.9, FAIR, "자주 벗어남"),
    (_INF, GOOD, "안정적"),
]
#: 카메라 응시 비율 (0~1)
GAZE_BANDS: list[tuple[float, str, str]] = [
    (0.5, POOR, "시선이 자주 흩어짐"),
    (0.7, FAIR, "보통"),
    (_INF, GOOD, "안정적"),
]
#: 머리 흔들림 (도/초)
HEAD_MOTION_BANDS: list[tuple[float, str, str]] = [
    (8, GOOD, "안정"),
    (20, FAIR, "보통"),
    (_INF, POOR, "많이 움직임"),
]
#: 어깨 기울기 (도, 기준 자세 대비)
SHOULDER_TILT_BANDS: list[tuple[float, str, str]] = [
    (3, GOOD, "바름"),
    (6, FAIR, "약간 기울어짐"),
    (_INF, POOR, "기울어짐"),
]
#: 자세 무너짐 비율 (0~1)
POSTURE_BANDS: list[tuple[float, str, str]] = [
    (0.1, GOOD, "바른 자세"),
    (0.3, FAIR, "가끔 흐트러짐"),
    (_INF, POOR, "자세가 자주 흐트러짐"),
]
#: 미소 비율 (0~1). 분야에 따라 적절한 표정이 달라 POOR 는 쓰지 않습니다.
SMILE_BANDS: list[tuple[float, str, str]] = [
    (0.05, FAIR, "표정이 굳은 편"),
    (0.5, GOOD, "자연스러움"),
    (_INF, FAIR, "웃음이 많음"),
]
#: 분당 눈 깜빡임
BLINK_BANDS: list[tuple[float, str, str]] = [(8, FAIR, "적음"), (25, GOOD, "정상 범위"), (_INF, FAIR, "많음")]
#: 분당 손 제스처
GESTURE_BANDS: list[tuple[float, str, str]] = [(2, FAIR, "거의 없음"), (12, GOOD, "적절"), (_INF, FAIR, "많음")]
#: 손 움직임 지수 (어깨폭/초)
HAND_MOTION_BANDS: list[tuple[float, str, str]] = [(1.2, GOOD, "안정"), (_INF, POOR, "움직임 과다")]

# ---- 점수 (PLAN 6.2) ----

#: 판정 하나의 점수. 측정 불가(NA)는 평균에서 뺍니다.
VERDICT_SCORES: dict[str, float] = {GOOD: 1.0, FAIR: 0.6, POOR: 0.2}
#: 전달력 점수에 쓰는 말하기 판정 항목
DELIVERY_SCORED = ("pace", "duration", "firstSpeech", "silence", "filler")
#: 비언어 점수에 쓰는 판정 항목. 미소·눈 깜빡임·제스처 빈도는 개인차가 커서 보여 주기만 합니다.
NONVERBAL_SCORED = ("faceVisible", "gaze", "headMotion", "shoulderTilt", "posture", "handMotion")
#: 답변 점수의 영역별 가중치. 내용(질문 적합성 25 + 구체성 15 + 직무 적합성 10), 구조성, 전달력, 비언어(참고).
#: 쓸 수 없는 영역(비언어 끔·신뢰도 낮음 등)은 가중치에서 빼고 나머지로 100점 만점으로 환산합니다.
ANSWER_WEIGHTS: dict[str, int] = {"content": 50, "structure": 20, "delivery": 20, "nonverbal": 10}
