import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/cn.ts'
import { cardClass } from './styles.ts'

export default function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn(cardClass, 'p-6', className)} {...rest} />
}
