---
name: apply-design
description: design/ 폴더의 디자인 원본(Google Stitch 내보내기 HTML·이미지, tweakcn 등의 CSS 변수, 참고 스크린샷)을 디자인 토큰과 UI 컴포넌트, 화면에 적용한다. "디자인 적용해줘", "Stitch 디자인 넣어줘", "색 바꿔줘" 같은 요청에 사용.
argument-hint: "[design/ 아래 경로] [범위: 색과 글꼴만 | 화면 이름]"
---

# 디자인 적용

요청: $ARGUMENTS

`.claude/rules/design.md` 의 세 층(토큰 → UI 컴포넌트 → 화면) 순서로 적용합니다. **동작 코드는 바꾸지 않습니다**: 상태, 이벤트 처리, API 호출, 라우팅, 인증 확인, 폼 필드 `name`, 에러 표시는 그대로 두고 마크업과 클래스만 바꿉니다.

## 0. 입력 찾기
- 경로가 주어지면 그 경로, 없으면 `design/` 전체를 봅니다 (`.gitkeep` 제외).
- 아무 파일도 없으면 `design/README.md` 의 "Google Stitch 에서 가져오기"를 짧게 안내하고 멈춥니다.
- 프론트엔드 종류는 `.harness.json` 의 `stack.frontend` (`react` = Vite + React Router, `next` = Next.js App Router) 로 확인합니다.

## 1. 원본 읽기
- **Stitch HTML** (`design/stitch/<화면>/code.html`): `<script id="tailwind-config">` 또는 `tailwind.config = {...}` 의 `colors`, `fontFamily`, `borderRadius`, 글꼴 `<link>`, 아이콘 글꼴(Material Symbols) 사용 여부, 반복되는 클래스 묶음(버튼, 카드, 입력칸)을 정리합니다. `screen.png` 도 열어 보고 실제 모습과 맞춥니다.
- **CSS 변수 파일** (`design/theme/*.css`, tweakcn·shadcn 형식): `:root` / `.dark` 의 `--background`, `--primary` … 는 이 프로젝트와 이름이 같습니다. `--radius`, `--font-sans` 등은 아래 표대로 옮깁니다.
- **이미지만 있을 때** (`design/references/`): 화면에서 주 색, 바탕색, 글자색, 테두리, 모서리, 그림자, 글꼴 느낌을 읽어 값을 정합니다. 추정한 값은 보고에 표시합니다.
- **React/HTML 코드** (v0, HyperUI 등): 구조와 클래스를 참고하되, 색 클래스는 토큰으로 바꿔 옮깁니다.

## 2. 토큰 (`frontend/src/styles/theme.css`)
원본 값을 아래 토큰으로 옮깁니다. 토큰 이름은 바꾸지 않고 값만 바꿉니다.

| 원본 (Stitch tailwind.config / CSS 변수 / 화면) | 토큰 |
| --- | --- |
| `primary` | `--primary` (+ 그 위 글자색 `--primary-foreground`: 대비 4.5:1 이상인 흰색 또는 짙은 색) |
| `background-light` / 페이지 바탕 | `--background` (`.dark` 에는 `background-dark`) |
| 카드·패널·입력칸 바탕 (`surface`, `white` 등) | `--card` |
| 본문 글자 (`gray-900`, `text-*` 계열 가장 진한 색) | `--foreground`, `--card-foreground` |
| 설명 글자 (`gray-500~600`) | `--muted-foreground` |
| 옅은 배경 (`gray-50~100`) | `--muted`, `--secondary` |
| 강조 배경 (primary 의 옅은 색, `primary/10`) | `--accent`, 그 위 글자 `--accent-foreground` |
| 테두리 (`gray-200`) / 입력 테두리 (`gray-300`) | `--border` / `--input` |
| 포커스 링 | `--ring` (보통 primary) |
| 오류 색 (`red-*`) | `--destructive` |
| `fontFamily.display` / `fontFamily.body` (`--font-sans`) | `--font-display` / `--font-body` |
| `borderRadius.xl` 또는 카드 모서리 (`--radius`) | `--radius` |
| `borderRadius.DEFAULT`/`lg` 또는 버튼 모서리 | `--control-radius` |
| 카드 그림자 | `--card-shadow` |

