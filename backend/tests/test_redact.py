import pytest

from app.interviews.redact import redact_text


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("제 번호는 010-1234-5678 입니다", "제 번호는 [전화번호] 입니다"),
        ("01012345678로 연락 주세요", "[전화번호]로 연락 주세요"),
        ("회사 번호는 02-123-4567 입니다", "회사 번호는 [전화번호] 입니다"),
        ("010 1234 5678", "[전화번호]"),
        ("제 메일은 hong.gildong+job@example.co.kr 입니다", "제 메일은 [이메일] 입니다"),
        ("주민번호는 900101-1234567 입니다", "주민번호는 [주민등록번호] 입니다"),
        ("카드는 1234-5678-9012-3456 입니다", "카드는 [카드번호] 입니다"),
        ("1234 5678 9012 3456", "[카드번호]"),
    ],
)
def test_personal_data_is_masked(text, expected):
    assert redact_text(text) == expected


def test_ordinary_numbers_are_kept():
    text = "저는 3년 동안 12명의 팀에서 2024년에 매출을 150% 올렸습니다. 우편번호 06236, 점수 95점."
    assert redact_text(text) == text


def test_several_items_in_one_text():
    assert redact_text("010-1111-2222 또는 a@b.com") == "[전화번호] 또는 [이메일]"


def test_card_number_is_not_mistaken_for_a_phone_number():
    assert redact_text("0101-2345-6789-0123") == "[카드번호]"


def test_empty_text():
    assert redact_text("") == ""
