import type { InterviewLevel, InterviewStatus, QuestionCategory } from '../api/interviews.ts'
import type { BadgeVariant } from '../components/ui/styles.ts'

export const levelLabel: Record<InterviewLevel, string> = {
  NEWCOMER: '신입',
  EXPERIENCED: '경력',
}

export const statusLabel: Record<InterviewStatus, string> = {
  READY: '준비됨',
  IN_PROGRESS: '진행 중',
  COMPLETED: '완료',
}

export const statusVariant: Record<InterviewStatus, BadgeVariant> = {
  READY: 'muted',
  IN_PROGRESS: 'accent',
  COMPLETED: 'success',
}

export const categoryLabel: Record<QuestionCategory, string> = {
  SELF_INTRO: '자기소개',
  MOTIVATION: '지원동기',
  JOB_KNOWLEDGE: '직무 지식',
  EXPERIENCE: '경험·성과',
  SITUATION: '상황 대처',
  PERSONALITY: '인성·협업',
  CLOSING: '마무리',
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })
}
