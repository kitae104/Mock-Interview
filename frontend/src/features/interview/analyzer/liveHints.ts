// 답변하는 동안 화면 모서리에 띄우는 짧은 안내("시선·자세 알림")를 판정합니다 (docs/PLAN.md 8장 ⑤).
// 기본은 꺼져 있고(긴장 방지), 사용자가 켰을 때만 씁니다. 같은 안내가 반복되지 않도록 쿨다운을 둡니다.

import { isGazingAtCamera, isPostureCollapsed } from './summarize.ts'
import type { Baseline, FrameSample } from './types.ts'

export type HintId = 'face' | 'gaze' | 'posture'

export interface Hint {
  id: HintId
  message: string
}

export interface HintOptions {
  /** 얼굴이 이 시간(ms) 이상 안 보이면 */
  faceMissingMs: number
  /** 카메라에서 이 시간(ms) 이상 시선이 벗어나 있으면 */
  gazeAwayMs: number
  /** 자세가 이 시간(ms) 이상 흐트러져 있으면 */
  postureMs: number
  /** 같은 종류의 안내를 다시 보여 주기까지 기다리는 시간(ms) */
  cooldownMs: number
}

export const DEFAULT_HINT_OPTIONS: HintOptions = {
  faceMissingMs: 2000,
  gazeAwayMs: 3000,
  postureMs: 5000,
  cooldownMs: 12_000,
}

const MESSAGES: Record<HintId, string> = {
  face: '얼굴이 화면 안에 보이게 해 주세요',
  gaze: '카메라를 바라보며 답해 보세요',
  posture: '자세를 바르게 해 보세요',
}

/**
 * 프레임을 하나씩 넣으면, 안내할 때가 된 순간에만 Hint 를 돌려줍니다 (그 밖에는 null).
 * 우선순위: 얼굴 안 보임 > 시선 이탈 > 자세. 안내를 한 번 낸 조건은 쿨다운이 지나야 다시 낼 수 있고, 조건이 풀리면 처음부터 다시 잽니다.
 */
export class HintTracker {
  private readonly options: HintOptions
  private since: Partial<Record<HintId, number>> = {}
  private lastShown: Partial<Record<HintId, number>> = {}

  constructor(options: Partial<HintOptions> = {}) {
    this.options = { ...DEFAULT_HINT_OPTIONS, ...options }
  }

  /** 새 질문을 시작할 때: 이전 질문의 상태와 쿨다운을 지웁니다. */
  reset(): void {
    this.since = {}
    this.lastShown = {}
  }

  update(sample: FrameSample, baseline: Baseline, now: number): Hint | null {
    const conditions: Record<HintId, boolean> = {
      face: !sample.faceVisible,
      gaze: sample.faceVisible && !isGazingAtCamera(sample, baseline),
      posture: sample.poseVisible && isPostureCollapsed(sample, baseline),
    }
    const thresholds: Record<HintId, number> = {
      face: this.options.faceMissingMs,
      gaze: this.options.gazeAwayMs,
      posture: this.options.postureMs,
    }

    let result: Hint | null = null
    for (const id of ['face', 'gaze', 'posture'] as const) {
      if (!conditions[id]) {
        delete this.since[id] // 조건이 풀리면 다시 처음부터 잽니다.
        continue
      }
      this.since[id] ??= now
      const lasted = now - (this.since[id] ?? now)
      const last = this.lastShown[id]
      const cooledDown = last === undefined || now - last >= this.options.cooldownMs
      if (result === null && lasted >= thresholds[id] && cooledDown) {
        this.lastShown[id] = now
        this.since[id] = now // 안내를 낸 뒤에는 다시 그만큼 지속될 때까지 기다립니다.
        result = { id, message: MESSAGES[id] }
      }
    }
    return result
  }
}
