import { useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  coverLettersApi,
  type CoverLetter,
  type CoverLetterItem,
  type CoverLetterRequest,
} from '../api/coverLetters.ts'
import { AiPanel, CareerHeader, SaveBar, ScoreBadge, SubTitle } from '../components/career/CareerShared.tsx'
import Alert from '../components/ui/Alert.tsx'
import Badge from '../components/ui/Badge.tsx'
import Button from '../components/ui/Button.tsx'
import Card from '../components/ui/Card.tsx'
import FormField from '../components/ui/FormField.tsx'
import Icon from '../components/ui/Icon.tsx'
import TextareaField from '../components/ui/TextareaField.tsx'
import { useDocumentEditor } from '../features/career/useDocumentEditor.ts'
import { cn } from '../lib/cn.ts'
import { formatDateTime } from '../lib/interviewLabels.ts'
import { errorText } from '../features/career/common.ts'

// 자기소개서 작성 도우미 편집 화면 (docs/PLAN.md 12.2)

const MAX_ITEMS = 10
const QUESTION_PRESETS = [
  '지원 동기와 입사 후 포부를 작성해 주세요.',
  '직무 관련 역량을 쌓기 위해 노력한 경험을 작성해 주세요.',
  '팀 프로젝트에서 갈등을 해결한 경험을 작성해 주세요.',
  '기술적으로 어려운 문제를 해결한 경험을 작성해 주세요.',
]

const emptyItem = (question = ''): CoverLetterItem => ({ question, answer: '', charLimit: null })
const empty = (): CoverLetterRequest => ({
  title: '',
  company: '',
  targetRole: '',
  jobPosting: null,
  items: [emptyItem(QUESTION_PRESETS[0])],
})
const toRequest = (c: CoverLetter): CoverLetterRequest => ({
  title: c.title,
  company: c.company,
  targetRole: c.targetRole,
  jobPosting: c.jobPosting,
  items: c.items,
})

