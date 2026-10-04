import { MAX_CONSECUTIVE_FAILURES, MAX_KEPT_SAMPLES, SAMPLE_INTERVAL_MS } from './config.ts'
import { buildFrameSample, type Landmark } from './features.ts'
import { loadLandmarkers, type Landmarkers } from './landmarkers.ts'
import type { FrameSample } from './types.ts'

/** 프레임 하나의 분석 결과. 화면에 점을 그릴 때 쓰도록 원본 랜드마크도 함께 줍니다. */
export interface FrameDetection {
  sample: FrameSample
  faceLandmarks: Landmark[] | null
  poseLandmarks: Landmark[] | null
  /** 이 프레임을 분석하는 데 걸린 시간(ms) */
  detectMs: number
}

export interface AnalyzerStartOptions {
  /** 프레임마다 부릅니다 (초당 약 10회). 오래 걸리는 일은 하지 마세요. */
  onFrame?: (detection: FrameDetection) => void
  /** 분석이 계속 실패해서 멈췄을 때. 화면은 그대로 동작하고 분석만 꺼집니다. */
  onError?: (error: Error) => void
  intervalMs?: number
}

/**
 * 카메라 영상(<video>)을 초당 약 10회 분석해 프레임별 값(FrameSample)을 모읍니다.
 *
 * - start() ~ stop() 사이의 프레임이 쌓이고, stop() 이 그 목록을 돌려줍니다. 요약 지표는 summarize.ts 의 순수 함수가 만듭니다.
 * - 모델은 loadLandmarkers() 가 한 번만 만들어 재사용합니다. 분석 한 번이 실패해도 그 프레임만 건너뛰고, 연달아 많이 실패하면 분석만 멈춥니다.
 * - 영상 프레임은 이 브라우저 안에서만 쓰이고 어디에도 저장·전송하지 않습니다.
 */
export class NonverbalAnalyzer {
  private samples: FrameSample[] = []
  private dropped = 0
  private running = false
  private token = 0
  private timer = 0
  private startedAt = 0
  private lastTimestamp = 0
  private failures = 0
  private landmarkers: Landmarkers | null = null

  get isRunning(): boolean {
    return this.running
  }

  /** start() 이후 지금까지 분석한 프레임 수 (오래된 프레임을 버렸어도 줄어들지 않음). samplesSince() 의 기준 번호로 씁니다. */
  get sampleCount(): number {
    return this.dropped + this.samples.length
  }

  /** `index` 번째 프레임부터 지금까지의 프레임. `index` 는 이전에 읽은 sampleCount 입니다. */
  samplesSince(index: number): FrameSample[] {
    return this.samples.slice(Math.max(0, index - this.dropped))
  }

  /** 모델을 불러오고(처음 한 번) 분석을 시작합니다. 모델을 쓸 수 없으면 AnalyzerUnavailableError 로 reject 합니다. */
  async start(video: HTMLVideoElement, options: AnalyzerStartOptions = {}): Promise<void> {
    this.stopLoop()
    const token = ++this.token
    this.samples = []
    this.dropped = 0
    this.failures = 0

    const landmarkers = await loadLandmarkers()
    if (token !== this.token) return // 기다리는 사이 stop() 되었거나 다시 start() 되었음
    this.landmarkers = landmarkers

    const intervalMs = options.intervalMs ?? SAMPLE_INTERVAL_MS
    this.running = true
    this.startedAt = performance.now()

    const tick = () => {
      if (!this.running || token !== this.token) return
      const began = performance.now()
      try {
        const detection = this.detect(video, began)
        if (detection) {
          this.push(detection.sample)
          options.onFrame?.(detection)
        }
        this.failures = 0
      } catch (err) {
        this.failures++
        if (this.failures >= MAX_CONSECUTIVE_FAILURES) {
          this.running = false
          options.onError?.(err instanceof Error ? err : new Error(String(err)))
          return
        }
      }
      const elapsed = performance.now() - began
      this.timer = window.setTimeout(tick, Math.max(0, intervalMs - elapsed))
    }
    tick()
  }

  /** 분석을 멈추고 start() 이후 모은 프레임 목록을 돌려줍니다. */
  stop(): FrameSample[] {
    this.token++
    this.stopLoop()
    return [...this.samples]
  }

  private stopLoop(): void {
    this.running = false
    window.clearTimeout(this.timer)
  }

  private push(sample: FrameSample): void {
    this.samples.push(sample)
    if (this.samples.length > MAX_KEPT_SAMPLES) {
      this.samples.shift()
      this.dropped++
    }
  }

  private detect(video: HTMLVideoElement, now: number): FrameDetection | null {
    const landmarkers = this.landmarkers
    // 영상이 아직 준비되지 않았거나 멈춰 있으면 이번 프레임은 건너뜁니다 (실패로 세지 않음).
    if (!landmarkers || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0 || video.paused) return null

    // detectForVideo 의 시각은 항상 늘어나야 합니다.
    const timestamp = Math.max(Math.round(now), this.lastTimestamp + 1)
    this.lastTimestamp = timestamp

    const faceResult = landmarkers.face.detectForVideo(video, timestamp)
    const poseResult = landmarkers.pose.detectForVideo(video, timestamp)

    const faceLandmarks = faceResult.faceLandmarks[0] ?? null
    const poseLandmarks = poseResult.landmarks[0] ?? null
    const sample = buildFrameSample({
      t: Math.round(now - this.startedAt),
      aspect: video.videoWidth / video.videoHeight,
      face: faceLandmarks
        ? {
            matrix: faceResult.facialTransformationMatrixes[0]?.data ?? null,
            blendshapes: faceResult.faceBlendshapes[0]?.categories ?? null,
          }
        : null,
      pose: poseLandmarks,
    })
    return { sample, faceLandmarks, poseLandmarks, detectMs: performance.now() - now }
  }
}
