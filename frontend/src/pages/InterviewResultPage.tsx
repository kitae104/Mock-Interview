import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ApiError } from '../api/client.ts'
import { interviewsApi, type InterviewDetail, type InterviewReport, type QuestionDto, type ReportMetric } from '../api/interviews.ts'
import { NonverbalMetricsTable, SpeechMetricsTable, VerdictBadge } from '../components/interview/MetricsTables.tsx'
import RetryInterviewButton from '../components/interview/RetryInterviewButton.tsx'
import ScoreBar from '../components/interview/ScoreBar.tsx'
import Alert from '../components/ui/Alert.tsx'
import Badge from '../components/ui/Badge.tsx'
import Button from '../components/ui/Button.tsx'
import Card from '../components/ui/Card.tsx'
import Icon from '../components/ui/Icon.tsx'
import { buttonClass } from '../components/ui/styles.ts'
import { categoryLabel, formatDateTime } from '../lib/interviewLabels.ts'

const NONVERBAL_NOTICE = '자세·표정 지표는 카메라 영상으로 추정한 참고값입니다. 조명·카메라 위치·안경·개인 차이에 따라 정확하지 않을 수 있고, 점수에 미치는 비중이 작아요.'

export default function InterviewResultPage() {
  const { id = '' } = useParams()
  const [interview, setInterview] = useState<InterviewDetail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  // 종합 리포트가 아직 없을 때 만드는 중인지, 실패했는지
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    let cancelled = false
    interviewsApi
      .get(id)
      .then((data) => !cancelled && setInterview(data))
      .catch((err) => !cancelled && setLoadError(err instanceof ApiError ? err.message : '결과를 불러오지 못했습니다.'))
    return () => {
      cancelled = true
    }
  }, [id])

  // 리포트 만들기: finish 를 다시 부르면 비어 있는 피드백과 리포트만 이어서 만듭니다 (이미 있으면 AI 를 부르지 않음).
  const generate = useCallback(async () => {
    setGenerating(true)
    setGenerateError(null)
    try {
      setInterview(await interviewsApi.finish(id))
    } catch (err) {
      setGenerateError(err instanceof ApiError ? err.message : '리포트를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setGenerating(false)
    }
  }, [id])

  // 끝난 면접에 리포트가 없으면 자동으로 한 번 만들기 시작합니다. 실패하면 [다시 만들기] 로 다시 부릅니다.
  useEffect(() => {
    if (interview?.status !== 'COMPLETED' || interview.report !== null || started.current) return
    started.current = true
    void generate()
  }, [interview, generate])

  if (loadError) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <Alert>{loadError}</Alert>
        <Link to="/interviews" className={buttonClass({ variant: 'outline' }, 'mt-4')}>
          면접 목록으로
        </Link>
      </div>
    )
  }
  if (!interview) return <p role="status" className="px-6 py-16 text-center text-muted-foreground">결과를 불러오는 중...</p>
  if (interview.status !== 'COMPLETED') {
    return <Navigate to={interview.status === 'IN_PROGRESS' ? `/interviews/${id}/run` : `/interviews/${id}`} replace />
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">면접 결과</h1>
          <p className="mt-1 text-muted-foreground">
            {interview.title}
            {interview.completedAt && <span className="ml-2 text-sm">· {formatDateTime(interview.completedAt)}</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to={`/interviews/${interview.id}`} className={buttonClass({ variant: 'outline' })}>
            면접 상세
          </Link>
          <RetryInterviewButton interviewId={interview.id} variant="primary" />
          <Link to={`/interviews/new?from=${interview.id}`} className={buttonClass({ variant: 'outline' })}>
            새 질문으로 다시 연습
          </Link>
        </div>
      </div>

      {interview.report ? (
        <ReportView report={interview.report} interview={interview} />
      ) : (
        <GeneratingCard generating={generating} error={generateError} onRetry={() => void generate()} interview={interview} />
      )}
    </div>
  )
}

function GeneratingCard({ generating, error, onRetry, interview }: { generating: boolean; error: string | null; onRetry: () => void; interview: InterviewDetail }) {
  const pending = interview.questions.filter((q) => q.answer && q.answer.feedbackStatus !== 'DONE').length
  return (
    <Card className="mt-6 p-6">
      {error ? (
        <div className="space-y-3">
          <Alert>{error}</Alert>
          <p className="text-sm text-muted-foreground">답변은 저장돼 있어요. 다시 만들면 비어 있는 부분만 이어서 만들어요.</p>
          <Button onClick={onRetry} disabled={generating}>
            <Icon name="refresh" />
            다시 만들기
          </Button>
        </div>
      ) : (
        <div role="status" className="flex items-start gap-3">
          <Icon name="progress_activity" size={28} className="animate-spin text-primary" />
          <div>
            <p className="font-heading text-lg font-bold">AI 가 종합 리포트를 만들고 있어요</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {pending > 0 ? `답변 ${pending}개의 피드백을 다시 만든 뒤 ` : ''}면접 전체를 정리하는 데 최대 1분 정도 걸려요. 이 화면을 닫지 말아 주세요.
            </p>
          </div>
        </div>
      )}
    </Card>
  )
}

