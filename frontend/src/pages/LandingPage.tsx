import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.tsx'
import Badge from '../components/ui/Badge.tsx'
import Card from '../components/ui/Card.tsx'
import Icon from '../components/ui/Icon.tsx'
import { buttonClass, cardClass } from '../components/ui/styles.ts'
import { site } from '../config/site.ts'
import { cn } from '../lib/cn.ts'

// 랜딩 화면의 문구. 서비스에 맞게 바꾸세요. 숫자 통계·후기·회사 로고는 실제 데이터가 생기면 추가합니다.

// 히어로 아래의 서비스 원칙 (사실에 해당하는 내용만)
const principles = [
  { icon: 'videocam_off', title: '영상은 전송하지 않아요', description: '카메라 영상은 이 브라우저 안에서만 분석합니다.' },
  { icon: 'mic_off', title: '음성은 보관하지 않아요', description: '답변 음성은 텍스트로 바꾼 뒤 저장하지 않습니다.' },
  { icon: 'delete', title: '기록은 직접 관리해요', description: '지난 면접을 다시 보고 언제든 삭제할 수 있습니다.' },
]

const highlights = [
  { icon: 'edit_note', title: '맞춤 질문 생성', description: '분야·수준·채용 공고를 반영' },
  { icon: 'psychology', title: '답변 내용 분석', description: '질문 의도에 맞는지 AI 가 평가' },
  { icon: 'monitoring', title: '말하기·자세 지표', description: '속도, 침묵, 시선, 자세를 수치로' },
  { icon: 'assignment', title: '종합 리포트', description: '면접이 끝나면 바로 확인' },
]

const pillars = [
  {
    icon: 'graphic_eq',
    title: '말하기 분석',
    description: '답변을 텍스트로 바꿔 말하기 속도, 침묵, 군말, 첫 발화까지 걸린 시간을 계산합니다.',
    chips: ['분당 음절 수', '2초 이상 침묵', '군말 횟수', '첫 발화 시간'],
  },
  {
    icon: 'visibility',
    title: '시선·자세',
    description: '카메라 응시, 머리 흔들림, 어깨 기울기, 기준 자세와 비교한 자세 변화를 브라우저에서 추정합니다.',
    chips: ['카메라 응시', '머리 흔들림', '어깨 기울기', '자세 변화'],
  },
  {
    icon: 'mood',
    title: '표정·제스처',
    description: '미소, 눈 깜빡임, 손 움직임을 참고값으로 보여 줍니다. 점수 비중은 작고 분석은 끌 수 있습니다.',
    chips: ['미소', '눈 깜빡임', '손 제스처'],
  },
  {
    icon: 'schema',
    title: '답변 내용 피드백',
    description: '질문 의도에 맞는지, 구조(STAR 등)와 구체성이 있는지 살펴보고 개선 답변 예시를 제안합니다.',
    chips: ['질문 적합성', '구조', '구체성', '직무 적합성'],
  },
]

const steps = [
  {
    title: '분야·공고 입력',
    description: '지원 분야와 수준, 질문 수를 고르고 채용 공고가 있다면 붙여 넣으세요.',
    icon: 'description',
    hint: '채용 공고는 선택 입력',
  },
  {
    title: '면접 응시',
    description: '카메라·마이크를 점검한 뒤, 질문을 듣고 생각할 시간을 가진 다음 답변을 녹음합니다.',
    icon: 'radio_button_checked',
    hint: '질문마다 답변 시간 제한',
  },
  {
    title: '리포트 확인',
    description: '답변별 피드백과 종합 리포트를 보고, 지난 면접과 비교해 보세요.',
    icon: 'download_done',
    hint: '면접 기록에서 다시 보기',
  },
]

const compareRows = [
  { item: '피드백 기준', study: '사람마다 다른 주관적 감상', service: '같은 기준으로 계산한 지표와 평가' },
  { item: '시간·장소', study: '일정 조율과 장소 필요', service: '웹캠이 있는 브라우저에서 언제든' },
  { item: '질문', study: '인터넷에 공개된 기출 위주', service: '분야·수준·채용 공고를 반영해 생성' },
  { item: '기록', study: '수기 메모, 분실 위험', service: '면접 기록으로 저장하고 다시 보기' },
]

