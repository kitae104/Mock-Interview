---
name: add-domain
description: 새 도메인(예: 게시글, 상품) 기능을 백엔드 API부터 프론트엔드 화면까지 한 번에 추가한다. "게시판 만들어줘", "상품 CRUD 추가" 같은 요청에 사용.
argument-hint: "<도메인 이름과 필드 설명>"
---

# 도메인 기능 추가

요청: $ARGUMENTS

이미 있는 회원가입·로그인 기능(백엔드의 auth·user, 프론트엔드의 로그인·회원가입 화면)을 기준으로, 같은 모양의 코드를 세로로 한 번에 만듭니다. 필드나 권한이 요청에 없으면 합리적인 기본값을 정하고 마지막 보고에 적습니다. 어떤 백엔드·프론트엔드인지는 `.harness.json` 의 `stack` 에 있습니다.

## 1. 설계 확인 (코드 작성 전)
- 이름(영문 단수, 예: `Post`), 필드와 타입, 필수 여부, 소유자(작성 사용자) 연결 여부.
- 엔드포인트: 기본은 `GET /api/<복수>`(목록, 페이지네이션 `page`,`size`), `GET /api/<복수>/{id}`, `POST`, `PUT /{id}`, `DELETE /{id}`.
- 권한: 기본은 로그인 사용자 전체 조회, 수정·삭제는 작성자만 (아니면 403).
- 응답 필드 이름은 camelCase, 에러는 `{ status, message, errors, timestamp }` 와 한국어 메시지.

## 2. 백엔드
`.claude/rules/backend.md` 의 **새 도메인 추가** 절차를 그대로 따릅니다. 테스트까지 통과시킨 뒤 다음 단계로 갑니다.

## 3. 프론트엔드
`.claude/rules/frontend.md` 의 **새 도메인 추가** 절차를 따르고, 화면은 `.claude/rules/design.md` 대로 `components/ui/` 와 토큰 클래스만 씁니다.

## 4. 마무리
- 새 환경 변수가 생겼다면 `.env.example`, `docker-compose.yml`, 백엔드 설정 파일에 함께 반영
- `README.md` 의 API 표에 새 엔드포인트 추가
- 보고: 만든 파일, 엔드포인트 표, 정한 기본값(권한, 필드), 실행한 검증과 결과
