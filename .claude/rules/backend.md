---
paths:
  - "backend/**"
---

# 백엔드 규칙 (FastAPI, Python 3.13, uv)

프런트엔드는 Spring 백엔드와 같은 HTTP 계약(경로, camelCase JSON, 에러 형식, JWT)을 기대합니다. 이 계약을 바꾸지 않습니다.

## 구조
- 기능(도메인)별 패키지: `app/<도메인>/` 안에 `models.py`(SQLAlchemy 모델) · `schemas.py`(pydantic 요청·응답) · `service.py`(비즈니스 로직, 커밋) · `router.py`(HTTP 입출력). 계층별 폴더(`routers/`, `services/`)로 나누지 않습니다.
- 공통: `app/core/`(config 설정 · db 세션 · security 비밀번호·JWT·현재 사용자) · `app/common/`(errors 에러 형식 · schemas 기반 모델 · validators 검증 메시지).
- `app/main.py` 는 앱 생성, CORS, 에러 처리기, 라우터 등록만 합니다. 확장 모듈 라우터 import 는 `# isort: split` 아래 별도 블록에 있습니다 (ruff 정렬 때문에 나눔).
- 모든 경로는 `/api/...` 로 시작하고 라우터의 `prefix` 에 전체 경로를 씁니다 (`APIRouter(prefix="/api/posts")`). 포트는 8080.

## 스키마
- 요청 본문은 `RequestModel`, 응답은 `ApiModel`(`app/common/schemas.py`)을 상속합니다. 파이썬 필드는 snake_case, JSON 은 자동으로 camelCase(`created_at` → `createdAt`).
- 검증 메시지는 한국어로 붙입니다: `Annotated[str, not_blank("제목을 입력해 주세요."), size("제목은 100자 이하여야 합니다.", max_length=100)]` (`app/auth/schemas.py` 참고). 그 밖의 규칙은 `check(조건, "메시지")` 또는 `field_validator` 에서 `raise ValueError("한국어 메시지")`.
- 숫자 범위 등 pydantic 기본 제약(`Field(ge=1)`)을 써도 `app/common/errors.py` 가 한국어 메시지로 바꿉니다. 새 오류 종류가 영어로 나오면 `field_message` 에 추가합니다.
- 응답은 라우터 반환 타입으로 선언하고 `XxxResponse.model_validate(엔티티)` 로 만듭니다. 모델(엔티티)을 그대로 반환하지 않고 `dict` 도 반환하지 않습니다 (health 제외).
- 날짜·시간은 UTC 시간대 포함(`datetime.now(UTC)`), JSON 에서는 `...Z` 형식입니다.

## 에러
- 실패는 `raise ApiError(404, "게시글을 찾을 수 없습니다.")`. `HTTPException` 대신 `ApiError` 를 씁니다.
- `register_error_handlers` 가 모든 에러를 `{ status, message, errors, timestamp }` 로 바꿉니다: 검증 실패 400(`errors` 에 필드별 메시지), 잘못된 JSON 400, 404, 405, `IntegrityError` 409, 나머지 500(로그만 남기고 내부 정보 숨김). 새 예외 타입은 여기에 처리기를 추가합니다.
- 권한이 부족하면 `ApiError(403, "권한이 없습니다.")`, 남의 데이터는 존재를 숨기려면 404.

## 설정
- 환경 변수는 `Settings`(`app/core/config.py`) 필드로 추가하고 `settings: SettingsDep` 로 주입합니다. `os.environ` 을 직접 읽지 않습니다. 필드 이름의 대문자가 환경 변수 이름입니다.
- 새 환경 변수는 루트 `.env.example` 과 `docker-compose.yml` 의 backend `environment` 에도 추가합니다.

## 인증
- 로그인이 필요한 엔드포인트는 `user: CurrentUser` 파라미터를 받습니다 (DB 에서 불러온 `User`). 없으면 공개 API 입니다. 공개 API 는 꼭 필요한 것만 둡니다.
- 비밀번호는 `hash_password` / `verify_password` 만 씁니다 (bcrypt, 72바이트 제한 처리 포함). 토큰은 `create_access_token`.

