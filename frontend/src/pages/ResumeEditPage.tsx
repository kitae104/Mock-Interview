import { useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import {
  emptyResumeContent,
  resumesApi,
  type Resume,
  type ResumeContent,
  type ResumeRequest,
} from '../api/resumes.ts'
import {
  AiPanel,
  CareerHeader,
  SaveBar,
  ScoreBadge,
  SubTitle,
  TagInput,
} from '../components/career/CareerShared.tsx'
import RepeatList from '../components/career/RepeatList.tsx'
import Alert from '../components/ui/Alert.tsx'
import Badge from '../components/ui/Badge.tsx'
import Button from '../components/ui/Button.tsx'
import Card from '../components/ui/Card.tsx'
import FormField from '../components/ui/FormField.tsx'
import TextareaField from '../components/ui/TextareaField.tsx'
import { useDocumentEditor } from '../features/career/useDocumentEditor.ts'
import { formatDateTime } from '../lib/interviewLabels.ts'
import { errorText } from '../features/career/common.ts'

// 이력서 작성 도우미 편집 화면 (docs/PLAN.md 12.1)

const ROLE_PRESETS = ['프론트엔드 개발자', '백엔드 개발자', '모바일 앱 개발자', '데이터 엔지니어', 'AI/ML 엔지니어', 'DevOps 엔지니어']

const SECTION_LABEL: Record<string, string> = {
  summary: '자기 요약',
  skills: '기술 스택',
  experiences: '경력·활동',
  educations: '학력',
  projects: '프로젝트',
  certificates: '자격증',
}

const empty = (): ResumeRequest => ({ title: '', targetRole: '', content: emptyResumeContent() })
const toRequest = (r: Resume): ResumeRequest => ({ title: r.title, targetRole: r.targetRole, content: r.content })

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card className="p-6">
      <h2 className="font-heading text-lg font-bold">{title}</h2>
      {description && <p className="mb-4 mt-1 text-sm text-muted-foreground">{description}</p>}
      <div className={description ? '' : 'mt-4'}>{children}</div>
    </Card>
  )
}

