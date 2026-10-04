---
paths:
  - "docker-compose.yml"
  - "Makefile"
  - ".env.example"
  - "**/Dockerfile"
  - "frontend/nginx.conf"
  - "frontend/next.config.ts"
---

# Docker 규칙

이 프로젝트는 다른 프로젝트와 같은 Docker 에서 돌아갑니다. 이 프로젝트의 스택은 하나의 단위로 올리고 내립니다.

- Compose 프로젝트 이름은 `.env` 의 `COMPOSE_PROJECT_NAME` 하나로 정해집니다 (`name: ${COMPOSE_PROJECT_NAME:-...}`).
- 새 서비스: `container_name: ${COMPOSE_PROJECT_NAME:-...}-<서비스>`, 직접 빌드하면 `image: ${COMPOSE_PROJECT_NAME:-...}-<서비스>`, 네트워크는 기존 `app-net` 만 사용.
- 새 볼륨: `name: ${COMPOSE_PROJECT_NAME:-...}-<용도>` 를 반드시 지정합니다.
- 포트: `"127.0.0.1:${<서비스>_PORT:-기본값}:<컨테이너 포트>"`. 변수는 `.env.example` 에도 추가합니다. 0.0.0.0 으로 열지 않습니다.
- 외부 `docker` 명령으로 이름 없는 리소스를 만들지 않고, 다른 프로젝트 리소스를 지우는 명령(`docker system prune`, `docker volume prune` 등)은 쓰지 않습니다.
- 프론트엔드에서 새 백엔드 서비스로 가는 경로가 필요하면 React 는 `frontend/nginx.conf`(Docker) 와 `frontend/vite.config.ts`(개발 서버) 의 프록시를, Next.js 는 `frontend/next.config.ts` 의 `rewrites` 를 추가합니다. nginx 는 기존 블록처럼 `set $xxx_upstream http://<서비스>:<포트>; proxy_pass $xxx_upstream;` 과 `proxy_set_header Host $http_host;` 를 씁니다 (컨테이너를 다시 만들어도 502 가 나지 않고, 포트를 바꿔도 CORS 에 걸리지 않음).
- HTTP 서비스에는 `healthcheck` 를 두고, 다른 서비스가 기다려야 하면 `depends_on: <서비스>: condition: service_healthy` 로 연결합니다.
- 컨테이너는 root 가 아닌 사용자로 실행합니다 (기존 Dockerfile 의 `USER` 참고).
- `make` 대상을 추가하면 주석(`## 설명`)을 붙입니다.
- 확인: `docker compose config -q` (문법), `make up && make ps`.
