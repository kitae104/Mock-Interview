import { useCallback, useEffect, useRef, useState } from 'react'
import { classifyMediaError, describeMediaFailure, type MediaFailure, type MediaFailureTarget } from './mediaFailure.ts'

export type MediaStatus = 'idle' | 'requesting' | 'ready' | 'error'

export interface VideoSettings {
  width: number
  height: number
  frameRate: number | null
}

interface Options {
  /** 처음에 쓸 장치 id (이전 점검에서 고른 값). 없거나 연결이 끊겼으면 기본 장치를 씁니다. */
  initialCameraId?: string
  initialMicrophoneId?: string
}

interface DeviceIds {
  cameraId?: string
  microphoneId?: string
}

/**
 * 카메라(1280x720 정도)와 마이크 스트림을 열고 관리하는 훅.
 *
 * - 마운트되면 바로 권한을 요청하고, 화면을 떠나면(언마운트) 모든 트랙을 stop 합니다.
 * - 실패하면 원인(권한 거부, 장치 없음, 다른 앱이 사용 중, 보안 연결 아님 등)을 나눠 `failure` 에 한국어 안내를 담습니다.
 * - 장치를 고르면(selectCamera / selectMicrophone) 스트림을 다시 엽니다. 장치를 꽂거나 뽑으면 목록이 갱신됩니다.
 */
