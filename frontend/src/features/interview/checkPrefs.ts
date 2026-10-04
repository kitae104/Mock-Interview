// 점검 화면에서 고른 값과 잰 값을 면접 진행 화면(⑤)이 이어 받도록 이 탭의 sessionStorage 에 잠깐 둡니다.
// 저장소를 못 쓰는 환경(사생활 보호 모드 등)에서도 화면은 동작해야 하므로 모든 접근을 try/catch 로 감쌉니다.

import type { Baseline } from './analyzer/types.ts'

export interface CheckPrefs {
  cameraId?: string
  microphoneId?: string
  /** 'off' 면 질문을 소리로 읽지 않고 화면 텍스트로만 진행 */
  speech: 'on' | 'off'
  /**
   * 'on': 표정·자세 분석을 쓴다 (baseline 을 함께 씀).
   * 'off': 분석 없이 진행한다 (모델을 내려받지 못했거나 분석을 쓸 수 없을 때). 진행 화면은 비언어 지표를 보내지 않습니다.
   */
  analysis: 'on' | 'off'
  /** 점검 화면에서 잰 기준 자세. analysis 가 'on' 일 때만 있습니다. */
  baseline?: Baseline
}

const key = (interviewId: string | number) => `interview:${interviewId}:check`

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const numOrNull = (v: unknown): v is number | null => v === null || num(v)

function isBaseline(v: unknown): v is Baseline {
  if (typeof v !== 'object' || v === null) return false
  const b = v as Record<string, unknown>
  return (
    num(b.yawDeg) &&
    num(b.pitchDeg) &&
    num(b.eyeH) &&
    num(b.eyeV) &&
    num(b.smile) &&
    typeof b.poseAvailable === 'boolean' &&
    numOrNull(b.shoulderTiltDeg) &&
    numOrNull(b.shoulderWidth) &&
    numOrNull(b.shoulderMidY) &&
    numOrNull(b.neckRatio)
  )
}

export function loadCheckPrefs(interviewId: string | number): CheckPrefs | null {
  try {
    const raw = sessionStorage.getItem(key(interviewId))
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<CheckPrefs>
    const baseline = isBaseline(value.baseline) ? value.baseline : undefined
    return {
      cameraId: typeof value.cameraId === 'string' ? value.cameraId : undefined,
      microphoneId: typeof value.microphoneId === 'string' ? value.microphoneId : undefined,
      speech: value.speech === 'off' ? 'off' : 'on',
      // 기준 자세가 없으면 분석을 쓸 수 없으므로 'off' 로 봅니다.
      analysis: value.analysis === 'on' && baseline ? 'on' : 'off',
      baseline,
    }
  } catch {
    return null
  }
}

export function saveCheckPrefs(interviewId: string | number, prefs: CheckPrefs): void {
  try {
    sessionStorage.setItem(key(interviewId), JSON.stringify(prefs))
  } catch {
    // 저장하지 못해도 면접 진행에는 영향이 없습니다 (기본 장치를 쓰고 분석 없이 진행합니다).
  }
}