function ReportView({ report, interview }: { report: InterviewReport; interview: InterviewDetail }) {
  const [open, setOpen] = useState<Set<number>>(new Set())
  const showQuestion = (seq: number) => {
    setOpen((prev) => new Set(prev).add(seq))
    window.setTimeout(() => document.getElementById(`question-${seq}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }
  const scores = report.categoryScores
  const nonverbalMetrics = report.aggregates.nonverbal

  return (
    <div className="mt-6 space-y-6">
      <Card className="p-6">
        <div className="grid gap-6 md:grid-cols-[auto_1fr] md:items-center">
          <div className="text-center md:px-6">
            <p className="text-sm font-medium text-muted-foreground">종합 점수</p>
            <p className="font-heading text-6xl font-bold text-primary" aria-label={`종합 점수 ${report.overallScore}점`}>
              {report.overallScore}
            </p>
            <p className="text-xs text-muted-foreground">
              100점 만점 · 답변 {report.answeredCount}/{report.questionCount}
            </p>
          </div>
          <div className="space-y-3">
            <ScoreBar label="내용" score={scores.content} hint="질문 적합성·구체성·직무 연결" />
            <ScoreBar label="구조성" score={scores.structure} hint="결론·논리 흐름" />
            <ScoreBar label="전달력" score={scores.delivery} hint="속도·침묵·군말" />
            <ScoreBar label="비언어" score={scores.nonverbal} hint={scores.nonverbal === null ? '점수에 쓰지 않음' : '참고'} />
          </div>
        </div>
        <p className="mt-5 leading-relaxed">{report.summary}</p>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="p-5">
          <h2 className="flex items-center gap-2 font-heading text-base font-bold">
            <Icon name="thumb_up" size={20} className="text-success" />
            강점 Top {report.topStrengths.length}
          </h2>
          <ol className="mt-3 space-y-2 text-sm">
            {report.topStrengths.map((text, i) => (
              <li key={text} className="flex gap-2">
                <span className="font-mono font-semibold text-success">{i + 1}</span>
                <span>{text}</span>
              </li>
            ))}
          </ol>
        </Card>
        <Card className="p-5">
          <h2 className="flex items-center gap-2 font-heading text-base font-bold">
            <Icon name="trending_up" size={20} className="text-warning" />
            개선점 Top {report.topImprovements.length}
          </h2>
          <ol className="mt-3 space-y-3 text-sm">
            {report.topImprovements.map((item, i) => (
              <li key={item.point} className="flex gap-2">
                <span className="font-mono font-semibold text-warning">{i + 1}</span>
                <span>
                  <span className="font-medium">{item.point}</span>
                  {item.suggestion && <span className="mt-0.5 block text-muted-foreground">{item.suggestion}</span>}
                  {item.evidenceSeqs.length > 0 && (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {item.evidenceSeqs.map((seq) => (
                        <button key={seq} type="button" onClick={() => showQuestion(seq)} className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground hover:bg-accent/70">
                          {seq}번 질문
                        </button>
                      ))}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="flex items-center gap-2 font-heading text-base font-bold">
          <Icon name="checklist" size={20} className="text-primary" />
          다음 연습 계획
        </h2>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm">
          {report.practicePlan.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </Card>

      <Card className="p-5">
        <h2 className="flex items-center gap-2 font-heading text-base font-bold">
          <Icon name="graphic_eq" size={20} className="text-primary" />
          지표 요약
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{report.speechSummary}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {Object.entries(report.aggregates.speech).map(([key, metric]) => (
            <MetricCard key={key} metric={metric} />
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          2초 이상 침묵: 모두 {report.aggregates.silenceCount}회 · 합 {report.aggregates.silenceSeconds}초. 군말은 인식된 텍스트 기준이라 실제보다 적게 나올 수 있어요.
        </p>
        {nonverbalMetrics ? (
          <div className="mt-5 border-t border-border pt-4">
            <h3 className="text-sm font-semibold">시선·자세·표정 (참고값)</h3>
            {report.nonverbalSummary && <p className="mt-1 text-sm text-muted-foreground">{report.nonverbalSummary}</p>}
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {Object.entries(nonverbalMetrics).map(([key, metric]) => (
                <MetricCard key={key} metric={metric} ratio={key !== 'headMotion'} />
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">시선·자세·표정 분석 결과가 없거나 얼굴이 충분히 보이지 않아 요약에서 뺐어요.</p>
        )}
        <p className="mt-4 rounded-control bg-accent/40 p-3 text-xs text-muted-foreground">{NONVERBAL_NOTICE}</p>
      </Card>

      <section aria-label="질문별 결과" className="space-y-3">
        <h2 className="font-heading text-xl font-bold">질문별 결과</h2>
        {interview.questions.map((q) => (
          <QuestionCard
            key={q.id}
            question={q}
            open={open.has(q.seq)}
            onToggle={(isOpen) =>
              setOpen((prev) => {
                const next = new Set(prev)
                if (isOpen) next.add(q.seq)
                else next.delete(q.seq)
                return next
              })
            }
          />
        ))}
      </section>
    </div>
  )
}

function MetricCard({ metric, ratio = false }: { metric: ReportMetric; ratio?: boolean }) {
  const value =
    metric.value === null ? '—' : ratio ? `${Math.round(metric.value * 100)}%` : `${Number(metric.value.toFixed(1))}`
  return (
    <div className="rounded-control bg-muted p-3">
      <p className="text-xs text-muted-foreground">평균 {metric.name}</p>
      <p className="mt-0.5 flex items-center gap-2">
        <span className="font-mono text-lg font-semibold">{value}</span>
        <VerdictBadge verdict={metric.verdict} />
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">기준 {metric.reference}</p>
    </div>
  )
}

function QuestionCard({ question: q, open, onToggle }: { question: QuestionDto; open: boolean; onToggle: (open: boolean) => void }) {
  const answer = q.answer
  const feedback = answer?.feedback ?? null
  return (
    <details
      id={`question-${q.seq}`}
      open={open}
      onToggle={(e) => onToggle(e.currentTarget.open)}
      className="group scroll-mt-20 rounded-card bg-card shadow-card"
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 p-4">
        <Badge variant="outline">{q.seq}번</Badge>
        <Badge variant="accent">{categoryLabel[q.category]}</Badge>
        <span className="min-w-0 flex-1 font-medium">{q.text}</span>
        {answer?.score !== null && answer?.score !== undefined && <span className="font-mono text-lg font-bold text-primary">{answer.score}점</span>}
        <Icon name="expand_more" className="transition-transform group-open:rotate-180" />
      </summary>

      {answer ? (
        <div className="space-y-5 border-t border-border p-4">
          <section aria-label="내 답변">
            <h3 className="text-sm font-semibold text-muted-foreground">내 답변</h3>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{answer.transcript || '인식된 말이 없어요.'}</p>
            {answer.timedOut && <p className="mt-1 text-xs text-muted-foreground">제한 시간에 도달해 녹음이 자동으로 끝났어요.</p>}
          </section>

          {feedback ? (
            <section aria-label="피드백" className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <ScoreBar label="내용" score={feedback.scores.content} />
                <ScoreBar label="구조성" score={feedback.scores.structure} />
                <ScoreBar label="전달력" score={feedback.scores.delivery} />
                <ScoreBar label="비언어" score={feedback.scores.nonverbal} hint={feedback.scores.nonverbal === null ? '점수에 쓰지 않음' : '참고'} />
              </div>
              <p className="font-medium">{feedback.summary}</p>
              {feedback.strengths.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-success">잘한 점</h3>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                    {feedback.strengths.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {feedback.improvements.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-warning">고칠 점</h3>
                  <ul className="mt-1 space-y-1.5 text-sm">
                    {feedback.improvements.map((item) => (
                      <li key={item.point}>
                        <span className="font-medium">{item.point}</span>
                        {item.suggestion && <span className="block text-muted-foreground">{item.suggestion}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {feedback.speechComment && <p className="text-sm text-muted-foreground">말하기: {feedback.speechComment}</p>}
              {feedback.nonverbalComment && <p className="text-sm text-muted-foreground">시선·자세: {feedback.nonverbalComment}</p>}
              {feedback.betterAnswer && (
                <div className="rounded-control bg-accent/40 p-3">
                  <h3 className="text-sm font-semibold">더 나은 답변 예시</h3>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{feedback.betterAnswer}</p>
                </div>
              )}
            </section>
          ) : (
            <Alert>이 답변의 피드백을 아직 만들지 못했어요.</Alert>
          )}

          <div className="space-y-6">
            <section aria-label="말하기 지표">
              <h3 className="mb-1 text-sm font-semibold text-muted-foreground">말하기 지표</h3>
              {answer.speech ? <SpeechMetricsTable speech={answer.speech} /> : <p className="text-sm text-muted-foreground">말하기 지표를 계산하지 못했어요.</p>}
            </section>
            <section aria-label="시선·자세 지표">
              <h3 className="mb-1 text-sm font-semibold text-muted-foreground">시선·자세·표정 지표</h3>
              {answer.nonverbal ? (
                <NonverbalMetricsTable nonverbal={answer.nonverbal} />
              ) : (
                <p className="text-sm text-muted-foreground">이 답변은 시선·자세 분석 없이 진행했어요.</p>
              )}
            </section>
          </div>

          {q.intent && (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium">이 질문의 평가 의도:</span> {q.intent}
            </p>
          )}
        </div>
      ) : (
        <p className="border-t border-border p-4 text-sm text-muted-foreground">답변이 없습니다.</p>
      )}
    </details>
  )
}
