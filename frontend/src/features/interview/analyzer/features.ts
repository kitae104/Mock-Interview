// 모델이 돌려준 랜드마크·블렌드셰이프에서 프레임별 값(FrameSample)을 뽑는 순수 함수들 (docs/PLAN.md 5.2).
// MediaPipe 에 의존하지 않고 숫자만 다루므로 단위 테스트로 계산을 확인할 수 있습니다.

import { THRESHOLDS } from './config.ts'
import type { FrameSample, Point } from './types.ts'

export interface Landmark {
  x: number
  y: number
  z?: number
  visibility?: number
}

export interface BlendshapeCategory {
  categoryName: string
  score: number
}

/** PoseLandmarker 랜드마크 번호 */
export const POSE = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
} as const

const RAD_TO_DEG = 180 / Math.PI
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/**
 * 얼굴 변환 행렬(4x4, 열 우선 16개 값)에서 머리 방향(도)을 구합니다.
 * 회전부의 열을 정규화해(행렬에 크기 변환이 섞여 있음) 오일러 각 XYZ 순서로 분해합니다: yaw = Y축(좌우), pitch = X축(상하), roll = Z축(기울임).
 * 축 방향과 부호는 카메라마다 확인이 필요합니다(/dev/analyzer 에서 고개를 돌려 보세요). 판정은 기준 자세와의 차이의 절댓값만 쓰므로 부호는 영향이 없습니다.
 */
export function headPoseFromMatrix(data: ArrayLike<number>): { yawDeg: number; pitchDeg: number; rollDeg: number } | null {
  if (data.length < 11) return null
  const columns = [
    [data[0], data[1], data[2]],
    [data[4], data[5], data[6]],
    [data[8], data[9], data[10]],
  ].map(([x, y, z]) => {
    const length = Math.hypot(x, y, z)
    return length > 1e-9 ? [x / length, y / length, z / length] : null
  })
  if (columns.some((c) => c === null)) return null
  // 사용하는 원소만 꺼냅니다 (m행열: m13 = 첫 행, 셋째 열)
  const [[m11], [m12, m22, m32], [m13, m23, m33]] = columns as number[][]

  const yaw = Math.asin(clamp(m13, -1, 1))
  const gimbalLock = Math.abs(m13) > 0.9999999
  const pitch = gimbalLock ? Math.atan2(m32, m22) : Math.atan2(-m23, m33)
  const roll = gimbalLock ? 0 : Math.atan2(-m12, m11)
  return { yawDeg: yaw * RAD_TO_DEG, pitchDeg: pitch * RAD_TO_DEG, rollDeg: roll * RAD_TO_DEG }
}

export function blendshapeMap(categories: BlendshapeCategory[]): Record<string, number> {
  const map: Record<string, number> = {}
  for (const c of categories) map[c.categoryName] = c.score
  return map
}

/** 눈 방향. h: 오른쪽(+)/왼쪽(-), v: 위(+)/아래(-). 둘 다 대략 -1~1 */
export function eyeDirection(b: Record<string, number>): { h: number; v: number } {
  const g = (name: string) => b[name] ?? 0
  const lookRight = (g('eyeLookInLeft') + g('eyeLookOutRight')) / 2
  const lookLeft = (g('eyeLookOutLeft') + g('eyeLookInRight')) / 2
  const up = g('eyeLookUpLeft') + g('eyeLookUpRight')
  const down = g('eyeLookDownLeft') + g('eyeLookDownRight')
  return { h: lookRight - lookLeft, v: (up - down) / 2 }
}

export const smileScore = (b: Record<string, number>) => ((b['mouthSmileLeft'] ?? 0) + (b['mouthSmileRight'] ?? 0)) / 2
export const blinkScore = (b: Record<string, number>) => ((b['eyeBlinkLeft'] ?? 0) + (b['eyeBlinkRight'] ?? 0)) / 2

/** 어깨선의 기울기(도). 사진 속 왼쪽/오른쪽 어느 쪽이 먼저 와도 같은 값이 나오도록 -90~90 도로 접습니다. */
export function lineTiltDeg(a: Point, b: Point): number {
  let deg = Math.atan2(b.y - a.y, b.x - a.x) * RAD_TO_DEG
  if (deg > 90) deg -= 180
  if (deg < -90) deg += 180
  return deg
}

const isVisible = (l: Landmark | undefined, min: number): l is Landmark => l !== undefined && (l.visibility ?? 1) >= min

/** 화면 안에 있는 점인지. 포즈 모델은 화면 밖(아래)에 있는 손목도 짐작해서 돌려주는데, 그 값은 떨려서 손 움직임으로 잘못 읽힙니다. */
const isInFrame = (l: Landmark): boolean => l.x >= 0 && l.x <= 1 && l.y >= 0 && l.y <= 1

interface FrameInput {
  /** 분석을 시작한 뒤 경과 시간(ms) */
  t: number
  /** 영상의 가로 ÷ 세로. 좌표를 같은 단위로 맞추는 데 씁니다. */
  aspect: number
  face: { matrix: ArrayLike<number> | null; blendshapes: BlendshapeCategory[] | null } | null
  pose: Landmark[] | null
}

/** 얼굴·포즈 검출 결과 하나를 FrameSample 로 바꿉니다. 검출되지 않은 쪽은 값이 null 입니다. */
export function buildFrameSample({ t, aspect, face, pose }: FrameInput, visibilityMin = THRESHOLDS.poseVisibilityMin): FrameSample {
  const sample: FrameSample = {
    t,
    faceVisible: face !== null,
    yawDeg: null,
    pitchDeg: null,
    rollDeg: null,
    eyeH: null,
    eyeV: null,
    smile: null,
    blink: null,
    poseVisible: false,
    shoulderTiltDeg: null,
    shoulderWidth: null,
    shoulderMidY: null,
    neckRatio: null,
    leftWrist: null,
    rightWrist: null,
  }

  if (face) {
    const head = face.matrix ? headPoseFromMatrix(face.matrix) : null
    if (head) Object.assign(sample, head)
    if (face.blendshapes) {
      const b = blendshapeMap(face.blendshapes)
      const eyes = eyeDirection(b)
      sample.eyeH = eyes.h
      sample.eyeV = eyes.v
      sample.smile = smileScore(b)
      sample.blink = blinkScore(b)
    }
  }

  if (pose) {
    const toPoint = (l: Landmark): Point => ({ x: l.x * aspect, y: l.y })
    const left = pose[POSE.LEFT_SHOULDER]
    const right = pose[POSE.RIGHT_SHOULDER]
    if (isVisible(left, visibilityMin) && isVisible(right, visibilityMin)) {
      const a = toPoint(left)
      const b = toPoint(right)
      const width = Math.hypot(a.x - b.x, a.y - b.y)
      if (width > 1e-6) {
        const midY = (a.y + b.y) / 2
        sample.poseVisible = true
        sample.shoulderWidth = width
        sample.shoulderMidY = midY
        sample.shoulderTiltDeg = lineTiltDeg(a, b)
        const nose = pose[POSE.NOSE]
        if (nose) sample.neckRatio = (midY - nose.y) / width
      }
    }
    const lw = pose[POSE.LEFT_WRIST]
    const rw = pose[POSE.RIGHT_WRIST]
    if (isVisible(lw, visibilityMin) && isInFrame(lw)) sample.leftWrist = toPoint(lw)
    if (isVisible(rw, visibilityMin) && isInFrame(rw)) sample.rightWrist = toPoint(rw)
  }

  return sample
}

