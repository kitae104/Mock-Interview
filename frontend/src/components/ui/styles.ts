import { cn } from '../../lib/cn.ts'

// UI 컴포넌트의 모양을 한곳에 모읍니다. 색·모서리 값 자체는 styles/theme.css 의 토큰에서 옵니다.
//
// 공통 규칙
// - 높이: 컨트롤(버튼·입력)은 sm 32px · md 40px · lg 44px. 같은 줄에 놓이는 버튼과 입력칸은 같은 크기를 씁니다.
// - 강조: 한 화면(또는 한 영역)에 primary 버튼은 하나. 나머지는 outline·ghost.
// - 상태: hover 는 배경을 한 단계 진하게, focus-visible 은 ring 2px(+2px 띄움), disabled 는 흐리게 + 누를 수 없음.
// - 표면: 카드(cardClass)는 독립된 정보 묶음, 목록(listClass)은 같은 종류 항목을 구분선으로, 본문은 표면 없이 바탕 위에.
// - 글자 위계(textStyles): 페이지 제목 > 섹션 제목 > 질문 > 본문 > 보조. 질문은 크게, 피드백 본문은 읽기 좋은 줄 길이로.

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive'
export type ButtonSize = 'sm' | 'md' | 'lg'

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/85',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-muted active:bg-border',
  outline: 'border border-border bg-card text-card-foreground hover:bg-muted active:bg-secondary',
  ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground',
  destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
}

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 px-5 text-[15px]',
}

export interface ButtonStyle {
  variant?: ButtonVariant
  size?: ButtonSize
  block?: boolean
}

// 링크 등 <button> 이 아닌 요소를 버튼 모양으로 만들 때도 씁니다: <Link className={buttonClass({ variant: 'outline' })}>
export function buttonClass({ variant = 'primary', size = 'md', block = false }: ButtonStyle = {}, className?: string) {
  return cn(
    'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-control font-medium transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
    buttonVariants[variant],
    buttonSizes[size],
    block && 'w-full',
    className,
  )
}

export const cardClass = 'rounded-card border border-border bg-card text-card-foreground shadow-card'

/** 같은 종류 항목의 목록: 카드 하나 안에 구분선으로 나눕니다. 항목마다 카드를 따로 만들지 않습니다. */
export const listClass = 'divide-y divide-border rounded-card border border-border bg-card text-card-foreground shadow-card'

export function inputClass(invalid = false, className?: string) {
  return cn(
    'w-full rounded-control border bg-card px-3 py-2 text-sm text-card-foreground outline-none transition-colors',
    'placeholder:text-muted-foreground hover:border-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30',
    'disabled:cursor-not-allowed disabled:opacity-50',
    invalid ? 'border-destructive' : 'border-input',
    className,
  )
}

export const linkClass =
  'rounded-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** 글자 위계. 화면에서 크기를 새로 정하지 말고 이 이름으로 씁니다. */
export const textStyles = {
  /** 페이지 제목 (한 화면에 하나) */
  pageTitle: 'font-heading text-2xl font-bold tracking-tight sm:text-[28px]',
  /** 페이지 제목 아래 설명 */
  pageDescription: 'text-[15px] text-muted-foreground',
  /** 영역 제목 (카드·섹션) */
  sectionTitle: 'font-heading text-base font-semibold',
  /** 영역 제목 위의 작은 분류 이름 (예: "질문 2 / 5") */
  eyebrow: 'text-xs font-medium text-muted-foreground',
  /** 면접 질문: 화면에서 가장 먼저 읽혀야 하는 문장 */
  question: 'font-heading text-xl font-semibold leading-relaxed sm:text-2xl',
  /** 읽는 본문 (답변, 피드백 설명). 줄 길이를 제한해 읽기 쉽게 */
  body: 'max-w-[68ch] text-[15px] leading-7',
  /** 보조 설명, 날짜 같은 부가 정보 */
  caption: 'text-[13px] text-muted-foreground',
  /** 큰 숫자 (점수, 통계) */
  metric: 'font-mono text-2xl font-semibold tracking-tight',
} as const

export type BadgeVariant = 'muted' | 'accent' | 'outline' | 'primary' | 'success' | 'warning' | 'danger'

const badgeVariants: Record<BadgeVariant, string> = {
  muted: 'bg-muted text-muted-foreground',
  accent: 'bg-accent text-accent-foreground',
  outline: 'border border-border bg-card text-muted-foreground',
  primary: 'bg-primary text-primary-foreground',
  success: 'bg-success/12 text-success',
  warning: 'bg-warning/12 text-warning',
  danger: 'bg-destructive/12 text-destructive',
}

// 작은 라벨(태그, 상태 표시). <Badge> 로 쓰거나 다른 요소에 badgeClass() 를 붙입니다.
// 상태 표시는 색만으로 구분하지 않도록 항상 글자(완료, 진행 중 …)를 함께 씁니다.
export function badgeClass(variant: BadgeVariant = 'muted', className?: string) {
  return cn(
    'inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-medium',
    badgeVariants[variant],
    className,
  )
}
