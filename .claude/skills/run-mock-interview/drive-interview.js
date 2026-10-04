// 인터뷰AI 를 가짜 카메라·마이크로 처음부터 끝까지 돌리는 Playwright 코드입니다 (점검 → 면접 진행 → 결과 화면).
// 사용: Playwright MCP 의 browser_run_code_unsafe 에 filename 으로 이 파일을 넘깁니다 (SKILL.md 참고).
// 이 파일은 `async (page) => { ... }` 하나라서 Playwright 서버(Node) 안에서 실행됩니다. 인자는 아래 CONFIG 를 고쳐서 바꿉니다.
async (page) => {
  const CONFIG = {
    base: 'http://localhost:3000', // docker compose 의 프론트엔드. 개발 서버를 쓰면 http://localhost:5173
    api: 'http://127.0.0.1:8080', // Node 의 fetch 는 localhost 를 IPv6(::1)로 먼저 찾아 실패하므로 127.0.0.1
    email: 'run-skill@example.com', // 없으면 가입합니다
    password: 'password123',
    questions: 3,
    answerSeconds: 10, // 질문마다 녹음하는 시간. 가짜 마이크가 반복 재생하는 한국어 음성이 이 시간 동안 녹음됩니다.
    assets: '.claude/skills/run-mock-interview/assets', // Playwright 서버의 작업 폴더(프로젝트 루트) 기준
    out: '.claude/skills/run-mock-interview/out',
  }
  const notes = []
  const shot = (name) => page.screenshot({ path: `${CONFIG.out}/${name}.png`, fullPage: true })

  // ---- 1) API 로 로그인(없으면 가입)하고, 시작 전(READY) 면접을 찾거나 새로 만듭니다 (질문 생성은 실제 AI 를 부릅니다) ----
  const call = async (path, body, token) => {
    const res = await fetch(CONFIG.api + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(`${path} ${res.status} ${json.message ?? ''}`)
    return json
  }
  const creds = { email: CONFIG.email, password: CONFIG.password }
  await call('/api/auth/signup', { ...creds, name: '실행 점검' }).catch(() => {}) // 이미 있으면 무시
  const token = (await call('/api/auth/login', creds)).accessToken
  let interview = (await call('/api/interviews?status=READY&limit=1', null, token)).items[0]
  if (!interview) {
    interview = await call('/api/interviews', { field: '백엔드 개발자', level: 'NEWCOMER', questionCount: CONFIG.questions, prepSeconds: 0 }, token)
    notes.push('면접을 새로 만들었습니다')
  }
  const id = interview.id
  const count = interview.questionCount
  notes.push(`면접 ${id} (질문 ${count}개)`)

  // ---- 2) 가짜 카메라·마이크: 영상은 사진을 캔버스에 그려서, 마이크는 한국어 음성을 WebAudio 로 반복 재생해서 만듭니다 ----
  // 음성은 스피커로 나가지 않고 마이크 스트림으로만 흐릅니다 (소리가 나지 않음). 파일은 route 로 대신 내려 주므로 서버가 필요 없습니다.
  const cors = { 'access-control-allow-origin': '*' }
  // 얼굴 인식용 사진은 저장소에 두지 않고 MediaPipe 공식 예제 이미지를 실행할 때 내려받습니다 (분석 모델을 받는 곳과 같은 Google 저장소).
  let portrait = null
  await page.route('http://fake-assets.local/portrait.jpg', async (r) => {
    portrait ??= Buffer.from(await (await fetch('https://storage.googleapis.com/mediapipe-assets/portrait.jpg')).arrayBuffer())
    await r.fulfill({ body: portrait, contentType: 'image/jpeg', headers: cors })
  })
  await page.route('http://fake-assets.local/answer.wav', (r) => r.fulfill({ path: `${CONFIG.assets}/answer.wav`, contentType: 'audio/wav', headers: cors }))
  await page.addInitScript(() => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.src = 'http://fake-assets.local/portrait.jpg'
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = new MediaStream()
      if (constraints.video) {
        await new Promise((resolve) => (image.complete ? resolve() : (image.onload = resolve)))
        const canvas = document.createElement('canvas')
        canvas.width = 1280
        canvas.height = 720
        const g = canvas.getContext('2d')
        const draw = () => {
          g.fillStyle = '#888'
          g.fillRect(0, 0, 1280, 720)
          const w = (image.width * 720) / image.height
          g.drawImage(image, (1280 - w) / 2, 0, w, 720)
          requestAnimationFrame(draw)
        }
        draw()
        canvas.captureStream(30).getVideoTracks().forEach((t) => stream.addTrack(t))
      }
      if (constraints.audio) {
        // 호출마다 새 오디오 그래프를 만듭니다 (앱이 스트림을 다시 열 때마다 끝난 트랙을 재사용하지 않도록).
        const ctx = new AudioContext()
        const destination = ctx.createMediaStreamDestination()
        const buffer = await ctx.decodeAudioData(await (await fetch('http://fake-assets.local/answer.wav')).arrayBuffer())
        const source = ctx.createBufferSource()
        source.buffer = buffer
        source.loop = true
        source.connect(destination)
        source.start()
        window.__fakeAudioCtx = ctx // 사용자 동작 뒤에 resume() 해야 소리가 흐릅니다
        destination.stream.getAudioTracks().forEach((t) => stream.addTrack(t))
      }
      return stream
    }
  })

  // ---- 3) 로그인 상태로 점검 화면 열기 ----
  await page.goto(CONFIG.base + '/login')
  await page.evaluate((t) => localStorage.setItem('accessToken', t), token)
  await page.goto(`${CONFIG.base}/interviews/${id}/check`)
  await page.getByText('기준 자세 측정').first().waitFor({ timeout: 30000 })

  // 동의 체크 = 사용자 동작이므로 오디오 컨텍스트를 깨우고, 스트림을 다시 열어 마이크 소리가 흐르게 합니다.
  await page.getByLabel('위 내용을 확인했고 동의합니다').check()
  await page.evaluate(() => window.__fakeAudioCtx?.resume())
  await page.getByRole('button', { name: '다시 측정하기' }).last().click() // 장치 다시 열기
  await page.evaluate(() => window.__fakeAudioCtx?.resume())
  // 분석 모델(wasm, 얼굴·포즈)을 내려받아 초기화할 때까지 기다린 뒤 기준 자세를 잽니다.
  const measure = page.getByRole('button', { name: /기준 자세 측정/ })
  await page.waitForFunction(
    () => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('기준 자세 측정') && !b.disabled),
    null,
    { timeout: 90000 },
  )
  await measure.click()
  await page.getByText('기준 자세를 기록했어요').waitFor({ timeout: 30000 })
  // 한국어 음성이 없는 환경에서도 같은 흐름이 되도록 질문은 텍스트로만 진행합니다.
  const textOnly = page.getByLabel('소리 없이 질문을 텍스트로만 볼게요')
  if (!(await textOnly.isChecked().catch(() => true))) await textOnly.check()
  await page.getByText('면접 준비가 모두 끝났어요').waitFor({ timeout: 30000 })
  await shot('1-check-ready')

  // ---- 4) 준비 완료 → 면접 진행 ----
  const calls = []
  page.on('response', (r) => {
    if (r.url().includes('/api/interviews')) calls.push(`${r.request().method()} ${r.url().replace(CONFIG.base, '')} ${r.status()}`)
  })
  await page.getByRole('button', { name: /준비 완료/ }).click()
  await page.waitForURL(/\/run$/, { timeout: 15000 })
  await page.getByRole('button', { name: /면접 시작|이어서 시작/ }).click()
  for (let q = 1; q <= count; q++) {
    await page.waitForFunction(() => document.body.innerText.includes('답변하고 있어요'), null, { timeout: 30000 })
    if (q === 1) await shot('2-recording')
    await page.waitForTimeout(CONFIG.answerSeconds * 1000)
    await page.getByRole('button', { name: /답변 완료/ }).click()
    notes.push(`질문 ${q} 답변 완료`)
  }
  await shot('3-finishing')

  // ---- 5) 업로드·피드백·리포트가 끝나면 결과 화면으로 이동합니다 (실제 AI 를 부르므로 1~2분까지 걸립니다) ----
  await page.waitForURL(/\/result$/, { timeout: 240000 })
  await page.getByText('종합 점수').waitFor({ timeout: 30000 })
  await shot('4-result')
  const text = await page.locator('body').innerText()
  const score = text.match(/종합 점수\s+(\d+)/)?.[1] ?? null
  return { interviewId: id, notes, score, calls, screenshots: `${CONFIG.out}/*.png`, resultTop: text.slice(0, 300) }
}
