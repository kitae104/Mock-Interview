import pytest

from app.interviews.models import QuestionCategory
from app.interviews.speech_metrics import (
    compute_speech_metrics,
    count_fillers,
    count_syllables,
    find_silences,
    is_no_speech,
    judge_speech,
)


def w(word: str, start: float, end: float) -> dict:
    return {"w": word, "s": start, "e": end}


def metrics(words, *, audio_seconds=60.0, max_answer_seconds=120, timed_out=False, probs=()):
    return compute_speech_metrics(
        words,
        audio_seconds=audio_seconds,
        max_answer_seconds=max_answer_seconds,
        timed_out=timed_out,
        no_speech_probs=probs,
    )


def run_of(count: int, start: float, *, word: str = "안녕하세요", step: float = 1.0) -> list[dict]:
    """같은 단어를 step 초 간격으로 count 개 늘어놓습니다 (각 단어는 step 의 절반 길이)."""
    return [w(word, start + i * step, start + i * step + step / 2) for i in range(count)]


# ---- 음절 수 ----


def test_count_syllables():
    assert count_syllables("안녕하세요") == 5
    assert count_syllables("저는 개발자입니다") == 8  # 저는(2) + 개발자입니다(6), 공백은 세지 않음
    assert count_syllables("API 서버") == 2 * 1 + 2  # 영문 단어는 2음절로 추정
    assert count_syllables("2024년") == 5  # 숫자는 한 자리에 1음절 + 한글 1
    assert count_syllables("") == 0
    assert count_syllables("... , ?") == 0


# ---- 분당 음절 수 / 첫 발화 / 말한 구간 ----


def test_syllables_per_minute_from_fixed_input():
    # 1.5초에 시작하는 6음절 단어 50개(300음절). 단어는 0.3초 길이로 0.6초마다 나와 구간은 29.7초
    words = run_of(50, 1.5, word="가나다라마바", step=0.6)
    result = metrics(words)
    assert result["wordCount"] == 50
    assert result["syllableCount"] == 300
    assert result["firstSpeechSeconds"] == 1.5
    assert result["speechSpanSeconds"] == pytest.approx(29.7)
    assert result["syllablesPerMinute"] == pytest.approx(300 / (29.7 / 60), abs=0.1)


def test_exact_300_syllables_per_minute():
    # 정확히 60초 구간에 300음절: 5음절 단어 60개를 1초 간격으로 (마지막 단어가 59.9초까지, 첫 단어는 0초에 시작)
    words = [w("안녕하세요", i, i + 0.9) for i in range(60)]  # 구간 = 59.9초
    result = metrics(words, audio_seconds=62.0)
    assert result["syllableCount"] == 300
    assert result["syllablesPerMinute"] == pytest.approx(300 / (59.9 / 60), abs=0.1)

    # 구간이 정확히 60초가 되도록 마지막 단어 끝을 맞춘다
    words[-1] = w("안녕하세요", 59, 60.0)
    assert metrics(words)["syllablesPerMinute"] == 300.0


def test_short_span_does_not_give_per_minute_values():
    words = [w("안녕하세요", 0.5, 1.0), w("반갑습니다", 1.2, 4.0), w("음", 4.2, 4.4)]  # 구간 3.9초 < 5초
    result = metrics(words, audio_seconds=5)
    assert result["noSpeech"] is False
    assert result["speechSpanSeconds"] == pytest.approx(3.9)
    assert result["syllablesPerMinute"] is None
    assert result["fillerPerMinute"] is None
    assert result["fillerCount"] == 1  # 횟수 자체는 센다


# ---- 침묵 ----


def test_silences_are_gaps_of_two_seconds_or_more():
    words = [
        w("하나", 0.0, 1.0),
        w("둘", 2.9, 3.5),  # 간격 1.9 → 아님
        w("셋", 5.5, 6.0),  # 간격 2.0 → 침묵
        w("넷", 9.0, 9.5),  # 간격 3.0 → 침묵
        w("다섯", 9.6, 10.0),
    ]
    assert find_silences(words) == [2.0, 3.0]
    result = metrics(words, audio_seconds=12)
    assert result["silenceCount"] == 2
    assert result["silenceTotalSeconds"] == 5.0
    assert result["longestSilenceSeconds"] == 3.0


