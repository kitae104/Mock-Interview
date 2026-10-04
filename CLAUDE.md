# 프로젝트 안내 (Claude Code)

dev-harness 템플릿으로 만든 프로젝트입니다. 어떤 백엔드·프론트엔드·확장 모듈로 만들었는지는 `.harness.json` 에 있습니다.

## 구성

| 폴더 | 내용 |
| --- | --- |
| `backend/` | FastAPI, Python 3.13, uv, SQLAlchemy 2 + Alembic, JWT(PyJWT, bcrypt), PostgreSQL 18 |
| `frontend/` | React 19, TypeScript, Vite, Tailwind CSS v4, React Router |
| `frontend/src/styles/theme.css` | 디자인 토큰 (색, 글꼴, 모서리, 그림자). 디자인은 여기서 바꿉니다 |
| `design/` | 디자인 원본 (Google Stitch 내보내기, 참고 이미지). `/apply-design` 으로 적용 |
| `docker-compose.yml` | 이 프로젝트 전용 Compose 스택 (이름은 `.env` 의 `COMPOSE_PROJECT_NAME`) |

## 명령

```bash
make up / make down / make ps / make logs   # 이 프로젝트 컨테이너만 대상
make db                                      # 로컬 개발용 DB 만 실행
cd backend && uv run pytest -q              # 백엔드 테스트 (SQLite 메모리 DB)
cd backend && uv run ruff check . && uv run ruff format --check .
cd backend && uv run alembic revision --autogenerate -m "설명"   # 모델을 바꾼 뒤 마이그레이션 생성
cd frontend && npm run lint && npm run build # 프론트엔드 린트(디자인 규칙 포함) + 타입 검사 + 빌드
```

## 작업 규칙

1. **작업이 끝나기 전에 검증합니다.** 바꾼 영역의 테스트·린트·빌드를 실행하고 통과를 확인한 뒤 완료라고 말합니다. Stop 훅(`.claude/hooks/verify.mjs`)이 바뀐 영역을 자동으로 검사하고, 실패하면 고쳐야 끝낼 수 있습니다.
2. **기능은 세로로 자릅니다.** API 하나를 추가하면 백엔드(모델 → 저장 → 서비스 → API → 테스트)와 프론트엔드(`src/api/*.ts` → 화면 → 메뉴)를 같은 작업에서 끝냅니다. 절차는 `/add-domain` 스킬과 `.claude/rules/backend.md`, `.claude/rules/frontend.md` 의 "새 도메인 추가" 절에 있습니다.
3. **기존 패턴을 따릅니다.** 새 코드를 쓰기 전에 같은 종류의 기존 코드(백엔드의 auth·user 기능, 프론트엔드의 로그인·회원가입 화면)를 읽고 구조, 이름, 에러 처리를 맞춥니다. 폴더별 세부 규칙은 `.claude/rules/` 에 있고 해당 파일을 다룰 때 자동으로 적용됩니다.
4. **에러 응답 형식은 하나입니다.** 모든 API 에러는 `{ status, message, errors, timestamp }` 이고 메시지는 사용자에게 보여줄 한국어 문장입니다.
5. **디자인은 토큰과 UI 컴포넌트로만 입힙니다.** 색·글꼴·모서리·그림자 값은 `frontend/src/styles/theme.css` 에만 두고, 화면에서는 토큰 클래스(`bg-primary`, `text-muted-foreground`, `rounded-card` …)와 `src/components/ui/` 컴포넌트를 씁니다. `bg-blue-500`, `#3b82f6` 같은 직접 색 지정은 `npm run lint` 가 막습니다. 새 디자인 적용은 `/apply-design` 스킬을 따릅니다 (`.claude/rules/design.md`).
6. **비밀값은 `.env` 에만 둡니다.** `.env` 는 읽거나 커밋하지 않습니다. 새 설정은 `.env.example`, `docker-compose.yml`, 백엔드 설정 파일(기본값 포함)에 함께 추가합니다.
7. **Docker 이름 규칙을 지킵니다.** 새 서비스의 `container_name`, `image`, 볼륨·네트워크 `name` 은 `${COMPOSE_PROJECT_NAME}-` 로 시작하고, 포트는 `127.0.0.1:${XXX_PORT:-기본값}` 으로 엽니다. 같은 Docker 에 다른 프로젝트가 함께 돌아갑니다.
8. **되돌리기 어려운 명령은 먼저 묻습니다.** `make clean`, `docker compose down -v`, `git push`, DB 데이터 삭제.

## 확장 모듈

### AI 채팅 (`backend/app/ai/`)

- 모델 호출은 `app/ai/providers.py` 의 `ChatModel`(`ChatModelDep` 의존성)로만 합니다. 라우터·서비스에서 제공자 HTTP API 나 SDK 를 직접 부르지 않습니다.
- 테스트는 실제 모델을 부르지 않습니다. `app.dependency_overrides[get_chat_model]` 로 가짜 모델을 넣습니다 (`tests/test_ai.py` 참고).
- API 키는 환경 변수로만 받습니다. 코드·테스트에 실제 키를 쓰지 않습니다.
- 세부 규칙: `.claude/rules/ai.md`
