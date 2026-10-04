import type { ReactNode, TextareaHTMLAttributes } from 'react'
import Textarea from './Textarea.tsx'

interface Props extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string
  /** 라벨 오른쪽에 붙는 보조 문구 (예: 글자 수) */
  hint?: ReactNode
  error?: string
}

export default function TextareaField({ label, hint, error, id, ...rest }: Props) {
  const inputId = id ?? rest.name
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label htmlFor={inputId} className="text-sm font-medium text-foreground">
          {label}
        </label>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      <Textarea id={inputId} invalid={Boolean(error)} {...rest} />
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  )
}
