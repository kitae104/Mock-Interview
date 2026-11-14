// Stop 훅: Claude 가 작업을 끝내려 할 때, git 기준으로 바뀐 영역만 검증합니다.
//   backend/  → Spring: ./gradlew test · FastAPI: ruff check, ruff format --check, pytest
//   frontend/ → npm run lint (oxlint + 디자인 규칙) + 타입 검사
//   fastapi/, ml/ → ruff check, ruff format --check, pytest
// 실패하면 exit 2 로 끝내기를 막고 실패 내용을 Claude 에게 돌려줍니다.
// 같은 변경으로 이미 통과했다면 다시 돌리지 않습니다 (.claude/.verify-cache).
// 끄기: HARNESS_VERIFY=off 환경 변수.
// Windows 애플리케이션 제어 정책이 로컬 pytest(또는 파이썬 확장 DLL)를 막으면, 같은 테스트를
// 이 프로젝트의 backend 이미지로 띄운 Docker 컨테이너에서 대신 돌립니다 (dockerPytest).
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { exists, gradlew, has, readInput, ROOT, run, tail } from './lib.mjs'

const MAX_BLOCKS = 3 // 연속으로 이만큼 막았는데도 실패하면 사람에게 넘깁니다.
const CACHE_DIR = path.join(ROOT, '.claude', '.verify-cache')
const STATE_FILE = path.join(CACHE_DIR, 'state.json')

if (process.env.HARNESS_VERIFY === 'off') process.exit(0)
const input = await readInput()

// -z: 경로를 따옴표·이스케이프 없이 NUL 로 구분 (한글 파일 이름도 그대로)
const status = run('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], ROOT)
if (!status.ok) process.exit(0) // git 저장소가 아니면 건너뜀

const changed = []
const entries = status.output.split('\0')
for (let i = 0; i < entries.length; i++) {
  const entry = entries[i]
  if (entry.length < 4) continue
  changed.push(entry.slice(3))
  // 이름 변경(R)·복사(C)는 다음 항목이 원래 경로
  if (entry[0] === 'R' || entry[0] === 'C') changed.push(entries[++i])
}

// 파이썬 프로젝트(uv) 공통 검사
const pythonChecks = (cwd) => [
  { name: 'ruff check', cmd: 'uv', args: ['run', 'ruff', 'check', '.'], cwd },
  { name: 'ruff format --check', cmd: 'uv', args: ['run', 'ruff', 'format', '--check', '.'], cwd },
  { name: 'pytest', cmd: 'uv', args: ['run', 'pytest', '-q'], cwd },
]
const pythonArea = (dir) => ({
  match: (p) => p.startsWith(`${dir}/`),
  available: () => exists(dir, 'pyproject.toml') && has('uv'),
  checks: pythonChecks(dir),
})
// 실행 자체가 정책으로 막힌 경우만 대체합니다. 테스트 실패는 그대로 실패입니다.
const POLICY_BLOCKED = /os error 4551|애플리케이션 제어 정책|DLL load failed/

// docker-compose.yml 의 backend 이미지(`${COMPOSE_PROJECT_NAME}-backend`)를 찾습니다. 없으면 null.
function backendImage() {
  if (!has('docker')) return null
  const res = run('docker', ['compose', 'config', '--images'], ROOT)
  if (!res.ok) return null
  const image = res.output
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => /-backend(:|$)/.test(l))
  if (!image || !run('docker', ['image', 'inspect', image], ROOT).ok) return null
  return image
}

// 소스는 읽기 전용으로 붙이고, 개발 의존성을 포함한 가상환경은 컨테이너 안(/tmp/venv)에 만들어 볼륨에 재사용합니다.
// 로컬 backend/.venv 는 건드리지 않습니다.
function dockerPytest(cwd) {
  const image = backendImage()
  if (!image) return null
  const project = image.replace(/:.*$/, '').replace(/-backend$/, '')
  const src = path.join(ROOT, cwd)
  const mount = `${src.includes(' ') ? `"${src}"` : src}:/src:ro`
  return run(
    'docker',
    [
      'run', '--rm', '-u', 'root', '-v', mount, '-v', `${project}-verify-venv:/tmp/venv`, '-w', '/src',
      '-e', 'UV_PROJECT_ENVIRONMENT=/tmp/venv', '-e', 'UV_LINK_MODE=copy', '-e', 'UV_COMPILE_BYTECODE=0',
      '-e', 'PYTHONDONTWRITEBYTECODE=1', image,
      'uv', 'run', '--locked', 'python', '-m', 'pytest', '-q', '-p', 'no:cacheprovider',
    ],
    ROOT,
  )
}

