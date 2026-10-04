import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../api/client.ts'
import { interviewsApi, type InterviewListResponse } from '../api/interviews.ts'
import DeleteInterviewButton from '../components/interview/DeleteInterviewButton.tsx'
import Alert from '../components/ui/Alert.tsx'
import Badge from '../components/ui/Badge.tsx'
import Button from '../components/ui/Button.tsx'
import Card from '../components/ui/Card.tsx'
import Icon from '../components/ui/Icon.tsx'
import { buttonClass } from '../components/ui/styles.ts'
import { formatDateTime, levelLabel, statusLabel, statusVariant } from '../lib/interviewLabels.ts'

const PAGE_SIZE = 20

export default function InterviewListPage() {
  const [offset, setOffset] = useState(0)
  const [data, setData] = useState<InterviewListResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    interviewsApi
      .list({ limit: PAGE_SIZE, offset })
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
  }, [offset, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])
  const total = data?.total ?? 0

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">모의 면접</h1>
          <p className="mt-2 text-muted-foreground">만든 면접을 다시 보거나 새 면접을 시작하세요.</p>
        </div>
        <Link to="/interviews/new" className={buttonClass({ size: 'lg' })}>
          <Icon name="add_circle" />새 면접 만들기
        </Link>
      </div>

      {error && <Alert className="mt-6">{error}</Alert>}
      {!data && !error && <p className="mt-8 text-sm text-muted-foreground">불러오는 중...</p>}

      {data && data.items.length === 0 && (
        <Card className="mt-8 flex flex-col items-center gap-3 py-12 text-center">
          <Icon name="forum" size={36} className="text-muted-foreground" />
          <p className="font-medium">아직 만든 면접이 없어요</p>
          <p className="text-sm text-muted-foreground">분야와 채용 공고를 입력하면 AI 가 맞춤 질문을 만들어 드립니다.</p>
          <Link to="/interviews/new" className={buttonClass({}, 'mt-2')}>
            첫 면접 만들기
          </Link>
        </Card>
      )}

      {data && data.items.length > 0 && (
        <>
          <ul className="mt-8 space-y-3">
            {data.items.map((item) => (
              <li key={item.id}>
                <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
                  <div className="min-w-0">
                    <Link to={`/interviews/${item.id}`} className="font-heading text-lg font-bold hover:text-primary">
                      {item.title}
                    </Link>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant={statusVariant[item.status]}>{statusLabel[item.status]}</Badge>
                      <Badge variant="outline">{levelLabel[item.level]}</Badge>
                      <span>질문 {item.questionCount}개</span>
                      {item.status !== 'READY' && (
                        <span>
                          답변 {item.answeredCount}/{item.questionCount}
                        </span>
                      )}
                      {item.overallScore !== null && <span className="font-mono font-semibold">{item.overallScore}점</span>}
                      <span>{formatDateTime(item.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link to={`/interviews/${item.id}`} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
                      보기
                    </Link>
                    <DeleteInterviewButton interviewId={item.id} onDeleted={reload} />
                  </div>
                </Card>
              </li>
            ))}
          </ul>

          {total > PAGE_SIZE && (
            <nav className="mt-6 flex items-center justify-between text-sm" aria-label="페이지 이동">
              <Button variant="outline" size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
                이전
              </Button>
              <span className="text-muted-foreground">
                {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} / 총 {total}개
              </span>
              <Button variant="outline" size="sm" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset(offset + PAGE_SIZE)}>
                다음
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  )
}
