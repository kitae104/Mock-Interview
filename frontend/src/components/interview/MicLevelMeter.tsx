import { TOO_LOUD_LEVEL, VOICE_DETECTED_LEVEL } from '../../features/interview/useAudioLevel.ts'
import { cn } from '../../lib/cn.ts'

interface Props {
  /** 0~1 */
  level: number
  detected: boolean
  /** 브라우저가 오디오를 막고 있음 */
  suspended?: boolean
  disabled?: boolean
}

// 소리 크기를 막대로 보여 주고, 지금 상태를 글로 알려 줍니다.
export default function MicLevelMeter({ level, detected, suspended, disabled }: Props) {
  const percent = Math.round(level * 100)
  const tooLoud = level > TOO_LOUD_LEVEL
  const status = disabled
    ? '마이크가 연결되지 않았어요'
    : suspended
      ? '화면을 한 번 클릭하면 소리 측정이 시작돼요'
      : tooLoud
        ? '소리가 너무 커요. 마이크에서 조금 떨어져 말해 보세요'
        : level >= VOICE_DETECTED_LEVEL
          ? '좋아요. 소리가 잘 들어와요'
          : detected
            ? '소리가 감지됐어요 (조용한 상태)'
            : '소리가 아직 감지되지 않았어요'

  return (
    <div>
      <div
        role="meter"
        aria-label="마이크 소리 크기"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="relative h-3 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-75', tooLoud ? 'bg-warning' : 'bg-primary')}
          style={{ width: `${percent}%` }}
        />
        {/* 이 위치를 넘으면 "소리 감지"로 봅니다. */}
        <div className="absolute inset-y-0 w-px bg-foreground/30" style={{ left: `${VOICE_DETECTED_LEVEL * 100}%` }} aria-hidden="true" />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-xs">
        <span className={cn(detected ? 'font-medium text-success' : 'text-muted-foreground')} role="status">
          {status}
        </span>
        <span className="font-mono text-muted-foreground">{percent}%</span>
      </div>
    </div>
  )
}
