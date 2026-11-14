import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.tsx'
import { ApiError } from '../api/client.ts'
import { interviewsApi, type InterviewListResponse, type InterviewStats, type InterviewSummary } from '../api/interviews.ts'
import InterviewActions from '../components/interview/InterviewActions.tsx'
import Alert from '../components/ui/Alert.tsx'
import Badge from '../components/ui/Badge.tsx'
import Card from '../components/ui/Card.tsx'
import Icon from '../components/ui/Icon.tsx'
import PageHeader from '../components/ui/PageHeader.tsx'
import { buttonClass, cardClass, linkClass, listClass, textStyles } from '../components/ui/styles.ts'
import { cn } from '../lib/cn.ts'
import { formatDateTime, levelLabel, statusLabel, statusVariant } from '../lib/interviewLabels.ts'

const RECENT_COUNT = 5

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
}

function Stat({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="px-3 py-4 sm:px-5">
      <dt className={textStyles.caption}>{label}</dt>
      <dd className={cn(textStyles.metric, 'mt-1 text-xl sm:text-2xl')}>{children}</dd>
      {hint && <dd className="mt-1 text-xs text-muted-foreground">{hint}</dd>}
    </div>
  )
}

/** 최근 점수 추이: 차트 라이브러리 없이 토큰 색 막대로 그립니다. 막대를 누르면 그 면접의 결과로 갑니다. */
function ScoreTrend({ recent }: { recent: InterviewStats['recent'] }) {
  return (
    <div>
      <ol className="flex h-40 items-end gap-1.5 border-b border-border sm:gap-2" aria-label="최근 종합 점수 추이">
        {recent.map((item, i) => {
          const latest = i === recent.length - 1
          return (
            <li key={item.id} className="flex h-full min-w-0 max-w-16 flex-1 flex-col justify-end">
              <Link
                to={`/interviews/${item.id}/result`}
                title={`${item.title} · ${item.score}점`}
                aria-label={`${shortDate(item.completedAt)} ${item.title} ${item.score}점, 결과 보기`}
                className="group flex h-full flex-col justify-end rounded-t-control"
              >
                <span className={cn('mb-1 text-center font-mono text-xs font-semibold', latest ? 'text-primary' : 'text-muted-foreground')}>
                  {item.score}
                </span>
                <span
                  className={cn('block w-full rounded-t-control transition-colors', latest ? 'bg-primary' : 'bg-primary/25 group-hover:bg-primary/45')}
                  style={{ height: `${Math.max(item.score, 2)}%` }}
                />
              </Link>
            </li>
          )
        })}
      </ol>
      <ol aria-hidden className="mt-1.5 flex gap-1.5 sm:gap-2">
        {recent.map((item) => (
          <li key={item.id} className="min-w-0 max-w-16 flex-1 truncate text-center text-[11px] text-muted-foreground">
            {shortDate(item.completedAt)}
          </li>
        ))}
      </ol>
    </div>
  )
}

