---
paths:
  - "frontend/src/**"
  - "design/**"
---

# 디자인 규칙

디자인은 **토큰 → UI 컴포넌트 → 화면** 세 층으로 나눕니다. 디자인을 바꿀 때 위층만 고치면 되도록 아래층에 값을 쓰지 않습니다.

| 층 | 위치 | 담는 것 |
| --- | --- | --- |
| 토큰 | `src/styles/theme.css` | 색, 글꼴, 모서리, 그림자 값 (`:root` 와 `.dark`) |
| 토큰 연결 | `src/index.css`(React) / `src/app/globals.css`(Next) 의 `@theme inline` | 토큰 → Tailwind 클래스 이름. 값은 쓰지 않음 |
| UI 컴포넌트 | `src/components/ui/` | Button, Card, Input, FormField, Alert 와 모양 함수(`styles.ts` 의 `buttonClass`, `cardClass` …) |
| 화면 | 페이지, 레이아웃 | 배치(그리드, 여백, 글자 크기)와 UI 컴포넌트 조합 |

## 지킬 것
- 화면과 컴포넌트에서 색은 토큰 클래스만 씁니다: `bg-background` `text-foreground` `bg-card` `bg-primary` `text-primary-foreground` `bg-secondary` `bg-muted` `text-muted-foreground` `bg-accent` `text-accent-foreground` `text-destructive` `border-border` `border-input` `ring-ring`. 투명도는 `bg-primary/90` 처럼 붙입니다.
- `bg-blue-500`, `text-white`, `border-[#ddd]`, `style={{ color: '#..' }}` 같은 직접 색 지정은 쓰지 않습니다. `npm run lint` (`scripts/check-design.mjs`) 가 막습니다. 정말 필요하면 그 줄 끝에 `// design-allow` 와 이유를 적습니다.
- 모서리는 `rounded-card`(카드·패널), `rounded-control`(버튼·입력), 그림자는 `shadow-card`, 제목 글꼴은 `font-heading` 을 씁니다.
- 버튼·링크 버튼은 `<Button>` 또는 `buttonClass({ variant, size })`, 카드는 `<Card>` 또는 `cardClass`, 입력은 `<FormField>`/`<Input>`. 같은 모양이 두 번 나오면 `components/ui/` 에 추가합니다.
- 새 색이 필요하면 (예: 성공 표시) `theme.css` 에 `--success`, `--success-foreground` 를 `:root` 와 `.dark` 에 함께 추가하고, `@theme inline` 에 `--color-success: var(--success);` 를 연결한 뒤 `text-success` 로 씁니다.
- 글꼴을 바꾸면 `theme.css` 의 `--font-body`/`--font-display` 와 글꼴을 불러오는 곳(React: `index.html` 의 `<link>`, Next: `src/app/layout.tsx` 의 `<link>`)을 함께 고칩니다.

## 외부 디자인 적용
- 디자인 원본(Google Stitch 내보내기, 참고 이미지, tweakcn CSS)은 `design/` 에 둡니다. 원본 HTML 을 `src/` 로 복사하지 않습니다.
- 적용 절차는 `/apply-design` 스킬을 따릅니다. 순서: 토큰 → UI 컴포넌트 → 레이아웃 → 화면. 로그인·API 호출 같은 동작 코드는 바꾸지 않습니다.
