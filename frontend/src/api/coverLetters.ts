import { api } from './client.ts'

// 자기소개서 작성 도우미 (docs/PLAN.md 12.2). 필드 이름은 백엔드 app/cover_letters/schemas.py 와 같습니다.

export interface CoverLetterItem {
  question: string
  answer: string
  /** 회사가 정한 글자 수 제한(공백 포함, 100~5000). 없으면 null */
  charLimit: number | null
}

export interface CoverLetterItemReview {
  index: number
  score: number
  comment: string
  suggestions: string[]
  revised: string
}

export interface CoverLetterReview {
  overall: string
  items: CoverLetterItemReview[]
}

export interface CoverLetterRequest {
  title: string
  company: string
  targetRole: string
  jobPosting: string | null
  items: CoverLetterItem[]
}

export interface CoverLetter extends CoverLetterRequest {
  id: number
  review: CoverLetterReview | null
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CoverLetterSummary {
  id: number
  title: string
  company: string
  targetRole: string
  itemCount: number
  createdAt: string
  updatedAt: string
}

export const coverLettersApi = {
  list: () => api<CoverLetterSummary[]>('/api/cover-letters'),
  get: (id: number | string) => api<CoverLetter>(`/api/cover-letters/${id}`),
  create: (body: CoverLetterRequest) =>
    api<CoverLetter>('/api/cover-letters', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: number | string, body: CoverLetterRequest) =>
    api<CoverLetter>(`/api/cover-letters/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  remove: (id: number | string) => api<void>(`/api/cover-letters/${id}`, { method: 'DELETE' }),
  /** 문항 하나의 AI 초안 (저장하지 않음) */
  draft: (id: number | string, itemIndex: number, notes: string) =>
    api<{ draft: string }>(`/api/cover-letters/${id}/draft`, {
      method: 'POST',
      body: JSON.stringify({ itemIndex, notes }),
    }),
  /** 답변이 있는 문항별 AI 첨삭 (결과 저장) */
  review: (id: number | string) => api<CoverLetter>(`/api/cover-letters/${id}/review`, { method: 'POST' }),
}