/** 이어서 하거나 시작할 면접 한 건. 대시보드에서 가장 먼저 보이는 다음 행동입니다. */
function NextUp({ item }: { item: InterviewSummary }) {
  const resuming = item.status === 'IN_PROGRESS'
  return (
    <section aria-labelledby="next-up-title" className={cn(cardClass, 'mt-8 flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6')}>
      <div className="min-w-0 flex-1 basis-64">
        <p className="flex items-center gap-2 text-xs font-medium text-accent-foreground">
          <span aria-hidden className="size-1.5 rounded-full bg-primary" />
          {resuming ? '진행 중인 면접이 있어요' : '시작하지 않은 면접이 있어요'}
        </p>
        <h2 id="next-up-title" className="mt-1.5 font-heading text-lg font-semibold">
          {item.title}
        </h2>
        <p className={cn(textStyles.caption, 'mt-1')}>
          {levelLabel[item.level]} · {formatDateTime(item.createdAt)} 만듦
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link to={`/interviews/${item.id}`} className={buttonClass({ variant: 'outline', size: 'lg' })}>
          질문 확인
        </Link>
        <Link to={`/interviews/${item.id}/check`} className={buttonClass({ size: 'lg' })}>
          <Icon name="videocam" size={18} />
          {resuming ? '이어서 하기' : '면접 시작'}
        </Link>
      </div>
    </section>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  const [stats, setStats] = useState<InterviewStats | null>(null)
  const [recent, setRecent] = useState<InterviewListResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([interviewsApi.stats(), interviewsApi.list({ limit: RECENT_COUNT })])
      .then(([s, r]) => {
        if (cancelled) return
        setStats(s)
        setRecent(r)
      })
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : '대시보드를 불러오지 못했습니다.'))
    return () => {
      cancelled = true
    }
  }, [])

  if (!user) return null
  const scores = stats?.recent ?? []
  const change = scores.length >= 2 ? scores[scores.length - 1].score - scores[scores.length - 2].score : null
  const nextUp = recent?.items.find((i) => i.status === 'IN_PROGRESS') ?? recent?.items.find((i) => i.status === 'READY')

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <PageHeader
        eyebrow={`안녕하세요, ${user.name}님`}
        title="오늘의 면접 연습"
        description="연습한 기록과 점수 변화를 한눈에 확인하세요."
        actions={
          // 이어서 할 면접이 있으면 그쪽이 주 버튼이라 이 버튼은 outline. 불러오기 전에는 그리지 않아 색이 바뀌며 깜빡이지 않게 합니다.
          (recent || error) && (
            <Link to="/interviews/new" className={buttonClass({ variant: nextUp ? 'outline' : 'primary', size: 'lg' })}>
              <Icon name="add" size={18} />새 모의 면접
            </Link>
          )
        }
      />

      {error && (
        <Card className="mt-8">
          <Alert>{error}</Alert>
          <p className={cn(textStyles.caption, 'mt-1')}>잠시 뒤 새로 고침해 주세요. 계속되면 다시 로그인해 보세요.</p>
        </Card>
      )}
      {!stats && !recent && !error && (
        <p role="status" className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
          <Icon name="progress_activity" size={18} className="animate-spin" />
          불러오는 중...
        </p>
      )}

      {stats && recent && recent.total === 0 && (
        <Card className="mt-8 flex flex-col items-center gap-3 px-6 py-12 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <Icon name="videocam" size={22} />
          </span>
          <h2 className="font-heading text-lg font-semibold">첫 모의 면접을 시작해 볼까요?</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            분야를 고르면 AI 가 맞춤 질문을 만들어 줘요. 웹캠 앞에서 답하면 내용, 말하기, 시선·자세 피드백을 받을 수 있습니다.
          </p>
          <Link to="/interviews/new" className={buttonClass({ size: 'lg' }, 'mt-2')}>
            새 모의 면접 만들기
          </Link>
        </Card>
      )}

      {stats && recent && recent.total > 0 && (
        <>
          {nextUp && <NextUp item={nextUp} />}

          <section aria-labelledby="stats-title" className="mt-10">
            <h2 id="stats-title" className={textStyles.sectionTitle}>
              연습 현황
            </h2>
            <div className={cn(cardClass, 'mt-3')}>
              <dl className="grid grid-cols-3 divide-x divide-border">
                <Stat label="끝낸 면접">
                  {stats.completedCount}
                  <span className="ml-1 font-sans text-sm font-normal text-muted-foreground">회</span>
                </Stat>
                <Stat label="평균 종합 점수">
                  {stats.averageScore ?? '—'}
                  {stats.averageScore !== null && <span className="ml-1 font-sans text-sm font-normal text-muted-foreground">/ 100</span>}
                </Stat>
                <Stat label="지난 면접 대비" hint={change === null ? '면접을 두 번 이상 끝내면 변화를 보여 드려요' : undefined}>
                  {change === null ? (
                    '—'
                  ) : (
                    <span className={change > 0 ? 'text-success' : change < 0 ? 'text-warning' : undefined}>
                      {change > 0 ? '+' : ''}
                      {change}
                      <span className="ml-1 font-sans text-sm font-normal text-muted-foreground">점</span>
                    </span>
                  )}
                </Stat>
              </dl>
              <div className="border-t border-border px-5 pb-5 pt-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-medium">종합 점수 추이</h3>
                  <span className="text-xs text-muted-foreground">최근 {scores.length}회 · 왼쪽이 오래된 면접</span>
                </div>
                {scores.length > 0 ? (
                  <div className="mt-4">
                    <ScoreTrend recent={scores} />
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">끝낸 면접이 생기면 점수 변화를 막대로 보여 드려요.</p>
                )}
              </div>
            </div>
          </section>

          <section aria-labelledby="recent-title" className="mt-10">
            <div className="flex items-baseline justify-between gap-2">
              <h2 id="recent-title" className={textStyles.sectionTitle}>
                최근 면접
              </h2>
              <Link to="/interviews" className={cn(linkClass, 'text-sm')}>
                전체 보기
              </Link>
            </div>
            <ul className={cn(listClass, 'mt-3')}>
              {recent.items.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 py-4">
                  <div className="min-w-0 flex-1 basis-64">
                    <Link to={`/interviews/${item.id}`} className="rounded-sm font-medium hover:text-primary">
                      {item.title}
                    </Link>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <Badge variant={statusVariant[item.status]}>{statusLabel[item.status]}</Badge>
                      <span>{levelLabel[item.level]}</span>
                      <span aria-hidden>·</span>
                      <span>{formatDateTime(item.completedAt ?? item.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {item.overallScore !== null && (
                      <span className="font-mono text-base font-semibold">
                        {item.overallScore}
                        <span className="ml-0.5 font-sans text-xs font-normal text-muted-foreground">점</span>
                      </span>
                    )}
                    <div className="flex items-center gap-2">
                      <InterviewActions item={item} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}
