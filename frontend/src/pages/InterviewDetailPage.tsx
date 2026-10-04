import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../api/client.ts'
import { interviewsApi, type InterviewDetail } from '../api/interviews.ts'
import RetryInterviewButton from '../components/interview/RetryInterviewButton.tsx'
import DeleteInterviewButton from '../components/interview/DeleteInterviewButton.tsx'
import Alert from '../components/ui/Alert.tsx'
import Badge from '../components/ui/Badge.tsx'
import Card from '../components/ui/Card.tsx'
import Icon from '../components/ui/Icon.tsx'
import { buttonClass } from '../components/ui/styles.ts'
import { categoryLabel, formatDateTime, levelLabel, statusLabel, statusVariant } from '../lib/interviewLabels.ts'

export default function InterviewDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [interview, setInterview] = useState<InterviewDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    interviewsApi
      .get(id ?? '')
      .then((data) => !cancelled && setInterview(data))
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : '면접을 불러오지 못했습니다.'))
    return () => {
      cancelled = true
    }
  }, [id])

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12">
        <Alert>{error}</Alert>
        <Link to="/interviews" className={buttonClass({ variant: 'outline' }, 'mt-4')}>
          면접 목록으로
        </Link>
      </div>
    )
  }
  if (!interview) {
    return <p className="mx-auto max-w-4xl px-6 py-12 text-sm text-muted-foreground">불러오는 중...</p>
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <Link to="/interviews" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <Icon name="chevron_left" size={18} />
        면접 목록
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">{interview.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge variant="accent">{interview.field}</Badge>
            <Badge variant="outline">{levelLabel[interview.level]}</Badge>
            <Badge variant={statusVariant[interview.status]}>{statusLabel[interview.status]}</Badge>
            <span className="text-xs text-muted-foreground">{formatDateTime(interview.createdAt)} 생성</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {interview.status === 'COMPLETED' ? (
            <>
              <Link to={`/interviews/${interview.id}/result`} className={buttonClass({ size: 'lg' })}>
                <Icon name="assignment" />
                결과 보기
              </Link>
              <RetryInterviewButton interviewId={interview.id} />
              <Link to={`/interviews/new?from=${interview.id}`} className={buttonClass({ variant: 'ghost', size: 'sm' })}>
                새 질문으로 다시 연습
              </Link>
            </>
          ) : (
            // 카메라·마이크 점검 화면으로 갑니다. 점검이 끝나면 [준비 완료]로 진행 화면으로 이어집니다.
            <Link to={`/interviews/${interview.id}/check`} className={buttonClass({ size: 'lg' })}>
              <Icon name="videocam" />
              {interview.status === 'IN_PROGRESS' ? '이어서 시작' : '면접 시작'}
            </Link>
          )}
          <DeleteInterviewButton interviewId={interview.id} onDeleted={() => navigate('/interviews', { replace: true })} />
        </div>
      </div>

      <Card className="mt-8">
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">질문 수</dt>
            <dd className="mt-1 font-semibold">{interview.questionCount}문항</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">답변 시간</dt>
            <dd className="mt-1 font-semibold">질문마다 최대 {interview.maxAnswerSeconds}초</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">생각할 시간</dt>
            <dd className="mt-1 font-semibold">{interview.prepSeconds === 0 ? '없음' : `${interview.prepSeconds}초`}</dd>
          </div>
        </dl>
        {interview.jobPosting && (
          <details className="mt-4 border-t border-border pt-4 text-sm">
            <summary className="cursor-pointer font-medium text-foreground">입력한 채용 공고 보기</summary>
            <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{interview.jobPosting}</p>
          </details>
        )}
      </Card>

      <h2 className="mt-10 font-heading text-xl font-bold">면접 질문 {interview.questions.length}개</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        면접을 시작하면 질문이 하나씩 나옵니다. 평가 의도는 시작 전에 미리 볼 수 있어요.
      </p>
      <ol className="mt-4 space-y-3">
        {interview.questions.map((q) => (
          <li key={q.id}>
            <Card className="p-5">
              <div className="flex items-start gap-4">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent font-mono text-sm font-bold text-primary">
                  {q.seq}
                </span>
                <div className="min-w-0 flex-1">
                  <Badge variant="muted" className="mb-2">
                    {categoryLabel[q.category]}
                  </Badge>
                  <p className="font-medium leading-relaxed">{q.text}</p>
                  {q.intent && (
                    <details className="group mt-3 text-sm">
                      <summary className="inline-flex cursor-pointer items-center gap-1 font-medium text-primary">
                        <Icon name="psychology" size={18} />
                        평가 의도 보기
                      </summary>
                      <div className="mt-2 space-y-2 rounded-control bg-muted p-3 text-muted-foreground">
                        <p>{q.intent}</p>
                        {q.expectedPoints && q.expectedPoints.length > 0 && (
                          <div>
                            <p className="font-medium text-foreground">좋은 답변에 들어갈 요소</p>
                            <ul className="mt-1 list-disc space-y-0.5 pl-5">
                              {q.expectedPoints.map((p, i) => (
                                <li key={`${i}-${p}`}>{p}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </details>
                  )}
                </div>
              </div>
            </Card>
          </li>
        ))}
      </ol>
    </div>
  )
}
