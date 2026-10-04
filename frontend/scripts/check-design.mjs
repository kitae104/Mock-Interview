// 디자인 규칙 검사: 화면 코드(src/)에 색을 직접 쓰지 않았는지 확인합니다.
// 색은 src/styles/theme.css 의 토큰(bg-primary, text-muted-foreground ...)으로만 씁니다.
// 그래야 theme.css 만 바꿔서 디자인 전체를 바꿀 수 있습니다.
//
// 꼭 필요한 줄은 끝에 `design-allow` 주석을 붙이면 검사에서 빠집니다.
// npm run lint 가 oxlint 다음에 이 스크립트를 실행합니다.
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..', 'src')
const SKIP_DIRS = new Set(['styles'])
const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'
const PREFIX = 'bg|text|border|border-[trblxy]|ring|ring-offset|outline|fill|stroke|from|via|to|divide|placeholder|decoration|accent|caret|shadow'
const RULES = [
  { re: new RegExp(`\\b(?:${PREFIX})-(?:${PALETTE})-\\d{2,3}\\b`, 'g'), why: 'Tailwind 기본 팔레트 색' },
  { re: new RegExp(`\\b(?:${PREFIX})-(?:white|black)\\b`, 'g'), why: '흰색/검은색 직접 지정' },
  { re: /\b[a-z-]+-\[(?:#|rgb|hsl|oklch)[^\]]*\]/g, why: '임의 색 값' },
  { re: /(?:color|background(?:Color)?|borderColor)\s*:\s*['"`](?:#|rgb|hsl|oklch)/g, why: 'style 속성의 색 값' },
]

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(full)
    } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
      yield full
    }
  }
}

const problems = []
for (const file of walk(ROOT)) {
  const lines = fs.readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    if (line.includes('design-allow')) return
    for (const { re, why } of RULES) {
      for (const m of line.matchAll(re)) {
        problems.push(`${path.relative(process.cwd(), file)}:${i + 1}  ${m[0]}  (${why})`)
      }
    }
  })
}

if (problems.length) {
  console.error(`디자인 토큰 대신 색을 직접 쓴 곳이 있습니다 (${problems.length}곳).`)
  console.error('src/styles/theme.css 의 토큰 클래스(bg-primary, text-muted-foreground, border-border 등)로 바꾸세요.\n')
  console.error(problems.join('\n'))
  process.exit(1)
}
