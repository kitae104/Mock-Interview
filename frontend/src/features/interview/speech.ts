// 브라우저 speechSynthesis 로 질문을 소리 내어 읽습니다 (docs/PLAN.md 8장 ②, ⑤).
// 점검 화면의 테스트 재생과 면접 진행 화면의 질문 읽기가 같은 함수를 씁니다.

export type SpeakResult = 'ended' | 'cancelled'

export interface SpeakOptions {
  voice?: SpeechSynthesisVoice | null
  /** 0.1~10, 기본 1 */
  rate?: number
  /** 0~1, 기본 1 */
  volume?: number
  /** abort() 하면 읽기를 멈추고 'cancelled' 로 끝냅니다. */
  signal?: AbortSignal
}

/** 이 길이를 넘는 문장은 나눠서 읽습니다. 긴 문장은 일부 브라우저(Chrome)가 도중에 멈춥니다. */
const MAX_CHUNK_CHARS = 120

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window
}

/** 음성 목록을 읽습니다. 브라우저가 목록을 늦게 채우므로 `voiceschanged` 를 기다립니다 (최대 2초). */
export function loadVoices(timeoutMs = 2000): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (!isSpeechSupported()) return resolve([])
    const synth = window.speechSynthesis
    if (synth.getVoices().length > 0) return resolve(synth.getVoices())

    let timer = 0
    const finish = () => {
      synth.removeEventListener('voiceschanged', onChange)
      window.clearTimeout(timer)
      resolve(synth.getVoices())
    }
    const onChange = () => {
      if (synth.getVoices().length > 0) finish()
    }
    synth.addEventListener('voiceschanged', onChange)
    timer = window.setTimeout(finish, timeoutMs)
  })
}

/** 한국어(ko-KR, Android 는 ko_KR) 음성 중 가장 좋아 보이는 것을 고릅니다. 없으면 null. */
export function pickKoreanVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const korean = voices.filter((v) => /^ko([-_]|$)/i.test(v.lang))
  if (korean.length === 0) return null
  const score = (v: SpeechSynthesisVoice) => {
    let s = 0
    if (/natural|online/i.test(v.name)) s += 3 // Edge 의 신경망 음성
    if (/google/i.test(v.name)) s += 2
    if (/microsoft|yuna|sora|heami|sunhi|injoon/i.test(v.name)) s += 1
    if (/^ko[-_]KR$/i.test(v.lang)) s += 1
    if (v.default) s += 1
    return s
  }
  return [...korean].sort((a, b) => score(b) - score(a))[0]
}

// 읽는 도중 Utterance 가 가비지 컬렉션되면 일부 브라우저에서 end 이벤트가 오지 않아 참조를 붙들어 둡니다.
const keepAlive = new Set<SpeechSynthesisUtterance>()

