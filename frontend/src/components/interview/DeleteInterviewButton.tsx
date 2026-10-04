import { useState } from 'react'
import { interviewsApi } from '../../api/interviews.ts'
import { ApiError } from '../../api/client.ts'
import Alert from '../ui/Alert.tsx'
import Button from '../ui/Button.tsx'

interface Props {
  interviewId: number
  /** 삭제가 끝난 뒤 (목록 새로고침, 화면 이동 등) */
  onDeleted: () => void
}

// 한 번 누르면 확인 문구가 나오고, 한 번 더 눌러야 삭제됩니다 (삭제하면 질문·답변·리포트가 모두 지워져 복구할 수 없음).
export default function DeleteInterviewButton({ interviewId, onDeleted }: Props) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDelete = async () => {
    setError(null)
    setDeleting(true)
    try {
      await interviewsApi.remove(interviewId)
      onDeleted()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '삭제하지 못했습니다.')
      setDeleting(false)
    }
  }

  if (!confirming) {
    return (
      <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
        삭제
      </Button>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">질문과 답변이 모두 지워지고 복구할 수 없어요.</span>
        <Button variant="destructive" size="sm" disabled={deleting} onClick={handleDelete}>
          {deleting ? '삭제 중...' : '삭제하기'}
        </Button>
        <Button variant="ghost" size="sm" disabled={deleting} onClick={() => setConfirming(false)}>
          취소
        </Button>
      </div>
      {error && <Alert>{error}</Alert>}
    </div>
  )
}
