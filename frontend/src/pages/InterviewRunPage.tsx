import { Link, useParams } from 'react-router-dom'
import Card from '../components/ui/Card.tsx'
import { buttonClass } from '../components/ui/styles.ts'

// 면접 진행 화면 자리. 점검 화면의 [준비 완료]가 여기로 이동합니다. 실제 화면은 5단계(docs/PLAN.md 8장 ⑤)에서 만듭니다.
export default function InterviewRunPage() {
  const { id } = useParams()
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <Card className="p-8 text-center">
        <h1 className="font-heading text-2xl font-bold">면접 진행 화면은 준비 중이에요</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          질문 읽기와 답변 녹음은 다음 단계에서 이 화면에 만들어집니다. 점검은 끝났으니 곧 이어서 진행할 수 있어요.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Link to={`/interviews/${id}/check`} className={buttonClass({ variant: 'outline' })}>
            장치 점검으로
          </Link>
          <Link to={`/interviews/${id}`} className={buttonClass()}>
            면접 상세로
          </Link>
        </div>
      </Card>
    </div>
  )
}
