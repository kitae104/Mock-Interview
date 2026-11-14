import type { ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'
import { textStyles } from './styles.ts'

interface Props {
  title: ReactNode
  /** 제목 위의 작은 글 (예: 인사말, 분류) */
  eyebrow?: ReactNode
  description?: ReactNode
  /** 오른쪽 동작 버튼. 좁은 화면에서는 제목 아래로 내려갑니다 */
  actions?: ReactNode
  className?: string
}

// 화면 맨 위 제목 영역. 모든 화면이 같은 크기·여백의 제목을 쓰도록 합니다.
export default function PageHeader({ title, eyebrow, description, actions, className }: Props) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-x-6 gap-y-4', className)}>
      <div className="min-w-0 max-w-2xl">
        {eyebrow && <p className={cn(textStyles.eyebrow, 'mb-1.5')}>{eyebrow}</p>}
        <h1 className={textStyles.pageTitle}>{title}</h1>
        {description && <p className={cn(textStyles.pageDescription, 'mt-1.5')}>{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
