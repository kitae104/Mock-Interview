import type { HTMLAttributes } from 'react'
import { badgeClass, type BadgeVariant } from './styles.ts'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
}

export default function Badge({ variant, className, ...rest }: BadgeProps) {
  return <span className={badgeClass(variant, className)} {...rest} />
}
