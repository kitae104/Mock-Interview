import { api } from './client.ts'

// 포트폴리오 관리 도우미 (docs/PLAN.md 12.3). 필드 이름은 백엔드 app/portfolios/schemas.py 와 같습니다.

export interface PortfolioAssist {
  polishedDescription: string
  resumeBullets: string[]
  expectedQuestions: { question: string; intent: string }[]
  tips: string[]
}

export interface PortfolioRequest {
  title: string
  summary: string
  role: string
  period: string
  teamSize: number | null
  techStack: string[]
  description: string
  achievements: string
  githubUrl: string
  demoUrl: string
  featured: boolean
}

export interface PortfolioProject extends PortfolioRequest {
  id: number
  assist: PortfolioAssist | null
  assistedAt: string | null
  createdAt: string
  updatedAt: string
}

export const emptyPortfolio = (): PortfolioRequest => ({
  title: '',
  summary: '',
  role: '',
  period: '',
  teamSize: null,
  techStack: [],
  description: '',
  achievements: '',
  githubUrl: '',
  demoUrl: '',
  featured: false,
})

export const portfoliosApi = {
  list: () => api<PortfolioProject[]>('/api/portfolios'),
  get: (id: number | string) => api<PortfolioProject>(`/api/portfolios/${id}`),
  create: (body: PortfolioRequest) =>
    api<PortfolioProject>('/api/portfolios', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: number | string, body: PortfolioRequest) =>
    api<PortfolioProject>(`/api/portfolios/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  remove: (id: number | string) => api<void>(`/api/portfolios/${id}`, { method: 'DELETE' }),
  /** 설명 다듬기·이력서 한 줄 성과·예상 면접 질문 (결과 저장) */
  assist: (id: number | string) => api<PortfolioProject>(`/api/portfolios/${id}/assist`, { method: 'POST' }),
}
