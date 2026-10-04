import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.tsx'
import Card from '../components/ui/Card.tsx'
import { buttonClass } from '../components/ui/styles.ts'
import { site } from '../config/site.ts'

// 랜딩 화면의 기능 소개. 서비스에 맞게 바꾸세요.
const features = [
  { title: 'FastAPI', description: 'Python 기반 REST API, SQLAlchemy, JWT 인증 (AI·데이터 기능을 붙이기 쉬움)' },
  { title: 'React + Tailwind', description: 'Vite, TypeScript, Tailwind CSS로 구성된 프론트엔드' },
  { title: 'Docker Compose', description: 'PostgreSQL, 백엔드, 프론트엔드를 한 번에 실행' },
  { title: 'AI 채팅', description: 'OpenAI·Anthropic·Ollama 를 바꿔 끼울 수 있는 채팅 API와 화면 (/api/ai/chat)' },
]

export default function LandingPage() {
  const { user } = useAuth()

  return (
    <div>
      <section className="mx-auto max-w-6xl px-4 py-24 text-center">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
          새 프로젝트를 <span className="text-primary">바로 시작</span>하세요
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">{site.description}</p>
        <div className="mt-10 flex justify-center gap-4">
          {user ? (
            <Link to="/dashboard" className={buttonClass({ size: 'lg' })}>
              대시보드로 이동
            </Link>
          ) : (
            <>
              <Link to="/signup" className={buttonClass({ size: 'lg' })}>
                시작하기
              </Link>
              <Link to="/login" className={buttonClass({ variant: 'outline', size: 'lg' })}>
                로그인
              </Link>
            </>
          )}
        </div>
      </section>
      <section className="mx-auto grid max-w-6xl gap-6 px-4 pb-24 sm:grid-cols-3">
        {features.map((f) => (
          <Card key={f.title}>
            <h2 className="font-semibold">{f.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{f.description}</p>
          </Card>
        ))}
      </section>
    </div>
  )
}
