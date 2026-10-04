import type { InputHTMLAttributes } from 'react'
import Input from './Input.tsx'

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
}

export default function FormField({ label, error, id, ...rest }: Props) {
  const inputId = id ?? rest.name
  return (
    <div>
      <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-foreground">
        {label}
      </label>
      <Input id={inputId} invalid={Boolean(error)} {...rest} />
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  )
}