function splitIntoChunks(text: string): string[] {
  const sentences = text.match(/[^.!?。！？\n]+[.!?。！？]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [text.trim()]
  const chunks: string[] = []
  for (const sentence of sentences) {
    let rest = sentence
    while (rest.length > MAX_CHUNK_CHARS) {
      const cut = rest.lastIndexOf(' ', MAX_CHUNK_CHARS)
      const at = cut > 20 ? cut : MAX_CHUNK_CHARS
      chunks.push(rest.slice(0, at).trim())
      rest = rest.slice(at).trim()
    }
    if (rest) chunks.push(rest)
  }
  return chunks.filter(Boolean)
}

/**
 * 문장을 소리 내어 읽고, 다 읽으면 resolve 합니다 ('ended').
 * 취소하면 'cancelled' 로 resolve, 브라우저 오류나 재생이 시작되지 않으면 reject 합니다.
 */
export function speak(text: string, { voice, rate = 1, volume = 1, signal }: SpeakOptions = {}): Promise<SpeakResult> {
  if (!isSpeechSupported()) return Promise.reject(new Error('이 브라우저는 음성 읽기를 지원하지 않습니다.'))
  const chunks = splitIntoChunks(text)
  if (chunks.length === 0) return Promise.resolve('ended')
  if (signal?.aborted) return Promise.resolve('cancelled')

  const synth = window.speechSynthesis
  return new Promise<SpeakResult>((resolve, reject) => {
    let index = 0
    let settled = false
    let watchdog = 0

    const settle = (fn: () => void) => {
      if (settled) return
      settled = true
      window.clearTimeout(watchdog)
      signal?.removeEventListener('abort', onAbort)
      keepAlive.clear()
      fn()
    }
    const onAbort = () => {
      synth.cancel()
      settle(() => resolve('cancelled'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })

    const readNext = () => {
      if (settled) return
      if (index >= chunks.length) return settle(() => resolve('ended'))
      const chunk = chunks[index++]
      const utterance = new SpeechSynthesisUtterance(chunk)
      utterance.lang = voice?.lang || 'ko-KR'
      if (voice) utterance.voice = voice
      utterance.rate = rate
      utterance.volume = volume
      utterance.onend = () => {
        window.clearTimeout(watchdog)
        readNext()
      }
      utterance.onerror = (event) => {
        if (event.error === 'canceled' || event.error === 'interrupted') return settle(() => resolve('cancelled'))
        settle(() => reject(new Error(`음성 읽기 오류(${event.error})`)))
      }
      keepAlive.add(utterance)
      // 소리 장치가 없거나 음성 엔진이 멈추면 end 가 영영 오지 않으므로, 글자 수에 비례한 제한 시간을 둡니다.
      window.clearTimeout(watchdog)
      watchdog = window.setTimeout(() => {
        synth.cancel()
        settle(() => reject(new Error('음성이 재생되지 않았습니다.')))
      }, chunk.length * 400 + 8000)
      synth.speak(utterance)
    }

    synth.cancel() // 이전에 읽던 것이 남아 있으면 비웁니다.
    readNext()
  })
}

/** 읽고 있는 것을 모두 멈춥니다. 읽던 speak() 는 'cancelled' 로 끝납니다. */
export function cancelSpeech(): void {
  if (isSpeechSupported()) window.speechSynthesis.cancel()
}

export interface VoiceInstallGuide {
  os: string
  steps: string[]
}

/** 한국어 음성이 없을 때 보여 줄 운영체제별 설치 방법. */
export function getVoiceInstallGuide(userAgent: string = navigator.userAgent): VoiceInstallGuide {
  if (/iPhone|iPad|iPod/i.test(userAgent)) {
    return {
      os: 'iPhone / iPad',
      steps: ['설정 → 손쉬운 사용 → 말하기 콘텐츠 → 음성 → 한국어에서 목소리(예: 유나)를 내려받으세요.', '내려받은 뒤 Safari 를 다시 열어 주세요.'],
    }
  }
  if (/Android/i.test(userAgent)) {
    return {
      os: 'Android',
      steps: [
        '설정 → 일반(또는 시스템) → 언어 및 입력 → 텍스트 음성 변환 출력을 여세요.',
        '선호하는 엔진을 "Google 음성 인식 및 합성"으로 정하고, 설정(톱니바퀴) → 음성 데이터 설치 → 한국어를 내려받으세요.',
        'Chrome 을 다시 열어 주세요.',
      ],
    }
  }
  if (/Mac OS X|Macintosh/i.test(userAgent)) {
    return {
      os: 'macOS',
      steps: [
        '시스템 설정 → 손쉬운 사용 → 말하기 콘텐츠 → 시스템 음성의 "관리…"를 여세요.',
        '한국어 항목에서 목소리(예: 유나)를 내려받으세요.',
        '브라우저를 완전히 종료했다가 다시 열어 주세요.',
      ],
    }
  }
  if (/Windows/i.test(userAgent)) {
    return {
      os: 'Windows',
      steps: [
        '설정 → 시간 및 언어 → 언어 및 지역에서 "한국어"가 있는지 확인하고, 없으면 추가하세요.',
        '한국어 옆 "…" → 언어 옵션 → "음성" 항목이 설치되어 있는지 확인하고, 없으면 설치하세요. (설정 → 접근성 → 내레이터 → 음성 추가에서 한국어를 추가할 수도 있습니다.)',
        'Microsoft Edge 는 온라인 한국어 음성을 기본 제공하므로, Edge 로 열어 보는 것도 방법입니다.',
        '브라우저를 완전히 종료했다가 다시 열어 주세요.',
      ],
    }
  }
  return {
    os: 'Linux / 기타',
    steps: [
      '운영체제의 음성 합성(speech-dispatcher 등)과 한국어 음성 패키지를 설치하세요.',
      '데스크톱 Chrome 은 인터넷에 연결되어 있으면 "Google 한국의" 음성을 제공하기도 합니다. 연결을 확인해 주세요.',
      '설치한 뒤 브라우저를 완전히 종료했다가 다시 열어 주세요.',
    ],
  }
}
