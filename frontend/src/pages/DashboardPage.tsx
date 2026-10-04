import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.tsx'
import { ApiError } from '../api/client.ts'
import { interviewsApi, type InterviewListResponse, type InterviewStats } from '../api/interviews.ts'
import InterviewActions from '../components/interview/InterviewActions.tsx'
import Alert from '../components/ui/Alert.tsx'
import Badge from '../components/ui/Badge.tsx'
import Card from '../components/ui/Card.tsx'
import Icon from '../components/ui/Icon.tsx'
import { buttonClass } from '../components/ui/styles.ts'
import { cn } from '../lib/cn.ts'
import { formatDateTime, levelLabel, statusLabel, statusVariant } from '../lib/interviewLabels.ts'

const RECENT_COUNT = 5

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
}

function StatCard({ icon, label, children, hint }: { icon: string; label: string; children: React.ReactNode; hint?: string }) {
  return (
    <Card className="p-5">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon name={icon} size={20} className="text-primary" />
        {label}
      </p>
      <p className="mt-2 font-heading text-3xl font-bold">{children}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  )
}

/** 최근 점수 추이: 차트 라이브러리 없이 토큰 색 막대로 그립니다. 막대를 누르면 그 면접의 결과로 갑니다. */
function ScoreTrend({ recent }: { recent: InterviewStats['recent'] }) {
  return (
    <ol className="flex h-48 items-end gap-2" aria-label="최근 종합 점수 추이">
      {recent.map((item, i) => {
        const latest = i === recent.length - 1
        return (
          <li key={item.id} className="flex h-full min-w-0 flex-1 flex-col justify-end">
            <Link
              to={`/interviews/${item.id}/result`}
              title={`${item.title} · ${item.score}점`}
              aria-label={`${shortDate(item.completedAt)} ${item.title} ${item.score}점, 결과 보기`}
              className="group flex h-full flex-col justify-end"
            >
              <span className={cn('mb-1 text-center font-mono text-xs font-semibold', latest ? 'text-primary' : 'text-muted-foreground')}>{item.score}</span>
              <span
                className={cn('block w-full rounded-t-control transition-colors', latest ? 'bg-primary' : 'bg-primary/40 group-hover:bg-primary/70')}
                style={{ height: `${Math.max(item.score, 2)}%` }}
              />
            </Link>
            <span className="mt-1.5 truncate text-center text-[11px] text-muted-foreground">{shortDate(item.completedAt)}</span>
          </li>
        )
      })}
    </ol>
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

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">안녕하세요, {user.name}님</h1>
          <p className="mt-2 text-muted-foreground">연습한 기록과 점수 변화를 한눈에 확인하세요.</p>
        </div>
        <Link to="/interviews/new" className={buttonClass({ size: 'lg' })}>
          <Icon name="add_circle" />새 모의 면접
        </Link>
      </div>

      {error && <Alert className="mt-6">{error}</Alert>}
      {!stats && !recent && !error && (
        <p role="status" className="mt-8 text-sm text-muted-foreground">
          불러오는 중...
        </p>
      )}

      {stats && recent && recent.total === 0 && (
        <Card className="mt-8 flex flex-col items-center gap-3 py-14 text-center">
          <Icon name="videocam" size={40} className="text-primary" />
          <p className="font-heading text-xl font-bold">첫 모의 면접을 시작해 볼까요?</p>
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
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <StatCard icon="task_alt" label="끝낸 면접">
              {stats.completedCount}
              <span className="ml-1 text-base font-normal text-muted-foreground">회</span>
            </StatCard>
            <StatCard icon="insights" label="평균 종합 점수">
              {stats.averageScore ?? '—'}
              {stats.averageScore !== null && <span className="ml-1 text-base font-normal text-muted-foreground">/ 100</span>}
            </StatCard>
            <StatCard
              icon="trending_up"
              label="지난 면접 대비"
              hint={change === null ? '면접을 두 번 이상 끝내면 변화를 보여 드려요' : undefined}
            >
              {change === null ? (
                '—'
              ) : (
                <span className={change > 0 ? 'text-success' : change < 0 ? 'text-warning' : undefined}>
                  {change > 0 ? '+' : ''}
                  {change}
                  <span className="ml-1 text-base font-normal text-muted-foreground">점</span>
                </span>
              )}
            </StatCard>
          </div>

          <Card className="mt-6 p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-heading text-lg font-bold">종합 점수 추이</h2>
              <span className="text-xs text-muted-foreground">최근 {scores.length}회 · 오래된 면접부터</span>
            </div>
            {scores.length > 0 ? (
              <div className="mt-4">
                <ScoreTrend recent={scores} />
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">끝낸 면접이 생기면 점수 변화를 막대로 보여 드려요.</p>
            )}
          </Card>

          <div className="mt-8 flex items-center justify-between">
            <h2 className="font-heading text-lg font-bold">최근 면접</h2>
            <Link to="/interviews" className="text-sm font-medium text-primary hover:underline">
              전체 보기
            </Link>
          </div>
          <ul className="mt-3 space-y-3">
            {recent.items.map((item) => (
              <li key={item.id}>
                <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <Link to={`/interviews/${item.id}`} className="font-medium hover:text-primary">
                      {item.title}
                    </Link>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant={statusVariant[item.status]}>{statusLabel[item.status]}</Badge>
                      <Badge variant="outline">{levelLabel[item.level]}</Badge>
                      {item.overallScore !== null && <span className="font-mono font-semibold text-foreground">{item.overallScore}점</span>}
                      <span>{formatDateTime(item.completedAt ?? item.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <InterviewActions item={item} />
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
