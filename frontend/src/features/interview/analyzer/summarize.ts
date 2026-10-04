// 프레임 값(FrameSample) 목록을 기준 자세와 요약 지표 JSON 으로 바꾸는 순수 함수들 (docs/PLAN.md 5.2).
// 영상이나 모델에 의존하지 않으므로 같은 입력은 항상 같은 결과를 냅니다.

import {
  BASELINE_SECONDS,
  METRICS_VERSION,
  MIN_BASELINE_FACE_RATIO,
  MIN_BASELINE_POSE_RATIO,
  SAMPLE_INTERVAL_MS,
  THRESHOLDS,
  type Thresholds,
} from './config.ts'
import type { Baseline, BaselineResult, FrameSample, NonverbalMetrics, Point } from './types.ts'

const isNumber = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v)
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0)
const round = (value: number, digits = 3) => {
  const f = 10 ** digits
  return Math.round(value * f) / f
}

export function median(values: number[]): number {
  if (values.length === 0) return NaN
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function medianOf(samples: FrameSample[], pick: (s: FrameSample) => number | null): number | null {
  const values = samples.map(pick).filter(isNumber)
  return values.length > 0 ? median(values) : null
}

/** 기준 자세가 없을 때(분석만 보고 싶을 때) 쓰는 값: 정면, 편안한 표정, 어깨 정보 없음 */
export const NEUTRAL_BASELINE: Baseline = {
  yawDeg: 0,
  pitchDeg: 0,
  eyeH: 0,
  eyeV: 0,
  smile: 0,
  poseAvailable: false,
  shoulderTiltDeg: null,
  shoulderWidth: null,
  shoulderMidY: null,
  neckRatio: null,
}

/**
 * 점검 화면에서 바르게 앉아 잰 프레임들로 기준 자세를 만듭니다 (각 값의 중앙값).
 * 얼굴이 충분히 보이지 않으면 실패합니다. 어깨가 보이지 않으면 성공하되 poseAvailable=false 입니다.
 */
export function computeBaseline(samples: FrameSample[]): BaselineResult {
  const frames = samples.length
  const faceSamples = samples.filter((s) => s.faceVisible)
  if (frames === 0) return { ok: false, reason: 'no-frames', frames, faceFrames: 0 }
  if (faceSamples.length / frames < MIN_BASELINE_FACE_RATIO) {
    return { ok: false, reason: 'no-face', frames, faceFrames: faceSamples.length }
  }

  const poseSamples = samples.filter((s) => s.poseVisible)
  const poseAvailable = poseSamples.length / frames >= MIN_BASELINE_POSE_RATIO
  const baseline: Baseline = {
    yawDeg: medianOf(faceSamples, (s) => s.yawDeg) ?? 0,
    pitchDeg: medianOf(faceSamples, (s) => s.pitchDeg) ?? 0,
    eyeH: medianOf(faceSamples, (s) => s.eyeH) ?? 0,
    eyeV: medianOf(faceSamples, (s) => s.eyeV) ?? 0,
    smile: medianOf(faceSamples, (s) => s.smile) ?? 0,
    poseAvailable,
    shoulderTiltDeg: poseAvailable ? medianOf(poseSamples, (s) => s.shoulderTiltDeg) : null,
    shoulderWidth: poseAvailable ? medianOf(poseSamples, (s) => s.shoulderWidth) : null,
    shoulderMidY: poseAvailable ? medianOf(poseSamples, (s) => s.shoulderMidY) : null,
    neckRatio: poseAvailable ? medianOf(poseSamples, (s) => s.neckRatio) : null,
  }
  return { ok: true, baseline, frames, faceFrames: faceSamples.length, poseFrames: poseSamples.length }
}

// ---- 프레임 하나에 대한 판정 (화면의 실시간 표시와 요약 지표가 같은 기준을 씁니다) ----

/** 카메라를 보고 있는가: 머리 방향과 눈 방향이 모두 기준 자세에서 크게 벗어나지 않음 */
export function isGazingAtCamera(s: FrameSample, base: Baseline, th: Thresholds = THRESHOLDS): boolean {
  if (!s.faceVisible || !isNumber(s.yawDeg) || !isNumber(s.pitchDeg)) return false
  const headOk = Math.abs(s.yawDeg - base.yawDeg) <= th.gazeYawMaxDeg && Math.abs(s.pitchDeg - base.pitchDeg) <= th.gazePitchMaxDeg
  const eyesOk =
    !isNumber(s.eyeH) ||
    !isNumber(s.eyeV) ||
    (Math.abs(s.eyeH - base.eyeH) <= th.eyeHMax && Math.abs(s.eyeV - base.eyeV) <= th.eyeVMax)
  return headOk && eyesOk
}

export function isSmiling(s: FrameSample, base: Baseline, th: Thresholds = THRESHOLDS): boolean {
  return s.faceVisible && isNumber(s.smile) && s.smile - base.smile >= th.smileOn
}

/** 자세가 무너졌는가: 어깨가 내려감, 고개가 어깨로 내려앉음, 카메라 쪽으로 구부정함 중 하나 */
export function isPostureCollapsed(s: FrameSample, base: Baseline, th: Thresholds = THRESHOLDS): boolean {
  if (!base.poseAvailable || !s.poseVisible || !isNumber(s.shoulderWidth) || !isNumber(s.shoulderMidY)) return false
  if (!isNumber(base.shoulderWidth) || !isNumber(base.shoulderMidY)) return false
  const dropped = (s.shoulderMidY - base.shoulderMidY) / base.shoulderWidth >= th.postureDrop
  const neckShrunk = isNumber(s.neckRatio) && isNumber(base.neckRatio) && base.neckRatio > 0 && s.neckRatio <= base.neckRatio * (1 - th.postureNeckShrink)
  const leaning = s.shoulderWidth >= base.shoulderWidth * (1 + th.postureLeanGrow)
  return dropped || neckShrunk || leaning
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

/** 두 프레임 사이 손목의 가장 빠른 속도(어깨폭/초). 같은 손목이 두 프레임에서 모두 보일 때만 잽니다. */
export function wristSpeed(prev: FrameSample, cur: FrameSample): number | null {
  const dt = (cur.t - prev.t) / 1000
  const width = cur.shoulderWidth ?? prev.shoulderWidth
  if (dt <= 0 || !isNumber(width) || width <= 0) return null
  const speeds: number[] = []
  if (prev.leftWrist && cur.leftWrist) speeds.push(distance(prev.leftWrist, cur.leftWrist) / width / dt)
  if (prev.rightWrist && cur.rightWrist) speeds.push(distance(prev.rightWrist, cur.rightWrist) / width / dt)
  return speeds.length > 0 ? Math.max(...speeds) : null
}

// ---- 구간 요약 ----

export interface SummarizeOptions {
  /** 분석한 시간(초). 없으면 프레임 시각에서 구합니다. */
  durationSeconds?: number
  intervalMs?: number
  thresholds?: Thresholds
}

/**
 * 한 구간(질문 하나의 답변)의 프레임들을 요약 지표로 바꿉니다.
 * 얼굴이 안 보이면 얼굴 계열, 어깨가 안 보이면(또는 기준 자세에 어깨가 없으면) 자세·손 계열이 null 입니다.
 */
export function summarizeSamples(samples: FrameSample[], baseline: Baseline = NEUTRAL_BASELINE, options: SummarizeOptions = {}): NonverbalMetrics {
  const th = options.thresholds ?? THRESHOLDS
  const intervalMs = options.intervalMs ?? SAMPLE_INTERVAL_MS
  const n = samples.length
  const durationSeconds =
    options.durationSeconds ?? (n > 0 ? (samples[n - 1].t - samples[0].t + intervalMs) / 1000 : 0)
  const secondsPerFrame = n > 0 ? durationSeconds / n : 0

  const faceSamples = samples.filter((s) => s.faceVisible)
  const poseSamples = samples.filter((s) => s.poseVisible)

  // 머리 흔들림: 연달아 얼굴이 보인 두 프레임의 yaw·pitch·roll 변화량 합 ÷ 시간
  let headDelta = 0
  let headTime = 0
  for (let i = 1; i < n; i++) {
    const a = samples[i - 1]
    const b = samples[i]
    const dt = (b.t - a.t) / 1000
    if (!a.faceVisible || !b.faceVisible || dt <= 0 || dt > (intervalMs * 3) / 1000) continue
    if (![a.yawDeg, a.pitchDeg, a.rollDeg, b.yawDeg, b.pitchDeg, b.rollDeg].every(isNumber)) continue
    headDelta += Math.abs(b.yawDeg! - a.yawDeg!) + Math.abs(b.pitchDeg! - a.pitchDeg!) + Math.abs(b.rollDeg! - a.rollDeg!)
    headTime += dt
  }

  // 눈 깜빡임: 감김이 blinkOn 이상으로 올라갔다가 blinkOff 이하로 내려오면 1회 (너무 오래 감은 것은 제외)
  let blinks = 0
  let closedSince: number | null = null
  for (const s of samples) {
    if (!s.faceVisible || !isNumber(s.blink)) {
      closedSince = null
      continue
    }
    if (closedSince === null && s.blink >= th.blinkOn) closedSince = s.t
    else if (closedSince !== null && s.blink <= th.blinkOff) {
      if (s.t - closedSince <= th.blinkMaxMs) blinks++
      closedSince = null
    }
  }
  const faceSeconds = faceSamples.length * secondsPerFrame

  // 손: 연달아 손목이 보인 구간의 속도
  const handSamples = poseSamples.filter((s) => s.leftWrist || s.rightWrist)
  const handsVisibleRatio = poseSamples.length > 0 ? handSamples.length / poseSamples.length : null
  const handsMeasurable = handsVisibleRatio !== null && handsVisibleRatio >= th.handsMinVisibleRatio
  const speeds: { t: number; speed: number }[] = []
  const lag = Math.max(1, Math.round(th.gestureWindowMs / intervalMs))
  for (let i = lag; i < n; i++) {
    const speed = wristSpeed(samples[i - lag], samples[i])
    if (speed !== null) speeds.push({ t: samples[i].t, speed })
  }
  let gestures = 0
  let armed = true
  let activeSince: number | null = null
  let calmSince: number | null = null
  for (const { t, speed } of speeds) {
    if (speed >= th.gestureSpeed) {
      calmSince = null
      activeSince ??= t - intervalMs
      if (armed && t - activeSince >= th.gestureMinMs) {
        gestures++
        armed = false
      }
    } else {
      activeSince = null
      calmSince ??= t
      if (t - calmSince >= th.gestureGapMs) armed = true
    }
  }
  const handSeconds = speeds.length * secondsPerFrame

  const baselineHasPose = baseline.poseAvailable
  const expectedFrames = (durationSeconds * 1000) / intervalMs

  const metrics: NonverbalMetrics = {
    version: METRICS_VERSION,
    analysisSeconds: round(durationSeconds, 1),
    sampleCoverage: expectedFrames > 0 ? round(Math.min(1, n / expectedFrames)) : 0,
    faceFrames: n,
    poseFrames: poseSamples.length,

    faceVisibleRatio: n > 0 ? round(faceSamples.length / n) : 0,
    gazeAtCameraRatio:
      faceSamples.length > 0 ? round(faceSamples.filter((s) => isGazingAtCamera(s, baseline, th)).length / faceSamples.length) : null,
    headMotionDegPerSec: headTime > 0 ? round(headDelta / headTime, 2) : null,
    shoulderTiltDeg: null,
    postureCollapseRatio: null,
    smileRatio: faceSamples.length > 0 ? round(faceSamples.filter((s) => isSmiling(s, baseline, th)).length / faceSamples.length) : null,
    blinksPerMinute: faceSeconds >= th.blinkMinFaceSeconds ? round(blinks / (faceSeconds / 60), 1) : null,
    gesturesPerMinute: handsMeasurable && handSeconds > 0 ? round(gestures / (handSeconds / 60), 1) : null,
    handMotionIndex: handsMeasurable && speeds.length > 0 ? round(sum(speeds.map((v) => v.speed)) / speeds.length) : null,
    handsVisibleRatio: handsVisibleRatio !== null ? round(handsVisibleRatio) : null,

    clientThresholds: { ...th },
  }

  if (baselineHasPose && poseSamples.length > 0) {
    const tilts = poseSamples.map((s) => s.shoulderTiltDeg).filter(isNumber)
    if (isNumber(baseline.shoulderTiltDeg) && tilts.length > 0) {
      metrics.shoulderTiltDeg = round(sum(tilts.map((t) => Math.abs(t - baseline.shoulderTiltDeg!))) / tilts.length, 2)
    }
    metrics.postureCollapseRatio = round(poseSamples.filter((s) => isPostureCollapsed(s, baseline, th)).length / poseSamples.length)
  }

  return metrics
}

/** 기준 자세를 재는 시간(초) 동안 기대하는 프레임 수 */
export const EXPECTED_BASELINE_FRAMES = Math.round((BASELINE_SECONDS * 1000) / SAMPLE_INTERVAL_MS)
