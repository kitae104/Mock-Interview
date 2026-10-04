"""피드백·리포트 테스트용 가짜 AI 모델. 실제 모델을 부르지 않고, 받은 요청을 기록합니다."""

import json

from app.ai.providers import Message, ModelError


def payload_of(content: str) -> dict:
    return json.loads(content.removeprefix("<입력>\n").removesuffix("\n</입력>"))


def feedback_json(content: int = 80, structure: int = 70) -> str:
    return json.dumps(
        {
            "scores": {"content": content, "structure": structure},
            "summary": "핵심은 전달했지만 사례가 부족합니다.",
            "strengths": ["결론을 먼저 말했습니다."],
            "improvements": [
                {"point": "구체적인 사례가 없습니다.", "suggestion": "수치가 있는 사례를 한 가지 들어 보세요."}
            ],
            "speechComment": "말하기 속도는 안정적입니다.",
            "nonverbalComment": "참고값 기준으로는 시선이 안정적입니다.",
            "betterAnswer": "저는 백엔드 개발자로서 ...",
        },
        ensure_ascii=False,
    )


def report_json() -> str:
    return json.dumps(
        {
            "summary": "전반적으로 안정적인 답변이었습니다.",
            "topStrengths": ["a", "b", "c", "d"],
            "topImprovements": [
                {"point": "사례 보강", "suggestion": "수치를 넣어 보세요.", "evidenceSeqs": [1, 99]},
                {"point": "군말 줄이기", "suggestion": "쉼으로 대체해 보세요.", "evidenceSeqs": [2]},
            ],
            "practicePlan": ["첫 문장에 결론 말하기", "STAR 구조로 사례 정리하기"],
            "speechSummary": "속도는 적정합니다.",
            "nonverbalSummary": "참고값 기준으로 시선이 안정적입니다.",
        },
        ensure_ascii=False,
    )


class FakeAi:
    """시스템 프롬프트로 종류(피드백/리포트)를 알아보고 정상 JSON 을 돌려줍니다.

    fail=True 면 항상 ModelError. feedback_replies / report_replies 로 응답을 미리 정하면 그 순서대로 돌려주고,
    다 쓰면 정상 응답을 돌려줍니다. 요청은 calls 에 (종류, 입력 데이터) 로 남습니다.
    """

    def __init__(self) -> None:
        self.fail = False
        self.feedback_replies: list[str] = []
        self.report_replies: list[str] = []
        self.calls: list[tuple[str, dict]] = []

    def kinds(self) -> list[str]:
        return [kind for kind, _ in self.calls]

    def payloads(self, kind: str) -> list[dict]:
        return [payload for k, payload in self.calls if k == kind]

    def complete(self, system: str, messages: list[Message]) -> str:
        kind = "report" if "종합 리포트" in system else "feedback"
        self.calls.append((kind, payload_of(messages[0]["content"])))
        if self.fail:
            raise ModelError("테스트 실패")
        replies = self.report_replies if kind == "report" else self.feedback_replies
        if replies:
            return replies.pop(0)
        return report_json() if kind == "report" else feedback_json()
