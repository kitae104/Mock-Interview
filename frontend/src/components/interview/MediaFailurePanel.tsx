import type { MediaFailure } from '../../features/interview/mediaFailure.ts'
import Button from '../ui/Button.tsx'
import Card from '../ui/Card.tsx'
import Icon from '../ui/Icon.tsx'

interface Props {
  failure: MediaFailure
  onRetry: () => void
  retrying?: boolean
}

// 카메라·마이크를 못 쓸 때: 무슨 일인지, 어떻게 고치는지를 순서대로 안내합니다.
export default function MediaFailurePanel({ failure, onRetry, retrying }: Props) {
  // 보안 연결이 아닌 경우에는 다시 시도해도 같은 결과라 버튼을 숨깁니다.
  const canRetry = failure.kind !== 'insecure' && failure.kind !== 'unsupported'
  return (
    <Card role="alert" className="border-destructive/40 p-6">
      <div className="flex items-start gap-3">
        <Icon name="error" size={28} className="mt-0.5 text-destructive" />
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-lg font-bold">{failure.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{failure.description}</p>
          <p className="mt-4 text-sm font-medium">이렇게 해 보세요</p>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
            {failure.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {failure.detail && <p className="mt-4 break-all font-mono text-xs text-muted-foreground">오류 정보: {failure.detail}</p>}
          {canRetry && (
            <Button className="mt-5" onClick={onRetry} disabled={retrying}>
              <Icon name="refresh" />
              {retrying ? '다시 시도하는 중...' : '다시 시도'}
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}
