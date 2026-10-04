import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../api/client.ts'
import { interviewsApi, type InterviewDetail } from '../api/interviews.ts'
import CameraPreview from '../components/interview/CameraPreview.tsx'
import MediaFailurePanel from '../components/interview/MediaFailurePanel.tsx'
import Alert from '../components/ui/Alert.tsx'
import Badge from '../components/ui/Badge.tsx'
import Button from '../components/ui/Button.tsx'
import Card from '../components/ui/Card.tsx'
import Icon from '../components/ui/Icon.tsx'
import { buttonClass } from '../components/ui/styles.ts'
import { HintTracker, type Hint } from '../features/interview/analyzer/liveHints.ts'
import { useNonverbalAnalyzer } from '../features/interview/analyzer/useNonverbalAnalyzer.ts'
import { loadCheckPrefs } from '../features/interview/checkPrefs.ts'
import { useInterviewRun, type RecordedAnswer } from '../features/interview/useInterviewRun.ts'
import { useKoreanVoice } from '../features/interview/useKoreanVoice.ts'
import { useMediaStream } from '../features/interview/useMediaStream.ts'
import { UploadQueue } from '../features/interview/uploadQueue.ts'
import { categoryLabel } from '../lib/interviewLabels.ts'

const HINTS_KEY = 'interview:liveHints'

function loadHintsOn(): boolean {
  try {
    return localStorage.getItem(HINTS_KEY) === 'on'
  } catch {
    return false
  }
}

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default function InterviewRunPage() {
  const { id = '' } = useParams()
  const [interview, setInterview] = useState<InterviewDetail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    interviewsApi
      .get(id)
      .then((data) => !cancelled && setInterview(data))
      .catch((err) => !cancelled && setLoadError(err instanceof ApiError ? err.message : '면접을 불러오지 못했습니다.'))
    return () => {
      cancelled = true
    }
  }, [id])

  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12">
        <Alert>{loadError}</Alert>
        <Link to="/interviews" className={buttonClass({ variant: 'outline' }, 'mt-4')}>
          면접 목록으로
        </Link>
      </div>
    )
  }
  if (!interview) {
    return (
      <p role="status" className="px-6 py-16 text-center text-muted-foreground">
        면접을 불러오는 중...
      </p>
    )
  }
  if (interview.status === 'COMPLETED') return <Navigate to={`/interviews/${id}/result`} replace />
  // 점검과 동의를 거치지 않았거나(READY) 점검 값을 잃었으면(새 탭 등) 점검 화면부터 다시 합니다.
  const prefs = loadCheckPrefs(id)
  if (interview.status === 'READY' || !prefs) return <Navigate to={`/interviews/${id}/check`} replace />

  return <RunScreen interview={interview} prefs={prefs} />
}

type Prefs = NonNullable<ReturnType<typeof loadCheckPrefs>>

