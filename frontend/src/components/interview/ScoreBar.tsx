import { cn } from '../../lib/cn.ts'

interface Props {
  label: string
  /** 0~100. null 이면 이 영역은 점수에 쓰지 않았다는 뜻(예: 비언어를 끔) */
  score: number | null
  /** 라벨 옆에 덧붙이는 짧은 설명 (예: "참고") */
  hint?: string
  className?: string
}

/** 영역별 점수 막대. 차트 라이브러리 없이 토큰 클래스로 그립니다. */
export default function ScoreBar({ label, score, hint, className }: Props) {
  const value = score === null ? 0 : Math.max(0, Math.min(100, score))
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">
          {label}
          {hint && <span className="ml-1 text-xs font-normal text-muted-foreground">{hint}</span>}
        </span>
        <span className="font-mono font-semibold">{score === null ? '—' : score}</span>
      </div>
      <div
        role="meter"
        aria-label={`${label} 점수`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={score === null ? undefined : value}
        aria-valuetext={score === null ? '점수에 쓰지 않음' : `${value}점`}
        className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-500', value >= 75 ? 'bg-success' : value >= 50 ? 'bg-primary' : 'bg-warning')}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  )
}