const isSpring = exists('backend', 'gradlew')
// Next.js 는 next build 가 타입 검사를 하지만 오래 걸리므로 tsc 만 돌립니다.
const typecheck = exists('frontend', 'next.config.ts')
  ? { name: 'tsc --noEmit', cmd: 'npx', args: ['--no-install', 'tsc', '--noEmit'], cwd: 'frontend' }
  : { name: 'tsc -b', cmd: 'npx', args: ['--no-install', 'tsc', '-b'], cwd: 'frontend' }

const AREAS = {
  backend: isSpring
    ? {
        match: (p) => p.startsWith('backend/'),
        available: () => has('java'),
        checks: [{ name: './gradlew test', cmd: gradlew, args: ['test', '-q'], cwd: 'backend' }],
      }
    : pythonArea('backend'),
  frontend: {
    match: (p) => p.startsWith('frontend/'),
    available: () => exists('frontend', 'node_modules'),
    checks: [
      { name: 'npm run lint', cmd: 'npm', args: ['run', 'lint', '--silent'], cwd: 'frontend' },
      typecheck,
      { name: 'npm run test', cmd: 'npm', args: ['run', 'test', '--silent'], cwd: 'frontend' },
    ],
  },
  fastapi: pythonArea('fastapi'),
  ml: pythonArea('ml'),
}

function fingerprint(files) {
  const h = createHash('sha256')
  for (const f of files.sort()) {
    h.update(f)
    const full = path.join(ROOT, f)
    h.update(fs.existsSync(full) && fs.statSync(full).isFile() ? fs.readFileSync(full) : 'deleted')
  }
  return h.digest('hex')
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
  } catch {
    return { passed: {}, blocks: 0 }
  }
}

function saveState(state) {
  fs.mkdirSync(CACHE_DIR, { recursive: true })
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
}

const state = loadState()
if (!input.stop_hook_active) state.blocks = 0

const failures = []
const skipped = []
for (const [area, spec] of Object.entries(AREAS)) {
  const files = changed.filter(spec.match)
  if (files.length === 0) continue
  const fp = fingerprint(files)
  if (state.passed[area] === fp) continue
  if (!spec.available()) {
    skipped.push(area)
    continue
  }
  let ok = true
  for (const check of spec.checks) {
    let res = run(check.cmd, check.args, path.join(ROOT, check.cwd))
    if (!res.ok && check.name === 'pytest' && POLICY_BLOCKED.test(res.output)) {
      const docker = dockerPytest(check.cwd)
      if (docker) res = { ...docker, output: `[로컬 실행이 정책으로 막혀 Docker 에서 실행]\n${docker.output}` }
    }
    if (!res.ok) {
      failures.push(`## ${area}: ${check.name} 실패\n${tail(res.output)}`)
      ok = false
      break
    }
  }
  if (ok) state.passed[area] = fp
}

if (failures.length === 0) {
  state.blocks = 0
  saveState(state)
  if (skipped.length) {
    console.log(JSON.stringify({ systemMessage: `[verify] 도구가 없어 검증을 건너뜀: ${skipped.join(', ')}` }))
  }
  process.exit(0)
}

state.blocks += 1
saveState(state)
if (state.blocks > MAX_BLOCKS) {
  console.log(
    JSON.stringify({
      systemMessage: `[verify] 검증이 ${MAX_BLOCKS}번 연속 실패해 멈춥니다. 실패 내용을 사용자에게 알리세요.\n${failures.join('\n\n')}`,
    }),
  )
  process.exit(0)
}
process.stderr.write(`[verify] 바뀐 영역의 검증이 실패했습니다. 고친 뒤 다시 끝내세요.\n\n${failures.join('\n\n')}\n`)
process.exit(2)
