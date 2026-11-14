import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { emptyPortfolio, portfoliosApi, type PortfolioProject, type PortfolioRequest } from '../api/portfolios.ts'
import { AiPanel, CareerHeader, SaveBar, SubTitle, TagInput } from '../components/career/CareerShared.tsx'
import Alert from '../components/ui/Alert.tsx'
import Button from '../components/ui/Button.tsx'
import Card from '../components/ui/Card.tsx'
import FormField from '../components/ui/FormField.tsx'
import Icon from '../components/ui/Icon.tsx'
import TextareaField from '../components/ui/TextareaField.tsx'
import { buttonClass } from '../components/ui/styles.ts'
import { useDocumentEditor } from '../features/career/useDocumentEditor.ts'
import { formatDateTime } from '../lib/interviewLabels.ts'
import { errorText } from '../features/career/common.ts'

// 포트폴리오 관리 도우미 편집 화면 (docs/PLAN.md 12.3)

const toRequest = (p: PortfolioProject): PortfolioRequest => ({
  title: p.title,
  summary: p.summary,
  role: p.role,
  period: p.period,
  teamSize: p.teamSize,
  techStack: p.techStack,
  description: p.description,
  achievements: p.achievements,
  githubUrl: p.githubUrl,
  demoUrl: p.demoUrl,
  featured: p.featured,
})