export function useMediaStream({ initialCameraId, initialMicrophoneId }: Options = {}) {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [status, setStatus] = useState<MediaStatus>('idle')
  const [failure, setFailure] = useState<MediaFailure | null>(null)
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([])
  const [cameraId, setCameraId] = useState<string | undefined>(initialCameraId)
  const [microphoneId, setMicrophoneId] = useState<string | undefined>(initialMicrophoneId)
  const [videoSettings, setVideoSettings] = useState<VideoSettings | null>(null)

  const streamRef = useRef<MediaStream | null>(null)
  const requestRef = useRef(0) // 요청마다 올려서, 늦게 도착한 이전 요청의 결과를 버립니다.
  const idsRef = useRef<DeviceIds>({ cameraId: initialCameraId, microphoneId: initialMicrophoneId })

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setStream(null)
    setVideoSettings(null)
  }, [])

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return
    const devices = await navigator.mediaDevices.enumerateDevices()
    setCameras(devices.filter((d) => d.kind === 'videoinput'))
    setMicrophones(devices.filter((d) => d.kind === 'audioinput'))
    return devices
  }, [])

  // 장치를 하나도 못 찾았을 때, 카메라/마이크 중 무엇이 없는지 알려 줍니다.
  const findMissingTarget = useCallback(async (): Promise<MediaFailureTarget> => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const hasCamera = devices.some((d) => d.kind === 'videoinput')
      const hasMic = devices.some((d) => d.kind === 'audioinput')
      if (!hasCamera && !hasMic) return 'both'
      if (!hasCamera) return 'camera'
      if (!hasMic) return 'microphone'
    } catch {
      // 목록을 못 읽으면 대상을 특정하지 않습니다.
    }
    return null
  }, [])

  const start = useCallback(
    async (ids: DeviceIds = idsRef.current) => {
      const requestId = ++requestRef.current
      idsRef.current = ids
      stopStream()
      setStatus('requesting')
      setFailure(null)

      if (!navigator.mediaDevices?.getUserMedia) {
        setFailure(describeMediaFailure(window.isSecureContext ? 'unsupported' : 'insecure'))
        setStatus('error')
        return
      }

      const constraints = (useIds: boolean): MediaStreamConstraints => ({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          ...(useIds && ids.cameraId ? { deviceId: { exact: ids.cameraId } } : {}),
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: { ideal: 1 },
          ...(useIds && ids.microphoneId ? { deviceId: { exact: ids.microphoneId } } : {}),
        },
      })

      let media: MediaStream
      try {
        try {
          media = await navigator.mediaDevices.getUserMedia(constraints(true))
        } catch (err) {
          // 이전에 고른 장치가 없어졌다면(뽑힘 등) 기본 장치로 한 번 더 시도합니다.
          const retriable = err instanceof DOMException && (err.name === 'OverconstrainedError' || err.name === 'NotFoundError')
          if (retriable && (ids.cameraId || ids.microphoneId)) {
            media = await navigator.mediaDevices.getUserMedia(constraints(false))
          } else {
            throw err
          }
        }
      } catch (err) {
        if (requestId !== requestRef.current) return
        const kind = classifyMediaError(err)
        const target = kind === 'no-device' ? await findMissingTarget() : null
        if (requestId !== requestRef.current) return
        setFailure(describeMediaFailure(kind, target, err))
        setStatus('error')
        void refreshDevices().catch(() => {})
        return
      }

      if (requestId !== requestRef.current) {
        // 기다리는 사이 화면을 떠났거나 새 요청이 시작됨: 방금 연 장치를 바로 닫습니다.
        media.getTracks().forEach((t) => t.stop())
        return
      }

      streamRef.current = media
      media.getTracks().forEach((track) =>
        // 사용 중에 장치가 뽑히면 트랙이 끝납니다. (우리가 stop() 한 경우에는 이 이벤트가 오지 않습니다.)
        track.addEventListener('ended', () => {
          if (streamRef.current !== media) return
          setFailure(
            describeMediaFailure('no-device', track.kind === 'video' ? 'camera' : 'microphone'),
          )
          setStatus('error')
        }),
      )
      const videoTrack = media.getVideoTracks()[0]
      const audioTrack = media.getAudioTracks()[0]
      const settings = videoTrack?.getSettings()
      setVideoSettings(
        settings?.width && settings.height
          ? { width: settings.width, height: settings.height, frameRate: settings.frameRate ?? null }
          : null,
      )
      setCameraId(videoTrack?.getSettings().deviceId ?? ids.cameraId)
      setMicrophoneId(audioTrack?.getSettings().deviceId ?? ids.microphoneId)
      idsRef.current = {
        cameraId: videoTrack?.getSettings().deviceId ?? ids.cameraId,
        microphoneId: audioTrack?.getSettings().deviceId ?? ids.microphoneId,
      }
      setStream(media)
      setStatus('ready')
      // 권한을 받은 뒤에야 장치 이름(label)이 채워집니다.
      void refreshDevices().catch(() => {})
    },
    [findMissingTarget, refreshDevices, stopStream],
  )

  // 진행 중인 요청을 무효로 하고 열려 있는 트랙을 모두 닫습니다.
  const release = useCallback(() => {
    requestRef.current++
    stopStream()
  }, [stopStream])

  // 화면에 들어오면 시작하고, 떠나면 모든 트랙을 닫습니다. (start 는 처음 한 번만 부릅니다.)
  useEffect(() => {
    void start()
    return release
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트·언마운트 때만 실행
  }, [])

  // 장치를 꽂거나 뽑으면 목록을 갱신합니다.
  useEffect(() => {
    const devices = navigator.mediaDevices
    if (!devices?.addEventListener) return
    const onChange = () => void refreshDevices().catch(() => {})
    devices.addEventListener('devicechange', onChange)
    return () => devices.removeEventListener('devicechange', onChange)
  }, [refreshDevices])

  const selectCamera = useCallback((id: string) => start({ ...idsRef.current, cameraId: id }), [start])
  const selectMicrophone = useCallback((id: string) => start({ ...idsRef.current, microphoneId: id }), [start])
  /** 같은 장치로 다시 시도 (권한을 바꾼 뒤, 장치를 연결한 뒤 등) */
  const retry = useCallback(() => start(idsRef.current), [start])

  return {
    stream,
    status,
    failure,
    cameras,
    microphones,
    cameraId,
    microphoneId,
    videoSettings,
    selectCamera,
    selectMicrophone,
    retry,
  }
}
