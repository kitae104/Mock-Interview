---
name: run-mock-interview
description: 인터뷰AI(모의 면접) 앱을 실행하고 가짜 카메라·마이크로 면접을 처음부터 끝까지 돌려 본다. "앱 실행해 줘", "면접 진행 화면 돌려 봐", "run", "start", "screenshot", "e2e 확인", "점검 화면부터 결과 화면까지" 같은 요청에 사용.
---

# 인터뷰AI 실행과 조종

FastAPI 백엔드(8080)와 React 프론트엔드(3000, nginx)를 Docker Compose 로 띄우고, **Playwright MCP 로 브라우저를 조종**합니다.
카메라·마이크가 없는 PC 에서도 가짜 장치로 `/interviews/:id/check` → `/run` → `/result` 를 끝까지 돌리는 코드가 `drive-interview.js` 입니다.
이 문서의 경로는 프로젝트 루트(`Mock-Interview/`) 기준입니다. Windows + Git Bash 에서 확인했습니다.

## 준비

- Docker Desktop 실행 중, 루트 `.env` 에 AI 키(`OPENAI_API_KEY`)가 있어야 합니다 (질문 생성·음성 인식·피드백이 실제 OpenAI 를 부릅니다).
- Playwright MCP(`browser_run_code_unsafe`)가 연결돼 있어야 합니다.

## 띄우기

```bash
docker compose up -d --build        # db, backend(마이그레이션 자동), frontend
curl -s localhost:8080/api/health   # {"status":"UP"}
```

화면 http://localhost:3000, API 문서 http://localhost:8080/api/docs. 

## 조종하기 (에이전트 경로)

Playwright MCP 의 `browser_run_code_unsafe` 를 **filename 으로** 호출합니다:

```
browser_run_code_unsafe(filename=".claude/skills/run-mock-interview/drive-interview.js")
```

하는 일: 계정 가입·로그인(`run-skill@example.com`) → 시작 전 면접이 없으면 새로 생성(질문 3개, 생각할 시간 0초) → 가짜 카메라·마이크 주입 →
점검 화면(동의, 마이크, 기준 자세 측정) → "준비 완료" → 질문마다 10초 녹음 후 "답변 완료" → 결과 화면까지. 약 2~3분 걸립니다.
반환값: 면접 id, 종합 점수, 오간 API 호출 목록(`start` → `answer` ×3 → `finish`). 스크린샷은 `.claude/skills/run-mock-interview/out/*.png` (git 제외) 에 저장되니 **열어서 확인**하세요.

바꾸고 싶으면 파일 맨 위 `CONFIG` 를 고칩니다 (주소, 계정, 질문 수, 답변 녹음 시간).
**끝나면 반드시 `browser_close` 로 브라우저를 닫으세요.**

### 가짜 장치가 하는 일

- 카메라: MediaPipe 공식 예제 인물 사진을 1280×720 캔버스에 그려 `captureStream` 으로 내보냅니다 (사진은 실행할 때 Google 저장소에서 내려받음). 얼굴·어깨가 인식됩니다.
- 마이크: `assets/answer.wav`(Windows SAPI 로 만든 한국어 음성: "안녕하세요. 음, 저는 백엔드 개발자를 지원한 김철수입니다. … 어, 이제 프로젝트 경험을 …")를 WebAudio 로 반복 재생해 마이크 트랙으로 보냅니다. **스피커로는 소리가 나지 않습니다.**
- 파일은 `page.route` 로 가짜 주소(`http://fake-assets.local/...`)에 대신 내려 주므로 별도 서버가 필요 없습니다.
- 답변 내용은 질문과 무관해서 내용 점수는 낮게 나옵니다(정상). 이 음성에는 군말, 3초 침묵, 전화번호("010 1234 5678")가 들어 있어 말하기 지표와 개인정보 가림 확인에 쓸 수 있습니다.

## 사람이 쓰는 경로

