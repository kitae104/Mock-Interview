import { site } from '../config/site.ts'
import { cn } from '../lib/cn.ts'

// 서비스 로고: 심볼(말풍선 + 점 세 개) + 이름 + 한 줄 소개. 원본은 design/stitch/brand-logo/code.html.
// 색은 토큰 클래스(fill-*, stroke-*)로 줍니다. 파비콘(public/favicon.svg)은 토큰을 못 쓰므로 같은 모양에 색 값을 직접 넣었습니다.

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 4 40 40" fill="none" aria-hidden="true" className={cn('size-9 shrink-0', className)}>
      <rect x="2" y="6" width="36" height="36" rx="10" className="fill-inverse" />
      <path
        d="M12 24C12 18.477 16.477 14 22 14C27.523 14 32 18.477 32 24C32 29.523 27.523 34 22 34H16L12 37V24Z"
        className="fill-ring/30"
      />
      <circle cx="17" cy="23" r="2.5" className="fill-ring" />
      <circle cx="23" cy="23" r="2.5" className="fill-inverse-foreground/80" />
      <circle cx="29" cy="23" r="2.5" className="fill-accent" />
      <path d="M22 10V14" className="stroke-ring" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export default function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark />
      <span className="flex flex-col">
        <span className="font-heading text-lg font-bold leading-tight tracking-tight text-foreground">{site.name}</span>
        <span className="hidden text-[10px] font-medium leading-tight text-muted-foreground sm:block">{site.tagline}</span>
      </span>
    </span>
  )
}
