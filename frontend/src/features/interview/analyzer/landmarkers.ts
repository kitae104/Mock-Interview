import type { FaceLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision'
import { FACE_LANDMARKER_MODEL_URL, MODEL_LOAD_TIMEOUT_MS, POSE_LANDMARKER_MODEL_URL, WASM_BASE_URL } from './config.ts'

export interface Landmarkers {
  face: FaceLandmarker
  pose: PoseLandmarker
  delegate: 'GPU' | 'CPU'
}

export type AnalyzerUnavailableReason = 'unsupported' | 'load-failed' | 'timeout'

/** 분석 모델을 쓸 수 없을 때(브라우저 미지원, 네트워크 차단, 시간 초과). 면접은 분석 없이 진행할 수 있습니다. */
export class AnalyzerUnavailableError extends Error {
  readonly reason: AnalyzerUnavailableReason

  constructor(reason: AnalyzerUnavailableReason, cause?: unknown) {
    super(`비언어 분석을 쓸 수 없습니다 (${reason})`, { cause })
    this.name = 'AnalyzerUnavailableError'
    this.reason = reason
  }
}

/** 사용자에게 보여 줄 원인 설명 */
export function describeAnalyzerError(err: unknown): string {
  const reason = err instanceof AnalyzerUnavailableError ? err.reason : 'load-failed'
  switch (reason) {
    case 'unsupported':
      return '이 브라우저에서는 표정·자세 분석을 쓸 수 없어요. 데스크톱 Chrome 또는 Edge 최신 버전을 권장합니다.'
    case 'timeout':
      return '분석 모델을 내려받는 데 너무 오래 걸렸어요. 인터넷 연결이 느리거나 일부가 막혀 있을 수 있어요.'
    default:
      return '분석 모델을 내려받지 못했어요. 인터넷 연결을 확인하거나, 회사·학교 네트워크라면 cdn.jsdelivr.net 과 storage.googleapis.com 접속이 막혀 있는지 확인해 주세요.'
  }
}

function supportsWebAssembly(): boolean {
  return typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function'
}

function supportsWebGl2(): boolean {
  try {
    return document.createElement('canvas').getContext('webgl2') !== null
  } catch {
    return false
  }
}

async function create(): Promise<Landmarkers> {
  if (!supportsWebAssembly()) throw new AnalyzerUnavailableError('unsupported')

  // 라이브러리는 분석을 처음 쓸 때만 내려받아, 분석을 쓰지 않는 화면의 첫 로딩이 느려지지 않게 합니다.
  const { FaceLandmarker, FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision')
  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE_URL)
  // GPU 를 먼저 시도하고 안 되면 CPU 로 한 번 더 만듭니다.
  const delegates: ('GPU' | 'CPU')[] = supportsWebGl2() ? ['GPU', 'CPU'] : ['CPU']
  let lastError: unknown
  for (const delegate of delegates) {
    let face: FaceLandmarker | null = null
    try {
      face = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: FACE_LANDMARKER_MODEL_URL, delegate },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
      })
      const pose = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: POSE_LANDMARKER_MODEL_URL, delegate },
        runningMode: 'VIDEO',
        numPoses: 1,
      })
      return { face, pose, delegate }
    } catch (err) {
      lastError = err
      face?.close()
    }
  }
  throw new AnalyzerUnavailableError('load-failed', lastError)
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new AnalyzerUnavailableError('timeout')), ms)
    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        window.clearTimeout(timer)
        reject(err)
      },
    )
  })
}

let cached: Promise<Landmarkers> | null = null

/**
 * 얼굴·포즈 모델을 한 번만 만들어 모든 화면이 재사용합니다 (모델을 만드는 데 수 초가 걸리고 메모리를 쓰기 때문).
 * 실패하면 캐시를 비워서 다음에 다시 시도할 수 있게 합니다.
 */
export function loadLandmarkers(): Promise<Landmarkers> {
  if (!cached) {
    const attempt = withTimeout(create(), MODEL_LOAD_TIMEOUT_MS).catch((err: unknown) => {
      cached = null
      throw err instanceof AnalyzerUnavailableError ? err : new AnalyzerUnavailableError('load-failed', err)
    })
    cached = attempt
  }
  return cached
}
