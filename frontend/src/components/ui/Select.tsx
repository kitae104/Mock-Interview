import type { SelectHTMLAttributes } from 'react'
import { inputClass } from './styles.ts'

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean
}

export default function Select({ invalid, className, children, ...rest }: Props) {
  return (
    <select aria-invalid={invalid || undefined} className={inputClass(invalid, className)} {...rest}>
      {children}
    </select>
  )
}
