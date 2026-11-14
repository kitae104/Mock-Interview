import { useEffect, useState } from 'react'
import { cn } from '../lib/cn.ts'
import Badge from './ui/Badge.tsx'
import Icon from './ui/Icon.tsx'
import { cardClass } from './ui/styles.ts'

// 첫 화면의 "면접 화면 예시" 슬라이드 (docs/PLAN.md 1.3 LandingPage).
// 지금은 public/scenes/ 의 자리표시 이미지입니다. 실제 화면 캡처는 같은 파일 이름으로 바꾸고,
// 녹화 영상을 쓰려면 장면에 video: '/scenes/xxx.mp4' 를 넣으면 이미지 대신 영상(소리 없음, 반복)을 보여 줍니다.

interface Scene {
  title: string
  description: string
  icon: string
  image: string
  video?: string
}

const scenes: Scene[] = [
  { title: '카메라·마이크 점검', description: '동의 후 마이크·소리·얼굴 인식을 확인하고 기준 자세를 측정합니다.', icon: 'settings_input_component', image: '/scenes/scene-1-check.svg' },
  { title: '질문 듣기', description: '면접관처럼 질문을 소리 내어 읽어 주고, 화면에도 질문을 보여 줍니다.', icon: 'record_voice_over', image: '/scenes/scene-2-question.svg' },
  { title: '생각할 시간', description: '실제 면접처럼 답변을 정리할 시간을 가진 뒤 녹음이 시작됩니다.', icon: 'hourglass_top', image: '/scenes/scene-3-prepare.svg' },
  { title: '답변 녹음', description: '남은 시간과 음성 레벨을 보며 답하고, 시선·자세는 브라우저에서 분석합니다.', icon: 'radio_button_checked', image: '/scenes/scene-4-record.svg' },
  { title: '피드백 리포트', description: '총점과 강점·개선점, 말하기·자세 지표, 다음 연습 과제를 확인합니다.', icon: 'assignment', image: '/scenes/scene-5-report.svg' },
]

const INTERVAL_MS = 6000

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

export default function InterviewSceneShowcase() {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(prefersReducedMotion)

  useEffect(() => {
    if (paused) return
    const id = window.setTimeout(() => setIndex((i) => (i + 1) % scenes.length), INTERVAL_MS)
    return () => window.clearTimeout(id)
  }, [index, paused])

  const go = (next: number) => setIndex((next + scenes.length) % scenes.length)
  const scene = scenes[index]

  return (
    <section
      aria-roledescription="carousel"
      aria-label="면접 화면 예시"
      className={cn(cardClass, 'flex flex-col gap-4 p-4 shadow-xl')}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(prefersReducedMotion())}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(prefersReducedMotion())}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="size-3 rounded-full bg-destructive" />
          <span className="size-3 rounded-full bg-muted" />
          <span className="size-3 rounded-full bg-accent" />
          <span className="ml-2 font-mono text-xs text-muted-foreground">면접 화면 예시</span>
        </div>
        <Badge variant="muted">
          장면 {index + 1} / {scenes.length}
        </Badge>
      </div>

      <div className="relative aspect-video overflow-hidden rounded-control bg-muted">
        {scenes.map((s, i) => (
          <div
            key={s.title}
            aria-hidden={i !== index}
            className={cn('absolute inset-0 transition-opacity duration-700', i === index ? 'opacity-100' : 'opacity-0')}
          >
            {s.video ? (
              <video src={s.video} poster={s.image} className="size-full object-cover" autoPlay muted loop playsInline />
            ) : (
              <img src={s.image} alt={`${s.title} 화면 예시`} className="size-full object-cover" loading={i === 0 ? 'eager' : 'lazy'} />
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => go(index - 1)}
          aria-label="이전 장면"
          className="absolute left-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-card/80 text-foreground shadow-card hover:bg-card"
        >
          <Icon name="chevron_left" />
        </button>
        <button
          type="button"
          onClick={() => go(index + 1)}
          aria-label="다음 장면"
          className="absolute right-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-card/80 text-foreground shadow-card hover:bg-card"
        >
          <Icon name="chevron_right" />
        </button>
      </div>

      <div className="flex items-start gap-3 rounded-control bg-accent p-3" aria-live="polite">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-control bg-card text-primary">
          <Icon name={scene.icon} size={20} />
        </div>
        <div>
          <p className="text-sm font-bold text-accent-foreground">
            {index + 1}. {scene.title}
          </p>
          <p className="text-sm leading-snug text-card-foreground">{scene.description}</p>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2">
        {scenes.map((s, i) => (
          <button
            key={s.title}
            type="button"
            onClick={() => go(i)}
            aria-label={`${i + 1}번째 장면: ${s.title}`}
            aria-current={i === index}
            className={cn('h-2 rounded-full transition-all', i === index ? 'w-6 bg-primary' : 'w-2 bg-primary/30 hover:bg-primary/50')}
          />
        ))}
      </div>
    </section>
  )
}
