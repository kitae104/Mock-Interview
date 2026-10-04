import { useEffect, useRef, useState, type RefObject } from 'react'
import { describeAnalyzerError } from './landmarkers.ts'
import { NonverbalAnalyzer, type FrameDetection } from './NonverbalAnalyzer.ts'

export type AnalyzerStatus = 'idle' | 'loading' | 'running' | 'unavailable'

interface Options {
  videoRef: RefObject<HTMLVideoElement | null>
  /** 이 스트림이 열려 있는 동안 분석합니다. 바뀌거나 null 이 되면 멈추고 다시 시작합니다. */
  stream: MediaStream | null
  enabled?: boolean
  /** 프레임마다 부릅니다 (초당 약 10회). 화면에 그릴 때 씁니다. */
  onFrame?: (detection: FrameDetection) => void
}

interface State {
  stream: MediaStream | null
  status: AnalyzerStatus
  error: string | null
  face: boolean
  shoulders: boolean
}

/**
 * <video> 에 연결된 카메라 스트림을 분석합니다. 모델을 쓸 수 없으면 status 가 'unavailable' 이 되고 error 에 한국어 안내가 담기며,
 * 화면은 그대로 동작합니다 (분석만 꺼짐). 화면을 떠나면 분석을 멈춥니다.
 */
export function useNonverbalAnalyzer({ videoRef, stream, enabled = true, onFrame }: Options) {
  const [analyzer] = useState(() => new NonverbalAnalyzer())
  const [state, setState] = useState<State>({ stream: null, status: 'idle', error: null, face: false, shoulders: false })
  const onFrameRef = useRef(onFrame)

  useEffect(() => {
    onFrameRef.current = onFrame
  }, [onFrame])

  useEffect(() => {
    const video = videoRef.current
    if (!enabled || !stream || !video) return
    let cancelled = false
    const update = (patch: Partial<State>) => !cancelled && setState((prev) => ({ ...prev, stream, ...patch }))

    analyzer
      .start(video, {
        onFrame: (detection) => {
          const face = detection.sample.faceVisible
          const shoulders = detection.sample.poseVisible
          // 값이 바뀔 때만 화면을 다시 그립니다 (초당 10번 렌더하지 않도록).
          if (!cancelled) setState((prev) => (prev.face === face && prev.shoulders === shoulders ? prev : { ...prev, face, shoulders }))
          onFrameRef.current?.(detection)
        },
        onError: () => update({ status: 'unavailable', error: '분석 중 오류가 계속 발생해 표정·자세 분석을 껐어요. 면접은 계속 진행할 수 있어요.' }),
      })
      .then(() => update({ status: 'running', error: null }))
      .catch((err: unknown) => update({ status: 'unavailable', error: describeAnalyzerError(err) }))

    return () => {
      cancelled = true
      analyzer.stop()
    }
  }, [analyzer, enabled, stream, videoRef])

  // 스트림이 바뀐 직후에는 이전 스트림의 값(상태·얼굴 검출 여부)을 쓰지 않고 '불러오는 중'으로 봅니다.
  const active = enabled && stream !== null
  const current = active && state.stream === stream ? state : null
  return {
    analyzer,
    status: (!active ? 'idle' : (current?.status ?? 'loading')) as AnalyzerStatus,
    error: current?.error ?? null,
    /** 얼굴이 보이는지 / 어깨가 보이는지 */
    presence: { face: current?.face ?? false, shoulders: current?.shoulders ?? false },
  }
}