def test_leading_and_trailing_silence_are_not_counted():
    words = run_of(10, 8.0, step=0.5)  # 8초에 시작(첫 발화 8초), 간격은 촘촘
    result = metrics(words, audio_seconds=60)
    assert result["firstSpeechSeconds"] == 8.0
    assert result["silenceCount"] == 0
    assert result["silenceTotalSeconds"] == 0.0
    assert result["longestSilenceSeconds"] == 0.0


# ---- 군말 ----


def test_strict_fillers_are_always_counted():
    words = [w("음,", 0, 0.3), w("저는", 0.4, 0.8), w("어", 0.9, 1.0), w("개발자입니다", 1.1, 2.0), w("음", 2.1, 2.3)]
    assert count_fillers(words) == {"음": 2, "어": 1}


def test_soft_fillers_count_only_when_hesitating():
    words = [
        w("저는", 0.0, 0.4),  # "저는" 은 군말이 아님
        w("그", 0.5, 0.6),  # 뒤에 0.1초만 쉼 → 정상 쓰임("그 프로젝트")
        w("프로젝트를", 0.7, 1.2),
        w("저", 2.0, 2.2),  # 뒤에 0.6초 쉼 → 군말
        w("이제", 2.8, 3.0),  # 바로 뒤 단어도 군말 → 군말
        w("음", 3.05, 3.2),
        w("약간", 3.25, 3.5),  # 뒤에 간격 0.1, 다음 단어는 군말 아님 → 아님
        w("어려웠습니다", 3.6, 4.5),
    ]
    assert count_fillers(words) == {"저": 1, "이제": 1, "음": 1}


def test_soft_filler_at_the_very_end_is_not_counted():
    assert count_fillers([w("감사합니다", 0, 1), w("이제", 1.1, 1.3)]) == {}


def test_filler_per_minute_and_breakdown():
    # 말한 구간이 정확히 60초이고 군말이 6번 → 분당 6회
    words = [w("안녕하세요", 0.0, 0.5)]
    words += [w("음", 10.0 * i, 10.0 * i + 0.2) for i in range(1, 6)]
    words += [w("어", 59.0, 60.0)]
    result = metrics(words)
    assert result["speechSpanSeconds"] == 60.0
    assert result["fillerCount"] == 6
    assert result["fillerPerMinute"] == 6.0
    assert result["fillerBreakdown"] == {"음": 5, "어": 1}


# ---- 빈 답변(무음) ----


def test_empty_answer_is_no_speech():
    result = metrics([], audio_seconds=30)
    assert result["noSpeech"] is True
    assert result["wordCount"] == 0
    assert result["syllableCount"] == 0
    assert result["syllablesPerMinute"] is None
    assert result["firstSpeechSeconds"] is None
    assert result["silenceCount"] == 0
    assert result["fillerCount"] == 0
    assert result["fillerBreakdown"] == {}
    assert result["answerSeconds"] == 30.0


def test_very_short_text_is_no_speech():
    assert is_no_speech([w("네", 0.0, 0.3)]) is True  # 1음절
    assert is_no_speech([w("네네네네", 0.0, 0.9)]) is True  # 4음절 < 5
    assert is_no_speech([w("안녕하세요", 0.0, 1.0)]) is False  # 5음절


def test_high_no_speech_probability_everywhere_is_no_speech():
    words = [w("시청해", 0.0, 1.0), w("주셔서", 1.0, 2.0), w("감사합니다", 2.0, 3.0)]
    assert is_no_speech(words, [0.95, 0.9]) is True
    assert is_no_speech(words, [0.95, 0.2]) is False  # 한 구간이라도 말이 있으면 아님
    assert is_no_speech(words, []) is False
    result = metrics(words, audio_seconds=10, probs=[0.95, 0.9])
    assert result["noSpeech"] is True
    assert result["wordCount"] == 0  # 지어낸 문장은 지표에 쓰지 않는다


def test_answer_seconds_and_timeout_are_passed_through():
    result = metrics(run_of(10, 0.0), audio_seconds=119.987, max_answer_seconds=120, timed_out=True)
    assert result["answerSeconds"] == 119.99
    assert result["maxAnswerSeconds"] == 120
    assert result["timedOut"] is True
    assert metrics([], audio_seconds=-3)["answerSeconds"] == 0.0


# ---- 판정 ----


def verdicts_for(**values):
    base = {
        "noSpeech": False,
        "syllablesPerMinute": 290,
        "answerSeconds": 60,
        "timedOut": False,
        "firstSpeechSeconds": 1.0,
        "silenceCount": 0,
        "fillerPerMinute": 1.0,
    }
    return judge_speech({**base, **values}, QuestionCategory.EXPERIENCE)


