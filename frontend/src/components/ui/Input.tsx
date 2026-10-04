import type { InputHTMLAttributes } from 'react'
import { inputClass } from './styles.ts'

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean
}

export default function Input({ invalid, className, ...rest }: Props) {
  return <input aria-invalid={invalid || undefined} className={inputClass(invalid, className)} {...rest} />
}