export default function PortfolioEditPage() {
  const { id } = useParams()
  const editor = useDocumentEditor<PortfolioRequest, PortfolioProject>({
    id,
    basePath: '/portfolios',
    empty: emptyPortfolio,
    toRequest,
    get: portfoliosApi.get,
    create: portfoliosApi.create,
    update: portfoliosApi.update,
  })
  const { form, edit, doc } = editor
  const [running, setRunning] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  const set = <K extends keyof PortfolioRequest>(key: K, value: PortfolioRequest[K]) =>
    edit((f) => ({ ...f, [key]: value }))

  const runAssist = async () => {
    setAiError(null)
    const saved = await editor.ensureSaved()
    if (!saved) return
    setRunning(true)
    try {
      editor.applyServerDoc(await portfoliosApi.assist(saved.id))
    } catch (err) {
      setAiError(errorText(err, 'AI 다듬기 결과를 받지 못했습니다.').message)
    } finally {
      setRunning(false)
    }
  }

  if (editor.loading) return <p className="px-6 py-12 text-sm text-muted-foreground">불러오는 중...</p>
  if (editor.loadError) return <Alert className="px-6 py-12">{editor.loadError}</Alert>

  const assist = doc?.assist
  const errors = editor.fieldErrors
  const hasContent = Boolean(form.description.trim() || form.achievements.trim() || form.summary.trim())

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <CareerHeader
        title={doc ? form.title || '프로젝트' : '새 프로젝트'}
        description="문제 → 내 역할 → 해결 → 결과 순서로 적으면 면접에서도 그대로 말할 수 있어요."
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
          <Card className="grid gap-4 p-6 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <FormField
                id="title"
                label="프로젝트 이름"
                maxLength={100}
                value={form.title}
                error={errors.title}
                onChange={(e) => set('title', e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <FormField
                id="summary"
                label="한 줄 소개"
                placeholder="예: 1만 명이 쓰는 대학 시간표 공유 서비스"
                maxLength={200}
                value={form.summary}
                onChange={(e) => set('summary', e.target.value)}
              />
            </div>
            <FormField id="role" label="내 역할" placeholder="예: 백엔드 리드" maxLength={100} value={form.role} onChange={(e) => set('role', e.target.value)} />
            <FormField id="period" label="기간" placeholder="2025.03 ~ 2025.06" maxLength={50} value={form.period} onChange={(e) => set('period', e.target.value)} />
            <FormField
              id="teamSize"
              label="팀 인원"
              type="number"
              min={1}
              max={100}
              placeholder="개인 프로젝트면 1"
              value={form.teamSize ?? ''}
              error={errors.teamSize}
              onChange={(e) => set('teamSize', e.target.value ? Number(e.target.value) : null)}
            />
            <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium">
              <input type="checkbox" checked={form.featured} onChange={(e) => set('featured', e.target.checked)} />
              대표 프로젝트로 표시
            </label>
            <div className="sm:col-span-2">
              <TagInput
                id="techStack"
                label="기술 스택"
                values={form.techStack}
                max={20}
                placeholder="예: React, TypeScript, AWS"
                onChange={(v) => set('techStack', v)}
              />
            </div>
          </Card>

          <Card className="flex flex-col gap-4 p-6">
            <TextareaField
              id="description"
              label="프로젝트 설명 (배경·문제, 내 역할, 기술 선택 이유, 해결 과정)"
              hint={`${form.description.length} / 5000자`}
              rows={10}
              maxLength={5000}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
            />
            <TextareaField
              id="achievements"
              label="성과와 배운 점"
              hint={`${form.achievements.length} / 2000자`}
              rows={5}
              maxLength={2000}
              placeholder="예: 쿼리 튜닝으로 응답 시간 70% 단축, 테스트 커버리지 80% 달성"
              value={form.achievements}
              onChange={(e) => set('achievements', e.target.value)}
            />
          </Card>

          <Card className="grid gap-4 p-6 sm:grid-cols-2">
            <FormField
              id="githubUrl"
              label="GitHub 주소"
              placeholder="https://github.com/..."
              maxLength={300}
              value={form.githubUrl}
              error={errors.githubUrl}
              onChange={(e) => set('githubUrl', e.target.value)}
            />
            <FormField
              id="demoUrl"
              label="데모·배포 주소"
              placeholder="https://..."
              maxLength={300}
              value={form.demoUrl}
              error={errors.demoUrl}
              onChange={(e) => set('demoUrl', e.target.value)}
            />
          </Card>
        </div>

        <aside className="flex flex-col gap-6 lg:sticky lg:top-6 lg:self-start">
          <AiPanel
            title="AI 프로젝트 다듬기"
            description="설명을 STAR 구조로 다듬고, 이력서에 넣을 한 줄 성과와 이 프로젝트로 받을 만한 면접 질문을 만들어 드려요."
            actionLabel={assist ? '다시 다듬기' : 'AI 다듬기'}
            running={running}
            disabled={!form.title.trim() || !hasContent}
            disabledReason="프로젝트 이름과 설명(또는 성과)을 먼저 적어 주세요."
            error={aiError}
            onRun={runAssist}
          >
            {assist && (
              <div className="flex flex-col gap-4 border-t border-border pt-4">
                {doc?.assistedAt && <span className="text-xs text-muted-foreground">{formatDateTime(doc.assistedAt)}</span>}
                <div>
                  <SubTitle>예상 면접 질문</SubTitle>
                  <ol className="flex flex-col gap-2">
                    {assist.expectedQuestions.map((q, i) => (
                      <li key={i} className="rounded-control bg-muted p-3 text-sm">
                        <p className="font-medium">
                          Q{i + 1}. {q.question}
                        </p>
                        {q.intent && <p className="mt-1 text-xs text-muted-foreground">{q.intent}</p>}
                      </li>
                    ))}
                  </ol>
                  <Link to="/interviews/new" className={buttonClass({ variant: 'outline', size: 'sm' }, 'mt-2')}>
                    <Icon name="videocam" size={16} />
                    모의 면접으로 연습하기
                  </Link>
                </div>
                {assist.resumeBullets.length > 0 && (
                  <div>
                    <SubTitle>이력서용 한 줄 성과</SubTitle>
                    <ul className="list-disc space-y-1 pl-5 text-sm">
                      {assist.resumeBullets.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {assist.polishedDescription && (
                  <div>
                    <SubTitle>다듬은 설명</SubTitle>
                    <p className="whitespace-pre-wrap rounded-control bg-accent p-3 text-sm">{assist.polishedDescription}</p>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="mt-2"
                      onClick={() => set('description', assist.polishedDescription.slice(0, 5000))}
                    >
                      설명에 적용
                    </Button>
                  </div>
                )}
                {assist.tips.length > 0 && (
                  <div>
                    <SubTitle>보완하면 좋은 점</SubTitle>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      {assist.tips.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
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