export default function ResumeEditPage() {
  const { id } = useParams()
  const editor = useDocumentEditor<ResumeRequest, Resume>({
    id,
    basePath: '/resumes',
    empty,
    toRequest,
    get: resumesApi.get,
    create: resumesApi.create,
    update: resumesApi.update,
  })
  const { form, edit, doc } = editor
  const [reviewing, setReviewing] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  const setContent = <K extends keyof ResumeContent>(key: K, value: ResumeContent[K]) =>
    edit((f) => ({ ...f, content: { ...f.content, [key]: value } }))

  const runReview = async () => {
    setAiError(null)
    const saved = await editor.ensureSaved()
    if (!saved) return
    setReviewing(true)
    try {
      editor.applyServerDoc(await resumesApi.review(saved.id))
    } catch (err) {
      setAiError(errorText(err, 'AI 첨삭을 받지 못했습니다.').message)
    } finally {
      setReviewing(false)
    }
  }

  if (editor.loading) return <p className="px-6 py-12 text-sm text-muted-foreground">불러오는 중...</p>
  if (editor.loadError) return <Alert className="px-6 py-12">{editor.loadError}</Alert>

  const c = form.content
  const review = doc?.review

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <CareerHeader
        title={doc ? form.title || '이력서' : '새 이력서'}
        description="섹션을 채우고 저장한 뒤 오른쪽에서 지원 직무 기준 AI 첨삭을 받아 보세요."
        actions={
          <SaveBar
            saving={editor.saving}
            dirty={editor.dirty}
            savedAt={doc ? formatDateTime(doc.updatedAt) : null}
            onSave={editor.save}
            error={editor.saveError}
          />
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Section title="기본 정보">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <FormField
                  id="title"
                  label="이력서 제목 (나만 보는 이름)"
                  placeholder="예: 백엔드 신입 공채용"
                  maxLength={100}
                  value={form.title}
                  error={editor.fieldErrors.title}
                  onChange={(e) => edit((f) => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div className="sm:col-span-2">
                <FormField
                  id="targetRole"
                  label="지원 직무"
                  placeholder="예: 백엔드 개발자"
                  maxLength={100}
                  value={form.targetRole}
                  onChange={(e) => edit((f) => ({ ...f, targetRole: e.target.value }))}
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {ROLE_PRESETS.map((r) => (
                    <button key={r} type="button" onClick={() => edit((f) => ({ ...f, targetRole: r }))}>
                      <Badge variant={form.targetRole === r ? 'accent' : 'outline'}>{r}</Badge>
                    </button>
                  ))}
                </div>
              </div>
              <FormField id="name" label="이름" maxLength={50} value={c.name} onChange={(e) => setContent('name', e.target.value)} />
              <FormField
                id="email"
                label="이메일"
                type="email"
                maxLength={255}
                value={c.email}
                onChange={(e) => setContent('email', e.target.value)}
              />
              <FormField id="phone" label="연락처" maxLength={30} value={c.phone} onChange={(e) => setContent('phone', e.target.value)} />
              <TextareaField
                id="links"
                label="링크 (GitHub·블로그 등, 한 줄에 하나, 최대 5개)"
                rows={3}
                value={c.links.join('\n')}
                onChange={(e) =>
                  setContent(
                    'links',
                    e.target.value
                      .split('\n')
                      .slice(0, 5)
                      .map((l) => l.slice(0, 300)),
                  )
                }
              />
            </div>
          </Section>

          <Section title="자기 요약" description="지원 직무와 강점을 3~5문장으로 요약하세요.">
            <TextareaField
              id="summary"
              label="자기 요약"
              hint={`${c.summary.length} / 1000자`}
              rows={5}
              maxLength={1000}
              placeholder="예: 대용량 트래픽을 고려한 API 설계에 관심이 많은 백엔드 개발자입니다..."
              value={c.summary}
              onChange={(e) => setContent('summary', e.target.value)}
            />
          </Section>

          <Section title="기술 스택">
            <TagInput
              id="skills"
              label="사용할 수 있는 기술"
              values={c.skills}
              max={40}
              placeholder="예: Java, Spring Boot, MySQL"
              onChange={(v) => setContent('skills', v)}
            />
          </Section>

          <Section title="경력·활동" description="인턴, 아르바이트, 동아리, 부트캠프, 오픈소스 기여 등을 적으세요.">
            <RepeatList
              id="exp"
              items={c.experiences}
              max={20}
              addLabel="경력·활동 추가"
              empty={() => ({ organization: '', position: '', period: '', description: '' })}
              onChange={(v) => setContent('experiences', v)}
              fields={[
                { key: 'organization', label: '회사·기관', maxLength: 100, half: true },
                { key: 'position', label: '직책·역할', maxLength: 100, half: true },
                { key: 'period', label: '기간', placeholder: '2024.03 ~ 2024.08', maxLength: 50 },
                { key: 'description', label: '한 일과 성과', type: 'textarea', maxLength: 2000 },
              ]}
            />
          </Section>

          <Section title="프로젝트">
            <RepeatList
              id="proj"
              items={c.projects}
              max={20}
              addLabel="프로젝트 추가"
              empty={() => ({ name: '', period: '', role: '', techStack: [], description: '' })}
              onChange={(v) => setContent('projects', v)}
              fields={[
                { key: 'name', label: '프로젝트 이름', maxLength: 100, half: true },
                { key: 'period', label: '기간', maxLength: 50, half: true },
                { key: 'role', label: '맡은 역할', maxLength: 100 },
                { key: 'techStack', label: '사용 기술', type: 'tags' },
                { key: 'description', label: '내용과 성과', type: 'textarea', maxLength: 2000 },
              ]}
            />
          </Section>

          <Section title="학력">
            <RepeatList
              id="edu"
              items={c.educations}
              max={10}
              addLabel="학력 추가"
              empty={() => ({ school: '', major: '', period: '', note: '' })}
              onChange={(v) => setContent('educations', v)}
              fields={[
                { key: 'school', label: '학교', maxLength: 100, half: true },
                { key: 'major', label: '전공', maxLength: 100, half: true },
                { key: 'period', label: '기간', maxLength: 50, half: true },
                { key: 'note', label: '비고 (학점, 주요 과목 등)', maxLength: 300, half: true },
              ]}
            />
          </Section>

          <Section title="자격증·수상">
            <RepeatList
              id="cert"
              items={c.certificates}
              max={20}
              addLabel="자격증·수상 추가"
              empty={() => ({ name: '', issuer: '', date: '' })}
              onChange={(v) => setContent('certificates', v)}
              fields={[
                { key: 'name', label: '이름', maxLength: 100, half: true },
                { key: 'issuer', label: '발급·주최', maxLength: 100, half: true },
                { key: 'date', label: '취득일', placeholder: '2025.06', maxLength: 20, half: true },
              ]}
            />
          </Section>
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <AiPanel
            title="AI 이력서 첨삭"
            description="지원 직무 기준으로 점수, 잘 된 점, 고칠 점, 빠진 키워드를 알려 드려요. 저장하지 않은 변경은 먼저 저장합니다."
            actionLabel={review ? '다시 첨삭 받기' : 'AI 첨삭 받기'}
            running={reviewing}
            disabled={!form.title.trim()}
            disabledReason="이력서 제목을 먼저 입력해 주세요."
            error={aiError}
            onRun={runReview}
          >
            {review && (
              <div className="flex flex-col gap-4 border-t border-border pt-4">
                <div className="flex items-center justify-between">
                  <ScoreBadge score={review.score} />
                  {doc?.reviewedAt && <span className="text-xs text-muted-foreground">{formatDateTime(doc.reviewedAt)}</span>}
                </div>
                <p className="text-sm leading-relaxed">{review.overall}</p>
                {review.strengths.length > 0 && (
                  <div>
                    <SubTitle>잘 된 점</SubTitle>
                    <ul className="list-disc space-y-1 pl-5 text-sm">
                      {review.strengths.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {review.improvements.length > 0 && (
                  <div>
                    <SubTitle>고칠 점</SubTitle>
                    <ul className="flex flex-col gap-2">
                      {review.improvements.map((imp, i) => (
                        <li key={i} className="rounded-control bg-muted p-3 text-sm">
                          <Badge variant="outline" className="mb-1">
                            {SECTION_LABEL[imp.section] ?? imp.section}
                          </Badge>
                          <p className="font-medium">{imp.point}</p>
                          <p className="mt-1 text-muted-foreground">{imp.suggestion}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {review.missingKeywords.length > 0 && (
                  <div>
                    <SubTitle>직무에서 자주 보는 키워드</SubTitle>
                    <div className="flex flex-wrap gap-1.5">
                      {review.missingKeywords.map((k) => (
                        <Badge key={k} variant="warning">
                          {k}
                        </Badge>
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">실제로 다룰 줄 아는 것만 이력서에 넣으세요.</p>
                  </div>
                )}
                {review.suggestedSummary && (
                  <div>
                    <SubTitle>다듬은 자기 요약</SubTitle>
                    <p className="whitespace-pre-wrap rounded-control bg-accent p-3 text-sm">{review.suggestedSummary}</p>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="mt-2"
                      onClick={() => setContent('summary', review.suggestedSummary.slice(0, 1000))}
                    >
                      자기 요약에 적용
                    </Button>
                  </div>
                )}
              </div>
            )}
          </AiPanel>
        </aside>
      </div>
    </div>
  )
}
