import { api } from './client.ts'

export type InterviewLevel = 'NEWCOMER' | 'EXPERIENCED'
export type InterviewStatus = 'READY' | 'IN_PROGRESS' | 'COMPLETED'
export type QuestionCategory =
  | 'SELF_INTRO'
  | 'MOTIVATION'
  | 'JOB_KNOWLEDGE'
  | 'EXPERIENCE'
  | 'SITUATION'
  | 'PERSONALITY'
  | 'CLOSING'

export interface InterviewConfig {
  minQuestions: number
  maxQuestions: number
  defaultQuestions: number
  maxAnswerSeconds: number
  maxJobPostingChars: number
  maxAudioMb: number
  prepSecondsOptions: number[]
  defaultPrepSeconds: number
  consentVersion: string
}

// 답변의 말하기·비언어 지표와 피드백은 이후 단계(docs/PLAN.md 8장 ④~⑥)에서 채워집니다.
export interface AnswerResponse {
  id: number
  questionId: number
  transcript: string
  audioSeconds: number
  timedOut: boolean
  feedback: Record<string, unknown> | null
  score: number | null
}

export interface QuestionDto {
  id: number
  seq: number
  category: QuestionCategory
  text: string
  /** 면접 진행 중(IN_PROGRESS)에는 null */
  intent: string | null
  expectedPoints: string[] | null
  answer: AnswerResponse | null
}

export interface InterviewSummary {
  id: number
  title: string
  field: string
  level: InterviewLevel
  questionCount: number
  answeredCount: number
  status: InterviewStatus
  overallScore: number | null
  createdAt: string
  startedAt: string | null
  completedAt: string | null
}

export interface InterviewDetail extends InterviewSummary {
  jobPosting: string | null
  maxAnswerSeconds: number
  prepSeconds: number
  nonverbalEnabled: boolean
  questions: QuestionDto[]
  report: Record<string, unknown> | null
}

export interface InterviewListResponse {
  items: InterviewSummary[]
  total: number
}

export interface InterviewCreateRequest {
  field: string
  level: InterviewLevel
  questionCount: number
  prepSeconds?: number
  jobPosting?: string
}

export interface InterviewListParams {
  status?: InterviewStatus
  limit?: number
  offset?: number
}

export const interviewsApi = {
  config: () => api<InterviewConfig>('/api/interviews/config'),
  create: (body: InterviewCreateRequest) =>
    api<InterviewDetail>('/api/interviews', { method: 'POST', body: JSON.stringify(body) }),
  list: ({ status, limit = 20, offset = 0 }: InterviewListParams = {}) => {
    const query = new URLSearchParams({ limit: String(limit), offset: String(offset) })
    if (status) query.set('status', status)
    return api<InterviewListResponse>(`/api/interviews?${query}`)
  },
  get: (id: number | string) => api<InterviewDetail>(`/api/interviews/${id}`),
  remove: (id: number | string) => api<void>(`/api/interviews/${id}`, { method: 'DELETE' }),
}
