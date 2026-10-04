// PostToolUse(Edit|Write): 방금 고친 파일 하나만 빠르게 검사합니다.
// 문제가 있으면 exit 2 로 Claude 에게 알려 바로 고치게 합니다.
import path from 'node:path'
import { exists, has, readInput, ROOT, run, tail } from './lib.mjs'

const input = await readInput()
const file = input.tool_input?.file_path
if (!file) process.exit(0)

const rel = path.relative(ROOT, path.resolve(ROOT, file)).split(path.sep).join('/')

function report(title, output) {
  process.stderr.write(`[lint-file] ${title}: ${rel}\n${tail(output, 40)}\n`)
  process.exit(2)
}

// 프론트엔드 TS/TSX → oxlint (node_modules 가 있을 때만). 디자인 규칙(직접 색 지정)은 Stop 훅의 npm run lint 에서 검사합니다.
if (/^frontend\/src\/.*\.(ts|tsx)$/.test(rel) && exists('frontend', 'node_modules', '.bin')) {
  const res = run('npx', ['--no-install', 'oxlint', path.relative('frontend', rel)], path.join(ROOT, 'frontend'))
  if (!res.ok && !res.missing) report('oxlint 경고/오류', res.output)
}

// 파이썬 (FastAPI 백엔드·서비스, ml 작업 공간) → ruff format + ruff check (uv 와 .venv 가 있을 때만)
const py = rel.match(/^(backend|fastapi|ml)\/.*\.py$/)
if (py && exists(py[1], 'pyproject.toml') && exists(py[1], '.venv') && has('uv')) {
  const cwd = path.join(ROOT, py[1])
  const target = path.relative(py[1], rel)
  run('uv', ['run', '--frozen', 'ruff', 'format', target], cwd)
  const res = run('uv', ['run', '--frozen', 'ruff', 'check', target], cwd)
  if (!res.ok && !res.missing) report('ruff 오류', res.output)
}

process.exit(0)