브라우저에서 http://localhost:3000 → 가입 → 모의 면접 → 새 면접 → 면접 시작. 실제 카메라·마이크 권한이 필요합니다. (개발 서버 `npm run dev` 는 이 스킬에서 확인하지 않았습니다.)

## 테스트 (실행 확인이 아니라 보조)

```bash
cd backend && DATABASE_URL=sqlite:// PYTHONUTF8=1 uv run python -m pytest -q   # 이 PC 는 pytest.exe 와 psycopg DLL 이 막혀 있어 이렇게 실행
cd frontend && npm run lint && npm run test && npm run build
```

## Gotchas

- **Node `fetch` 는 `localhost` 가 안 됩니다.** Playwright 서버의 Node 는 `localhost` 를 IPv6(`::1`)로 먼저 찾는데 Docker 가 `127.0.0.1` 에만 열어서 `ECONNREFUSED` 가 납니다. 브라우저 쪽 주소는 `localhost:3000` 이어도 됩니다.
- **`browser_run_code_unsafe` 에는 `require` 가 없습니다** (`fs` 사용 불가). 스크린샷 폴더는 `page.screenshot` 이 만들어 줍니다. 전역 `fetch`, `Buffer` 는 됩니다.
- **오디오 컨텍스트는 사용자 동작 뒤에야 소리가 흐릅니다.** 그래서 동의 체크 후 `__fakeAudioCtx.resume()` 을 부르고 "다시 측정하기"로 스트림을 다시 엽니다. 이 단계가 없으면 마이크 소리 감지가 영원히 안 돼서 "준비 완료"가 잠긴 채입니다.
- **앱이 스트림을 닫고 다시 열면 이전 오디오 트랙은 끝난 상태**라서, 가짜 `getUserMedia` 는 호출마다 새 오디오 그래프를 만듭니다.
- 분석 모델(wasm, 얼굴·포즈)은 처음에 CDN(`cdn.jsdelivr.net`, `storage.googleapis.com`)에서 내려받아 수 초~수십 초 걸립니다. 그동안 "기준 자세 측정" 버튼이 비활성이라 스크립트가 활성화될 때까지 기다립니다. 네트워크가 막혀 있으면 분석 없이 진행되고 스크립트가 멈춥니다.
- 이 PC 에는 한국어 음성이 있어 질문을 소리로 읽습니다. 스크립트는 "텍스트로만 진행"을 체크해 소리와 시간을 줄입니다. 소리 읽기 흐름을 보려면 그 체크를 빼세요(읽는 동안 `speechSynthesis` 소리가 실제로 납니다).
- 면접을 끝까지 돌리면 실제 OpenAI 를 부릅니다(질문 생성 1회, 음성 인식 3회, 피드백 3회, 리포트 1회). 비용이 들고 분당 호출 한도(기본 20)가 있습니다.
- 가입한 계정과 면접은 DB 에 남습니다. 지우려면 면접 상세 화면의 삭제 버튼 또는 `DELETE /api/interviews/{id}`.

## Troubleshooting

- `TypeError: fetch failed` (cause `ECONNREFUSED`) → 백엔드가 안 떠 있거나(`docker compose ps`; 컨테이너가 없으면 `docker compose up -d --build`) `localhost` 를 썼습니다 → `CONFIG.api` 는 `127.0.0.1`.
- `ReferenceError: require is not defined` → 위 Gotcha. 스크립트에서 `require` 를 쓰지 마세요.
- "준비 완료"가 계속 비활성 → 점검 체크리스트에서 어느 항목이 비었는지 스크린샷 확인. 보통 마이크 소리 미감지(오디오 컨텍스트가 `suspended`)입니다.
- 결과 화면 대신 `finish` 502 → AI 호출 실패(키, 한도, 네트워크). 결과 화면에서 "다시 만들기"가 같은 요청을 다시 보냅니다.
- 소리가 계속 나는 것 같다 → 오디오 요소를 쓰던 예전 방식의 흔적입니다. 지금 방식은 소리가 나지 않으니 남아 있는 Playwright 브라우저 창을 닫으세요(`browser_close`).
