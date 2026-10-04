import { describe, expect, it } from 'vitest'
import { METRICS_VERSION, SAMPLE_INTERVAL_MS, THRESHOLDS } from './config.ts'
import {
  computeBaseline,
  isGazingAtCamera,
  isPostureCollapsed,
  isSmiling,
  median,
  NEUTRAL_BASELINE,
  summarizeSamples,
  wristSpeed,
} from './summarize.ts'
import type { Baseline, FrameSample } from './types.ts'

const STEP = SAMPLE_INTERVAL_MS

function sample(i: number, overrides: Partial<FrameSample> = {}): FrameSample {
  return {
    t: i * STEP,
    faceVisible: true,
    yawDeg: 0,
    pitchDeg: 0,
    rollDeg: 0,
    eyeH: 0,
    eyeV: 0,
    smile: 0,
    blink: 0,
    poseVisible: true,
    shoulderTiltDeg: 0,
    shoulderWidth: 0.3,
    shoulderMidY: 0.7,
    neckRatio: 1.2,
    leftWrist: null,
    rightWrist: null,
    ...overrides,
  }
}

const frames = (count: number, make: (i: number) => Partial<FrameSample> = () => ({})) =>
  Array.from({ length: count }, (_, i) => sample(i, make(i)))

const poseBaseline: Baseline = {
  ...NEUTRAL_BASELINE,
  poseAvailable: true,
  shoulderTiltDeg: 0,
  shoulderWidth: 0.3,
  shoulderMidY: 0.7,
  neckRatio: 1.2,
}

describe('median', () => {
  it('홀수·짝수·빈 목록', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(median([])).toBeNaN()
  })
})

describe('computeBaseline', () => {
  it('프레임이 없으면 실패', () => {
    expect(computeBaseline([])).toMatchObject({ ok: false, reason: 'no-frames' })
  })

  it('얼굴이 60% 미만으로 보이면 실패', () => {
    const samples = frames(30, (i) => ({ faceVisible: i < 17 })) // 17/30 = 56%
    expect(computeBaseline(samples)).toMatchObject({ ok: false, reason: 'no-face', faceFrames: 17 })
  })

  it('중앙값으로 만들어 튀는 값에 흔들리지 않는다', () => {
    const samples = frames(30, (i) => ({ yawDeg: i === 5 ? 80 : 4, smile: 0.1, shoulderTiltDeg: 2 }))
    const result = computeBaseline(samples)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.baseline.yawDeg).toBe(4)
    expect(result.baseline.smile).toBeCloseTo(0.1)
    expect(result.baseline.poseAvailable).toBe(true)
    expect(result.baseline.shoulderTiltDeg).toBe(2)
    expect(result.baseline.shoulderWidth).toBe(0.3)
  })

  it('어깨가 안 보이면 성공하되 자세 값은 null', () => {
    const samples = frames(30, () => ({ poseVisible: false, shoulderTiltDeg: null, shoulderWidth: null, shoulderMidY: null, neckRatio: null }))
    const result = computeBaseline(samples)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.baseline.poseAvailable).toBe(false)
    expect(result.baseline.shoulderWidth).toBeNull()
    expect(result.poseFrames).toBe(0)
  })
})