@pytest.mark.parametrize(
    ("spm", "level", "label"),
    [
        (150, "POOR", "매우 느림"),
        (199.9, "POOR", "매우 느림"),
        (200, "FAIR", "조금 느림"),
        (249.9, "FAIR", "조금 느림"),
        (250, "GOOD", "적정"),
        (329.9, "GOOD", "적정"),
        (330, "FAIR", "조금 빠름"),
        (379.9, "FAIR", "조금 빠름"),
        (380, "POOR", "매우 빠름"),
        (500, "POOR", "매우 빠름"),
        (None, "NA", "측정 불가"),
    ],
)
def test_pace_bands(spm, level, label):
    assert verdicts_for(syllablesPerMinute=spm)["pace"] == {"level": level, "label": label}


@pytest.mark.parametrize(
    ("seconds", "level", "label"),
    [
        (29, "POOR", "너무 짧음"),
        (30, "FAIR", "짧은 편"),
        (59.9, "FAIR", "짧은 편"),
        (60, "GOOD", "적정"),
        (110, "GOOD", "적정"),
        (111, "FAIR", "긴 편"),
    ],
)
def test_duration_bands_for_experience_questions(seconds, level, label):
    # EXPERIENCE 의 적정 구간은 60~110초 (하한의 절반 30초 미만은 "너무 짧음")
    assert verdicts_for(answerSeconds=seconds)["duration"] == {"level": level, "label": label}


def test_duration_bands_depend_on_question_category():
    base = {"noSpeech": False, "timedOut": False, "answerSeconds": 30}
    assert judge_speech(base, QuestionCategory.CLOSING)["duration"]["label"] == "적정"  # 마무리는 15~60초
    assert judge_speech(base, QuestionCategory.SELF_INTRO)["duration"]["label"] == "짧은 편"  # 자기소개는 40~90초
    assert judge_speech({**base, "answerSeconds": 95}, QuestionCategory.SELF_INTRO)["duration"]["label"] == "긴 편"


def test_timed_out_is_always_poor():
    assert verdicts_for(timedOut=True, answerSeconds=120)["duration"] == {"level": "POOR", "label": "시간 초과"}


@pytest.mark.parametrize(
    ("seconds", "level"), [(0.5, "GOOD"), (3.0, "GOOD"), (3.1, "FAIR"), (6.0, "FAIR"), (6.1, "POOR")]
)
def test_first_speech_bands(seconds, level):
    assert verdicts_for(firstSpeechSeconds=seconds)["firstSpeech"]["level"] == level


@pytest.mark.parametrize(("count", "level"), [(0, "GOOD"), (1, "FAIR"), (2, "FAIR"), (3, "POOR"), (9, "POOR")])
def test_silence_bands(count, level):
    assert verdicts_for(silenceCount=count)["silence"]["level"] == level


@pytest.mark.parametrize(
    ("per_minute", "level"), [(0.0, "GOOD"), (2.0, "GOOD"), (2.1, "FAIR"), (5.0, "FAIR"), (5.1, "POOR"), (None, "NA")]
)
def test_filler_bands(per_minute, level):
    assert verdicts_for(fillerPerMinute=per_minute)["filler"]["level"] == level


def test_no_speech_makes_everything_unavailable():
    result = judge_speech({"noSpeech": True}, QuestionCategory.SELF_INTRO)
    assert set(result) == {"pace", "duration", "firstSpeech", "silence", "filler"}
    assert all(v == {"level": "NA", "label": "측정 불가"} for v in result.values())


def test_judging_a_computed_result_end_to_end():
    words = [w("안녕하세요", i * 1.0, i * 1.0 + 0.9) for i in range(60)]
    words[-1] = w("안녕하세요", 59, 60.0)
    verdicts = judge_speech(metrics(words, audio_seconds=62), QuestionCategory.JOB_KNOWLEDGE)
    assert verdicts["pace"]["label"] == "적정"  # 분당 300음절
    assert verdicts["duration"]["label"] == "적정"  # 62초, 직무 지식 40~100초
    assert verdicts["firstSpeech"]["label"] == "바로 시작"
    assert verdicts["silence"]["label"] == "없음"
    assert verdicts["filler"]["label"] == "적음"
