import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { coverLettersApi } from '../api/coverLetters.ts'
import { portfoliosApi } from '../api/portfolios.ts'
import { resumesApi } from '../api/resumes.ts'
import { careerTools } from '../features/career/common.ts'
import Badge from '../components/ui/Badge.tsx'
import Card from '../components/ui/Card.tsx'
import Icon from '../components/ui/Icon.tsx'
import { buttonClass } from '../components/ui/styles.ts'

// 취업 도우미 첫 화면 (docs/PLAN.md 12장)
export default function CareerHubPage() {
  const [counts, setCounts] = useState<Record<string, number | null>>({})

  useEffect(() => {
    let cancelled = false
    const load = async (key: string, fetcher: () => Promise<unknown[]>) => {
      try {
        const items = await fetcher()
        if (!cancelled) setCounts((c) => ({ ...c, [key]: items.length }))
      } catch {
        if (!cancelled) setCounts((c) => ({ ...c, [key]: null }))
      }
    }
    load('/resumes', resumesApi.list)
    load('/cover-letters', coverLettersApi.list)
    load('/portfolios', portfoliosApi.list)
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8">
        <Badge variant="accent" className="mb-3">
          취업 도우미
        </Badge>
        <h1 className="font-heading text-3xl font-bold">지원 서류부터 면접까지 한 곳에서</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          IT 직무 지원에 필요한 이력서, 자기소개서, 포트폴리오를 작성·보관하고 AI 첨삭을 받으세요. 정리한 프로젝트와 경험은 모의
          면접 답변 연습에도 그대로 쓸 수 있습니다.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-3">
        {careerTools.map((t) => (
          <Card key={t.to} className="flex flex-col p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex size-12 items-center justify-center rounded-card bg-accent text-primary">
                <Icon name={t.icon} size={28} />
              </div>
              {typeof counts[t.to] === 'number' && <Badge variant="muted">{counts[t.to]}개 작성</Badge>}
            </div>
            <h2 className="font-heading text-xl font-bold">{t.label}</h2>
            <p className="mb-6 mt-1 text-sm leading-relaxed text-muted-foreground">{t.description}</p>
            <div className="mt-auto flex gap-2">
              <Link to={t.to} className={buttonClass({ variant: 'secondary' }, 'flex-1')}>
                목록 보기
              </Link>
              <Link to={`${t.to}/new`} className={buttonClass({}, 'flex-1')}>
                <Icon name="add" size={18} />
                새로 쓰기
              </Link>
            </div>
          </Card>
        ))}
      </div>

      <Card className="mt-8 flex flex-col gap-3 p-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="font-heading text-lg font-bold">서류를 다 썼다면 면접 연습으로</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            포트폴리오 AI 다듬기에서 받은 예상 질문을 떠올리며, 같은 직무로 모의 면접을 만들어 보세요.
          </p>
        </div>
        <Link to="/interviews/new" className={buttonClass({ variant: 'outline' })}>
          모의 면접 만들기
          <Icon name="arrow_forward" size={18} />
        </Link>
      </Card>
    </div>
  )
}
