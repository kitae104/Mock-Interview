"""답변 텍스트에서 개인정보처럼 보이는 숫자·주소를 저장하기 전에 가립니다 (docs/PLAN.md 7.6).

DB 와 이후 AI 제공자로 가는 텍스트에 주민등록번호, 카드번호, 이메일, 전화번호가 그대로 남지 않게 하는 안전장치입니다.
한계: 한글로 읽은 숫자("공일공 일이삼사 …")나 단어 사이가 많이 떨어진 숫자는 잡지 못합니다.
"""

import re

# 순서가 중요합니다: 긴 숫자 패턴(주민등록번호, 카드번호)을 먼저 가려야 전화번호 패턴이 그 일부를 먼저 먹지 않습니다.
# 앞뒤가 숫자가 아닐 때만 맞추고(\b 는 한글과 숫자가 붙어 있으면 동작하지 않음), 구분자는 하이픈·공백·점을 허용합니다.
_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"(?<!\d)\d{6}[-\s.]?[1-4]\d{6}(?!\d)"), "[주민등록번호]"),
    (re.compile(r"(?<!\d)(?:\d{4}[-\s.]?){3}\d{4}(?!\d)"), "[카드번호]"),
    (re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+"), "[이메일]"),
    (re.compile(r"(?<!\d)0\d{1,2}[-\s.]?\d{3,4}[-\s.]?\d{4}(?!\d)"), "[전화번호]"),
]


def redact_text(text: str) -> str:
    for pattern, replacement in _PATTERNS:
        text = pattern.sub(replacement, text)
    return text
