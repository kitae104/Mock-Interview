FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:0.12 /uv /uvx /bin/
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never

# 의존성 먼저 설치해 코드 변경 시 캐시를 재사용
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-install-project

COPY alembic.ini ./
COPY migrations migrations
COPY app app
RUN groupadd --system app && useradd --system --gid app --no-create-home app
USER app
ENV PATH="/app/.venv/bin:$PATH"
EXPOSE 8080
# 시작할 때 DB 스키마를 최신 마이그레이션까지 올린 뒤 서버를 띄웁니다.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8080 --proxy-headers"]
