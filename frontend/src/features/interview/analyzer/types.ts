// 비언어 분석에서 오가는 값의 모양 (docs/PLAN.md 5장).

/** 프레임 높이를 1 로 둔 좌표. x 는 가로세로 비율로 보정해서, 각도와 거리를 그대로 계산할 수 있습니다. */
export interface Point {
  x: number
  y: number
}

/** 프레임 하나에서 읽은 값. 못 읽은 값은 null. 요약 지표를 만들기 전의 가장 작은 단위입니다. */
export interface FrameSample {
  /** 분석을 시작한 뒤 경과 시간(ms) */
  t: number

  faceVisible: boolean
  /** 머리 방향(도). 얼굴 변환 행렬에서 구함 */
  yawDeg: number | null
  pitchDeg: number | null
  rollDeg: number | null
  /** 눈 방향. 좌우(h)와 상하(v), 대략 -1~1 */
  eyeH: number | null
  eyeV: number | null
  /** 미소 정도 0~1 (mouthSmileLeft·Right 평균) */
  smile: number | null
  /** 눈 감김 정도 0~1 (eyeBlinkLeft·Right 평균) */
  blink: number | null

  /** 어깨(11·12)가 모두 보임 */
  poseVisible: boolean
  /** 어깨선의 기울기(도, -90~90) */
  shoulderTiltDeg: number | null
  /** 어깨 폭 */
  shoulderWidth: number | null
  /** 어깨 중점의 높이(y) */
  shoulderMidY: number | null
  /** 코-어깨 높이: (어깨 중점 y - 코 y) ÷ 어깨 폭. 클수록 고개가 어깨에서 멀리 있음 */
  neckRatio: number | null
  /** 손목 위치. 보이지 않으면 null */
  leftWrist: Point | null
  rightWrist: Point | null
}

/** 기준 자세: 점검 화면에서 바르게 앉아 잰 값의 중앙값. 이후 모든 판정은 이 값과의 차이로 합니다. */
export interface Baseline {
  yawDeg: number
  pitchDeg: number
  eyeH: number
  eyeV: number
  smile: number
  /** 어깨가 보이지 않으면 아래 값은 null 이고 자세·손 지표는 쓰지 않습니다. */
  poseAvailable: boolean
  shoulderTiltDeg: number | null
  shoulderWidth: number | null
  shoulderMidY: number | null
  neckRatio: number | null
}

export type BaselineFailure = 'no-frames' | 'no-face'

export type BaselineResult =
  | { ok: true; baseline: Baseline; frames: number; faceFrames: number; poseFrames: number }
  | { ok: false; reason: BaselineFailure; frames: number; faceFrames: number }

/**
 * 한 구간(질문 하나의 답변)의 요약 지표. 서버로 보내는 것은 이 숫자뿐입니다 (영상·프레임별 좌표는 보내지 않음).
 * 측정할 수 없는 값은 null.
 */
export interface NonverbalMetrics {
  version: number
  /** 분석한 시간(초) */
  analysisSeconds: number
  /** 기대한 분석 횟수 대비 실제로 분석한 비율 0~1 (탭이 숨겨지거나 PC 가 느리면 낮아짐) */
  sampleCoverage: number
  /** 분석한 프레임 수 / 그중 어깨가 보인 프레임 수 */
  faceFrames: number
  poseFrames: number

  faceVisibleRatio: number
  gazeAtCameraRatio: number | null
  headMotionDegPerSec: number | null
  shoulderTiltDeg: number | null
  postureCollapseRatio: number | null
  smileRatio: number | null
  blinksPerMinute: number | null
  gesturesPerMinute: number | null
  handMotionIndex: number | null
  handsVisibleRatio: number | null

  /** 이 값을 계산할 때 쓴 임계값 */
  clientThresholds: Record<string, number>
}
