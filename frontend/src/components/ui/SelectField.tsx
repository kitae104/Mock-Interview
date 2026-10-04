import type { ReactNode, SelectHTMLAttributes } from 'react'
import Select from './Select.tsx'

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  /** 라벨 오른쪽에 붙는 보조 문구 (예: 연결된 장치 수) */
  hint?: ReactNode
  error?: string
}

export default function SelectField({ label, hint, error, id, children, ...rest }: Props) {
  const inputId = id ?? rest.name
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label htmlFor={inputId} className="text-sm font-medium text-foreground">
          {label}
        </label>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      <Select id={inputId} invalid={Boolean(error)} {...rest}>
        {children}
      </Select>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  )
}