function RunScreen({ interview, prefs }: { interview: InterviewDetail; prefs: Prefs }) {
  const navigate = useNavigate()
  const id = interview.id
  const media = useMediaStream({ initialCameraId: prefs.cameraId, initialMicrophoneId: prefs.microphoneId })
  const koreanVoice = useKoreanVoice()
  const videoRef = useRef<HTMLVideoElement>(null)
  const baseline = prefs.analysis === 'on' ? (prefs.baseline ?? null) : null

  // 다시 보내기에 쓰도록 녹음 내용과 분석 요약을 대기열에 그대로 둡니다.
  const [queue] = useState(
    () =>
      new UploadQueue<RecordedAnswer>((questionId, answer) =>
        interviewsApi.submitAnswer(id, questionId, {
          audio: answer.audio,
          durationMs: answer.durationMs,
          nonverbal: answer.nonverbal,
        }),
      ),
  )
  useEffect(() => () => queue.dispose(), [queue])
  const uploads = useSyncExternalStore(queue.subscribe, queue.getSnapshot)

  // 시선·자세 알림: 기본 꺼짐. 켜면 답변하는 동안 화면 모서리에 짧은 안내가 뜹니다.
  const [hintsOn, setHintsOn] = useState(loadHintsOn)
  const [hint, setHint] = useState<Hint | null>(null)
  const [tracker] = useState(() => new HintTracker())
  const hintTimer = useRef<number | null>(null)
  const recordingRef = useRef(false)
  const hintsOnRef = useRef(hintsOn)
  useEffect(() => {
    hintsOnRef.current = hintsOn
    try {
      localStorage.setItem(HINTS_KEY, hintsOn ? 'on' : 'off')
    } catch {
      // 저장하지 못해도 이번 면접에는 영향이 없습니다.
    }
  }, [hintsOn])
  useEffect(() => () => void (hintTimer.current !== null && window.clearTimeout(hintTimer.current)), [])

  const onFrame = useCallback(
    (detection: { sample: Parameters<HintTracker['update']>[0] }) => {
      if (!baseline || !recordingRef.current || !hintsOnRef.current) return
      const next = tracker.update(detection.sample, baseline, performance.now())
      if (!next) return
      setHint(next)
      if (hintTimer.current !== null) window.clearTimeout(hintTimer.current)
      hintTimer.current = window.setTimeout(() => setHint(null), 4000)
    },
    [baseline, tracker],
  )

  const analysis = useNonverbalAnalyzer({ videoRef, stream: media.stream, enabled: baseline !== null, onFrame })
  const speechOn = prefs.speech === 'on'

  const run = useInterviewRun({
    interview,
    stream: media.stream,
    analyzer: analysis.analyzer,
    baseline,
    analysisRunning: analysis.status === 'running',
    speechOn,
    voice: koreanVoice.voice,
    onRecorded: (questionId, answer) => queue.add(questionId, answer),
  })

  const prevPhase = useRef(run.phase)
  useEffect(() => {
    recordingRef.current = run.phase === 'recording'
    if (prevPhase.current !== run.phase && run.phase === 'recording') tracker.reset()
    prevPhase.current = run.phase
  }, [run.phase, tracker])

  // 이미 서버에 답변이 있는 질문은 업로드 대기열에 없어도 끝난 것으로 봅니다(이어하기).
  const unsent = interview.questions.filter(
    (q) => q.answer === null && uploads.find((u) => u.questionId === q.id)?.status !== 'done',
  )
  const failed = uploads.filter((u) => u.status === 'failed')
  const pending = uploads.filter((u) => u.status !== 'done' && u.status !== 'failed')
  const allUploaded = run.phase === 'finishing' && unsent.length === 0

  // 진행 중에는 새로고침·탭 닫기 경고. (react-router 의 BrowserRouter 는 앱 안 이동을 막을 수 없어 "면접 중단" 버튼에서 확인합니다.)
  const leaving = useRef(false)
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (leaving.current) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  // 모든 답변이 올라가면 면접을 끝내고 결과 화면으로 갑니다.
  const [finishError, setFinishError] = useState<string | null>(null)
  const [finishing, setFinishing] = useState(false)
  const finishStarted = useRef(false)
  const finish = useCallback(async () => {
    setFinishing(true)
    setFinishError(null)
    try {
      await interviewsApi.finish(id)
      leaving.current = true
      navigate(`/interviews/${id}/result`, { replace: true })
    } catch (err) {
      setFinishError(err instanceof ApiError ? err.message : '면접을 마무리하지 못했습니다. 잠시 후 다시 시도해 주세요.')
      setFinishing(false)
    }
  }, [id, navigate])
  useEffect(() => {
    if (!allUploaded || finishStarted.current) return
    finishStarted.current = true
    void finish()
  }, [allUploaded, finish])

  const [confirmStop, setConfirmStop] = useState(false)
  const stop = () => {
    leaving.current = true
    navigate(`/interviews/${id}`)
  }

  const remainingSeconds = interview.maxAnswerSeconds - run.elapsedMs / 1000
  const recording = run.phase === 'recording'
  const mediaFailed = media.status === 'error' && media.failure
  const progress = useMemo(() => `${Math.min(run.index + 1, run.total)} / ${run.total}`, [run.index, run.total])

  if (mediaFailed) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <MediaFailurePanel failure={media.failure!} onRetry={() => void media.retry()} retrying={false} />
        <Link to={`/interviews/${id}`} className={buttonClass({ variant: 'ghost' }, 'mt-4')}>
          면접 상세로
        </Link>
      </div>
    )
  }

  if (run.phase === 'finishing') {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12">
        <Card className="p-6">
          <h1 className="font-heading text-xl font-bold">수고하셨어요! 답변을 정리하고 있어요</h1>
          <p className="mt-1 text-sm text-muted-foreground">답변을 모두 보내면 결과 화면으로 이동해요. 이 화면을 닫지 말아 주세요.</p>
          <ul className="mt-4 space-y-2" aria-label="답변 전송 상태">
            {interview.questions.map((q) => {
              const upload = uploads.find((u) => u.questionId === q.id)
              const done = q.answer !== null || upload?.status === 'done'
              return (
                <li key={q.id} className="flex items-center justify-between gap-3 rounded-control bg-muted px-3 py-2 text-sm">
                  <span className="min-w-0 truncate">
                    {q.seq}. {q.text}
                  </span>
                  {done ? (
                    <Badge variant="success">전송 완료</Badge>
                  ) : upload?.status === 'failed' ? (
                    <span className="flex shrink-0 items-center gap-2">
                      <Badge variant="danger">전송 실패</Badge>
                      <Button size="sm" variant="outline" onClick={() => queue.retry(q.id)}>
                        다시 보내기
                      </Button>
                    </span>
                  ) : (
                    <Badge variant="muted">{upload?.status === 'retrying' ? '다시 시도하는 중...' : '보내는 중...'}</Badge>
                  )}
                </li>
              )
            })}
          </ul>
          {failed.length > 0 && (
            <div className="mt-4 space-y-2">
              <Alert>{failed[0].error ?? '일부 답변을 보내지 못했어요.'}</Alert>
              <Button variant="outline" onClick={() => queue.retryAll()}>
                실패한 답변 모두 다시 보내기
              </Button>
            </div>
          )}
          {pending.length > 0 && <p role="status" className="mt-4 text-sm text-muted-foreground">전송이 끝나길 기다리는 중...</p>}
          {finishing && (
            <p role="status" className="mt-4 text-sm text-muted-foreground">
              AI 가 피드백과 종합 리포트를 만드는 중이에요. 최대 1분 정도 걸려요...
            </p>
          )}
          {finishError && (
            <div className="mt-4 space-y-2">
              <Alert>{finishError}</Alert>
              <Button
                onClick={() => {
                  finishStarted.current = true
                  void finish()
                }}
              >
                다시 시도
              </Button>
              <p className="text-xs text-muted-foreground">답변은 저장돼 있어요. 결과 화면에서도 &quot;다시 만들기&quot;로 이어서 만들 수 있어요.</p>
              <Link to={`/interviews/${id}/result`} onClick={() => (leaving.current = true)} className={buttonClass({ variant: 'outline' })}>
                결과 화면으로
              </Link>
            </div>
          )}
        </Card>
      </div>
    )
  }

  const question = run.question
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Badge variant="outline">
            질문 <span className="font-mono">{progress}</span>
          </Badge>
          {question && <Badge variant="accent">{categoryLabel[question.category]}</Badge>}
          {uploads.length > 0 && (pending.length > 0 || failed.length > 0) && (
            <span role="status" className="text-xs text-muted-foreground">
              {failed.length > 0 ? `전송 실패 ${failed.length}건 (마지막에 다시 보낼 수 있어요)` : '이전 답변을 보내는 중...'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {recording && (
            <span className="flex items-center gap-2 rounded-full bg-destructive/10 px-3 py-1 text-sm font-medium text-destructive">
              <span className="size-2.5 animate-pulse rounded-full bg-destructive" aria-hidden />
              녹음 중 <span className="font-mono">{formatClock(remainingSeconds)}</span>
            </span>
          )}
          {!confirmStop ? (
            <Button variant="ghost" size="sm" onClick={() => setConfirmStop(true)}>
              <Icon name="close" />
              면접 중단
            </Button>
          ) : (
            <span className="flex items-center gap-2 text-sm" role="alertdialog" aria-label="면접 중단 확인">
              정말 중단할까요? 답한 질문은 저장돼 있어요.
              <Button size="sm" variant="outline" onClick={() => setConfirmStop(false)}>
                계속하기
              </Button>
              <Button size="sm" variant="destructive" onClick={stop}>
                중단하기
              </Button>
            </span>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <CameraPreview stream={media.stream} loading={media.status !== 'ready'} videoRef={videoRef} settings={media.videoSettings}>
            {hintsOn && hint && (
              <div
                role="status"
                className="absolute right-3 top-3 flex items-center gap-1.5 rounded-control bg-inverse/70 px-3 py-1.5 text-sm text-inverse-foreground"
              >
                <Icon name="lightbulb" size={18} />
                {hint.message}
              </div>
            )}
            {run.phase === 'countdown' && (
              <div className="absolute inset-0 flex items-center justify-center bg-inverse/40" aria-live="assertive">
                <span className="font-heading text-8xl font-bold text-inverse-foreground">{run.countdown}</span>
              </div>
            )}
          </CameraPreview>
        </div>

        <div className="space-y-4 lg:col-span-4">
          <Card className="p-5">
            {run.phase === 'gate' ? (
              <>
                <h1 className="font-heading text-lg font-bold">준비되면 시작해 주세요</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  질문이 나오고, 다 읽은 뒤 3초 카운트다운이 끝나면 녹음이 시작돼요. 답변을 마치면 &quot;답변 완료&quot;를 눌러 주세요.
                  {run.index > 0 && ` (${run.index + 1}번째 질문부터 이어서 진행해요.)`}
                </p>
                {run.error && (
                  <div className="mt-3">
                    <Alert>{run.error}</Alert>
                  </div>
                )}
                <Button className="mt-4" size="lg" onClick={run.begin} disabled={media.status !== 'ready'}>
                  <Icon name="play_arrow" />
                  {run.index > 0 ? '이어서 시작' : '면접 시작'}
                </Button>
              </>
            ) : (
              <>
                <p className="text-xs font-medium text-muted-foreground">질문 {run.index + 1}</p>
                <p className="mt-1 text-lg font-semibold leading-relaxed" aria-live="polite">
                  {question?.text}
                </p>
                <p role="status" className="mt-3 text-sm text-muted-foreground">
                  {run.phase === 'speaking' && (speechOn && koreanVoice.voice && !run.speechFailed ? '질문을 읽어 드리고 있어요...' : '질문을 확인해 주세요...')}
                  {run.phase === 'thinking' && (
                    <>
                      생각할 시간이에요. <span className="font-mono font-semibold text-foreground">{run.thinkLeft}</span>초 뒤에 시작해요.
                    </>
                  )}
                  {run.phase === 'countdown' && '곧 녹음이 시작돼요. 준비해 주세요.'}
                  {recording && '답변하고 있어요. 다 말씀하셨다면 "답변 완료"를 눌러 주세요.'}
                </p>
                {run.speechFailed && <p className="mt-1 text-xs text-muted-foreground">소리를 재생하지 못해 텍스트로 진행하고 있어요.</p>}
                {run.error && (
                  <div className="mt-3">
                    <Alert>{run.error}</Alert>
                  </div>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  {recording ? (
                    <Button size="lg" onClick={run.finishAnswer}>
                      <Icon name="check_circle" />
                      {run.isLast ? '답변 완료 (마지막 질문)' : '답변 완료'}
                    </Button>
                  ) : (
                    <>
                      {run.phase === 'thinking' && (
                        <Button variant="secondary" onClick={run.skipThinking}>
                          바로 시작하기
                        </Button>
                      )}
                      {run.canReplay && (
                        <Button variant="outline" onClick={run.replay}>
                          <Icon name="replay" />
                          질문 다시 듣기
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </Card>

          {baseline && (
            <label className="flex cursor-pointer items-start gap-2 rounded-card bg-card p-4 text-sm shadow-card">
              <input
                type="checkbox"
                name="liveHints"
                checked={hintsOn}
                onChange={(e) => setHintsOn(e.target.checked)}
                className="mt-0.5 size-4 accent-primary"
              />
              <span>
                <span className="font-medium">시선·자세 알림</span>
                <span className="block text-xs text-muted-foreground">
                  답변 중에 시선이 벗어나거나 자세가 흐트러지면 화면 모서리에 짧게 알려 줘요. 기본은 꺼져 있어요(긴장 방지).
                </span>
              </span>
            </label>
          )}
          {baseline && analysis.status === 'unavailable' && (
            <Alert>표정·자세 분석을 쓸 수 없어 분석 없이 진행해요. 답변과 말하기 분석은 그대로 받을 수 있어요.</Alert>
          )}
        </div>
      </div>
    </div>
  )
}
