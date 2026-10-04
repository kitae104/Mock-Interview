import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isRetryableUploadError, UploadQueue, type UploadItem } from './uploadQueue.ts'

// 보내는 일을 가짜로 대신합니다. 호출 기록을 남기고, 정해 둔 순서대로 성공/실패를 돌려줍니다.
interface Call {
  questionId: number
  payload: string
}

function setup(results: ('ok' | { status?: number; message?: string })[] = [], options = {}) {
  const calls: Call[] = []
  const queue = new UploadQueue<string>(async (questionId, payload) => {
    calls.push({ questionId, payload })
    const result = results.shift() ?? 'ok'
    if (result !== 'ok') throw Object.assign(new Error(result.message ?? '실패'), { status: result.status })
  }, options)
  const states = () => queue.getSnapshot().map((i) => `${i.questionId}:${i.status}:${i.attempts}`)
  return { queue, calls, states }
}

const find = (items: readonly UploadItem[], id: number) => items.find((i) => i.questionId === id)

beforeEach(() => {
  vi.stubGlobal('window', globalThis)
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('isRetryableUploadError', () => {
  it('서버 오류, 호출 한도, 네트워크 오류는 다시 시도할 만하다', () => {
    expect(isRetryableUploadError({ status: 500 })).toBe(true)
    expect(isRetryableUploadError({ status: 502 })).toBe(true)
    expect(isRetryableUploadError({ status: 503 })).toBe(true)
    expect(isRetryableUploadError({ status: 429 })).toBe(true)
    expect(isRetryableUploadError(new TypeError('Failed to fetch'))).toBe(true) // status 없음 = 응답을 받지 못함
  })

  it('요청이 잘못된 오류는 반복해도 소용없다', () => {
    for (const status of [400, 401, 404, 409, 413]) expect(isRetryableUploadError({ status })).toBe(false)
  })
})

describe('UploadQueue', () => {
  it('성공하면 done 이 되고 한 번만 보낸다', async () => {
    const { queue, calls, states } = setup()
    queue.add(11, 'a')
    await vi.runAllTimersAsync()
    expect(states()).toEqual(['11:done:1'])
    expect(calls).toEqual([{ questionId: 11, payload: 'a' }])
  })

  it('여러 개는 넣은 순서대로 하나씩 보낸다', async () => {
    const order: string[] = []
    let release: () => void = () => {}
    const queue = new UploadQueue<string>(async (id) => {
      order.push(`start ${id}`)
      if (id === 1) await new Promise<void>((resolve) => (release = resolve))
      order.push(`end ${id}`)
    })
    queue.add(1, 'a')
    queue.add(2, 'b')
    queue.add(3, 'c')
    await vi.advanceTimersByTimeAsync(0)
    expect(order).toEqual(['start 1']) // 1번이 끝나기 전에는 2번을 시작하지 않는다
    expect(queue.getSnapshot().map((i) => i.status)).toEqual(['uploading', 'queued', 'queued'])
    release()
    await vi.runAllTimersAsync()
    expect(order).toEqual(['start 1', 'end 1', 'start 2', 'end 2', 'start 3', 'end 3'])
  })

  it('서버 오류는 2초, 4초 뒤에 자동으로 다시 보내고 성공하면 done', async () => {
    const { queue, calls, states } = setup([{ status: 502 }, { status: 502 }, 'ok'])
    queue.add(7, 'a')
    await vi.advanceTimersByTimeAsync(0)
    expect(states()).toEqual(['7:retrying:1'])
    expect(calls).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(1999)
    expect(calls).toHaveLength(1) // 아직 2초가 안 됨
    await vi.advanceTimersByTimeAsync(1)
    expect(calls).toHaveLength(2)
    expect(states()).toEqual(['7:retrying:2'])

    await vi.advanceTimersByTimeAsync(3999)
    expect(calls).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(calls).toHaveLength(3)
    expect(states()).toEqual(['7:done:3'])
  })

  it('자동 재시도는 최대 2회(총 3번)이고 그래도 실패하면 failed 와 이유를 남긴다', async () => {
    const { queue, calls, states } = setup(Array(5).fill({ status: 502, message: '음성을 텍스트로 바꾸지 못했습니다.' }))
    queue.add(7, 'a')
    await vi.runAllTimersAsync()
    expect(calls).toHaveLength(3)
    expect(states()).toEqual(['7:failed:3'])
    expect(find(queue.getSnapshot(), 7)?.error).toBe('음성을 텍스트로 바꾸지 못했습니다.')
  })

  it('다시 시도해도 소용없는 오류(400)는 바로 failed', async () => {
    const { queue, calls, states } = setup([{ status: 400, message: '지원하지 않는 오디오 형식입니다.' }])
    queue.add(7, 'a')
    await vi.runAllTimersAsync()
    expect(calls).toHaveLength(1)
    expect(states()).toEqual(['7:failed:1'])
  })

  it('재시도를 기다리는 동안 다음 질문의 업로드가 먼저 진행된다', async () => {
    const { queue, calls, states } = setup([{ status: 502 }, 'ok', 'ok'])
    queue.add(1, 'a')
    queue.add(2, 'b')
    await vi.advanceTimersByTimeAsync(0)
    expect(calls.map((c) => c.questionId)).toEqual([1, 2]) // 1번이 쉬는 동안 2번을 보낸다
    expect(states()).toEqual(['1:retrying:1', '2:done:1'])
    await vi.runAllTimersAsync()
    expect(states()).toEqual(['1:done:2', '2:done:1'])
  })

  it('retry() 는 failed 인 질문을 횟수를 새로 세어 다시 보낸다', async () => {
    const { queue, calls, states } = setup([{ status: 502 }, { status: 502 }, { status: 502 }, 'ok'])
    queue.add(5, '녹음 내용')
    await vi.runAllTimersAsync()
    expect(states()).toEqual(['5:failed:3'])

    queue.retry(5)
    expect(states()).toEqual(['5:uploading:1']) // 호출하자마자 처음부터 다시 보내기 시작한다(횟수는 새로 센다)
    await vi.runAllTimersAsync()
    expect(states()).toEqual(['5:done:1'])
    expect(calls.at(-1)).toEqual({ questionId: 5, payload: '녹음 내용' }) // 보관해 둔 같은 내용을 보낸다
  })

  it('retry() 는 failed 가 아닌 질문에는 아무 일도 하지 않는다', async () => {
    const { queue, calls } = setup()
    queue.add(5, 'a')
    await vi.runAllTimersAsync()
    queue.retry(5)
    queue.retry(999)
    await vi.runAllTimersAsync()
    expect(calls).toHaveLength(1)
  })

  it('retryAll() 은 실패한 것만 모두 다시 보낸다', async () => {
    const { queue, calls, states } = setup([{ status: 400 }, 'ok', { status: 400 }, 'ok', 'ok'])
    queue.add(1, 'a')
    queue.add(2, 'b')
    queue.add(3, 'c')
    await vi.runAllTimersAsync()
    expect(states()).toEqual(['1:failed:1', '2:done:1', '3:failed:1'])
    queue.retryAll()
    await vi.runAllTimersAsync()
    expect(states()).toEqual(['1:done:1', '2:done:1', '3:done:1'])
    expect(calls.map((c) => c.questionId)).toEqual([1, 2, 3, 1, 3])
  })

  it('같은 질문을 다시 넣으면 새 내용으로 바꿔 처음부터 보낸다', async () => {
    const { queue, calls } = setup([{ status: 502 }])
    queue.add(1, '처음 녹음')
    await vi.advanceTimersByTimeAsync(0) // retrying 상태
    queue.add(1, '다시 녹음')
    await vi.runAllTimersAsync()
    expect(calls.map((c) => c.payload)).toEqual(['처음 녹음', '다시 녹음'])
    expect(queue.getSnapshot()).toHaveLength(1)
    expect(queue.getSnapshot()[0].status).toBe('done')
  })

  it('상태가 바뀔 때마다 구독자에게 알리고, 해제하면 알리지 않는다', async () => {
    const { queue } = setup()
    const listener = vi.fn()
    const unsubscribe = queue.subscribe(listener)
    queue.add(1, 'a')
    await vi.runAllTimersAsync()
    expect(listener).toHaveBeenCalled()
    const count = listener.mock.calls.length
    unsubscribe()
    queue.add(2, 'b')
    await vi.runAllTimersAsync()
    expect(listener.mock.calls.length).toBe(count)
  })

  it('상태 스냅샷은 바뀌기 전에는 같은 객체다 (useSyncExternalStore 용)', async () => {
    const { queue } = setup()
    queue.add(1, 'a')
    await vi.runAllTimersAsync()
    expect(queue.getSnapshot()).toBe(queue.getSnapshot())
  })

  it('dispose() 하면 기다리던 재시도를 보내지 않는다', async () => {
    const { queue, calls } = setup([{ status: 502 }])
    queue.add(1, 'a')
    await vi.advanceTimersByTimeAsync(0)
    queue.dispose()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(calls).toHaveLength(1)
    queue.add(2, 'b') // 해제한 뒤에 넣어도 보내지 않는다
    await vi.advanceTimersByTimeAsync(10_000)
    expect(calls).toHaveLength(1)
  })

  it('재시도 횟수와 대기 시간을 바꿀 수 있다', async () => {
    const { queue, calls, states } = setup(Array(3).fill({ status: 500 }), { maxRetries: 1, retryDelaysMs: [500] })
    queue.add(1, 'a')
    await vi.advanceTimersByTimeAsync(499)
    expect(calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(calls).toHaveLength(2)
    await vi.runAllTimersAsync()
    expect(calls).toHaveLength(2) // 재시도 1회까지만
    expect(states()).toEqual(['1:failed:2'])
  })
})
