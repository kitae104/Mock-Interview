import { cn } from '../../lib/cn.ts'

// UI 컴포넌트의 모양을 한곳에 모읍니다. 색·모서리 값 자체는 styles/theme.css 의 토큰에서 옵니다.

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive'
export type ButtonSize = 'sm' | 'md' | 'lg'

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  outline: 'border border-input bg-card text-card-foreground hover:bg-muted',
  ghost: 'text-foreground hover:bg-muted',
  destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
}

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-5 py-3 text-base',
}

export interface ButtonStyle {
  variant?: ButtonVariant
  size?: ButtonSize
  block?: boolean
}

// 링크 등 <button> 이 아닌 요소를 버튼 모양으로 만들 때도 씁니다: <Link className={buttonClass({ variant: 'outline' })}>
export function buttonClass({ variant = 'primary', size = 'md', block = false }: ButtonStyle = {}, className?: string) {
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-control font-medium transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60',
    buttonVariants[variant],
    buttonSizes[size],
    block && 'w-full',
    className,
  )
}

export const cardClass = 'rounded-card border border-border bg-card text-card-foreground shadow-card'

export function inputClass(invalid = false, className?: string) {
  return cn(
    'w-full rounded-control border bg-card px-3 py-2 text-sm text-card-foreground outline-none',
    'placeholder:text-muted-foreground focus:ring-2 focus:ring-ring',
    invalid ? 'border-destructive' : 'border-input',
    className,
  )
}

export const linkClass = 'font-medium text-primary hover:underline'

export type BadgeVariant = 'muted' | 'accent' | 'outline' | 'success' | 'warning' | 'danger'

const badgeVariants: Record<BadgeVariant, string> = {
  muted: 'bg-muted text-muted-foreground',
  accent: 'bg-accent text-accent-foreground',
  outline: 'border border-border bg-card text-muted-foreground',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-destructive/10 text-destructive',
}

// 알약 모양 라벨(태그, 상태 표시). <Badge> 로 쓰거나 다른 요소에 badgeClass() 를 붙입니다.
export function badgeClass(variant: BadgeVariant = 'muted', className?: string) {
  return cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium', badgeVariants[variant], className)
}