describe('프레임 판정', () => {
  const base: Baseline = { ...NEUTRAL_BASELINE, yawDeg: 10, pitchDeg: -5, eyeH: 0.1, smile: 0.2 }

  it('응시: 기준 자세 대비 15도 이내이면 보고 있는 것', () => {
    expect(isGazingAtCamera(sample(0, { yawDeg: 24, pitchDeg: -5 }), base)).toBe(true)
    expect(isGazingAtCamera(sample(0, { yawDeg: 26, pitchDeg: -5 }), base)).toBe(false)
    expect(isGazingAtCamera(sample(0, { yawDeg: 10, pitchDeg: 11 }), base)).toBe(false)
  })

  it('응시: 눈이 기준에서 크게 벗어나면(예: 아래를 봄) 아니다', () => {
    expect(isGazingAtCamera(sample(0, { yawDeg: 10, pitchDeg: -5, eyeH: 0.1, eyeV: -0.6 }), base)).toBe(false)
    expect(isGazingAtCamera(sample(0, { yawDeg: 10, pitchDeg: -5, eyeH: 0.3, eyeV: 0.2 }), base)).toBe(true)
  })

  it('응시: 얼굴이 안 보이면 아니다', () => {
    expect(isGazingAtCamera(sample(0, { faceVisible: false }), base)).toBe(false)
  })

  it('미소: 기준보다 0.35 이상 올라가야 한다', () => {
    expect(isSmiling(sample(0, { smile: 0.6 }), base)).toBe(true)
    expect(isSmiling(sample(0, { smile: 0.5 }), base)).toBe(false)
  })

  it('자세 무너짐: 어깨 내려감 / 목 비율 감소 / 구부정함 중 하나', () => {
    expect(isPostureCollapsed(sample(0), poseBaseline)).toBe(false)
    expect(isPostureCollapsed(sample(0, { shoulderMidY: 0.7 + 0.3 * 0.16 }), poseBaseline)).toBe(true) // 어깨 폭의 16% 내려감
    expect(isPostureCollapsed(sample(0, { neckRatio: 1.2 * 0.8 }), poseBaseline)).toBe(true)
    expect(isPostureCollapsed(sample(0, { shoulderWidth: 0.3 * 1.25 }), poseBaseline)).toBe(true)
    expect(isPostureCollapsed(sample(0, { shoulderMidY: 0.7 + 0.3 * 0.1, neckRatio: 1.1, shoulderWidth: 0.33 }), poseBaseline)).toBe(false)
  })

  it('자세 무너짐: 기준 자세에 어깨가 없으면 판정하지 않는다', () => {
    expect(isPostureCollapsed(sample(0, { shoulderWidth: 0.9 }), NEUTRAL_BASELINE)).toBe(false)
  })

  it('손목 속도: 어깨폭 단위, 두 프레임에서 모두 보인 손목만', () => {
    const a = sample(0, { leftWrist: { x: 0, y: 0 } })
    const b = sample(1, { leftWrist: { x: 0.03, y: 0 } }) // 0.03 ÷ 0.3 ÷ 0.1초 = 1.0
    expect(wristSpeed(a, b)).toBeCloseTo(1)
    expect(wristSpeed(a, sample(1, { rightWrist: { x: 0.03, y: 0 } }))).toBeNull()
    expect(wristSpeed(a, sample(0, { leftWrist: { x: 1, y: 1 } }))).toBeNull() // 시간이 흐르지 않음
  })
})

