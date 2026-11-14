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
import PageHeader from '../components/ui/PageHeader.tsx'
import { badgeClass, buttonClass, cardClass, listClass, textStyles } from '../components/ui/styles.ts'
import { cn } from '../lib/cn.ts'
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
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <Alert>{loadError}</Alert>
        <Link to="/interviews" className={buttonClass({ variant: 'outline' }, 'mt-4')}>
          면접 목록으로
        </Link>
      </div>
    )
  }
  if (!interview)
    return (
      <p role="status" className="flex items-center justify-center gap-2 px-6 py-16 text-muted-foreground">
        <Icon name="progress_activity" size={18} className="animate-spin" />
        결과를 불러오는 중...
      </p>
    )
  if (interview.status !== 'COMPLETED') {
    return <Navigate to={interview.status === 'IN_PROGRESS' ? `/interviews/${id}/run` : `/interviews/${id}`} replace />
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <PageHeader
        eyebrow={
          <>
            {interview.title}
            {interview.completedAt && <> · {formatDateTime(interview.completedAt)}</>}
          </>
        }
        title="면접 결과"
        description="고칠 점과 그 근거가 된 답변을 확인하고 다시 연습해 보세요."
        actions={
          <>
            <Link to={`/interviews/${interview.id}`} className={buttonClass({ variant: 'ghost' })}>
              면접 상세
            </Link>
            <RetryInterviewButton interviewId={interview.id} variant="outline" />
          </>
        }
      />

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
    <Card className="mt-8">
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
          <Icon name="progress_activity" size={24} className="mt-0.5 animate-spin text-primary" />
          <div>
            <p className={textStyles.sectionTitle}>AI 가 종합 리포트를 만들고 있어요</p>
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
    window.setTimeout(() => {
      const el = document.getElementById(`question-${seq}`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      el?.querySelector('summary')?.focus({ preventScroll: true })
    }, 0)
  }
  const scores = report.categoryScores
  const nonverbalMetrics = report.aggregates.nonverbal

  return (
    <div className="mt-8 space-y-10">
      {/* 1. 한눈 요약: 종합 점수, 영역별 점수, 총평 */}
      <section aria-label="종합 평가" className={cn(cardClass, 'p-5 sm:p-6')}>
        <div className="grid gap-6 md:grid-cols-[minmax(0,180px)_1fr] md:items-center">
          <div className="md:border-r md:border-border md:pr-6">
            <p className={textStyles.caption}>종합 점수</p>
            <p className="mt-1 font-mono text-5xl font-semibold tracking-tight" aria-label={`종합 점수 ${report.overallScore}점`}>
              {report.overallScore}
              <span className="ml-1 font-sans text-base font-normal text-muted-foreground">/ 100</span>
            </p>
            <p className={cn(textStyles.caption, 'mt-1')}>
              답변 {report.answeredCount}/{report.questionCount}
            </p>
          </div>
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <ScoreBar label="내용" score={scores.content} hint="질문 적합성·구체성·직무 연결" />
            <ScoreBar label="구조성" score={scores.structure} hint="결론·논리 흐름" />
            <ScoreBar label="전달력" score={scores.delivery} hint="속도·침묵·군말" />
            <ScoreBar label="비언어" score={scores.nonverbal} hint={scores.nonverbal === null ? '점수에 쓰지 않음' : '참고'} />
          </div>
        </div>
        <p className={cn(textStyles.body, 'mt-6 border-t border-border pt-5')}>{report.summary}</p>
      </section>

      {/* 2. 개선점(근거 질문으로 이동) → 강점. 다시 연습할 때 가장 필요한 정보를 먼저 둡니다 */}
      <div className="grid gap-6 lg:grid-cols-5">
        <section aria-labelledby="improvements-title" className="lg:col-span-3">
          <h2 id="improvements-title" className={cn(textStyles.sectionTitle, 'flex items-center gap-2')}>
            <span aria-hidden className="size-2 rounded-full bg-warning" />
            먼저 고칠 점
          </h2>
          <ol className={cn(listClass, 'mt-3')}>
            {report.topImprovements.map((item, i) => (
              <li key={`${i}-${item.point}`} className="flex gap-3 px-5 py-4">
                <span className="mt-0.5 font-mono text-sm font-semibold text-warning">{i + 1}</span>
                <div className="min-w-0">
                  <p className="font-medium">{item.point}</p>
                  {item.suggestion && <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.suggestion}</p>}
                  {item.evidenceSeqs.length > 0 && (
                    <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      근거
                      {item.evidenceSeqs.map((seq) => (
                        <button
                          key={seq}
                          type="button"
                          onClick={() => showQuestion(seq)}
                          className={badgeClass('outline', 'h-6 cursor-pointer hover:border-primary hover:text-primary')}
                        >
                          {seq}번 질문
                          <Icon name="arrow_downward" size={14} />
                        </button>
                      ))}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
        <section aria-labelledby="strengths-title" className="lg:col-span-2">
          <h2 id="strengths-title" className={cn(textStyles.sectionTitle, 'flex items-center gap-2')}>
            <span aria-hidden className="size-2 rounded-full bg-success" />
            잘한 점
          </h2>
          <ol className={cn(listClass, 'mt-3')}>
            {report.topStrengths.map((text, i) => (
              <li key={`${i}-${text}`} className="flex gap-3 px-5 py-4 text-sm leading-6">
                <span className="font-mono font-semibold text-success">{i + 1}</span>
                <span className="min-w-0">{text}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {/* 3. 다음 연습 계획 */}
      <section aria-labelledby="plan-title">
        <h2 id="plan-title" className={textStyles.sectionTitle}>
          다음 연습 계획
        </h2>
        <ol className={cn(listClass, 'mt-3')}>
          {report.practicePlan.map((step, i) => (
            <li key={`${i}-${step}`} className="flex gap-3 px-5 py-3.5 text-sm leading-6">
              <span className="font-mono font-semibold text-primary">{i + 1}</span>
              <span className="min-w-0">{step}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* 4. 지표 요약 (근거가 되는 수치) */}
      <section aria-labelledby="metrics-title">
        <h2 id="metrics-title" className={textStyles.sectionTitle}>
          말하기 지표
        </h2>
        <div className={cn(cardClass, 'mt-3 p-5')}>
          <p className="text-sm leading-6 text-muted-foreground">{report.speechSummary}</p>
          <dl className="mt-4 grid gap-3 sm:grid-cols-3">
            {Object.entries(report.aggregates.speech).map(([key, metric]) => (
              <MetricCard key={key} metric={metric} />
            ))}
          </dl>
          <p className={cn(textStyles.caption, 'mt-3')}>
            2초 이상 침묵: 모두 {report.aggregates.silenceCount}회 · 합 {report.aggregates.silenceSeconds}초. 군말은 인식된 텍스트 기준이라 실제보다 적게 나올 수 있어요.
          </p>
          <div className="mt-5 border-t border-border pt-5">
            <h3 className="text-sm font-semibold">시선·자세·표정 (참고값)</h3>
            {nonverbalMetrics ? (
              <>
                {report.nonverbalSummary && <p className="mt-1 text-sm leading-6 text-muted-foreground">{report.nonverbalSummary}</p>}
                <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                  {Object.entries(nonverbalMetrics).map(([key, metric]) => (
                    <MetricCard key={key} metric={metric} ratio={key !== 'headMotion'} />
                  ))}
                </dl>
              </>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">시선·자세·표정 분석 결과가 없거나 얼굴이 충분히 보이지 않아 요약에서 뺐어요.</p>
            )}
            <p className={cn(textStyles.caption, 'mt-3')}>{NONVERBAL_NOTICE}</p>
          </div>
        </div>
      </section>

      {/* 5. 질문별 결과 */}
      <section aria-labelledby="questions-title">
        <h2 id="questions-title" className={textStyles.sectionTitle}>
          질문별 결과
        </h2>
        <p className={cn(textStyles.caption, 'mt-1')}>질문을 누르면 내 답변과 피드백, 지표를 볼 수 있어요.</p>
        <div className={cn(listClass, 'mt-3')}>
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
        </div>
      </section>

      {/* 6. 다시 연습 */}
      <section aria-label="다시 연습" className="flex flex-wrap items-center justify-between gap-4 rounded-card bg-muted px-5 py-5 sm:px-6">
        <div>
          <p className="font-medium">고칠 점을 떠올리며 다시 연습해 볼까요?</p>
          <p className={cn(textStyles.caption, 'mt-0.5')}>같은 질문으로 다시 하거나, 같은 조건에서 새 질문을 받을 수 있어요.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/interviews/new?from=${interview.id}`} className={buttonClass({ variant: 'outline' })}>
            새 질문으로 다시 연습
          </Link>
          <RetryInterviewButton interviewId={interview.id} variant="primary" />
        </div>
      </section>
    </div>
  )
}

function MetricCard({ metric, ratio = false }: { metric: ReportMetric; ratio?: boolean }) {
  const value =
    metric.value === null ? '—' : ratio ? `${Math.round(metric.value * 100)}%` : `${Number(metric.value.toFixed(1))}`
  return (
    <div className="rounded-control bg-muted px-4 py-3">
      <dt className="text-xs text-muted-foreground">평균 {metric.name}</dt>
      <dd className="mt-1 flex flex-wrap items-center gap-2">
        <span className="font-mono text-lg font-semibold">{value}</span>
        <VerdictBadge verdict={metric.verdict} />
      </dd>
      <dd className="mt-1 text-xs text-muted-foreground">기준 {metric.reference}</dd>
    </div>
  )
}

function QuestionCard({ question: q, open, onToggle }: { question: QuestionDto; open: boolean; onToggle: (open: boolean) => void }) {
  const answer = q.answer
  const feedback = answer?.feedback ?? null
  return (
    <details id={`question-${q.seq}`} open={open} onToggle={(e) => onToggle(e.currentTarget.open)} className="group scroll-mt-20">
      <summary className="flex cursor-pointer list-none items-start gap-3 px-5 py-4 hover:bg-muted/60 [&::-webkit-details-marker]:hidden">
        <span className="mt-0.5 w-6 shrink-0 font-mono text-sm font-semibold text-muted-foreground">{q.seq}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium leading-relaxed">{q.text}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-2">
            <Badge variant="accent">{categoryLabel[q.category]}</Badge>
            {!answer && <Badge variant="muted">답변 없음</Badge>}
          </span>
        </span>
        {answer?.score !== null && answer?.score !== undefined && (
          <span className="mt-0.5 shrink-0 font-mono text-base font-semibold">
            {answer.score}
            <span className="ml-0.5 font-sans text-xs font-normal text-muted-foreground">점</span>
          </span>
        )}
        <Icon name="expand_more" className="mt-0.5 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>

      {answer ? (
        <div className="space-y-6 px-5 pb-6 pt-1 sm:pl-14">
          {feedback ? (
            <section aria-label="피드백" className="space-y-5">
              <p className={cn(textStyles.body, 'font-medium')}>{feedback.summary}</p>
              <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                <ScoreBar label="내용" score={feedback.scores.content} />
                <ScoreBar label="구조성" score={feedback.scores.structure} />
                <ScoreBar label="전달력" score={feedback.scores.delivery} />
                <ScoreBar label="비언어" score={feedback.scores.nonverbal} hint={feedback.scores.nonverbal === null ? '점수에 쓰지 않음' : '참고'} />
              </div>
              {feedback.improvements.length > 0 && (
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <span aria-hidden className="size-1.5 rounded-full bg-warning" />
                    고칠 점
                  </h3>
                  <ul className="mt-2 space-y-2.5 text-sm leading-6">
                    {feedback.improvements.map((item, i) => (
                      <li key={`${i}-${item.point}`}>
                        <span className="font-medium">{item.point}</span>
                        {item.suggestion && <span className="block text-muted-foreground">{item.suggestion}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {feedback.strengths.length > 0 && (
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <span aria-hidden className="size-1.5 rounded-full bg-success" />
                    잘한 점
                  </h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 marker:text-muted-foreground">
                    {feedback.strengths.map((s, i) => (
                      <li key={`${i}-${s}`}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {(feedback.speechComment || feedback.nonverbalComment) && (
                <div className="space-y-1 text-sm leading-6 text-muted-foreground">
                  {feedback.speechComment && <p>말하기: {feedback.speechComment}</p>}
                  {feedback.nonverbalComment && <p>시선·자세: {feedback.nonverbalComment}</p>}
                </div>
              )}
            </section>
          ) : (
            <Alert tone="info">이 답변의 피드백을 아직 만들지 못했어요.</Alert>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <section aria-label="내 답변" className="rounded-control border border-border p-4">
              <h3 className="text-xs font-semibold text-muted-foreground">내 답변</h3>
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6">{answer.transcript || '인식된 말이 없어요.'}</p>
              {answer.timedOut && <p className={cn(textStyles.caption, 'mt-2')}>제한 시간에 도달해 녹음이 자동으로 끝났어요.</p>}
            </section>
            {feedback?.betterAnswer && (
              <section aria-label="더 나은 답변 예시" className="rounded-control bg-accent/60 p-4">
                <h3 className="text-xs font-semibold text-accent-foreground">더 나은 답변 예시</h3>
                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6">{feedback.betterAnswer}</p>
              </section>
            )}
          </div>

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
            <p className={textStyles.caption}>
              <span className="font-medium">이 질문의 평가 의도:</span> {q.intent}
            </p>
          )}
        </div>
      ) : (
        <p className="px-5 pb-5 text-sm text-muted-foreground sm:pl-14">답변이 없습니다.</p>
      )}
    </details>
  )
}
