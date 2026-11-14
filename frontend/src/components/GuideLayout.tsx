import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.tsx'
import Badge from './ui/Badge.tsx'
import Icon from './ui/Icon.tsx'
import { buttonClass } from './ui/styles.ts'

// 준비 가이드(/guide)와 이용 가이드(/how-to)가 함께 쓰는 머리말·목차·절·하단 CTA.

export interface GuideTocItem {
  id: string
  label: string
}

export function GuideHeader({
  eyebrow,
  title,
  description,
  toc,
}: {
  eyebrow: string
  title: string
  description: string
  toc: GuideTocItem[]
}) {
  return (
    <header className="mb-12">
      <Badge variant="accent" className="mb-3">
        {eyebrow}
      </Badge>
      <h1 className="font-heading text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-3 max-w-3xl text-base leading-relaxed text-muted-foreground">{description}</p>
      <nav aria-label="목차" className="mt-6 flex flex-wrap gap-2">
        {toc.map((t) => (
          <a key={t.id} href={`#${t.id}`} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
            {t.label}
          </a>
        ))}
      </nav>
    </header>
  )
}

export function GuideSection({
  id,
  icon,
  title,
  description,
  children,
}: {
  id: string
  icon: string
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-border py-10">
      <div className="mb-6 flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-card bg-accent text-primary">
          <Icon name={icon} size={24} />
        </div>
        <div>
          <h2 className="font-heading text-2xl font-bold">{title}</h2>
          {description && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

export function CheckList({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2 text-sm leading-relaxed">
          <Icon name="check_circle" size={18} className="mt-0.5 shrink-0 text-primary" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

export function GuideCta({ title, description }: { title: string; description: string }) {
  const { user } = useAuth()
  return (
    <section className="mt-6 flex flex-col items-center rounded-card bg-inverse p-8 text-center text-inverse-foreground shadow-xl md:p-12">
      <h2 className="font-heading text-2xl font-bold md:text-3xl">{title}</h2>
      <p className="mb-6 mt-2 max-w-xl text-sm text-inverse-foreground/70">{description}</p>
      <Link to={user ? '/interviews/new' : '/signup'} className={buttonClass({ size: 'lg' })}>
        {user ? '새 면접 만들기' : '회원가입하고 시작하기'}
        <Icon name="arrow_forward" />
      </Link>
    </section>
  )
}