describe('summarizeSamples', () => {
  it('프레임이 없어도 오류 없이 빈 지표를 준다', () => {
    const m = summarizeSamples([])
    expect(m.faceFrames).toBe(0)
    expect(m.faceVisibleRatio).toBe(0)
    expect(m.gazeAtCameraRatio).toBeNull()
    expect(m.sampleCoverage).toBe(0)
    expect(m.version).toBe(METRICS_VERSION)
  })

  it('기본 정보: 버전, 분석 시간, 사용한 임계값', () => {
    const m = summarizeSamples(frames(100))
    expect(m.analysisSeconds).toBeCloseTo(10)
    expect(m.faceFrames).toBe(100)
    expect(m.poseFrames).toBe(100)
    expect(m.clientThresholds).toEqual({ ...THRESHOLDS })
  })

  it('얼굴 보임 비율과 응시 비율', () => {
    const m = summarizeSamples(frames(100, (i) => (i < 20 ? { faceVisible: false } : { yawDeg: i < 76 ? 0 : 30 })))
    expect(m.faceVisibleRatio).toBeCloseTo(0.8)
    // 보이는 80프레임 중 4번째 구간(76~99, 24프레임)은 30도 돌아가 있어 응시 아님: 56/80
    expect(m.gazeAtCameraRatio).toBeCloseTo(0.7)
  })

  it('얼굴이 전혀 안 보이면 얼굴 계열은 null', () => {
    const m = summarizeSamples(frames(50, () => ({ faceVisible: false, yawDeg: null, pitchDeg: null, rollDeg: null, smile: null, blink: null })))
    expect(m.faceVisibleRatio).toBe(0)
    expect(m.gazeAtCameraRatio).toBeNull()
    expect(m.smileRatio).toBeNull()
    expect(m.headMotionDegPerSec).toBeNull()
    expect(m.blinksPerMinute).toBeNull()
  })

  it('머리 흔들림: 초당 변화한 각도', () => {
    const m = summarizeSamples(frames(100, (i) => ({ yawDeg: i % 2 === 0 ? 0 : 1 }))) // 0.1초마다 1도 → 10도/초
    expect(m.headMotionDegPerSec).toBeCloseTo(10)
    expect(summarizeSamples(frames(100)).headMotionDegPerSec).toBe(0)
  })

  it('머리 흔들림: 얼굴이 사라진 구간은 건너뛴다', () => {
    const m = summarizeSamples(frames(100, (i) => (i === 50 ? { faceVisible: false, yawDeg: null, pitchDeg: null, rollDeg: null } : { yawDeg: i < 50 ? 0 : 90 })))
    expect(m.headMotionDegPerSec).toBe(0) // 0 → (사라짐) → 90 의 큰 변화는 세지 않는다
  })

  it('미소 비율', () => {
    const m = summarizeSamples(frames(100, (i) => ({ smile: i < 30 ? 0.5 : 0.1 })))
    expect(m.smileRatio).toBeCloseTo(0.3)
  })

  it('눈 깜빡임: 짧게 감았다 뜨면 1회, 오래 감으면 제외', () => {
    const blinkAt = [10, 30, 50, 70, 90]
    const m = summarizeSamples(frames(100, (i) => ({ blink: blinkAt.includes(i) ? 0.9 : 0.05 })))
    expect(m.blinksPerMinute).toBeCloseTo(30) // 10초 동안 5회

    const longClosed = summarizeSamples(frames(100, (i) => ({ blink: i >= 10 && i < 20 ? 0.9 : 0.05 }))) // 1초 동안 감김
    expect(longClosed.blinksPerMinute).toBe(0)
  })

  it('눈 깜빡임: 얼굴이 보인 시간이 10초 미만이면 계산하지 않는다', () => {
    expect(summarizeSamples(frames(50)).blinksPerMinute).toBeNull()
  })

  it('어깨 기울기와 자세 무너짐 (기준 자세 대비)', () => {
    const m = summarizeSamples(
      frames(100, (i) => ({ shoulderTiltDeg: i % 2 === 0 ? 4 : 2, shoulderMidY: i < 25 ? 0.7 + 0.3 * 0.2 : 0.7 })),
      poseBaseline,
    )
    expect(m.shoulderTiltDeg).toBeCloseTo(3)
    expect(m.postureCollapseRatio).toBeCloseTo(0.25)
  })

  it('기준 자세에 어깨가 없으면 자세 지표는 null', () => {
    const m = summarizeSamples(frames(100), NEUTRAL_BASELINE)
    expect(m.shoulderTiltDeg).toBeNull()
    expect(m.postureCollapseRatio).toBeNull()
  })

  it('손: 손목이 거의 안 보이면 측정 불가(null)', () => {
    const m = summarizeSamples(frames(100, (i) => (i === 0 ? { leftWrist: { x: 0, y: 0 } } : {})))
    expect(m.handsVisibleRatio).toBeCloseTo(0.01)
    expect(m.gesturesPerMinute).toBeNull()
    expect(m.handMotionIndex).toBeNull()
  })

  it('손: 빠르게 움직인 구간을 제스처로 센다', () => {
    // 8프레임 동안 프레임마다 0.08 씩 움직이고(어깨폭의 약 2배/초), 12프레임 가만히 있는 것을 5번 반복
    const m = summarizeSamples(
      frames(100, (i) => {
        const phase = i % 20
        const cycle = Math.floor(i / 20)
        const x = cycle * 0.8 + (phase < 8 ? phase * 0.08 : 8 * 0.08)
        return { leftWrist: { x, y: 0.5 } }
      }),
    )
    expect(m.handsVisibleRatio).toBe(1)
    const handSeconds = (100 - 4) * (10 / 100)
    expect((m.gesturesPerMinute! * handSeconds) / 60).toBeCloseTo(5, 0)
    expect(m.handMotionIndex).toBeGreaterThan(0.2)
  })

  it('손: 포즈 모델의 떨림(가만히 있는데 프레임마다 ±0.03 흔들림)은 제스처로 세지 않는다', () => {
    const m = summarizeSamples(frames(100, (i) => ({ leftWrist: { x: 0.4 + (i % 2 === 0 ? 0.03 : -0.03), y: 0.5 } })))
    expect(m.gesturesPerMinute).toBe(0)
  })

  it('손: 제스처가 한 번도 없으면 0', () => {
    const m = summarizeSamples(frames(100, () => ({ leftWrist: { x: 0.4, y: 0.5 } })))
    expect(m.gesturesPerMinute).toBe(0)
    expect(m.handMotionIndex).toBe(0)
  })

  it('표본 충족률: 기대한 프레임 수 대비 실제 프레임 수', () => {
    const m = summarizeSamples(frames(50), NEUTRAL_BASELINE, { durationSeconds: 10 })
    expect(m.sampleCoverage).toBeCloseTo(0.5)
    expect(m.analysisSeconds).toBe(10)
  })

  it('같은 입력은 같은 결과 (순수 함수)', () => {
    const input = frames(100, (i) => ({ yawDeg: i % 7, smile: (i % 10) / 10 }))
    expect(summarizeSamples(input, poseBaseline)).toEqual(summarizeSamples(input, poseBaseline))
  })
})
