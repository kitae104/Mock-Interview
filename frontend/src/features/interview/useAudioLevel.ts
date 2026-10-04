import { useEffect, useRef, useState } from 'react'

/** 이 값 이상으로 올라간 적이 있으면 "소리가 감지됨"으로 봅니다 (0~1, 대략 -45dB). */
export const VOICE_DETECTED_LEVEL = 0.3
/** 이 값보다 크면 "너무 큼"으로 안내합니다 (대략 -15dB). */
export const TOO_LOUD_LEVEL = 0.9

const MIN_DB = -60 // 이 값 이하는 0
const MAX_DB = -10 // 이 값 이상은 1
const UPDATE_INTERVAL_MS = 60

const IDLE: AudioLevel = { level: 0, detected: false, suspended: false }

export interface AudioLevel {
  /** 현재 소리 크기 0~1 (부드럽게 보정됨) */
  level: number
  /** 스트림이 바뀐 뒤 `VOICE_DETECTED_LEVEL` 을 넘은 적이 있는지 */
  detected: boolean
  /** 브라우저가 오디오를 아직 막고 있음 (화면을 한 번 클릭하면 풀립니다) */
  suspended: boolean
}

/**
 * 마이크 소리 크기를 AudioContext + AnalyserNode 로 읽습니다.
 * 소리를 스피커로 내보내지 않으므로(분석만 함) 하울링이 생기지 않습니다.
 */
export function useAudioLevel(stream: MediaStream | null): AudioLevel {
  // 어느 스트림의 값인지 함께 저장해서, 스트림이 바뀌면 이전 값(감지됨 등)을 쓰지 않고 처음 상태로 돌아갑니다.
  const [state, setState] = useState<{ source: MediaStream | null; value: AudioLevel }>({ source: null, value: IDLE })
  const detectedRef = useRef(false)

  useEffect(() => {
    detectedRef.current = false
    const track = stream?.getAudioTracks()[0]
    if (!stream || !track) return

    const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return

    const context = new AudioContextClass()
    const analyser = context.createAnalyser()
    analyser.fftSize = 1024
    const source = context.createMediaStreamSource(new MediaStream([track]))
    source.connect(analyser)

    const samples = new Float32Array(analyser.fftSize)
    let smoothed = 0
    let lastUpdate = 0
    let frame = 0

    const resume = () => void context.resume().catch(() => {})
    resume()
    // 사용자 동작 없이는 막힐 수 있으니, 첫 클릭·키 입력 때 한 번 더 풀어 봅니다.
    window.addEventListener('pointerdown', resume)
    window.addEventListener('keydown', resume)

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick)
      analyser.getFloatTimeDomainData(samples)
      let sum = 0
      for (const v of samples) sum += v * v
      const rms = Math.sqrt(sum / samples.length)
      const db = rms > 0 ? 20 * Math.log10(rms) : MIN_DB
      const target = Math.min(1, Math.max(0, (db - MIN_DB) / (MAX_DB - MIN_DB)))
      // 올라갈 때는 빠르게, 내려갈 때는 천천히 따라가서 막대가 덜 떨립니다.
      smoothed += (target - smoothed) * (target > smoothed ? 0.6 : 0.15)
      if (smoothed >= VOICE_DETECTED_LEVEL) detectedRef.current = true

      if (now - lastUpdate >= UPDATE_INTERVAL_MS) {
        lastUpdate = now
        setState({
          source: stream,
          value: { level: smoothed, detected: detectedRef.current, suspended: context.state === 'suspended' },
        })
      }
    }
    frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointerdown', resume)
      window.removeEventListener('keydown', resume)
      source.disconnect()
      void context.close().catch(() => {})
    }
  }, [stream])

  return state.source === stream ? state.value : IDLE
}
