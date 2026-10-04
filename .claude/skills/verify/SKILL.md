---
name: verify
description: 프로젝트 전체(백엔드, 프론트엔드, 확장 서비스, Compose 설정)를 검증하고 결과를 표로 보고한다. "전체 테스트 돌려줘", "검증해줘", 커밋·PR 전에 사용.
---

# 전체 검증

있는 영역만 순서대로 실행하고, 실패해도 나머지는 계속 실행한 뒤 한 번에 보고합니다.

| 영역 | 조건 | 명령 (해당 폴더에서) |
| --- | --- | --- |
| backend (Spring) | `backend/gradlew` | `./gradlew test` |
| backend (FastAPI) | `backend/pyproject.toml` | `uv sync` → `uv run ruff check .` → `uv run ruff format --check .` → `uv run pytest -q` |
| frontend | `frontend/` | `npm ci` (node_modules 없을 때만) → `npm run lint` (디자인 규칙 포함) → `npm run build` |
| fastapi | `fastapi/` | backend (FastAPI) 와 같음 |
| ml | `ml/` | backend (FastAPI) 와 같음 (처음에는 PyTorch 설치로 오래 걸림) |
| compose | `docker` 명령이 있을 때 | 루트에서 `docker compose config -q` |

보고 형식: 영역별 통과/실패 표, 실패한 항목은 원인 한 줄과 관련 `파일:줄`. 실패를 고치라는 요청이 없었다면 고치지 말고 원인과 제안만 적습니다.
