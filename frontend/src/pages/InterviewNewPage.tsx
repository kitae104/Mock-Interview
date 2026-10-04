import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError } from '../api/client.ts'
import { interviewsApi, type InterviewConfig, type InterviewLevel } from '../api/interviews.ts'
import Alert from '../components/ui/Alert.tsx'
import Badge from '../components/ui/Badge.tsx'
import Button from '../components/ui/Button.tsx'
import Card from '../components/ui/Card.tsx'
import FormField from '../components/ui/FormField.tsx'
import Icon from '../components/ui/Icon.tsx'
import TextareaField from '../components/ui/TextareaField.tsx'
import { buttonClass } from '../components/ui/styles.ts'
import { cn } from '../lib/cn.ts'
import { levelLabel } from '../lib/interviewLabels.ts'

// 서버 설정(GET /api/interviews/config)을 불러오기 전, 또는 불러오지 못했을 때 쓰는 값 (서버 기본값과 같음)
const FALLBACK_CONFIG: InterviewConfig = {
  minQuestions: 3,
  maxQuestions: 10,
  defaultQuestions: 5,
  maxAnswerSeconds: 120,
  maxJobPostingChars: 4000,
  maxAudioMb: 10,
  prepSecondsOptions: [0, 10, 30],
  defaultPrepSeconds: 10,
  consentVersion: '',
}

const FIELD_PRESETS = ['프론트엔드 개발자', '백엔드 개발자', '데이터 분석가', '마케팅', '간호사', '공기업 행정']

// 질문 하나를 읽어 주는 데 걸리는 시간(초)과 평균 답변 시간(초). 예상 소요 시간 계산용.
const READ_SECONDS = 15
const AVERAGE_ANSWER_SECONDS = 90

function SectionTitle({ children }: { children: string }) {
  return (
    <h2 className="flex items-center gap-2 font-heading text-lg font-bold">
      <span className="size-2 rounded-full bg-primary" aria-hidden="true" />
      {children}
    </h2>
  )
}

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  disabled,
  label,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  disabled?: boolean
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-control bg-muted p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-control px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            o.value === value ? 'bg-card text-primary shadow-card' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// 질문을 만드는 동안(수십 초) 보여 주는 진행 표시
function GeneratingPanel() {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <Card role="status" className="flex flex-col items-center gap-3 py-10 text-center">
      <Icon name="progress_activity" size={40} className="animate-spin text-primary" />
      <p className="font-heading text-lg font-bold">AI 가 면접 질문을 만들고 있어요</p>
      <p className="max-w-md text-sm text-muted-foreground">
        분야와 채용 공고를 분석해 질문과 평가 의도를 만드는 중입니다. 보통 10~30초, 길게는 1분 이상 걸릴 수 있어요. 이
        창을 닫지 말고 기다려 주세요.
      </p>
      <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
      </div>
      <p className="font-mono text-xs text-muted-foreground">경과 {seconds}초</p>
    </Card>
  )
}

