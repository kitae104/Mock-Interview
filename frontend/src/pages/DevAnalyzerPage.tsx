import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CameraPreview from '../components/interview/CameraPreview.tsx'
import MediaFailurePanel from '../components/interview/MediaFailurePanel.tsx'
import Alert from '../components/ui/Alert.tsx'
import Badge from '../components/ui/Badge.tsx'
import Button from '../components/ui/Button.tsx'
import Card from '../components/ui/Card.tsx'
import Icon from '../components/ui/Icon.tsx'
import { SAMPLE_INTERVAL_MS, THRESHOLDS } from '../features/interview/analyzer/config.ts'
import { drawOverlay, readOverlayColors, type OverlayColors } from '../features/interview/analyzer/drawOverlay.ts'
import { measureBaseline } from '../features/interview/analyzer/measureBaseline.ts'
import type { FrameDetection } from '../features/interview/analyzer/NonverbalAnalyzer.ts'
import { isGazingAtCamera, isPostureCollapsed, isSmiling, NEUTRAL_BASELINE, summarizeSamples, wristSpeed } from '../features/interview/analyzer/summarize.ts'
import type { Baseline, FrameSample, NonverbalMetrics } from '../features/interview/analyzer/types.ts'
import { useNonverbalAnalyzer } from '../features/interview/analyzer/useNonverbalAnalyzer.ts'
import { useMediaStream } from '../features/interview/useMediaStream.ts'
import { cn } from '../lib/cn.ts'
import DevRecordingTest from './DevRecordingTest.tsx'

// 개발 확인용 화면 (개발 서버에서만 라우트가 등록됩니다). 시선·자세·표정·손 움직임 분석이 제대로 읽히는지 숫자로 확인합니다.
// 판정 기준은 features/interview/analyzer/config.ts 의 THRESHOLDS 입니다.

const RECORD_SECONDS = 10

interface Live {
  sample: FrameSample
  detectMs: number
  handSpeed: number | null
}

const fmt = (value: number | null | undefined, digits = 2) => (value === null || value === undefined ? '—' : value.toFixed(digits))

function Row({ label, value, hint, ok }: { label: string; value: string; hint?: string; ok?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border py-1.5 text-sm last:border-0">
      <dt className="text-muted-foreground">
        {label}
        {hint && <span className="ml-1 text-xs">({hint})</span>}
      </dt>
      <dd className={cn('font-mono font-semibold', ok === true && 'text-success', ok === false && 'text-warning')}>{value}</dd>
    </div>
  )
}

