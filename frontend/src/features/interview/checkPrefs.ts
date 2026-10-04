// 점검 화면에서 고른 값을 면접 진행 화면(⑤)이 이어 받도록 이 탭의 sessionStorage 에 잠깐 둡니다.
// 저장소를 못 쓰는 환경(사생활 보호 모드 등)에서도 화면은 동작해야 하므로 모든 접근을 try/catch 로 감쌉니다.

export interface CheckPrefs {
  cameraId?: string
  microphoneId?: string
  /** 'off' 면 질문을 소리로 읽지 않고 화면 텍스트로만 진행 */
  speech: 'on' | 'off'
}

const key = (interviewId: string | number) => `interview:${interviewId}:check`

export function loadCheckPrefs(interviewId: string | number): CheckPrefs | null {
  try {
    const raw = sessionStorage.getItem(key(interviewId))
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<CheckPrefs>
    return {
      cameraId: typeof value.cameraId === 'string' ? value.cameraId : undefined,
      microphoneId: typeof value.microphoneId === 'string' ? value.microphoneId : undefined,
      speech: value.speech === 'off' ? 'off' : 'on',
    }
  } catch {
    return null
  }
}

export function saveCheckPrefs(interviewId: string | number, prefs: CheckPrefs): void {
  try {
    sessionStorage.setItem(key(interviewId), JSON.stringify(prefs))
  } catch {
    // 저장하지 못해도 면접 진행에는 영향이 없습니다 (기본 장치를 씁니다).
  }
}
