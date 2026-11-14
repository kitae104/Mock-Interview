"""자기소개서 AI 초안·첨삭 프롬프트 (docs/PLAN.md 12.2)."""

from typing import Any

from app.ai.assist import COMMON_RULES, safe_text
from app.cover_letters.models import CoverLetter

DRAFT_SYSTEM_PROMPT = f"""\
당신은 IT 직무 지원자의 자기소개서 작성을 돕는 코치다. 입력의 문항(question)에 대한 답변 초안을 하나 쓴다.

규칙:
{COMMON_RULES}
- 초안은 notes(지원자가 적은 경험 메모)와 currentAnswer 에 있는 사실만 사용한다. 메모에 없는 회사, 프로젝트,
  수치를 만들지 말고 필요하면 "[수치 입력]" 같은 자리표시를 남긴다.
- 첫 문장에 핵심 메시지를 쓰고, 경험은 상황 → 행동 → 결과 순서로 쓴다. 지원 직무(targetRole)와 회사(company),
  채용 공고(jobPosting)가 있으면 연결한다.
- charLimit 이 있으면 공백 포함 글자 수가 charLimit 의 90~100% 가 되게 쓰고, 없으면 700자 안팎으로 쓴다.

출력 형식:
{{"draft": "..."}}"""

REVIEW_SYSTEM_PROMPT = f"""\
당신은 IT 기업의 채용 담당자다. 입력된 자기소개서의 문항별 답변을 첨삭한다.

규칙:
{COMMON_RULES}
- 답변이 있는 문항마다 items 에 하나씩 쓴다. index 는 입력 문항의 index 를 그대로 쓴다.
- score 는 0~100 정수, comment 는 문항 의도에 맞는지와 구체성·구조·직무 연관성에 대한 평가 2~3문장이다.
- suggestions 는 구체적인 고칠 점 1~5개다.
- revised 는 원문의 사실만 사용해 다듬은 수정안이다. charLimit 이 있으면 넘지 않는다.
- overall 은 자기소개서 전체 총평 2~4문장이다(문항 간 중복, 일관성 포함).

출력 형식:
{{"overall": "...",
"items": [{{"index": 0, "score": 0, "comment": "...", "suggestions": ["..."], "revised": "..."}}]}}"""


def _context(letter: CoverLetter) -> dict[str, Any]:
    return {
        "company": safe_text(letter.company),
        "targetRole": safe_text(letter.target_role) or "IT 직무",
        "jobPosting": safe_text(letter.job_posting) or None,
    }


def draft_payload(letter: CoverLetter, index: int, notes: str) -> dict[str, Any]:
    item = letter.items[index]
    return {
        **_context(letter),
        "question": safe_text(item.get("question")),
        "charLimit": item.get("charLimit"),
        "currentAnswer": safe_text(item.get("answer")),
        "notes": safe_text(notes),
    }


def review_payload(letter: CoverLetter) -> dict[str, Any]:
    return {
        **_context(letter),
        "items": [
            {
                "index": i,
                "question": safe_text(item.get("question")),
                "charLimit": item.get("charLimit"),
                "answer": safe_text(item.get("answer")),
            }
            for i, item in enumerate(letter.items)
            if (item.get("answer") or "").strip()
        ],
    }
