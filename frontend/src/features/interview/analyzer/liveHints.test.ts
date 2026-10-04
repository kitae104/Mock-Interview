import { describe, expect, it } from 'vitest'
import { HintTracker } from './liveHints.ts'
import { NEUTRAL_BASELINE } from './summarize.ts'
import type { Baseline, FrameSample } from './types.ts'

const poseBaseline: Baseline = {
  ...NEUTRAL_BASELINE,
  poseAvailable: true,
  shoulderTiltDeg: 0,
  shoulderWidth: 0.3,
  shoulderMidY: 0.7,
  neckRatio: 1.2,
}

function frame(overrides: Partial<FrameSample> = {}): FrameSample {
  return {
    t: 0,
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

const away = { yawDeg: 40 } // 기준(0°)에서 15° 넘게 벗어남
const slouch = { shoulderMidY: 0.7 + 0.3 * 0.2 } // 어깨가 어깨폭의 20% 내려감
const noFace = { faceVisible: false, yawDeg: null, pitchDeg: null }

/** 100ms 간격으로 `untilMs` 까지 같은 프레임을 넣고, 안내가 나온 시각(ms)과 내용을 돌려줍니다. */
function run(tracker: HintTracker, sample: FrameSample, fromMs: number, untilMs: number) {
  const hints: { at: number; id: string }[] = []
  for (let t = fromMs; t <= untilMs; t += 100) {
    const hint = tracker.update(sample, poseBaseline, t)
    if (hint) hints.push({ at: t, id: hint.id })
  }
  return hints
}

describe('HintTracker', () => {
  it('정면을 보고 바른 자세면 안내가 없다', () => {
    expect(run(new HintTracker(), frame(), 0, 60_000)).toEqual([])
  })

  it('시선이 3초 이상 벗어나 있으면 안내한다', () => {
    const hints = run(new HintTracker(), frame(away), 0, 5000)
    expect(hints).toEqual([{ at: 3000, id: 'gaze' }])
  })

  it('3초가 되기 전에 시선이 돌아오면 안내하지 않고 처음부터 다시 센다', () => {
    const tracker = new HintTracker()
    expect(run(tracker, frame(away), 0, 2500)).toEqual([])
    expect(run(tracker, frame(), 2600, 2800)).toEqual([]) // 돌아옴 → 초기화
    expect(run(tracker, frame(away), 2900, 5500)).toEqual([]) // 2.9초부터 다시 세므로 5.5초에도 2.6초
    expect(run(tracker, frame(away), 5600, 6000)).toEqual([{ at: 5900, id: 'gaze' }])
  })

  it('얼굴이 2초 이상 안 보이면 안내한다', () => {
    expect(run(new HintTracker(), frame(noFace), 0, 3000)).toEqual([{ at: 2000, id: 'face' }])
  })

  it('자세가 5초 이상 흐트러지면 안내한다', () => {
    expect(run(new HintTracker(), frame(slouch), 0, 6000)).toEqual([{ at: 5000, id: 'posture' }])
  })

  it('안내한 뒤 12초(쿨다운) 동안은 같은 안내를 다시 하지 않고, 조건이 계속되면 12초마다 다시 안내한다', () => {
    const hints = run(new HintTracker(), frame(away), 0, 30_000)
    expect(hints.map((h) => h.at)).toEqual([3000, 15_000, 27_000])
  })

  it('한 번에 하나만: 얼굴이 안 보이면 시선 안내보다 먼저 한다', () => {
    const tracker = new HintTracker()
    const hints = run(tracker, frame(noFace), 0, 4000)
    expect(hints.map((h) => h.id)).toEqual(['face'])
  })

  it('서로 다른 종류는 각자 센다 (시선 안내 직후 자세 안내도 나올 수 있음)', () => {
    const tracker = new HintTracker()
    const both = frame({ ...away, ...slouch })
    const hints = run(tracker, both, 0, 6000)
    expect(hints).toEqual([
      { at: 3000, id: 'gaze' },
      { at: 5000, id: 'posture' },
    ])
  })

  it('reset() 하면 쿨다운과 지속 시간을 모두 지운다 (다음 질문)', () => {
    const tracker = new HintTracker()
    expect(run(tracker, frame(away), 0, 3000)).toHaveLength(1)
    tracker.reset()
    expect(run(tracker, frame(away), 3100, 6100)).toEqual([{ at: 6100, id: 'gaze' }]) // 쿨다운 없이 3초 뒤 다시
  })

  it('기준 자세에 어깨가 없으면 자세 안내는 하지 않는다', () => {
    const tracker = new HintTracker()
    const hints: string[] = []
    for (let t = 0; t <= 10_000; t += 100) {
      const hint = tracker.update(frame(slouch), NEUTRAL_BASELINE, t)
      if (hint) hints.push(hint.id)
    }
    expect(hints).toEqual([])
  })

  it('기준을 바꾸면 판정 기준도 바뀐다 (기준이 40° 이면 40° 는 정면)', () => {
    const tracker = new HintTracker()
    const shifted: Baseline = { ...poseBaseline, yawDeg: 40 }
    let shown = 0
    for (let t = 0; t <= 5000; t += 100) if (tracker.update(frame(away), shifted, t)) shown++
    expect(shown).toBe(0)
  })

  it('안내 문구는 짧은 한국어 문장이다', () => {
    const messages = [
      new HintTracker().update(frame(noFace), poseBaseline, 0),
      ...[2000].map((t) => {
        const tr = new HintTracker()
        tr.update(frame(noFace), poseBaseline, 0)
        return tr.update(frame(noFace), poseBaseline, t)
      }),
    ]
    expect(messages[1]?.message).toBe('얼굴이 화면 안에 보이게 해 주세요')
  })
})