export default function DevAnalyzerPage() {
  const media = useMediaStream()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const colorsRef = useRef<OverlayColors | null>(null)
  const sampleHistoryRef = useRef<FrameSample[]>([])
  const lastUiUpdate = useRef(0)
  const abortRef = useRef<AbortController | null>(null)

  const [live, setLive] = useState<Live | null>(null)
  const [baseline, setBaseline] = useState<Baseline | null>(null)
  const [baselineMessage, setBaselineMessage] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ label: string; value: number } | null>(null)
  const [metrics, setMetrics] = useState<NonverbalMetrics | null>(null)
  const [copied, setCopied] = useState(false)

  const onFrame = useCallback((detection: FrameDetection) => {
    // 점은 바로 그립니다. 숫자 표시는 화면이 너무 자주 다시 그려지지 않도록 0.2초에 한 번만 갱신합니다.
    const canvas = canvasRef.current
    const video = videoRef.current
    if (canvas && video && video.videoWidth > 0) {
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
      }
      colorsRef.current ??= readOverlayColors()
      const ctx = canvas.getContext('2d')
      if (ctx) drawOverlay(ctx, detection, colorsRef.current)
    }
    // 손 속도는 제스처 판정과 같게 gestureWindowMs 만큼 떨어진 프레임과 비교합니다.
    const history = sampleHistoryRef.current
    history.push(detection.sample)
    const lag = Math.max(1, Math.round(THRESHOLDS.gestureWindowMs / SAMPLE_INTERVAL_MS))
    if (history.length > lag + 1) history.shift()
    const previous = history.length > lag ? history[0] : null
    const now = performance.now()
    if (now - lastUiUpdate.current >= 200) {
      lastUiUpdate.current = now
      setLive({ sample: detection.sample, detectMs: detection.detectMs, handSpeed: previous ? wristSpeed(previous, detection.sample) : null })
    }
  }, [])

  const analysis = useNonverbalAnalyzer({ videoRef, stream: media.stream, onFrame })

  useEffect(() => () => abortRef.current?.abort(), [])

  const activeBaseline = baseline ?? NEUTRAL_BASELINE
  const run = async (label: string, seconds: number, work: (signal: AbortSignal) => Promise<void>) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setProgress({ label, value: 0 })
    const timer = window.setInterval(() => {
      // 진행률은 시작한 뒤 흐른 시간으로 계산합니다.
      setProgress((p) => (p ? { ...p, value: Math.min(1, p.value + 0.1 / seconds) } : p))
    }, 100)
    try {
      await work(controller.signal)
    } finally {
      window.clearInterval(timer)
      if (!controller.signal.aborted) setProgress(null)
    }
  }

  const measure = () =>
    run('기준 자세 측정', 3, async (signal) => {
      const result = await measureBaseline(analysis.analyzer, { signal })
      if (!result) return
      if (result.ok) {
        setBaseline(result.baseline)
        setBaselineMessage(`기준 자세 측정 완료 (프레임 ${result.frames}개 중 얼굴 ${result.faceFrames}개, 어깨 ${result.poseFrames}개)`)
      } else {
        setBaselineMessage(result.reason === 'no-face' ? '얼굴이 충분히 보이지 않아 측정하지 못했어요.' : '분석된 프레임이 없어요.')
      }
    })

  const record = () =>
    run(`${RECORD_SECONDS}초 기록`, RECORD_SECONDS, async (signal) => {
      const startIndex = analysis.analyzer.sampleCount
      await new Promise<void>((resolve) => {
        const timer = window.setTimeout(resolve, RECORD_SECONDS * 1000)
        signal.addEventListener('abort', () => (window.clearTimeout(timer), resolve()), { once: true })
      })
      if (signal.aborted) return
      const samples = analysis.analyzer.samplesSince(startIndex)
      setMetrics(summarizeSamples(samples, activeBaseline, { durationSeconds: RECORD_SECONDS }))
      setCopied(false)
    })

  const json = useMemo(() => (metrics ? JSON.stringify(metrics, null, 2) : ''), [metrics])
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const s = live?.sample
  const gazing = s ? isGazingAtCamera(s, activeBaseline) : null
  const aspect = media.videoSettings ? media.videoSettings.width / media.videoSettings.height : 16 / 9
  const running = analysis.status === 'running'

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <Badge variant="warning" className="mb-3">
        <Icon name="build" size={16} />
        개발용 화면
      </Badge>
      <h1 className="font-heading text-3xl font-bold tracking-tight">비언어 분석 확인</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        카메라 영상에서 시선·자세·표정·손 움직임이 어떻게 읽히는지 숫자로 확인합니다. 개발 서버에서만 보이며, 영상은 이 브라우저 안에서만 분석됩니다.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-7">
          {media.status === 'error' && media.failure ? (
            <MediaFailurePanel failure={media.failure} onRetry={() => void media.retry()} />
          ) : (
            <CameraPreview
              stream={media.stream}
              loading={media.status !== 'ready'}
              settings={media.videoSettings}
              videoRef={videoRef}
              aspect={aspect}
            >
              {/* 점 그림: 거울처럼 반전된 영상과 같이 좌우를 뒤집습니다. 색은 토큰에서 읽습니다. */}
              <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 size-full -scale-x-100" aria-hidden="true" />
            </CameraPreview>
          )}

          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={running ? 'success' : analysis.status === 'unavailable' ? 'warning' : 'muted'}>
                {analysis.status === 'running' && '분석 중'}
                {analysis.status === 'loading' && '모델 불러오는 중...'}
                {analysis.status === 'unavailable' && '분석 불가'}
                {analysis.status === 'idle' && '대기'}
              </Badge>
              {live && <Badge variant="outline">프레임당 {live.detectMs.toFixed(0)}ms</Badge>}
              <span className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-primary" /> 얼굴 윤곽</span>
                <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-success" /> 어깨</span>
                <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-warning" /> 손목</span>
              </span>
            </div>
            {analysis.error && <Alert className="mt-3">{analysis.error}</Alert>}

            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => void measure()} disabled={!running || progress !== null}>
                <Icon name="accessibility_new" className="text-primary" />
                현재 자세를 기준으로 (3초)
              </Button>
              <Button onClick={() => void record()} disabled={!running || progress !== null}>
                <Icon name="fiber_manual_record" />
                {RECORD_SECONDS}초 기록
              </Button>
              {baseline && (
                <Button variant="ghost" onClick={() => (setBaseline(null), setBaselineMessage(null))}>
                  기준 지우기
                </Button>
              )}
            </div>
            {progress && (
              <div role="status" className="mt-3">
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-[width] duration-100" style={{ width: `${Math.round(progress.value * 100)}%` }} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{progress.label} 중...</p>
              </div>
            )}
            {baselineMessage && <p className="mt-3 text-sm text-muted-foreground">{baselineMessage}</p>}
          </Card>

          {/* 녹음 테스트: 마이크로 10초 녹음해 서버의 음성 인식과 말하기 지표를 확인합니다. */}
          <DevRecordingTest stream={media.stream} analyzer={running ? analysis.analyzer : null} baseline={activeBaseline} />

          {metrics && (
            <Card>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-heading text-base font-bold">{RECORD_SECONDS}초 기록의 요약 지표 (JSON)</h2>
                <Button variant="outline" size="sm" onClick={() => void copy()}>
                  <Icon name={copied ? 'check' : 'content_copy'} size={16} />
                  {copied ? '복사됨' : '복사'}
                </Button>
              </div>
              <p className="mb-2 text-xs text-muted-foreground">
                기준 자세: {baseline ? '측정한 값' : '없음(정면·무표정을 기준으로 계산)'}. 서버로 보내는 값은 이 숫자뿐입니다.
              </p>
              <pre className="max-h-96 overflow-auto rounded-control bg-muted p-3 font-mono text-xs">{json}</pre>
            </Card>
          )}
        </div>

        <div className="space-y-6 lg:col-span-5">
          <Card>
            <h2 className="mb-2 font-heading text-base font-bold">실시간 값</h2>
            <dl>
              <Row label="얼굴 보임" value={s ? (s.faceVisible ? '예' : '아니오') : '—'} ok={s?.faceVisible} />
              <Row label="응시 여부" value={gazing === null ? '—' : gazing ? '카메라를 봄' : '벗어남'} hint="기준 대비" ok={gazing ?? undefined} />
              <Row label="머리 yaw" value={s ? `${fmt(s.yawDeg, 1)}°` : '—'} hint={baseline ? `기준 ${fmt(baseline.yawDeg, 1)}°` : undefined} />
              <Row label="머리 pitch" value={s ? `${fmt(s.pitchDeg, 1)}°` : '—'} hint={baseline ? `기준 ${fmt(baseline.pitchDeg, 1)}°` : undefined} />
              <Row label="머리 roll" value={s ? `${fmt(s.rollDeg, 1)}°` : '—'} />
              <Row label="눈 방향 좌우(h)" value={fmt(s?.eyeH)} hint={`±${THRESHOLDS.eyeHMax}`} />
              <Row label="눈 방향 상하(v)" value={fmt(s?.eyeV)} hint={`±${THRESHOLDS.eyeVMax}`} />
              <Row label="미소" value={fmt(s?.smile)} ok={s ? isSmiling(s, activeBaseline) || undefined : undefined} hint={`기준 +${THRESHOLDS.smileOn}`} />
              <Row label="눈 감김" value={fmt(s?.blink)} hint={`깜빡임 ${THRESHOLDS.blinkOn}↑`} />
              <Row label="어깨 보임" value={s ? (s.poseVisible ? '예' : '아니오') : '—'} ok={s?.poseVisible} />
              <Row label="어깨 기울기" value={s ? `${fmt(s.shoulderTiltDeg, 1)}°` : '—'} hint={baseline?.shoulderTiltDeg != null ? `기준 ${fmt(baseline.shoulderTiltDeg, 1)}°` : undefined} />
              <Row label="어깨 폭" value={fmt(s?.shoulderWidth, 3)} hint={baseline?.shoulderWidth != null ? `기준 ${fmt(baseline.shoulderWidth, 3)}` : undefined} />
              <Row label="코-어깨 높이" value={fmt(s?.neckRatio)} hint={baseline?.neckRatio != null ? `기준 ${fmt(baseline.neckRatio)}` : undefined} />
              <Row label="자세 무너짐" value={s ? (isPostureCollapsed(s, activeBaseline) ? '예' : '아니오') : '—'} ok={s && activeBaseline.poseAvailable ? !isPostureCollapsed(s, activeBaseline) : undefined} />
              <Row label="손목 보임" value={s ? `${s.leftWrist ? '왼' : ''}${s.rightWrist ? '오' : ''}` || '없음' : '—'} />
              <Row label="손 움직임" value={live?.handSpeed != null ? `${fmt(live.handSpeed)} 어깨폭/초` : '—'} hint={`제스처 ${THRESHOLDS.gestureSpeed}↑`} ok={live?.handSpeed != null ? live.handSpeed < THRESHOLDS.gestureSpeed : undefined} />
            </dl>
          </Card>

          {baseline && (
            <Card>
              <h2 className="mb-2 font-heading text-base font-bold">기준 자세</h2>
              <pre className="overflow-auto rounded-control bg-muted p-3 font-mono text-xs">{JSON.stringify(baseline, null, 2)}</pre>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
