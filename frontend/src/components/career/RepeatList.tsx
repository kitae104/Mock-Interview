import Button from '../ui/Button.tsx'
import FormField from '../ui/FormField.tsx'
import Icon from '../ui/Icon.tsx'
import TextareaField from '../ui/TextareaField.tsx'
import { TagInput } from './CareerShared.tsx'

// 이력서의 경력·학력·프로젝트·자격증처럼 같은 모양의 항목을 여러 개 입력하는 목록

export interface RepeatField {
  key: string
  label: string
  type?: 'text' | 'textarea' | 'tags'
  placeholder?: string
  maxLength?: number
  /** 한 줄에 두 칸씩 놓을 때 true (text 만) */
  half?: boolean
}

type Row = Record<string, string | string[]>

interface Props<T extends object> {
  id: string
  items: T[]
  fields: RepeatField[]
  max: number
  addLabel: string
  empty: () => T
  onChange: (next: T[]) => void
}

export default function RepeatList<T extends object>({ id, items, fields, max, addLabel, empty, onChange }: Props<T>) {
  const set = (index: number, key: string, value: string | string[]) =>
    onChange(items.map((item, i) => (i === index ? ({ ...item, [key]: value } as T) : item)))
  const move = (index: number, delta: number) => {
    const next = [...items]
    const [row] = next.splice(index, 1)
    next.splice(index + delta, 0, row)
    onChange(next)
  }

  return (
    <div className="flex flex-col gap-4">
      {items.map((item, index) => (
        <div key={index} className="rounded-control border border-border bg-muted/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-xs text-muted-foreground">#{index + 1}</span>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" aria-label="위로" disabled={index === 0} onClick={() => move(index, -1)}>
                <Icon name="arrow_upward" size={16} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label="아래로"
                disabled={index === items.length - 1}
                onClick={() => move(index, 1)}
              >
                <Icon name="arrow_downward" size={16} />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onChange(items.filter((_, i) => i !== index))}>
                <Icon name="delete" size={16} />
                빼기
              </Button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((f) => {
              const fieldId = `${id}-${index}-${f.key}`
              const value = (item as Row)[f.key]
              if (f.type === 'tags') {
                return (
                  <div key={f.key} className="sm:col-span-2">
                    <TagInput
                      id={fieldId}
                      label={f.label}
                      values={Array.isArray(value) ? value : []}
                      max={20}
                      placeholder={f.placeholder}
                      onChange={(v) => set(index, f.key, v)}
                    />
                  </div>
                )
              }
              if (f.type === 'textarea') {
                const text = typeof value === 'string' ? value : ''
                return (
                  <div key={f.key} className="sm:col-span-2">
                    <TextareaField
                      id={fieldId}
                      label={f.label}
                      hint={f.maxLength ? `${text.length} / ${f.maxLength}자` : undefined}
                      rows={4}
                      maxLength={f.maxLength}
                      placeholder={f.placeholder}
                      value={text}
                      onChange={(e) => set(index, f.key, e.target.value)}
                    />
                  </div>
                )
              }
              return (
                <div key={f.key} className={f.half ? undefined : 'sm:col-span-2'}>
                  <FormField
                    id={fieldId}
                    label={f.label}
                    maxLength={f.maxLength}
                    placeholder={f.placeholder}
                    value={typeof value === 'string' ? value : ''}
                    onChange={(e) => set(index, f.key, e.target.value)}
                  />
                </div>
              )
            })}
          </div>
        </div>
      ))}
      <Button variant="secondary" disabled={items.length >= max} onClick={() => onChange([...items, empty()])}>
        <Icon name="add" size={18} />
        {addLabel}
      </Button>
    </div>
  )
}