## DB
- 세션은 요청마다 하나: 라우터에서 `db: DbSession` 으로 받아 서비스 함수에 넘깁니다. 서비스 함수가 변경 후 `db.commit()` 하고, 커밋하지 않은 변경은 요청이 끝나면 롤백됩니다. 조회만 하는 함수는 커밋하지 않습니다.
- 쿼리는 SQLAlchemy 2 스타일(`db.scalar(select(...))`, `db.scalars(...)`)로 씁니다. `db.query()` 는 쓰지 않습니다.
- 모델: `Base` 상속, `Mapped[...]` + `mapped_column`. 기본 키는 `mapped_column(BigIntPk, primary_key=True)`, 시각은 `UtcDateTime()` + `default=utcnow`, enum 은 `Enum(XxxEnum, native_enum=False, length=20)`(문자열로 저장) (`app/users/models.py` 참고).
- 스키마 변경은 반드시 Alembic 마이그레이션으로 합니다. `create_all` 로 운영 DB 를 만들지 않습니다.
  1. 모델 수정 (새 모듈이면 `migrations/env.py` 에 `import app.<도메인>.models` 추가)
  2. `uv run alembic revision --autogenerate -m "create posts"` → `migrations/versions/` 에 생긴 파일을 열어 내용 확인·수정 (파일 이름은 `<revision>_<설명>.py`)
  3. `uv run alembic upgrade head` 로 로컬 DB 에 적용 (컨테이너는 시작할 때 자동 적용)
- 이미 적용·공유된 마이그레이션 파일은 고치지 않고 새 마이그레이션을 추가합니다.

## 테스트
- `tests/test_<기능>.py`. `client`(인메모리 SQLite, 테스트마다 새 DB) · `auth_headers`(새 사용자로 가입·로그인한 `Authorization` 헤더) 픽스처를 씁니다 (`tests/conftest.py`).
- HTTP 계약을 검증합니다: 엔드포인트마다 정상, 인증 없음(401), 검증 실패(400, `errors` 필드), 주요 실패(404/409)와 응답 JSON 의 camelCase 키.
- 이메일 등은 `unique_email()` 로 고유하게 만듭니다.
- 새 모델을 추가하면 `tests/test_migrations.py` 가 마이그레이션 후 테이블이 생기는지 함께 확인하도록 늘립니다.

## 명령
```bash
cd backend
uv sync                                  # 의존성 설치
uv run uvicorn app.main:app --reload --port 8080   # 개발 서버 (DB 는 docker compose up -d db)
uv run ruff check . && uv run ruff format . && uv run pytest -q   # 수정 후 필수
uv add <패키지>                            # 의존성 추가 (pyproject.toml, uv.lock 둘 다 커밋)
```
API 문서: http://localhost:8080/api/docs

## 새 도메인 추가
예: 게시글(`posts`). 기존 `app/users`, `app/auth` 를 본보기로 삼습니다.

1. **모델** `app/posts/models.py` (+ 빈 `app/posts/__init__.py`): `class Post(Base)`, `__tablename__ = "posts"`, `id: Mapped[int] = mapped_column(BigIntPk, primary_key=True)`, 작성자는 `author_id: Mapped[int] = mapped_column(BigIntPk, ForeignKey("users.id"))`, `created_at` 은 `UtcDateTime()` + `default=utcnow`.
2. **마이그레이션**: `migrations/env.py` 에 `import app.posts.models  # noqa: F401` 추가 → `uv run alembic revision --autogenerate -m "create posts"` → 생성된 파일 확인 → `uv run alembic upgrade head`. `tests/test_migrations.py` 에 `posts` 테이블 확인을 추가합니다.
3. **스키마** `app/posts/schemas.py`: `PostCreateRequest`/`PostUpdateRequest(RequestModel)` 에 한국어 검증 메시지, `PostResponse(ApiModel)` (JSON 은 camelCase). 목록은 `list[PostResponse]`.
4. **서비스** `app/posts/service.py`: `create(db, user, request)`, `list_(db, user)`, `get(db, user, post_id)`, `update(...)`, `delete(...)`. 없으면 `raise ApiError(404, "게시글을 찾을 수 없습니다.")`, 남의 글 수정은 403(또는 404). 변경 함수는 마지막에 `db.commit()`.
5. **라우터** `app/posts/router.py`: `router = APIRouter(prefix="/api/posts", tags=["posts"])`. 생성은 `status_code=201`, 삭제는 `status_code=204` 에 반환값 없음. 파라미터는 `db: DbSession`, `user: CurrentUser`, 반환 타입은 응답 스키마.
6. **등록** `app/main.py`: 기존 라우터 import 블록에 `from app.posts import router as posts` 를 이름순으로, `app.include_router(users.router)` 아래에 `app.include_router(posts.router)` 를 추가합니다.
7. **테스트** `tests/test_posts.py`: `client`, `auth_headers` 로 생성 201 → 목록 → 단건 → 수정 → 삭제 204 → 다시 조회 404, 인증 없음 401, 검증 실패 400(`errors` 키), 다른 사용자의 글 접근 실패.
8. **확인**: `uv run ruff check . && uv run ruff format . && uv run pytest -q`. 프런트엔드에서 쓸 API 는 기존 `auth.ts` 옆에 `<도메인>.ts` 로 같은 camelCase 타입을 맞춰 추가합니다.
