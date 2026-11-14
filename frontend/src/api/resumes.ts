import { api } from './client.ts'

// 이력서 작성 도우미 (docs/PLAN.md 12.1). 필드 이름은 백엔드 app/resumes/schemas.py 와 같습니다.

export interface Experience {
  organization: string
  position: string
  period: string
  description: string
}

export interface Education {
  school: string
  major: string
  period: string
  note: string
}

export interface ResumeProject {
  name: string
  period: string
  role: string
  techStack: string[]
  description: string
}

export interface Certificate {
  name: string
  issuer: string
  date: string
}

export interface ResumeContent {
  name: string
  email: string
  phone: string
  links: string[]
  summary: string
  skills: string[]
  experiences: Experience[]
  educations: Education[]
  projects: ResumeProject[]
  certificates: Certificate[]
}

export interface ResumeReview {
  score: number
  overall: string
  strengths: string[]
  improvements: { section: string; point: string; suggestion: string }[]
  suggestedSummary: string
  missingKeywords: string[]
}

export interface ResumeRequest {
  title: string
  targetRole: string
  content: ResumeContent
}

export interface Resume extends ResumeRequest {
  id: number
  review: ResumeReview | null
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ResumeSummary {
  id: number
  title: string
  targetRole: string
  reviewScore: number | null
  createdAt: string
  updatedAt: string
}

export const emptyResumeContent = (): ResumeContent => ({
  name: '',
  email: '',
  phone: '',
  links: [],
  summary: '',
  skills: [],
  experiences: [],
  educations: [],
  projects: [],
  certificates: [],
})

export const resumesApi = {
  list: () => api<ResumeSummary[]>('/api/resumes'),
  get: (id: number | string) => api<Resume>(`/api/resumes/${id}`),
  create: (body: ResumeRequest) => api<Resume>('/api/resumes', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: number | string, body: ResumeRequest) =>
    api<Resume>(`/api/resumes/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  remove: (id: number | string) => api<void>(`/api/resumes/${id}`, { method: 'DELETE' }),
  /** 저장된 내용 기준 AI 첨삭. 10~30초 걸릴 수 있습니다. */
  review: (id: number | string) => api<Resume>(`/api/resumes/${id}/review`, { method: 'POST' }),
}
