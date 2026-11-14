import { ApiError } from '../../api/client.ts'

// 취업 도우미(이력서·자기소개서·포트폴리오) 화면이 함께 쓰는 값과 함수 (docs/PLAN.md 12장).

export const careerTools = [
  { to: '/resumes', icon: 'badge', label: '이력서', description: '섹션별로 이력서를 쓰고 지원 직무 기준 AI 첨삭을 받아요.' },
  { to: '/cover-letters', icon: 'edit_document', label: '자기소개서', description: '문항별 글자 수를 보며 쓰고, 경험 메모로 초안·첨삭을 받아요.' },
  { to: '/portfolios', icon: 'folder_special', label: '포트폴리오', description: '프로젝트를 정리하고 설명 다듬기와 예상 면접 질문을 받아요.' },
]

/** 서버 에러를 화면 문구로. 필드별 메시지가 있으면 함께 돌려줍니다. */
export function errorText(err: unknown, fallback: string): { message: string; fields: Record<string, string> } {
  if (err instanceof ApiError) return { message: err.message, fields: err.errors }
  return { message: fallback, fields: {} }
}
