"""이력서 AI 첨삭 프롬프트 (docs/PLAN.md 12.1)."""

from typing import Any

from app.ai.assist import COMMON_RULES, safe_text
from app.resumes.models import Resume

REVIEW_SYSTEM_PROMPT = f"""\
당신은 IT 기업의 채용 담당자이자 현업 개발 리더다. 입력된 이력서를 지원 직무(targetRole) 기준으로 첨삭한다.

규칙:
{COMMON_RULES}
- score 는 지원 직무 서류 통과 가능성 관점의 0~100 정수다. 비어 있는 섹션이 많으면 낮게 준다.
- overall 은 총평 2~4문장이다.
- strengths 는 잘 된 점 2~5개, improvements 는 고칠 점 3~8개다. section 은 summary, skills, experiences, educations,
  projects, certificates 중 하나, point 는 문제, suggestion 은 구체적인 수정 방법(가능하면 고친 문장 예시 포함)이다.
- suggestedSummary 는 입력 내용만으로 다시 쓴 자기 요약 3~5문장이다.
- missingKeywords 는 지원 직무에서 흔히 요구되지만 이력서에 보이지 않는 기술·키워드 0~10개다.
  가진 것처럼 쓰라고 권하지 않는다.

출력 형식:
{{"score": 0, "overall": "...", "strengths": ["..."],
"improvements": [{{"section": "...", "point": "...", "suggestion": "..."}}],
"suggestedSummary": "...", "missingKeywords": ["..."]}}"""


def _texts(item: dict[str, Any], keys: tuple[str, ...]) -> dict[str, str]:
    return {k: safe_text(item.get(k)) for k in keys}


def review_payload(resume: Resume) -> dict[str, Any]:
    """이름·이메일·전화·링크는 보내지 않고, 자유 텍스트는 개인정보 패턴을 가립니다."""
    c = resume.content or {}
    return {
        "targetRole": safe_text(resume.target_role) or "미정(IT 직무 일반)",
        "summary": safe_text(c.get("summary")),
        "skills": c.get("skills", []),
        "experiences": [
            _texts(e, ("organization", "position", "period", "description")) for e in c.get("experiences", [])
        ],
        "educations": [_texts(e, ("school", "major", "period", "note")) for e in c.get("educations", [])],
        "projects": [
            {**_texts(p, ("name", "period", "role", "description")), "techStack": p.get("techStack", [])}
            for p in c.get("projects", [])
        ],
        "certificates": [_texts(e, ("name", "issuer", "date")) for e in c.get("certificates", [])],
    }
