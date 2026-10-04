---
paths:
  - "frontend/**"
---

# 프론트엔드 규칙 (React 19, TypeScript, Vite, Tailwind v4)

- API 호출은 `src/api/<도메인>.ts` 에 `xxxApi` 객체로 모으고 반드시 `client.ts` 의 `api<T>()` 를 거칩니다. 컴포넌트에서 `fetch` 를 직접 쓰지 않습니다 (토큰, 에러 형식 처리가 여기 있음).
- 서버 응답 타입은 `src/api/<도메인>.ts` 에 `interface` 로 선언하고 백엔드 응답과 필드 이름(camelCase)을 맞춥니다.
- 에러 표시: `catch (err) { err instanceof ApiError ? err.message : '요청을 처리하지 못했습니다.' }` 를 `<Alert>` 로 보여 줍니다. 필드별 메시지는 `err.errors[필드]` 로 `FormField` 의 `error` 에 넘깁니다 (`pages/SignupPage.tsx` 참고).
- 페이지는 `src/pages/XxxPage.tsx`(default export), 재사용 UI 는 `src/components/`. 로그인이 필요한 화면은 `App.tsx` 의 `<ProtectedRoute>` 안에 라우트를 추가하고, 메뉴는 `components/Layout.tsx` 에 추가합니다.
- 로그인 사용자: `useAuth()` (`auth/AuthContext.tsx`). 토큰을 직접 다루지 않습니다. 토큰 만료(401)는 `client.ts` 가 토큰을 지우고 `AuthContext` 가 로그아웃 상태로 바꾸므로 페이지에서 따로 처리하지 않습니다.
- 스타일은 디자인 규칙(`.claude/rules/design.md`)을 따릅니다: 버튼·카드·입력은 `components/ui/` 를 쓰고, 색은 토큰 클래스(`bg-primary`, `text-muted-foreground`, `border-border` …)만 씁니다.
- 화면이 아닌 기능 로직(커스텀 훅, 카메라·마이크·음성 같은 브라우저 API 래퍼, 계산)은 `src/features/<기능>/` 에 두고 UI 는 만들지 않습니다. 화면은 `src/pages/`, 재사용 UI 는 `src/components/` 에 둡니다.
- 서비스 이름과 소개 문구는 `src/config/site.ts` 에서 가져옵니다.
- 화면 문구는 한국어.
- import 경로에 확장자(`.tsx`, `.ts`)를 붙입니다 (기존 코드와 동일).
- 검증: `cd frontend && npm run lint && npm run build`

## 새 도메인 추가

1. `src/api/<도메인>.ts`: 응답 `interface` + `xxxApi` (모두 `api<T>()` 사용)
2. `src/pages/XxxListPage.tsx`, 필요하면 `XxxFormPage.tsx` / `XxxDetailPage.tsx`. 목록·상세는 `Card`, 폼은 `FormField`·`Button`·`Alert` 를 씁니다.
3. `App.tsx` 의 `<ProtectedRoute>` 안에 라우트, `components/Layout.tsx` 에 메뉴 링크 (`NavLink` + `navClass`)
4. `cd frontend && npm run lint && npm run build` 통과 확인
