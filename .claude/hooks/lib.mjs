// 훅 공용 함수. Node 표준 라이브러리만 사용합니다 (Windows 의 Git Bash 에서도 동작).
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

export const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd()
const WIN = process.platform === 'win32'

export async function readInput() {
  let data = ''
  for await (const chunk of process.stdin) data += chunk
  try {
    return JSON.parse(data || '{}')
  } catch {
    return {}
  }
}

export function run(cmd, args, cwd) {
  const res = spawnSync(cmd, args, { cwd, encoding: 'utf8', shell: WIN, maxBuffer: 64 * 1024 * 1024 })
  return { ok: res.status === 0, output: `${res.stdout ?? ''}${res.stderr ?? ''}`, missing: res.error?.code === 'ENOENT' }
}

// 명령이 설치되어 있는지. Windows 는 shell 을 거치면 ENOENT 가 나지 않으므로 where 로 찾습니다.
export function has(cmd) {
  if (WIN) return spawnSync('where', [cmd], { stdio: 'ignore' }).status === 0
  return !run(cmd, ['--version'], ROOT).missing
}

export function exists(...parts) {
  return fs.existsSync(path.join(ROOT, ...parts))
}

export function tail(text, lines = 60) {
  return text.trimEnd().split('\n').slice(-lines).join('\n')
}

export const gradlew = WIN ? 'gradlew.bat' : './gradlew'
