import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../api/client.ts'
import {
  interviewsApi,
  type AnswerResponse,
  type InterviewDetail,
  type InterviewSummary,
  type Verdict,
  type VerdictLevel,
} from '../api/interviews.ts'
import Alert from '../components/ui/Alert.tsx'
import Badge from '../components/ui/Badge.tsx'
import Button from '../components/ui/Button.tsx'
import Card from '../components/ui/Card.tsx'
import Icon from '../components/ui/Icon.tsx'
import SelectField from '../components/ui/SelectField.tsx'
import type { BadgeVariant } from '../components/ui/styles.ts'
import type { NonverbalAnalyzer } from '../features/interview/analyzer/NonverbalAnalyzer.ts'
import { summarizeSamples } from '../features/interview/analyzer/summarize.ts'
import type { Baseline, NonverbalMetrics } from '../features/interview/analyzer/types.ts'
import { AnswerRecorder, type RecordingResult } from '../features/interview/recorder.ts'
import { formatDateTime, statusLabel } from '../lib/interviewLabels.ts'

// /dev/analyzer 안의 개발용 영역: 녹음 → 업로드 → 음성 인식 결과와 말하기 지표 확인.
// 내 면접 하나와 질문을 골라 10초 동안 말하면, 서버가 텍스트로 바꾸고 PLAN 4장의 지표를 계산해 돌려줍니다.

const RECORD_SECONDS = 10

const verdictVariant: Record<VerdictLevel, BadgeVariant> = {
  GOOD: 'success',
  FAIR: 'warning',
  POOR: 'danger',
  NA: 'muted',
}

function VerdictBadge({ verdict }: { verdict: Verdict | undefined }) {
  if (!verdict) return null
  return <Badge variant={verdictVariant[verdict.level]}>{verdict.label}</Badge>
}

const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text)
const fmt = (value: number | null | undefined, unit = '', digits = 1) => (value === null || value === undefined ? '—' : `${Number(value.toFixed(digits))}${unit}`)

function Row({ label, value, verdict }: { label: string; value: string; verdict?: Verdict }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-1.5 text-sm last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex items-center gap-2 text-right">
        <span className="font-mono font-semibold">{value}</span>
        <VerdictBadge verdict={verdict} />
      </dd>
    </div>
  )
}

interface Props {
  /** 마이크가 들어 있는 스트림 */
  stream: MediaStream | null
  /** 돌고 있는 비언어 분석기. 있으면 녹음하는 동안의 요약 지표를 함께 보냅니다. */
  analyzer: NonverbalAnalyzer | null
  baseline: Baseline
}

type Phase = 'idle' | 'recording' | 'uploading' | 'done' | 'error'

