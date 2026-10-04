# 디자인 원본 폴더

이 폴더에는 화면에 적용할 **디자인 원본**을 둡니다. 실제 화면 코드(`frontend/src/`)는 여기 있는 파일을 직접 가져다 쓰지 않고, Claude Code 의 `/apply-design` 이 읽어서 프로젝트 구조에 맞게 옮깁니다.

```
design/
├── stitch/       # Google Stitch 에서 내보낸 화면 (화면마다 폴더 하나: code.html + screen.png)
├── theme/        # tweakcn, Realtime Colors 등에서 받은 CSS 변수 파일
└── references/   # 참고 스크린샷, 다른 사이트 캡처, 무드보드
```

## 디자인이 화면에 들어가는 구조

| 층 | 파일 | 바꾸면 |
| --- | --- | --- |
| 토큰 | `frontend/src/styles/theme.css` | 색·글꼴·모서리·그림자가 전체 화면에서 바뀜 |
| UI 컴포넌트 | `frontend/src/components/ui/` | 버튼·카드·입력칸 모양이 모든 화면에서 바뀜 |
| 레이아웃·화면 | 헤더/푸터, 각 페이지 | 배치와 구성이 바뀜 |

화면 코드는 색을 직접 쓰지 않고 토큰 클래스(`bg-primary`, `text-muted-foreground` …)만 씁니다. `npm run lint` 가 이 규칙을 검사합니다.

## 1. Google Stitch 에서 가져오기

1. https://stitch.withgoogle.com 에서 화면을 만듭니다. 랜딩, 로그인, 회원가입, 대시보드처럼 **이 프로젝트에 있는 화면 이름**으로 만들면 짝을 맞추기 쉽습니다.
2. 화면마다 내보내기(Export) 메뉴에서 **코드(HTML)** 를 내려받거나 복사하고, 화면 이미지(PNG)도 함께 받습니다. 여러 화면을 한 번에 zip 으로 받았다면 풀어서 넣으면 됩니다. (메뉴 이름은 Stitch 업데이트에 따라 조금 다를 수 있습니다.)
3. 이렇게 넣습니다.
   ```
   design/stitch/landing/code.html
   design/stitch/landing/screen.png
   design/stitch/login/code.html
   design/stitch/login/screen.png
   ```
4. Claude Code 에서 실행합니다.
   ```
   /apply-design
   /apply-design design/stitch/landing   # 화면 하나만
   /apply-design 색과 글꼴만             # 토큰만 적용
   ```

Stitch 의 HTML 에는 `tailwind.config` (색, 글꼴, 모서리)가 들어 있어서 `/apply-design` 이 이것을 먼저 토큰으로 옮기고, 그다음 화면 구조를 옮깁니다. 로그인·회원가입·API 호출 같은 동작 코드는 그대로 둡니다.

## 2. Stitch 를 쓰지 않을 때 (추천 사이트)

| 하고 싶은 것 | 사이트 | 넣는 곳 |
| --- | --- | --- |
| 색·글꼴·모서리 테마만 바꾸기 (가장 쉬움) | tweakcn — https://tweakcn.com (shadcn 테마 편집기. 변수 이름이 이 프로젝트와 같아 거의 그대로 들어감) | 내보낸 CSS 를 `design/theme/theme.css` 로 저장 |
| 어울리는 색 조합 찾기 | Realtime Colors — https://www.realtimecolors.com | 내보낸 CSS 를 `design/theme/` 에 저장 |
| 문장으로 화면 만들기 (Stitch 대신 AI) | v0 — https://v0.app (React + Tailwind 코드) | 받은 코드를 `design/references/<화면>.tsx` 로 저장 |
| 랜딩·로그인 화면 블록 고르기 | HyperUI — https://www.hyperui.dev , Flowbite Blocks — https://flowbite.com/blocks | 코드를 `design/references/<화면>.html` 로 저장 |
| 디자이너 시안 | Figma (Community 파일 포함) | 화면 캡처를 `design/references/` 에, 색·글꼴 값을 메모로 |
| 한글 글꼴 | Pretendard, 눈누 — https://noonnu.cc , Google Fonts — https://fonts.google.com | 글꼴 이름을 요청에 적기 |

넣은 뒤 `/apply-design` 을 실행하거나, "design/theme/theme.css 를 적용해줘"처럼 요청하면 됩니다.

## 3. 직접 바꾸기

- 주 색만 바꾸려면 `frontend/src/styles/theme.css` 의 `--primary` 값을 고칩니다 (hex 도 됩니다: `--primary: #0f766e;`).
- 어두운 테마는 같은 파일의 `.dark { ... }` 값을 고치고, `<html class="dark">` 로 켭니다.
- 버튼 모양(둥글기, 크기)은 `frontend/src/components/ui/styles.ts` 의 `buttonClass` 에서 한 번에 바꿉니다.
