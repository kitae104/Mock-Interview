import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { careerTools, errorText } from '../../features/career/common.ts'
import { cn } from '../../lib/cn.ts'
import Alert from '../ui/Alert.tsx'
import Badge from '../ui/Badge.tsx'
import Button from '../ui/Button.tsx'
import Card from '../ui/Card.tsx'
import Icon from '../ui/Icon.tsx'
import Input from '../ui/Input.tsx'

// 취업 도우미(이력서·자기소개서·포트폴리오) 화면이 함께 쓰는 조각 (docs/PLAN.md 12장).

/** 화면 위 제목과 세 도우미 사이를 오가는 탭 */
export function CareerHeader({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return (
    <header className="mb-8">
      <nav aria-label="취업 도우미" className="mb-6 flex flex-wrap gap-2 border-b border-border">
        {careerTools.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              cn(
                '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium',
                isActive ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
              )
            }
          >
            <Icon name={t.icon} size={18} />
            {t.label}
          </NavLink>
        ))}
      </nav>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        {actions}
      </div>
    </header>
  )
}

/** 한 번 누르면 확인 문구, 한 번 더 눌러야 삭제 */
export function ConfirmDeleteButton({ onDelete, warning }: { onDelete: () => Promise<void>; warning: string }) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setDeleting(true)
    setError(null)
    try {
      await onDelete()
    } catch (err) {
      setError(errorText(err, '삭제하지 못했습니다.').message)
      setDeleting(false)
    }
  }

  if (!confirming) {
    return (
      <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
        삭제
      </Button>
    )
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="text-sm text-muted-foreground">{warning}</span>
        <Button variant="destructive" size="sm" disabled={deleting} onClick={run}>
          {deleting ? '삭제 중...' : '삭제하기'}
        </Button>
        <Button variant="ghost" size="sm" disabled={deleting} onClick={() => setConfirming(false)}>
          취소
        </Button>
      </div>
      {error && <Alert>{error}</Alert>}
    </div>
  )
}

/** 쉼표나 Enter 로 태그(기술 스택 등)를 추가하는 입력 */
export function TagInput({
  id,
  label,
  values,
  onChange,
  max,
  placeholder,
}: {
  id: string
  label: string
  values: string[]
  onChange: (next: string[]) => void
  max: number
  placeholder?: string
}) {
  const [draft, setDraft] = useState('')

  const commit = (raw: string) => {
    const added = raw
      .split(',')
      .map((v) => v.trim().slice(0, 50))
      .filter((v) => v && !values.includes(v))
    if (added.length) onChange([...values, ...added].slice(0, max))
    setDraft('')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commit(draft)
    } else if (e.key === 'Backspace' && !draft && values.length) {
      onChange(values.slice(0, -1))
    }
  }

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label} <span className="text-xs font-normal text-muted-foreground">(쉼표·Enter 로 추가, 최대 {max}개)</span>
      </label>
      {values.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {values.map((v) => (
            <Badge key={v} variant="accent">
              {v}
              <button type="button" aria-label={`${v} 빼기`} onClick={() => onChange(values.filter((x) => x !== v))}>
                <Icon name="close" size={14} />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <Input
        id={id}
        value={draft}
        disabled={values.length >= max}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => draft && commit(draft)}
      />
    </div>
  )
}

/** AI 도움 패널: 설명, 실행 버튼, 진행·오류 표시, 결과 */
export function AiPanel({
  title,
  description,
  actionLabel,
  running,
  disabled,
  disabledReason,
  error,
  onRun,
  children,
}: {
  title: string
  description: string
  actionLabel: string
  running: boolean
  disabled?: boolean
  disabledReason?: string
  error: string | null
  onRun: () => void
  children?: ReactNode
}) {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div>
        <h2 className="flex items-center gap-1.5 font-heading text-lg font-bold">
          <Icon name="auto_awesome" size={20} className="text-primary" />
          {title}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <Button onClick={onRun} disabled={running || disabled}>
        {running ? 'AI 가 살펴보는 중... (10~30초)' : actionLabel}
      </Button>
      {disabled && disabledReason && <Alert tone="info">{disabledReason}</Alert>}
      {error && <Alert>{error}</Alert>}
      <p className="text-xs text-muted-foreground">
        이름·연락처·링크는 보내지 않고, 나머지 내용은 AI 분석을 위해 AI 제공자에게 전송됩니다. AI 제안은 사실과 다를 수 있으니
        확인 후 적용하세요.
      </p>
      {children}
    </Card>
  )
}

/** 점수 표시 (0~100) */
export function ScoreBadge({ score }: { score: number }) {
  return <Badge variant={score >= 80 ? 'success' : score >= 60 ? 'warning' : 'danger'}>{score}점</Badge>
}

/** 목록·결과에서 쓰는 소제목 */
export function SubTitle({ children }: { children: ReactNode }) {
  return <h3 className="mb-2 text-sm font-bold">{children}</h3>
}

/** 저장 상태 표시 + 저장 버튼 묶음 */
export function SaveBar({
  saving,
  dirty,
  savedAt,
  onSave,
  error,
}: {
  saving: boolean
  dirty: boolean
  savedAt: string | null
  onSave: () => void
  error: string | null
}) {
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">
          {dirty ? '저장하지 않은 변경이 있어요' : savedAt ? `저장됨 · ${savedAt}` : ''}
        </span>
        <Button onClick={onSave} disabled={saving}>
          <Icon name="save" size={18} />
          {saving ? '저장 중...' : '저장'}
        </Button>
      </div>
      {error && <Alert>{error}</Alert>}
    </div>
  )
}