export default function DevRecordingTest({ stream, analyzer, baseline }: Props) {
  const [interviews, setInterviews] = useState<InterviewSummary[] | null>(null)
  const [interviewId, setInterviewId] = useState('')
  const [detail, setDetail] = useState<InterviewDetail | null>(null)
  const [questionId, setQuestionId] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [elapsedMs, setElapsedMs] = useState(0)
  const [answer, setAnswer] = useState<AnswerResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<{ recording: RecordingResult; nonverbal: NonverbalMetrics | null } | null>(null)
  const recorderRef = useRef<AnswerRecorder | null>(null)

  // 끝나지 않은 면접만 고를 수 있습니다 (끝난 면접에는 답변을 보낼 수 없음).
  useEffect(() => {
    let cancelled = false
    interviewsApi
      .list({ limit: 50 })
      .then((res) => !cancelled && setInterviews(res.items.filter((i) => i.status !== 'COMPLETED')))
      .catch(() => !cancelled && setError('면접 목록을 불러오지 못했어요.'))
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!interviewId) return
    let cancelled = false
    interviewsApi
      .get(interviewId)
      .then((d) => {
        if (cancelled) return
        setDetail(d)
        setQuestionId(String(d.questions[0]?.id ?? ''))
      })
      .catch(() => !cancelled && setError('면접을 불러오지 못했어요.'))
    return () => {
      cancelled = true
    }
  }, [interviewId])

  // 화면을 떠나면 녹음을 버립니다.
  useEffect(() => () => recorderRef.current?.cancel(), [])

  const upload = async (recording: RecordingResult, nonverbal: NonverbalMetrics | null) => {
    setPhase('uploading')
    setError(null)
    try {
      // 개발용: 시작 전 면접이면 동의한 것으로 보고 시작합니다 (실제 화면은 점검 화면에서 안내·동의를 받습니다).
      if (detail?.status === 'READY') {
        const config = await interviewsApi.config()
        setDetail(await interviewsApi.start(interviewId, { consent: true, consentVersion: config.consentVersion, nonverbalEnabled: false }))
      }
      const result = await interviewsApi.submitAnswer(interviewId, questionId, {
        audio: recording.blob,
        durationMs: recording.durationMs,
        nonverbal,
      })
      setAnswer(result)
      setPending(null)
      setPhase('done')
      // 목록의 "답변 있음" 표시를 갱신합니다.
      interviewsApi.get(interviewId).then(setDetail).catch(() => {})
    } catch (err) {
      setPending({ recording, nonverbal }) // 서버·네트워크 문제면 같은 녹음을 다시 보낼 수 있게 보관합니다.
      setError(err instanceof ApiError ? err.message : '업로드하지 못했어요.')
      setPhase('error')
    }
  }

  const record = async () => {
    setError(null)
    setAnswer(null)
    setPending(null)
    if (!stream) return setError('마이크가 아직 준비되지 않았어요.')
    let recorder: AnswerRecorder
    try {
      recorder = new AnswerRecorder(stream)
    } catch (err) {
      setError(err instanceof Error ? err.message : '녹음을 시작하지 못했어요.')
      return setPhase('error')
    }
    recorderRef.current = recorder
    const startIndex = analyzer?.isRunning ? analyzer.sampleCount : null
    setElapsedMs(0)
    setPhase('recording')
    recorder.start({ maxSeconds: RECORD_SECONDS, onTick: setElapsedMs })

    let recording: RecordingResult
    try {
      recording = await recorder.result
    } catch (err) {
      setError(err instanceof Error ? err.message : '녹음에 실패했어요.')
      return setPhase('error')
    }
    // 분석기가 돌고 있었다면 녹음한 동안의 시선·자세·표정 요약도 같이 보냅니다.
    const nonverbal =
      analyzer && startIndex !== null
        ? summarizeSamples(analyzer.samplesSince(startIndex), baseline, { durationSeconds: recording.durationMs / 1000 })
        : null
    await upload(recording, nonverbal)
  }

  const busy = phase === 'recording' || phase === 'uploading'
  const m = answer?.speech?.metrics
  const v = answer?.speech?.verdicts
  const selectedQuestion = detail?.questions.find((q) => String(q.id) === questionId)

  return (
    <Card>
      <h2 className="font-heading text-base font-bold">녹음 테스트 (음성 인식 + 말하기 지표)</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        내 면접과 질문을 고르고 {RECORD_SECONDS}초 동안 답해 보세요. 녹음은 서버로 올라가 음성 인식 서비스(OpenAI)로 전송되고, 오디오는 저장되지
        않습니다. 같은 질문에 다시 보내면 이전 답변을 덮어씁니다.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <SelectField
          label="면접"
          name="dev-interview"
          value={interviewId}
          disabled={busy || interviews === null}
          hint={interviews ? `${interviews.length}개` : undefined}
          onChange={(e) => {
            setInterviewId(e.target.value)
            setDetail(null)
            setQuestionId('')
            setAnswer(null)
          }}
        >
          <option value="">{interviews === null ? '불러오는 중...' : '면접을 고르세요'}</option>
          {interviews?.map((i) => (
            <option key={i.id} value={i.id}>
              {i.title} ({statusLabel[i.status]}) · {formatDateTime(i.createdAt)}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="질문"
          name="dev-question"
          value={questionId}
          disabled={busy || !detail}
          onChange={(e) => {
            setQuestionId(e.target.value)
            setAnswer(null)
          }}
        >
          <option value="">{detail ? '질문을 고르세요' : '면접을 먼저 고르세요'}</option>
          {detail?.questions.map((q) => (
            <option key={q.id} value={q.id}>
              {q.seq}. {truncate(q.text, 28)}
              {q.answer ? ' (답변 있음)' : ''}
            </option>
          ))}
        </SelectField>
      </div>
      {selectedQuestion && <p className="mt-3 rounded-control bg-muted p-3 text-sm">&quot;{selectedQuestion.text}&quot;</p>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {phase === 'recording' ? (
          <Button variant="outline" onClick={() => void recorderRef.current?.stop()}>
            <Icon name="stop_circle" />
            지금 끝내기
          </Button>
        ) : (
          <Button onClick={() => void record()} disabled={busy || !stream || !questionId}>
            <Icon name="mic" />
            {RECORD_SECONDS}초 녹음 후 업로드
          </Button>
        )}
        {pending && phase === 'error' && (
          <Button variant="secondary" onClick={() => void upload(pending.recording, pending.nonverbal)}>
            <Icon name="refresh" className="text-primary" />
            같은 녹음 다시 올리기
          </Button>
        )}
        {analyzer && <Badge variant="muted">비언어 지표도 함께 보냄</Badge>}
      </div>

      {phase === 'recording' && (
        <div role="status" className="mt-3">
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-destructive transition-[width] duration-200" style={{ width: `${Math.min(100, (elapsedMs / (RECORD_SECONDS * 1000)) * 100)}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">녹음 중... {(elapsedMs / 1000).toFixed(1)}초 / {RECORD_SECONDS}초 — 지금 답해 보세요.</p>
        </div>
      )}
      {phase === 'uploading' && (
        <p role="status" className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Icon name="progress_activity" size={18} className="animate-spin text-primary" />
          음성을 텍스트로 바꾸는 중이에요. 수 초에서 수십 초 걸릴 수 있어요...
        </p>
      )}
      {error && <Alert className="mt-3">{error}</Alert>}

      {answer && m && v && (
        <div className="mt-5 space-y-4">
          <div>
            <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
              인식된 텍스트
              {m.noSpeech && <Badge variant="warning">빈 답변 — 인식된 말이 없어요</Badge>}
            </h3>
            <p className="whitespace-pre-wrap rounded-control bg-muted p-3 text-sm">
              {answer.transcript || '(인식된 말이 없어요. 마이크 소리가 작거나 말을 하지 않았을 수 있어요.)'}
            </p>
          </div>

          <dl>
            <Row label="답변 시간" value={`${fmt(m.answerSeconds, '초')} / 최대 ${m.maxAnswerSeconds}초`} verdict={v.duration} />
            <Row label="분당 음절 수" value={fmt(m.syllablesPerMinute, '', 0)} verdict={v.pace} />
            <Row label="첫 발화까지" value={fmt(m.firstSpeechSeconds, '초')} verdict={v.firstSpeech} />
            <Row
              label="2초 이상 침묵"
              value={`${m.silenceCount}회 · 합 ${fmt(m.silenceTotalSeconds, '초')} · 최대 ${fmt(m.longestSilenceSeconds, '초')}`}
              verdict={v.silence}
            />
            <Row
              label="군말"
              value={`${m.fillerCount}회${Object.keys(m.fillerBreakdown).length > 0 ? ` (${Object.entries(m.fillerBreakdown).map(([word, count]) => `${word} ${count}`).join(', ')})` : ''} · 분당 ${fmt(m.fillerPerMinute)}`}
              verdict={v.filler}
            />
            <Row label="단어 / 음절" value={`${m.wordCount}개 / ${m.syllableCount}음절`} />
            <Row label="말한 구간" value={fmt(m.speechSpanSeconds, '초')} />
          </dl>

          {answer.nonverbal && (
            <p className="text-sm text-muted-foreground">
              비언어 지표 {answer.nonverbal.reliable ? '(참고할 수 있음)' : '(얼굴이 충분히 보이지 않아 점수에서는 제외됨)'}: 응시{' '}
              {fmt(answer.nonverbal.metrics.gazeAtCameraRatio !== null ? answer.nonverbal.metrics.gazeAtCameraRatio * 100 : null, '%', 0)}, 얼굴 보임{' '}
              {fmt(answer.nonverbal.metrics.faceVisibleRatio * 100, '%', 0)}
            </p>
          )}
          <details>
            <summary className="cursor-pointer text-xs text-muted-foreground">서버 응답 JSON 보기</summary>
            <pre className="mt-2 max-h-72 overflow-auto rounded-control bg-muted p-3 font-mono text-xs">{JSON.stringify(answer, null, 2)}</pre>
          </details>
        </div>
      )}
    </Card>
  )
}