- 원본에 다크 모드 값이 있으면 `.dark` 블록에도 넣습니다. 없으면 `.dark` 는 그대로 둡니다.
- 위 표에 없는 의미 있는 색(성공, 경고, 두 번째 강조색 등)은 새 토큰으로 추가합니다 (`design.md` 의 "새 색" 절차: `theme.css` 의 `:root`·`.dark` + `@theme inline` 연결).
- 글꼴: 원본의 글꼴 `<link>` 를 React 는 `frontend/index.html` 의 `<head>`, Next 는 `frontend/src/app/layout.tsx` 의 `<head>` 에 넣고, 글꼴 이름을 `--font-body`/`--font-display` 앞에 둡니다. 한글이 섞이면 뒤에 한글 글꼴(예: Pretendard)을 남깁니다.
- 아이콘: 원본이 Material Symbols 를 쓰면 같은 글꼴 `<link>` 를 추가하고 `<span className="material-symbols-outlined">이름</span>` 으로 씁니다.

## 3. UI 컴포넌트 (`frontend/src/components/ui/`)
- 원본에서 반복되는 버튼·카드·입력칸 모양을 `styles.ts` 의 `buttonClass`, `cardClass`, `inputClass` 에 반영합니다 (둥글기, 여백, 글자 굵기, 그림자, hover). 색은 토큰 클래스로만 씁니다.
- 원본에 있고 여기 없는 반복 요소(배지, 아바타, 구분선 등)는 `components/ui/` 에 새로 만듭니다.

## 4. 레이아웃과 화면
- 범위가 "색과 글꼴만"이면 이 단계를 건너뜁니다.
- 원본 화면을 프로젝트 화면과 짝지읍니다: 랜딩·홈 → 랜딩, 로그인 → 로그인, 회원가입·가입 → 회원가입, 대시보드·홈(로그인 후) → 대시보드, 헤더·푸터 → 레이아웃. React 는 `src/pages/*Page.tsx`, `src/components/Layout.tsx`, Next 는 `src/app/**/page.tsx`, `src/components/SiteHeader.tsx`·`SiteFooter.tsx`.
- 짝이 없는 원본 화면은 새 페이지로 만들고 라우트·메뉴를 연결합니다. 필요한 API 가 없으면 화면만 만들고 보고에 "API 필요"로 적습니다.
- 원본 마크업을 옮길 때:
  - 색 클래스(`bg-[#..]`, `text-gray-500`, `bg-primary/10` 처럼 원본 이름을 쓴 것)는 2단계 표의 토큰 클래스로 바꿉니다.
  - 버튼·카드·입력칸은 `Button`/`buttonClass`, `Card`, `FormField` 로 바꿉니다.
  - 링크는 React 는 `Link`/`NavLink`(react-router-dom), Next 는 `next/link`.
  - 원본 문구는 쓰되 서비스 이름은 `src/config/site.ts` 에서 가져오고, 화면 문구는 한국어로 둡니다 (원본이 영어면 번역).
  - 원본의 외부 이미지 URL 은 그대로 두지 말고 `frontend/public/images/` 에 내려받아 쓰거나(가능할 때), 자리표시 영역으로 바꾸고 보고합니다.
  - 기존 화면의 로그인 상태 분기(`user ? ... : ...`), 제출 중 표시, 에러 표시, 리다이렉트는 반드시 남깁니다.

## 5. 검증과 보고
1. `cd frontend && npm run lint && npm run build` 통과 (lint 가 직접 색 지정을 잡아냅니다).
2. 가능하면 개발 서버(`npm run dev`)로 바뀐 화면을 열어 원본 이미지와 비교합니다.
3. 보고: 원본 → 토큰 대응표(값 포함), 바꾼 파일, 짝지은 화면 목록, 적용하지 못했거나 추정한 부분. 사용자가 값만 고치면 되도록 `theme.css` 위치를 알려 줍니다.