export default function CoverLetterEditPage() {
  const { id } = useParams()
  const editor = useDocumentEditor<CoverLetterRequest, CoverLetter>({
    id,
    basePath: '/cover-letters',
    empty,
    toRequest,
    get: coverLettersApi.get,
    create: coverLettersApi.create,
    update: coverLettersApi.update,
  })
  const { form, edit, doc } = editor
  const [selected, setSelected] = useState(0)
  const [notes, setNotes] = useState('')
  const [draft, setDraft] = useState<{ index: number; text: string } | null>(null)
  const [running, setRunning] = useState<'draft' | 'review' | null>(null)
  const [aiError, setAiError] = useState<{ kind: 'draft' | 'review'; message: string } | null>(null)

  const setItem = (index: number, patch: Partial<CoverLetterItem>) =>
    edit((f) => ({ ...f, items: f.items.map((it, i) => (i === index ? { ...it, ...patch } : it)) }))

  const removeItem = (index: number) => {
    edit((f) => ({ ...f, items: f.items.filter((_, i) => i !== index) }))
    setSelected(0)
    setDraft(null)
  }

  const run = async (kind: 'draft' | 'review') => {
    setAiError(null)
    const saved = await editor.ensureSaved()
    if (!saved) return
    setRunning(kind)
    try {
      if (kind === 'draft') {
        const res = await coverLettersApi.draft(saved.id, selected, notes)
        setDraft({ index: selected, text: res.draft })
      } else {
        editor.applyServerDoc(await coverLettersApi.review(saved.id))
      }
    } catch (err) {
      setAiError({ kind, message: errorText(err, 'AI 도움을 받지 못했습니다.').message })
    } finally {
      setRunning(null)
    }
  }

  if (editor.loading) return <p className="px-6 py-12 text-sm text-muted-foreground">불러오는 중...</p>
  if (editor.loadError) return <Alert className="px-6 py-12">{editor.loadError}</Alert>

  const review = doc?.review
  const reviewOf = (index: number) => review?.items.find((r) => r.index === index)
  const fieldError = Object.entries(editor.fieldErrors).find(([k]) => k.startsWith('items'))?.[1]

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <CareerHeader
        title={doc ? form.title || '자기소개서' : '새 자기소개서'}
        description="회사의 문항과 글자 수 제한을 옮겨 적고 답변을 작성하세요. 경험 메모로 초안을 받거나 전체 첨삭을 받을 수 있어요."
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
                label="제목 (나만 보는 이름)"
                placeholder="예: A사 2026 하반기 백엔드"
                maxLength={100}
                value={form.title}
                error={editor.fieldErrors.title}
                onChange={(e) => edit((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <FormField
              id="company"
              label="회사"
              maxLength={100}
              value={form.company}
              onChange={(e) => edit((f) => ({ ...f, company: e.target.value }))}
            />
            <FormField
              id="targetRole"
              label="지원 직무"
              placeholder="예: 프론트엔드 개발자"
              maxLength={100}
              value={form.targetRole}
              onChange={(e) => edit((f) => ({ ...f, targetRole: e.target.value }))}
            />
            <div className="sm:col-span-2">
              <TextareaField
                id="jobPosting"
                label="채용 공고 (선택)"
                hint={`${(form.jobPosting ?? '').length} / 4000자`}
                rows={4}
                maxLength={4000}
                placeholder="담당 업무, 자격 요건, 우대 사항을 붙여 넣으면 초안·첨삭에 반영돼요. 기밀 정보는 넣지 마세요."
                value={form.jobPosting ?? ''}
                onChange={(e) => edit((f) => ({ ...f, jobPosting: e.target.value || null }))}
              />
            </div>
          </Card>

          {fieldError && <Alert>{fieldError}</Alert>}

          {form.items.map((item, index) => {
            const length = item.answer.length
            const over = item.charLimit !== null && length > item.charLimit
            const itemReview = reviewOf(index)
            return (
              <Card
                key={index}
                className={cn('flex flex-col gap-4 p-6', selected === index && 'ring-2 ring-ring')}
                onFocusCapture={() => setSelected(index)}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-bold text-primary">문항 {index + 1}</span>
                  <Button variant="ghost" size="sm" disabled={form.items.length <= 1} onClick={() => removeItem(index)}>
                    <Icon name="delete" size={16} />
                    문항 빼기
                  </Button>
                </div>
                <div className="grid gap-4 sm:grid-cols-4">
                  <div className="sm:col-span-3">
                    <FormField
                      id={`q-${index}`}
                      label="문항"
                      maxLength={500}
                      value={item.question}
                      onChange={(e) => setItem(index, { question: e.target.value })}
                    />
                  </div>
                  <FormField
                    id={`limit-${index}`}
                    label="글자 수 제한"
                    type="number"
                    min={100}
                    max={5000}
                    step={50}
                    placeholder="없음"
                    value={item.charLimit ?? ''}
                    onChange={(e) => setItem(index, { charLimit: e.target.value ? Number(e.target.value) : null })}
                  />
                </div>
                <TextareaField
                  id={`a-${index}`}
                  label="답변"
                  hint={
                    <span className={cn(over && 'font-bold text-destructive')}>
                      {length}
                      {item.charLimit ? ` / ${item.charLimit}` : ''}자 (공백 포함)
                    </span>
                  }
                  rows={10}
                  maxLength={5000}
                  value={item.answer}
                  onChange={(e) => setItem(index, { answer: e.target.value })}
                />
                {draft?.index === index && (
                  <div className="rounded-control bg-accent p-4">
                    <SubTitle>AI 초안</SubTitle>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{draft.text}</p>
                    <p className="mt-2 text-xs text-muted-foreground">[수치 입력] 같은 자리표시는 실제 내용으로 바꿔 주세요.</p>
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" onClick={() => {
                          setItem(index, { answer: draft.text.slice(0, 5000) })
                          setDraft(null)
                        }}>
                        답변에 적용
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
                        닫기
                      </Button>
                    </div>
                  </div>
                )}
                {itemReview && (
                  <div className="rounded-control border border-border p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <SubTitle>AI 첨삭</SubTitle>
                      <ScoreBadge score={itemReview.score} />
                    </div>
                    <p className="text-sm">{itemReview.comment}</p>
                    {itemReview.suggestions.length > 0 && (
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                        {itemReview.suggestions.map((s) => (
                          <li key={s}>{s}</li>
                        ))}
                      </ul>
                    )}
                    {itemReview.revised && (
                      <details className="mt-3">
                        <summary className="cursor-pointer text-sm font-medium text-primary">수정안 보기</summary>
                        <p className="mt-2 whitespace-pre-wrap rounded-control bg-muted p-3 text-sm">{itemReview.revised}</p>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="mt-2"
                          onClick={() => setItem(index, { answer: itemReview.revised.slice(0, 5000) })}
                        >
                          수정안 적용
                        </Button>
                      </details>
                    )}
                  </div>
                )}
              </Card>
            )
          })}

          <Card className="flex flex-col gap-3 p-6">
            <Button
              variant="secondary"
              disabled={form.items.length >= MAX_ITEMS}
              onClick={() => edit((f) => ({ ...f, items: [...f.items, emptyItem()] }))}
            >
              <Icon name="add" size={18} />
              문항 추가 (최대 {MAX_ITEMS}개)
            </Button>
            <div className="flex flex-wrap gap-1.5">
              <span className="text-xs text-muted-foreground">자주 나오는 문항:</span>
              {QUESTION_PRESETS.map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={form.items.length >= MAX_ITEMS}
                  onClick={() => edit((f) => ({ ...f, items: [...f.items, emptyItem(q)] }))}
                >
                  <Badge variant="outline">{q}</Badge>
                </button>
              ))}
            </div>
          </Card>
        </div>

        <aside className="flex flex-col gap-6 lg:sticky lg:top-6 lg:self-start">
          <AiPanel
            title={`문항 ${selected + 1} AI 초안`}
            description="이 문항에 쓸 경험을 메모로 적으면 초안을 만들어 드려요. 메모에 없는 경험이나 수치는 만들지 않아요."
            actionLabel="초안 만들기"
            running={running === 'draft'}
            disabled={!form.title.trim() || !notes.trim() || running !== null}
            disabledReason={!form.title.trim() ? '제목을 먼저 입력해 주세요.' : undefined}
            error={aiError?.kind === 'draft' ? aiError.message : null}
            onRun={() => run('draft')}
          >
            <TextareaField
              id="notes"
              label="경험 메모"
              hint={`${notes.length} / 2000자`}
              rows={6}
              maxLength={2000}
              placeholder="예: 졸업 프로젝트에서 3명과 쇼핑몰을 만들었고, 내가 결제 API 를 맡았다. 응답이 느려 캐시를 적용해 2초→0.3초로 줄였다."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </AiPanel>

          <AiPanel
            title="AI 전체 첨삭"
            description="답변을 쓴 문항마다 점수, 평가, 고칠 점, 수정안을 받아요. 결과는 각 문항 아래에 표시됩니다."
            actionLabel={review ? '다시 첨삭 받기' : 'AI 첨삭 받기'}
            running={running === 'review'}
            disabled={!form.title.trim() || running !== null}
            error={aiError?.kind === 'review' ? aiError.message : null}
            onRun={() => run('review')}
          >
            {review && (
              <div className="border-t border-border pt-4">
                <SubTitle>총평</SubTitle>
                <p className="text-sm leading-relaxed">{review.overall}</p>
                {doc?.reviewedAt && (
                  <p className="mt-2 text-xs text-muted-foreground">{formatDateTime(doc.reviewedAt)}</p>
                )}
              </div>
            )}
          </AiPanel>
        </aside>
      </div>
    </div>
  )
}
