import { useEffect, useState } from 'react'
import { isSpeechSupported, loadVoices, pickKoreanVoice } from './speech.ts'

export interface KoreanVoiceState {
  /** 브라우저가 음성 읽기(speechSynthesis)를 지원하는지 */
  supported: boolean
  /** 음성 목록을 읽는 중 */
  loading: boolean
  /** 쓸 한국어 음성. 없으면 null */
  voice: SpeechSynthesisVoice | null
}

/** 한국어 음성을 찾아 줍니다. 목록이 늦게 채워지는 브라우저도 기다립니다. */
export function useKoreanVoice(): KoreanVoiceState {
  const supported = isSpeechSupported()
  const [state, setState] = useState<{ loading: boolean; voice: SpeechSynthesisVoice | null }>({
    loading: supported,
    voice: null,
  })

  useEffect(() => {
    if (!supported) return
    let cancelled = false
    const update = (voices: SpeechSynthesisVoice[]) => !cancelled && setState({ loading: false, voice: pickKoreanVoice(voices) })
    void loadVoices().then(update)
    // 목록이 나중에 더 채워지는 경우(온라인 음성 등)를 위해 계속 지켜봅니다.
    const onChange = () => update(window.speechSynthesis.getVoices())
    window.speechSynthesis.addEventListener('voiceschanged', onChange)
    return () => {
      cancelled = true
      window.speechSynthesis.removeEventListener('voiceschanged', onChange)
    }
  }, [supported])

  return { supported, ...state }
}
