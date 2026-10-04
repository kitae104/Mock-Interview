import type { Baseline, NonverbalMetrics } from '../features/interview/analyzer/types.ts'
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

/** 판정: 좋음(GOOD) / 보통(FAIR) / 주의(POOR) / 측정 불가(NA). label 은 화면에 보여 줄 문구 */
export type VerdictLevel = 'GOOD' | 'FAIR' | 'POOR' | 'NA'

export interface Verdict {
  level: VerdictLevel
  label: string
  /** 적정 구간(기준 범위) 문구. 예: "250~330", "70% 이상" */
  reference: string | null
}

/** 말하기 지표 (docs/PLAN.md 4.1). 계산할 수 없는 값은 null */
export interface SpeechMetrics {
  answerSeconds: number
  maxAnswerSeconds: number
  timedOut: boolean
  wordCount: number
  syllableCount: number
  firstSpeechSeconds: number | null
  speechSpanSeconds: number | null
  syllablesPerMinute: number | null
  silenceCount: number
  silenceTotalSeconds: number
  longestSilenceSeconds: number
  fillerCount: number
  fillerPerMinute: number | null
  fillerBreakdown: Record<string, number>
  /** 사실상 말을 하지 않은 답변 (인식된 말이 없거나 거의 없음) */
  noSpeech: boolean
}

export interface SpeechResult {
  metrics: SpeechMetrics
  /** pace, duration, firstSpeech, silence, filler */
  verdicts: Record<string, Verdict>
}

export interface NonverbalResult {
  metrics: NonverbalMetrics
  /** faceVisible, gaze, headMotion, shoulderTilt, posture, smile, blink, gesture, handMotion (카메라 영상으로 추정한 참고값) */
  verdicts: Record<string, Verdict>
  /** 얼굴이 충분히 보였고 충분히 분석했을 때만 true. false 면 점수에서 제외 */
  reliable: boolean
}

export type FeedbackStatus = 'NONE' | 'DONE' | 'FAILED'

/** 영역별 점수(0~100). 전달력·비언어는 서버가 판정에서 계산하고, 쓸 수 없으면 null */
export interface FeedbackScores {
  content: number
  structure: number
  delivery: number | null
  nonverbal: number | null
}

export interface AnswerFeedback {
  /** 사실상 말하지 않은 답변 (AI 를 부르지 않고 고정 문구) */
  noSpeech: boolean
  scores: FeedbackScores
  summary: string
  strengths: string[]
  improvements: { point: string; suggestion: string }[]
  speechComment: string
  nonverbalComment: string | null
  /** 개선 답변 예시 */
  betterAnswer: string
  /** AI 에 넘긴 판정 문장 */
  judgements: { speech: string[]; nonverbal: string[] | null }
  /** 총점에 쓴 영역별 가중치 */
  weights: Record<string, number>
}

/** 집계 지표 하나 (종합 리포트의 지표 카드) */
export interface ReportMetric {
  name: string
  value: number | null
  verdict: Verdict
  reference: string
}

export interface InterviewReport {
  overallScore: number
  summary: string
  categoryScores: FeedbackScores
  topStrengths: string[]
  topImprovements: { point: string; suggestion: string; evidenceSeqs: number[] }[]
  practicePlan: string[]
  speechSummary: string
  nonverbalSummary: string | null
  aggregates: {
    speech: Record<string, ReportMetric>
    nonverbal: Record<string, ReportMetric> | null
    silenceCount: number
    silenceSeconds: number
  }
  answeredCount: number
  questionCount: number
  generatedAt: string
}

export interface AnswerResponse {
  id: number
  questionId: number
  /** 인식된 텍스트. 말이 없으면 빈 문자열 */
  transcript: string
  audioSeconds: number
  timedOut: boolean
  speech: SpeechResult | null
  nonverbal: NonverbalResult | null
  feedback: AnswerFeedback | null
  /** 피드백은 답변을 올린 직후 만듭니다. FAILED 면 면접을 마무리할 때 다시 만듭니다. */
  feedbackStatus: FeedbackStatus
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
  report: InterviewReport | null
}

export interface InterviewListResponse {
  items: InterviewSummary[]
  total: number
}

/** 대시보드 통계: 점수가 있는 끝난 면접만 셉니다. recent 는 최근 10개를 오래된 것부터 */
export interface InterviewStats {
  completedCount: number
  averageScore: number | null
  recent: { id: number; title: string; score: number; completedAt: string }[]
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

export interface InterviewStartRequest {
  /** 안내(영상 미전송, 음성 인식 서비스 전송 등)에 동의했는지. true 여야 시작할 수 있습니다. */
  consent: boolean
  /** 동의한 안내 문구의 버전 (GET /api/interviews/config 의 consentVersion) */
  consentVersion: string
  /** 표정·자세 분석을 쓰는지. false 면 기준 자세는 저장하지 않습니다. */
  nonverbalEnabled: boolean
  baseline?: Baseline | null
}

export interface SubmitAnswerInput {
  /** 녹음한 오디오 (webm, ogg, mp4, wav). 영상이 섞이지 않은 오디오만 보냅니다. */
  audio: Blob
  /** 브라우저가 잰 녹음 시간(ms) */
  durationMs: number
  /** 분석을 쓴 경우의 요약 지표. 분석을 끈 경우에는 생략 */
  nonverbal?: NonverbalMetrics | null
}

// 서버는 파일 머리 바이트로 형식을 판별하지만, 이름도 형식에 맞게 붙입니다.
function audioFileName(mimeType: string): string {
  if (mimeType.includes('ogg')) return 'answer.ogg'
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'answer.mp4'
  if (mimeType.includes('wav')) return 'answer.wav'
  return 'answer.webm'
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
  stats: () => api<InterviewStats>('/api/interviews/stats'),
  /** 같은 질문으로 다시 하기: 질문을 복사한 새 면접(READY)을 만듭니다. AI 를 부르지 않아 바로 끝납니다. */
  retry: (id: number | string) => api<InterviewDetail>(`/api/interviews/${id}/retry`, { method: 'POST' }),
  /** 안내 동의를 기록하고 면접을 시작합니다(IN_PROGRESS). 진행 중인 면접에 다시 부르면 기준 자세만 새로 기록합니다. 끝난 면접은 409. */
  start: (id: number | string, body: InterviewStartRequest) =>
    api<InterviewDetail>(`/api/interviews/${id}/start`, { method: 'POST', body: JSON.stringify(body) }),
  /** 모든 질문에 답변이 있으면 면접을 끝냅니다(COMPLETED). 이미 끝났으면 그대로 돌려줍니다. */
  finish: (id: number | string) => api<InterviewDetail>(`/api/interviews/${id}/finish`, { method: 'POST' }),
  /**
   * 답변 녹음을 올립니다. 서버가 음성을 텍스트로 바꾸고 말하기 지표를 계산해 돌려줍니다 (수 초~수십 초 걸릴 수 있음).
   * 같은 질문에 다시 보내면 이전 답변을 덮어씁니다. 오디오는 서버에 저장되지 않습니다.
   */
  submitAnswer: (interviewId: number | string, questionId: number | string, { audio, durationMs, nonverbal }: SubmitAnswerInput) => {
    const form = new FormData()
    form.append('audio', audio, audioFileName(audio.type))
    form.append('durationMs', String(Math.round(durationMs)))
    if (nonverbal) form.append('nonverbal', JSON.stringify(nonverbal))
    return api<AnswerResponse>(`/api/interviews/${interviewId}/questions/${questionId}/answer`, { method: 'POST', body: form })
  },
}
