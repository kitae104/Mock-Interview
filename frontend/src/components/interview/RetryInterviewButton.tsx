import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../../api/client.ts'
import { interviewsApi } from '../../api/interviews.ts'
import type { ButtonSize, ButtonVariant } from '../ui/styles.ts'
import Alert from '../ui/Alert.tsx'
import Button from '../ui/Button.tsx'
import Icon from '../ui/Icon.tsx'

interface Props {
  interviewId: number
  variant?: ButtonVariant
  size?: ButtonSize
  /** 버튼 글자. 기본은 "같은 질문으로 다시 하기" */
  label?: string
}

// 같은 질문으로 다시 하기: 질문을 복사한 새 면접을 만들고(AI 를 부르지 않아 바로 끝남) 바로 장치 점검 화면으로 이동합니다.
export default function RetryInterviewButton({ interviewId, variant = 'outline', size = 'md', label = '같은 질문으로 다시 하기' }: Props) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClick = async () => {
    setBusy(true)
    setError(null)
    try {
      const copy = await interviewsApi.retry(interviewId)
      navigate(`/interviews/${copy.id}/check`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '다시 하기를 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.')
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant={variant} size={size} onClick={() => void handleClick()} disabled={busy}>
        <Icon name={busy ? 'progress_activity' : 'replay'} className={busy ? 'animate-spin' : undefined} />
        {busy ? '준비하는 중...' : label}
      </Button>
      {error && <Alert className="max-w-xs text-xs">{error}</Alert>}
    </div>
  )
}
