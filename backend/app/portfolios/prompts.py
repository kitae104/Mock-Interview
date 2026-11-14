"""포트폴리오 AI 다듬기 프롬프트 (docs/PLAN.md 12.3)."""

from typing import Any

from app.ai.assist import COMMON_RULES, safe_text
from app.portfolios.models import PortfolioProject

ASSIST_SYSTEM_PROMPT = f"""\
당신은 IT 직무 지원자의 포트폴리오를 검토하는 현업 개발 리더다. 입력된 프로젝트 하나를 다듬고 면접 준비를 돕는다.

규칙:
{COMMON_RULES}
- polishedDescription 은 입력 내용만으로 다시 쓴 프로젝트 설명이다. 배경·문제 → 내 역할과 기술적 선택(이유 포함)
  → 해결 과정 → 결과·배운 점 순서로 4~8문장 쓴다.
- resumeBullets 는 이력서에 넣을 한 줄 성과 2~5개다. "무엇을 해서 어떤 결과" 형태로 쓰고,
  수치가 없으면 "[수치 입력]" 을 남긴다.
- expectedQuestions 는 면접관이 이 프로젝트로 물을 만한 질문 3~6개다. 기술 선택 이유, 어려웠던 문제, 내 기여,
  성능·확장·테스트처럼 깊이를 확인하는 질문을 섞는다. intent 는 질문으로 확인하려는 것 1문장이다.
- tips 는 포트폴리오를 보완할 점 1~5개다(README, 데모, 아키텍처 그림, 성과 수치 등).

출력 형식:
{{"polishedDescription": "...", "resumeBullets": ["..."],
"expectedQuestions": [{{"question": "...", "intent": "..."}}], "tips": ["..."]}}"""


def assist_payload(project: PortfolioProject) -> dict[str, Any]:
    """링크는 보내지 않습니다 (AI 가 열어 볼 수 없고 개인 식별에 쓰일 수 있음)."""
    return {
        "title": safe_text(project.title),
        "summary": safe_text(project.summary),
        "role": safe_text(project.role),
        "period": safe_text(project.period),
        "teamSize": project.team_size,
        "techStack": project.tech_stack or [],
        "description": safe_text(project.description),
        "achievements": safe_text(project.achievements),
    }
