import { BASELINE_SECONDS } from './config.ts'
import type { NonverbalAnalyzer } from './NonverbalAnalyzer.ts'
import { computeBaseline } from './summarize.ts'
import type { BaselineResult } from './types.ts'

interface Options {
  /** 0~1 진행률 (측정 중 화면에 막대로 보여 줄 때) */
  onProgress?: (progress: number) => void
  /** 취소하면 null 로 끝납니다 (화면을 떠날 때 등). */
  signal?: AbortSignal
  seconds?: number
}

/**
 * 이미 돌고 있는 분석기에서 3초 동안의 프레임을 모아 기준 자세를 만듭니다.
 * 취소되면 null, 얼굴이 충분히 보이지 않으면 { ok: false } 를 돌려줍니다.
 */
export async function measureBaseline(analyzer: NonverbalAnalyzer, { onProgress, signal, seconds = BASELINE_SECONDS }: Options = {}): Promise<BaselineResult | null> {
  const startIndex = analyzer.sampleCount
  const startedAt = performance.now()
  const total = seconds * 1000

  await new Promise<void>((resolve) => {
    const step = () => {
      const elapsed = performance.now() - startedAt
      onProgress?.(Math.min(1, elapsed / total))
      if (signal?.aborted || elapsed >= total) return resolve()
      window.setTimeout(step, 100)
    }
    step()
  })

  if (signal?.aborted) return null
  return computeBaseline(analyzer.samplesSince(startIndex))
}
