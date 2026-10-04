import { useEffect, useRef, type ReactNode } from 'react'
import type { VideoSettings } from '../../features/interview/useMediaStream.ts'
import { cn } from '../../lib/cn.ts'
import Badge from '../ui/Badge.tsx'
import Icon from '../ui/Icon.tsx'

interface Props {
  stream: MediaStream | null
  /** 카메라를 여는 중 */
  loading?: boolean
  settings?: VideoSettings | null
  /** 거울처럼 좌우 반전해서 보여 줍니다 (화면 표시만. 분석에는 원본 영상을 씁니다) */
  mirrored?: boolean
  /** 영상 위에 겹쳐 놓을 내용 */
  children?: ReactNode
  className?: string
}

export default function CameraPreview({ stream, loading, settings, mirrored = true, children, className }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.srcObject = stream
    if (stream) void video.play().catch(() => {})
  }, [stream])

  return (
    <div className={cn('relative aspect-video w-full overflow-hidden rounded-card bg-inverse text-inverse-foreground shadow-card', className)}>
      {/* muted: 내 목소리가 스피커로 다시 나오지 않게 합니다. */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        aria-label="카메라 미리보기"
        className={cn('size-full object-cover', mirrored && '-scale-x-100', !stream && 'invisible')}
      />
      {!stream && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-inverse-foreground/70">
          <Icon name={loading ? 'progress_activity' : 'videocam_off'} size={40} className={loading ? 'animate-spin' : undefined} />
          <span className="text-sm">{loading ? '카메라를 여는 중...' : '카메라 화면이 여기에 표시됩니다'}</span>
        </div>
      )}
      {stream && (
        <div className="absolute left-4 top-4 flex items-center gap-2">
          <Badge className="bg-inverse/80 text-inverse-foreground">
            <span className="size-2 animate-pulse rounded-full bg-destructive" aria-hidden="true" />
            미리보기
          </Badge>
          {settings && (
            <Badge className="bg-inverse/80 font-mono text-inverse-foreground">
              {settings.width}×{settings.height}
              {settings.frameRate ? ` · ${Math.round(settings.frameRate)}fps` : ''}
            </Badge>
          )}
        </div>
      )}
      {children}
    </div>
  )
}