const compareChecks = [
  '답변을 텍스트로 변환하고 군말 횟수를 계산',
  '채용 공고를 반영한 질문과 직무 적합성 피드백',
  '점수, 개선점, 개선 답변 예시 제공',
]

// 미리보기 음성 막대 높이 (장식용)
const waveBars = ['h-3', 'h-5', 'h-4', 'h-7', 'h-8', 'h-5', 'h-6', 'h-3', 'h-6', 'h-4', 'h-7', 'h-3', 'h-5', 'h-2']

function SectionTitle({ eyebrow, title, description }: { eyebrow: string; title: React.ReactNode; description?: string }) {
  return (
    <div className="mx-auto mb-12 max-w-3xl text-center">
      <Badge variant="accent" className="mb-3">
        {eyebrow}
      </Badge>
      <h2 className="font-heading text-3xl font-bold leading-tight tracking-tight">{title}</h2>
      {description && <p className="mt-3 text-base leading-relaxed text-muted-foreground">{description}</p>}
    </div>
  )
}

export default function LandingPage() {
  const { user } = useAuth()

  return (
    <div>
      {/* 히어로 */}
      <section className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid items-center gap-12 lg:grid-cols-12">
          <div className="flex flex-col gap-4 lg:col-span-6">
            <Badge className="w-fit rounded-control font-semibold">
              <Icon name="videocam" size={18} className="text-primary" />
              브라우저에서 바로 시작
            </Badge>
            <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-[40px] sm:leading-[1.3]">
              웹캠 하나로 완성하는
              <br />
              <span className="text-primary">실전 AI 모의 면접</span>
            </h1>
            <p className="max-w-xl text-base leading-relaxed text-muted-foreground">{site.description}</p>
            <div className="flex flex-wrap items-center gap-4 pt-2">
              {user ? (
                <Link to="/dashboard" className={buttonClass({ size: 'lg' })}>
                  대시보드로 이동
                  <Icon name="arrow_forward" />
                </Link>
              ) : (
                <Link to="/signup" className={buttonClass({ size: 'lg' })}>
                  시작하기
                  <Icon name="arrow_forward" />
                </Link>
              )}
              <a href="#features" className={buttonClass({ variant: 'secondary', size: 'lg' })}>
                <Icon name="play_circle" className="text-primary" />
                서비스 둘러보기
              </a>
            </div>
            <p className="flex items-center gap-1.5 pt-1 text-sm font-medium text-muted-foreground">
              <Icon name="check_circle" size={18} className="text-success" />
              별도 프로그램 설치 없이 웹 브라우저에서 진행합니다
            </p>
            <div className="grid max-w-lg gap-3 pt-4 sm:grid-cols-3">
              {principles.map((p) => (
                <div key={p.title} className={cn(cardClass, 'p-3')}>
                  <Icon name={p.icon} size={22} className="text-primary" />
                  <p className="mt-2 text-sm font-semibold leading-snug">{p.title}</p>
                  <p className="mt-1 text-xs leading-snug text-muted-foreground">{p.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* 면접 화면 미리보기 자리표시. 실제 화면 캡처가 생기면 이 카드 안을 이미지로 바꾸세요. */}
          <div className="relative lg:col-span-6">
            <div className="pointer-events-none absolute -right-12 -top-12 -z-10 size-80 rounded-full bg-primary/10 blur-3xl" />
            <div className={cn(cardClass, 'flex flex-col gap-4 p-4 shadow-xl')}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="size-3 rounded-full bg-destructive" />
                  <span className="size-3 rounded-full bg-muted" />
                  <span className="size-3 rounded-full bg-accent" />
                  <span className="ml-2 font-mono text-xs text-muted-foreground">면접 화면 예시</span>
                </div>
                <Badge variant="muted" className="gap-1.5">
                  <span className="size-2 animate-pulse rounded-full bg-destructive" />
                  녹음 중
                </Badge>
              </div>
              <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-control bg-muted">
                <div className="pointer-events-none absolute inset-x-[28%] bottom-0 top-[16%] rounded-card border-2 border-dashed border-primary/60" />
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Icon name="videocam" size={40} />
                  <span className="text-sm">내 카메라 화면이 여기에 표시됩니다</span>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-12">
                <div className="flex flex-col justify-between gap-2 rounded-control bg-muted p-3 md:col-span-5">
                  <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                    <Icon name="mic" size={16} className="text-primary" />
                    음성 레벨
                  </span>
                  <div className="flex h-8 items-end gap-1" aria-hidden="true">
                    {waveBars.map((h, i) => (
                      <span key={i} className={cn('w-1.5 rounded-full bg-primary', h, i % 2 === 0 && 'bg-primary/50')} />
                    ))}
                  </div>
                </div>
                <div className="flex flex-col justify-center rounded-control bg-accent p-3 md:col-span-7">
                  <span className="mb-1 flex items-center gap-1.5 text-xs font-bold text-accent-foreground">
                    <Icon name="psychology" size={18} />
                    AI 피드백
                  </span>
                  <p className="text-sm leading-snug text-card-foreground">
                    답변이 끝나면 내용, 말하기, 자세에 대한 피드백이 이곳에 표시됩니다.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 핵심 기능 띠 */}
      <section className="my-8 w-full bg-card py-6 shadow-card">
        <div className="mx-auto grid max-w-7xl grid-cols-2 items-center gap-6 px-6 md:grid-cols-4">
          {highlights.map((h) => (
            <div key={h.title} className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-control bg-accent text-primary">
                <Icon name={h.icon} size={24} />
              </div>
              <div>
                <p className="text-sm font-semibold">{h.title}</p>
                <p className="text-xs text-muted-foreground">{h.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 분석 항목 */}
      <section id="features" className="mx-auto max-w-7xl px-6 py-16">
        <SectionTitle
          eyebrow="분석 항목"
          title={
            <>
              단순 텍스트 피드백을 넘어선
              <br />
              네 가지 분석
            </>
          }
          description="웹캠과 마이크만으로 답변의 내용과 전달 방식을 함께 살펴봅니다."
        />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {pillars.map((p, i) => (
            <Card key={p.title} className="flex flex-col justify-between p-6 transition-shadow hover:shadow-lg">
              <div>
                <div className="mb-4 flex size-12 items-center justify-center rounded-card bg-accent text-primary">
                  <Icon name={p.icon} size={28} />
                </div>
                <span className="mb-1 block font-mono text-xs text-primary">분석 {String(i + 1).padStart(2, '0')}</span>
                <h3 className="mb-2 font-heading text-xl font-bold">{p.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{p.description}</p>
              </div>
              <div className="mt-6 flex flex-wrap gap-1.5 rounded-control bg-muted p-3">
                {p.chips.map((c) => (
                  <Badge key={c} variant="outline">
                    {c}
                  </Badge>
                ))}
              </div>
            </Card>
          ))}
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          표정·시선·자세 지표는 카메라 영상으로 추정한 참고값이며 조명, 카메라 위치, 개인 차이에 따라 정확하지 않을 수 있습니다.
        </p>
      </section>

      {/* 이용 방법 */}
      <section className="w-full bg-muted py-16">
        <div className="mx-auto max-w-7xl px-6">
          <SectionTitle eyebrow="이용 방법" title="세 단계로 끝나는 면접 연습" description="복잡한 설정 없이 분야만 정하면 면접 환경이 준비됩니다." />
          <div className="grid gap-6 md:grid-cols-3">
            {steps.map((s, i) => (
              <Card key={s.title} className="flex flex-col">
                <div className="mb-4 flex items-center justify-between">
                  <span
                    className={cn(
                      'flex size-10 items-center justify-center rounded-full font-mono text-lg font-bold',
                      i === 1 ? 'bg-primary text-primary-foreground' : 'bg-accent text-primary',
                    )}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">단계 {i + 1}</span>
                </div>
                <h3 className="mb-2 font-heading text-xl font-bold">{s.title}</h3>
                <p className="mb-4 text-sm leading-relaxed text-muted-foreground">{s.description}</p>
                <div className="mt-auto flex items-center gap-2 rounded-control bg-muted p-3 text-sm text-muted-foreground">
                  <Icon name={s.icon} size={18} className="text-primary" />
                  <span>{s.hint}</span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* 면접 스터디와 비교 */}
      <section className="mx-auto max-w-7xl px-6 py-16">
        <div className={cn(cardClass, 'p-6 shadow-lg md:p-10')}>
          <div className="grid items-center gap-8 lg:grid-cols-12">
            <div className="flex flex-col gap-3 lg:col-span-5">
              <span className="font-mono text-xs font-bold text-primary">비교</span>
              <h2 className="font-heading text-3xl font-bold leading-tight tracking-tight">
                면접 스터디와
                <br />
                {site.name} 비교
              </h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                애매한 감상 대신 지표와 근거가 있는 개선 방향을 받아 보세요.
              </p>
              <ul className="flex flex-col gap-2 pt-3">
                {compareChecks.map((c) => (
                  <li key={c} className="flex items-start gap-2 text-sm">
                    <Icon name="check" className="text-primary" />
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-card bg-muted p-4 lg:col-span-7">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground">
                      <th className="pb-3 font-semibold">평가 항목</th>
                      <th className="pb-3 font-semibold">일반 면접 스터디</th>
                      <th className="pb-3 font-semibold text-primary">{site.name}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {compareRows.map((r) => (
                      <tr key={r.item}>
                        <td className="py-3 pr-3 font-medium">{r.item}</td>
                        <td className="py-3 pr-3 text-muted-foreground">{r.study}</td>
                        <td className="py-3 font-bold text-primary">{r.service}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 하단 CTA */}
      <section className="mx-auto max-w-7xl px-6 pb-16">
        <div className="relative flex flex-col items-center overflow-hidden rounded-card bg-inverse p-8 text-center text-inverse-foreground shadow-xl md:p-14">
          <div className="pointer-events-none absolute -left-24 -top-24 size-96 rounded-full bg-primary/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -right-24 size-96 rounded-full bg-primary/15 blur-3xl" />
          <span className="mb-2 font-mono text-xs font-bold uppercase tracking-wider text-inverse-foreground/70">지금 시작하기</span>
          <h2 className="relative max-w-2xl font-heading text-3xl font-bold leading-tight md:text-[40px] md:leading-[1.3]">
            다음 면접,
            <br />
            미리 연습해 보세요.
          </h2>
          <p className="relative mb-8 mt-3 max-w-xl text-base text-inverse-foreground/70">
            웹캠과 마이크만 있으면 바로 시작할 수 있습니다. 첫 면접으로 내 답변과 말하기 습관을 확인해 보세요.
          </p>
          <div className="relative flex w-full flex-col items-center gap-4 sm:w-auto sm:flex-row">
            <Link to={user ? '/dashboard' : '/signup'} className={buttonClass({ size: 'lg' }, 'w-full sm:w-auto')}>
              {user ? '대시보드로 이동' : '모의 면접 시작하기'}
              <Icon name="videocam" />
            </Link>
            {!user && (
              <Link
                to="/login"
                className={buttonClass({ variant: 'ghost', size: 'lg' }, 'w-full text-inverse-foreground hover:bg-inverse-foreground/10 sm:w-auto')}
              >
                로그인
              </Link>
            )}
          </div>
          <ul className="relative mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-inverse-foreground/70">
            {['별도 설치 불필요', '데스크톱 Chrome·Edge 권장', '영상은 서버로 전송되지 않음'].map((t) => (
              <li key={t} className="flex items-center gap-1">
                <Icon name="check" size={16} />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  )
}
