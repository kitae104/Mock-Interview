// 답변 녹음 (docs/PLAN.md 8장 ④). 오디오 트랙만 MediaRecorder 로 녹음해서 영상이 파일에 섞이지 않습니다.

/** 우선순위 순서. webm/opus(Chrome, Edge, Firefox)를 먼저 고르고, 안 되면 mp4(Safari)를 씁니다. */
const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4'] as const

export function isRecordingSupported(): boolean {
  return typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function'
}

/** 이 브라우저가 녹음할 수 있는 형식 중 가장 먼저 지원되는 것. 하나도 없으면 null */
export function pickAudioMimeType(): string | null {
  if (!isRecordingSupported()) return null
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null
}

export interface RecordingResult {
  blob: Blob
  mimeType: string
  /** 녹음을 시작해서 끝낼 때까지 걸린 시간(ms) */
  durationMs: number
  /** 최대 시간에 도달해서 자동으로 끝났는지 */
  timedOut: boolean
}

export interface RecorderStartOptions {
  /** 이 시간(초)이 되면 자동으로 끝냅니다. 없으면 stop() 할 때까지 녹음합니다. */
  maxSeconds?: number
  /** 녹음 중 0.2초마다 경과 시간(ms)을 알려 줍니다 (남은 시간 표시용). */
  onTick?: (elapsedMs: number) => void
}

/**
 * 마이크 스트림에서 오디오만 골라 녹음합니다. 카메라·마이크 트랙은 닫지 않습니다 (열고 닫는 것은 useMediaStream 의 몫).
 *
 *   const recorder = new AnswerRecorder(stream)
 *   recorder.start({ maxSeconds: 120 })
 *   const { blob, durationMs } = await recorder.stop()   // 또는 최대 시간이 되면 자동으로 끝나므로 recorder.result
 */
export class AnswerRecorder {
  private readonly mimeType: string
  private readonly audioStream: MediaStream
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private startedAt = 0
  private timedOut = false
  private timers: number[] = []
  private done: Promise<RecordingResult> | null = null

  constructor(stream: MediaStream) {
    const mimeType = pickAudioMimeType()
    if (!mimeType) throw new Error('이 브라우저는 답변 녹음을 지원하지 않아요. 데스크톱 Chrome 또는 Edge 를 이용해 주세요.')
    const tracks = stream.getAudioTracks().filter((t) => t.readyState === 'live')
    if (tracks.length === 0) throw new Error('마이크가 연결되어 있지 않아요. 마이크를 확인해 주세요.')
    this.mimeType = mimeType
    // 오디오 트랙만 담은 새 스트림: 영상은 녹음에 섞이지 않고, 서버로 가지도 않습니다.
    this.audioStream = new MediaStream(tracks)
  }

  get isRecording(): boolean {
    return this.recorder?.state === 'recording'
  }

  /** start() 이후의 결과. 최대 시간에 자동으로 끝나는 경우에도 이것으로 받을 수 있습니다. */
  get result(): Promise<RecordingResult> {
    if (!this.done) return Promise.reject(new Error('녹음을 시작하지 않았어요.'))
    return this.done
  }

  start({ maxSeconds, onTick }: RecorderStartOptions = {}): void {
    if (this.recorder) throw new Error('이미 녹음 중이에요.')
    const recorder = new MediaRecorder(this.audioStream, { mimeType: this.mimeType, audioBitsPerSecond: 64_000 })
    this.recorder = recorder
    this.chunks = []
    this.timedOut = false

    this.done = new Promise<RecordingResult>((resolve, reject) => {
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) this.chunks.push(event.data)
      }
      recorder.onerror = () => {
        this.clearTimers()
        reject(new Error('녹음 중 오류가 발생했어요. 마이크 연결을 확인하고 다시 시도해 주세요.'))
      }
      recorder.onstop = () => {
        this.clearTimers()
        const type = recorder.mimeType || this.mimeType
        resolve({
          blob: new Blob(this.chunks, { type }),
          mimeType: type,
          durationMs: performance.now() - this.startedAt,
          timedOut: this.timedOut,
        })
      }
    })
    // 아무도 결과를 기다리지 않는 경우(취소 등)에 "처리되지 않은 거부" 경고가 뜨지 않게 합니다.
    this.done.catch(() => {})

    this.startedAt = performance.now()
    recorder.start(1000) // 1초마다 조각을 받아 두면 긴 녹음도 한 번에 메모리를 쓰지 않습니다.

    if (onTick) {
      this.timers.push(window.setInterval(() => onTick(performance.now() - this.startedAt), 200))
    }
    if (maxSeconds) {
      this.timers.push(
        window.setTimeout(() => {
          this.timedOut = true
          if (recorder.state === 'recording') recorder.stop()
        }, maxSeconds * 1000),
      )
    }
  }

  /** 녹음을 끝내고 결과를 돌려줍니다. 이미 끝났다면(최대 시간 도달) 그 결과를 돌려줍니다. */
  stop(): Promise<RecordingResult> {
    if (this.recorder?.state === 'recording') this.recorder.stop()
    return this.result
  }

  /** 결과를 버리고 녹음을 멈춥니다 (화면을 떠날 때 등). */
  cancel(): void {
    this.clearTimers()
    this.chunks = []
    if (this.recorder?.state === 'recording') this.recorder.stop()
  }

  private clearTimers(): void {
    for (const id of this.timers) {
      window.clearInterval(id)
      window.clearTimeout(id)
    }
    this.timers = []
  }
}
