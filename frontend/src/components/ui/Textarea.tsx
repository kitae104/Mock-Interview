import type { TextareaHTMLAttributes } from 'react'
import { cn } from '../../lib/cn.ts'
import { inputClass } from './styles.ts'

interface Props extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
}

export default function Textarea({ invalid, className, ...rest }: Props) {
  return <textarea aria-invalid={invalid || undefined} className={inputClass(invalid, cn('resize-y', className))} {...rest} />
}
