import { Link } from 'react-router-dom'
import type { InterviewSummary } from '../../api/interviews.ts'
import Icon from '../ui/Icon.tsx'
import { buttonClass } from '../ui/styles.ts'
import RetryInterviewButton from './RetryInterviewButton.tsx'

// 면접 한 건의 동작 버튼: 상태에 따라 시작/이어서 하기/결과 보기가 달라지고, 끝난 면접은 같은 질문으로 다시 할 수 있습니다.
// 목록과 대시보드가 함께 씁니다.
export default function InterviewActions({ item }: { item: Pick<InterviewSummary, 'id' | 'status'> }) {
  if (item.status === 'COMPLETED') {
    return (
      <>
        <Link to={`/interviews/${item.id}/result`} className={buttonClass({ size: 'sm' })}>
          <Icon name="assignment" size={18} />
          결과 보기
        </Link>
        <RetryInterviewButton interviewId={item.id} size="sm" label="다시 하기" />
      </>
    )
  }
  return (
    <Link to={`/interviews/${item.id}/check`} className={buttonClass({ size: 'sm' })}>
      <Icon name="videocam" size={18} />
      {item.status === 'IN_PROGRESS' ? '이어서 하기' : '면접 시작'}
    </Link>
  )
}
