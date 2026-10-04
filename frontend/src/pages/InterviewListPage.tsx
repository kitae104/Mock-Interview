import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../api/client.ts'
import { interviewsApi, type InterviewListResponse, type InterviewStatus } from '../api/interviews.ts'
import DeleteInterviewButton from '../components/interview/DeleteInterviewButton.tsx'
import InterviewActions from '../components/interview/InterviewActions.tsx'
import Alert from '../components/ui/Alert.tsx'
import Badge from '../components/ui/Badge.tsx'
import Button from '../components/ui/Button.tsx'
import Card from '../components/ui/Card.tsx'
import Icon from '../components/ui/Icon.tsx'
import Select from '../components/ui/Select.tsx'
import { buttonClass } from '../components/ui/styles.ts'
import { cn } from '../lib/cn.ts'
import { pageNumbers } from '../lib/pagination.ts'
import { levelLabel, statusLabel, statusVariant } from '../lib/interviewLabels.ts'

const PAGE_SIZE = 10

type StatusFilter = InterviewStatus | ''

export default function InterviewListPage() {
  const [offset, setOffset] = useState(0)
  const [status, setStatus] = useState<StatusFilter>('')
  const [data, setData] = useState<InterviewListResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    interviewsApi
      .list({ limit: PAGE_SIZE, offset, status: status || undefined })
      .then((res) => {
        if (cancelled) return
        // 마지막 페이지의 항목을 모두 지웠다면 앞 페이지로 돌아갑니다.
        if (res.items.length === 0 && res.total > 0 && offset > 0) {
          setOffset(Math.max(0, offset - PAGE_SIZE))
          return
        }
        setError(null)
        setData(res)
      })
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : '면접 목록을 불러오지 못했습니다.'))
    return () => {
      cancelled = true
    }
  }, [offset, status, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])
  const total = data?.total ?? 0
  const page = Math.floor(offset / PAGE_SIZE) + 1
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const goToPage = (n: number) => setOffset((n - 1) * PAGE_SIZE)

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge variant="accent" className="mb-3">
            <Icon name="history" size={16} />
            면접 기록
          </Badge>
          <h1 className="font-heading text-3xl font-bold tracking-tight">면접 응시 히스토리</h1>
          <p className="mt-2 text-muted-foreground">지난 면접의 결과를 다시 보고, 이어서 하거나 같은 질문으로 다시 연습하세요.</p>
        </div>
        <Link to="/interviews/new" className={buttonClass({ size: 'lg' })}>
          <Icon name="add_circle" />새 면접 만들기
        </Link>
      </div>

      <Card className="mt-8 flex flex-wrap items-center justify-between gap-3 p-4">
        <label className="flex items-center gap-3 text-sm">
          <span className="whitespace-nowrap font-medium text-muted-foreground">진행 상태</span>
          <Select
            name="status"
            value={status}
            className="w-auto"
            onChange={(e) => {
              setStatus(e.target.value as StatusFilter)
              setOffset(0)
            }}
          >
            <option value="">전체</option>
            <option value="READY">{statusLabel.READY}</option>
            <option value="IN_PROGRESS">{statusLabel.IN_PROGRESS}</option>
            <option value="COMPLETED">{statusLabel.COMPLETED}</option>
          </Select>
        </label>
        {data && <span className="text-sm text-muted-foreground">총 {total}개</span>}
      </Card>

      {error && <Alert className="mt-4">{error}</Alert>}
      {!data && !error && (
        <p role="status" className="mt-8 text-sm text-muted-foreground">
          불러오는 중...
        </p>
      )}

      {data && data.items.length === 0 && (
        <Card className="mt-6 flex flex-col items-center gap-3 py-12 text-center">
          <Icon name="forum" size={36} className="text-muted-foreground" />
          {status ? (
            <>
              <p className="font-medium">{statusLabel[status]} 상태의 면접이 없어요</p>
              <Button variant="outline" size="sm" onClick={() => setStatus('')}>
                전체 보기
              </Button>
            </>
          ) : (
            <>
              <p className="font-medium">아직 만든 면접이 없어요</p>
              <p className="text-sm text-muted-foreground">분야와 채용 공고를 입력하면 AI 가 맞춤 질문을 만들어 드립니다.</p>
              <Link to="/interviews/new" className={buttonClass({}, 'mt-2')}>
                첫 면접 만들기
              </Link>
            </>
          )}
        </Card>
      )}

      {data && data.items.length > 0 && (
        <Card className="mt-4 overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead>
                <tr className="bg-muted text-xs text-muted-foreground">
                  <th scope="col" className="px-6 py-3 font-semibold">
                    응시 일시
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    분야
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    응시 수준
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    진행 상태
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    종합 점수
                  </th>
                  <th scope="col" className="px-6 py-3 text-right font-semibold">
                    결과 및 동작
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.items.map((item) => {
                  const at = new Date(item.completedAt ?? item.createdAt)
                  return (
                    <tr key={item.id} className="hover:bg-muted/50">
                      <td className="whitespace-nowrap px-6 py-4">
                        <span className="block font-mono font-semibold">
                          {at.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                        </span>
                        <span className="block font-mono text-xs text-muted-foreground">
                          {at.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <span
                            aria-hidden="true"
                            className="flex size-10 shrink-0 items-center justify-center rounded-control bg-accent font-heading font-bold text-accent-foreground"
                          >
                            {item.field.slice(0, 1)}
                          </span>
                          <div className="min-w-0">
                            <Link to={`/interviews/${item.id}`} className="font-heading font-bold hover:text-primary">
                              {item.field}
                            </Link>
                            <span className="block text-xs text-muted-foreground">
                              질문 {item.questionCount}개{item.status !== 'READY' && ` · 답변 ${item.answeredCount}/${item.questionCount}`}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <Badge variant="outline">{levelLabel[item.level]}</Badge>
                      </td>
                      <td className="px-4 py-4">
                        <Badge variant={statusVariant[item.status]}>
                          <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
                          {statusLabel[item.status]}
                        </Badge>
                      </td>
                      <td className="px-4 py-4">
                        {item.overallScore !== null ? (
                          <span className="font-mono text-lg font-bold text-primary">
                            {item.overallScore}
                            <span className="ml-1 text-xs font-normal text-muted-foreground">/ 100</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap items-start justify-end gap-2">
                          <InterviewActions item={item} />
                          <DeleteInterviewButton interviewId={item.id} onDeleted={reload} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {total > PAGE_SIZE && (
            <nav
              className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-6 py-4 text-sm"
              aria-label="페이지 이동"
            >
              <span className="text-muted-foreground">
                총 {total}개 중 {offset + 1}–{Math.min(offset + PAGE_SIZE, total)}번째
              </span>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" disabled={page === 1} onClick={() => goToPage(page - 1)}>
                  <Icon name="chevron_left" size={18} />
                  이전
                </Button>
                {pageNumbers(page, lastPage).map((n, i) =>
                  n === null ? (
                    <span key={`gap-${i}`} className="px-1 text-muted-foreground" aria-hidden>
                      …
                    </span>
                  ) : (
                    <button
                      key={n}
                      type="button"
                      aria-label={`${n}페이지`}
                      aria-current={n === page ? 'page' : undefined}
                      onClick={() => goToPage(n)}
                      className={cn(
                        'size-9 rounded-control font-mono text-sm font-semibold',
                        n === page ? 'bg-inverse text-inverse-foreground' : 'text-muted-foreground hover:bg-muted',
                      )}
                    >
                      {n}
                    </button>
                  ),
                )}
                <Button variant="ghost" size="sm" disabled={page === lastPage} onClick={() => goToPage(page + 1)}>
                  다음
                  <Icon name="chevron_right" size={18} />
                </Button>
              </div>
            </nav>
          )}
        </Card>
      )}
    </div>
  )
}