export default function InterviewNewPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [config, setConfig] = useState<InterviewConfig>(FALLBACK_CONFIG)
  const [field, setField] = useState('')
  const [level, setLevel] = useState<InterviewLevel>('NEWCOMER')
  const [questionCount, setQuestionCount] = useState(FALLBACK_CONFIG.defaultQuestions)
  const [prepSeconds, setPrepSeconds] = useState(FALLBACK_CONFIG.defaultPrepSeconds)
  const [jobPosting, setJobPosting] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // 서버 설정으로 입력 범위와 기본값을 맞춥니다. 실패해도 기본값으로 계속 쓸 수 있습니다.
  useEffect(() => {
    let cancelled = false
    interviewsApi
      .config()
      .then((c) => {
        if (cancelled) return
        setConfig(c)
        setQuestionCount(c.defaultQuestions)
        setPrepSeconds(c.defaultPrepSeconds)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  // ?from={면접 id}: 같은 조건으로 다시 연습 (질문은 새로 만듭니다)
  const fromId = searchParams.get('from')
  useEffect(() => {
    if (!fromId) return
    let cancelled = false
    interviewsApi
      .get(fromId)
      .then((d) => {
        if (cancelled) return
        setField(d.field)
        setLevel(d.level)
        setQuestionCount(d.questionCount)
        setPrepSeconds(d.prepSeconds)
        setJobPosting(d.jobPosting ?? '')
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [fromId])

  const estimatedMinutes = Math.ceil((questionCount * (READ_SECONDS + prepSeconds + AVERAGE_ANSWER_SECONDS)) / 60)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setFieldErrors({})
    setSubmitting(true)
    try {
      const created = await interviewsApi.create({
        field: field.trim(),
        level,
        questionCount,
        prepSeconds,
        jobPosting: jobPosting.trim() || undefined,
      })
      navigate(`/interviews/${created.id}`)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
        setFieldErrors(err.errors)
      } else {
        setError('질문을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.')
      }
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <Badge variant="accent" className="mb-3">
        <Icon name="auto_awesome" size={16} />
        AI 맞춤 질문
      </Badge>
      <h1 className="font-heading text-3xl font-bold tracking-tight">새 모의 면접 설정</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        지원하려는 분야와 채용 공고를 입력하면 AI 가 맞춤 면접 질문과 평가 의도를 만들어 드립니다.
      </p>

      <div className="mt-8">
        {submitting ? (
          <GeneratingPanel />
        ) : (
          <Card className="p-6 md:p-8">
            <form onSubmit={handleSubmit} className="space-y-8">
              <section className="space-y-3">
                <SectionTitle>면접 분야 및 포지션</SectionTitle>
                <FormField
                  label="분야"
                  name="field"
                  required
                  maxLength={100}
                  placeholder="예: 프론트엔드 개발자, 데이터 엔지니어, B2B 프로덕트 매니저"
                  value={field}
                  onChange={(e) => setField(e.target.value)}
                  error={fieldErrors.field}
                />
                <div className="flex flex-wrap gap-2" aria-label="자주 쓰는 분야">
                  {FIELD_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setField(preset)}
                      className={cn(
                        'rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        field === preset ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent',
                      )}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </section>

              <div className="grid gap-8 md:grid-cols-2">
                <section className="space-y-3">
                  <SectionTitle>지원 수준</SectionTitle>
                  <Segmented
                    label="지원 수준"
                    value={level}
                    onChange={setLevel}
                    options={[
                      { value: 'NEWCOMER', label: levelLabel.NEWCOMER },
                      { value: 'EXPERIENCED', label: levelLabel.EXPERIENCED },
                    ]}
                  />
                  <p className="text-xs text-muted-foreground">
                    수준에 따라 질문의 초점이 달라집니다. 신입은 학습 태도와 경험, 경력은 역할과 성과 중심입니다.
                  </p>
                </section>

                <section className="space-y-3">
                  <SectionTitle>생각할 시간</SectionTitle>
                  <Segmented
                    label="생각할 시간"
                    value={prepSeconds}
                    onChange={setPrepSeconds}
                    options={config.prepSecondsOptions.map((s) => ({ value: s, label: s === 0 ? '없음' : `${s}초` }))}
                  />
                  <p className="text-xs text-muted-foreground">질문을 들은 뒤 답변을 녹음하기 전에 정리할 시간입니다.</p>
                  {fieldErrors.prepSeconds && <p className="text-xs text-destructive">{fieldErrors.prepSeconds}</p>}
                </section>
              </div>

              <section className="space-y-3">
                <SectionTitle>면접 질문 수</SectionTitle>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    name="questionCount"
                    aria-label="면접 질문 수"
                    min={config.minQuestions}
                    max={config.maxQuestions}
                    step={1}
                    value={questionCount}
                    onChange={(e) => setQuestionCount(Number(e.target.value))}
                    className="h-2 flex-1 cursor-pointer accent-primary"
                  />
                  <span className="w-16 text-right font-mono text-lg font-semibold">{questionCount}문항</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {config.minQuestions}~{config.maxQuestions}문항 중에서 고르세요. 질문 읽기, 생각할 시간, 답변(평균 약{' '}
                  {AVERAGE_ANSWER_SECONDS}초)을 합쳐 예상 소요 시간은 약 {estimatedMinutes}분입니다. 답변은 질문마다 최대{' '}
                  {config.maxAnswerSeconds}초입니다.
                </p>
                {fieldErrors.questionCount && <p className="text-xs text-destructive">{fieldErrors.questionCount}</p>}
              </section>

              <section className="space-y-3">
                <SectionTitle>채용 공고 (선택)</SectionTitle>
                <TextareaField
                  label="채용 공고 내용"
                  name="jobPosting"
                  rows={8}
                  maxLength={config.maxJobPostingChars}
                  placeholder="채용 공고의 담당 업무, 자격 요건, 우대 사항을 붙여넣어 주세요. 공고를 자세히 입력할수록 질문이 공고에 가까워집니다."
                  value={jobPosting}
                  onChange={(e) => setJobPosting(e.target.value)}
                  hint={`${jobPosting.length.toLocaleString()} / ${config.maxJobPostingChars.toLocaleString()}자`}
                  error={fieldErrors.jobPosting}
                />
                <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <Icon name="info" size={16} className="mt-px" />
                  공고 내용은 질문 생성을 위해 AI 서비스 제공자에게 전송됩니다. 기밀 정보나 개인정보는 넣지 마세요.
                </p>
              </section>

              {error && <Alert>{error}</Alert>}

              <div className="flex flex-col-reverse items-stretch justify-between gap-3 sm:flex-row sm:items-center">
                <Link to="/interviews" className={buttonClass({ variant: 'ghost' })}>
                  <Icon name="chevron_left" />
                  면접 목록으로
                </Link>
                <Button type="submit" size="lg" disabled={!field.trim()}>
                  맞춤 질문 만들기
                  <Icon name="arrow_forward" />
                </Button>
              </div>
            </form>
          </Card>
        )}
      </div>
    </div>
  )
}
