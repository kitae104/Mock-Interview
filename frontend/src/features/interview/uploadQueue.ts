// 답변 업로드 대기열: 한 번에 하나씩 보내고, 실패하면 자동으로 다시 보냅니다 (docs/PLAN.md 8장 ⑤).
// 면접 진행 화면은 업로드를 기다리지 않고 바로 다음 질문으로 가므로, 업로드는 이 대기열이 뒤에서 처리합니다.

export type UploadStatus = 'queued' | 'uploading' | 'retrying' | 'done' | 'failed'

export interface UploadItem {
  questionId: number
  status: UploadStatus
  /** 지금까지 보낸 횟수 */
  attempts: number
  /** 끝까지 실패했을 때의 이유 (화면에 보여 줄 문장) */
  error: string | null
}

export interface UploadQueueOptions {
  /** 처음 시도 외에 자동으로 다시 시도하는 최대 횟수. 기본 2 (최대 3번 보냄) */
  maxRetries?: number
  /** 재시도 전에 기다리는 시간(ms). attempts 번째 실패 뒤에 retryDelaysMs[attempts - 1] 만큼 기다립니다. */
  retryDelaysMs?: number[]
  /** 이 오류는 다시 시도할 가치가 있는가 (서버 오류, 네트워크 문제). 아니면 바로 실패로 처리합니다. */
  shouldRetry?: (error: unknown) => boolean
}

/**
 * 서버 오류(5xx)나 호출 한도(429), 네트워크 문제는 다시 보내면 될 수 있습니다.
 * 형식·크기·권한·상태 오류(400, 404, 409, 413 …)는 같은 요청을 반복해도 같은 결과라서 다시 시도하지 않습니다.
 */
export function isRetryableUploadError(error: unknown): boolean {
  const status = typeof error === 'object' && error !== null && 'status' in error ? Number((error as { status: unknown }).status) : NaN
  if (Number.isNaN(status)) return true // 응답을 받지 못함(네트워크 오류 등)
  return status >= 500 || status === 429
}

type Listener = () => void

interface Entry<P> {
  item: UploadItem
  payload: P
  timer: number | null
  /** add() 로 내용이 바뀔 때마다 올립니다. 이전 내용을 보내던 시도의 결과는 이 번호가 다르면 버립니다. */
  generation: number
}

/**
 * P: 보낼 내용(녹음 Blob 등). 순서대로 하나씩 보냅니다. 끝까지 실패한 것은 내용을 보관해 두었다가 retry() 로 다시 보냅니다.
 * React 에서는 useSyncExternalStore(queue.subscribe, queue.getSnapshot) 로 상태를 읽습니다.
 */
export class UploadQueue<P> {
  private readonly send: (questionId: number, payload: P) => Promise<unknown>
  private readonly maxRetries: number
  private readonly delays: number[]
  private readonly shouldRetry: (error: unknown) => boolean
  private entries: Entry<P>[] = []
  private listeners = new Set<Listener>()
  private snapshot: readonly UploadItem[] = []
  private disposed = false
  private running = false
  /** 지금 서버로 보내는 중인 항목 */
  private inflight = new Set<Entry<P>>()

  constructor(send: (questionId: number, payload: P) => Promise<unknown>, options: UploadQueueOptions = {}) {
    this.send = send
    this.maxRetries = options.maxRetries ?? 2
    this.delays = options.retryDelaysMs ?? [2000, 4000]
    this.shouldRetry = options.shouldRetry ?? isRetryableUploadError
  }

  /** 대기열에 넣습니다. 같은 질문이 이미 있으면 새 내용으로 바꿉니다(다시 답변한 경우). */
  add(questionId: number, payload: P): void {
    const existing = this.entries.find((e) => e.item.questionId === questionId)
    if (existing) {
      if (existing.timer !== null) window.clearTimeout(existing.timer)
      existing.payload = payload
      existing.timer = null
      existing.generation++
      existing.item = { questionId, status: 'queued', attempts: 0, error: null }
    } else {
      this.entries.push({ item: { questionId, status: 'queued', attempts: 0, error: null }, payload, timer: null, generation: 0 })
    }
    this.emit()
    void this.pump()
  }

  /** 끝까지 실패한 질문을 처음부터 다시 보냅니다(자동 재시도 횟수도 새로 셉니다). */
  retry(questionId: number): void {
    const entry = this.entries.find((e) => e.item.questionId === questionId)
    if (!entry || entry.item.status !== 'failed') return
    entry.item = { questionId, status: 'queued', attempts: 0, error: null }
    this.emit()
    void this.pump()
  }

  retryAll(): void {
    for (const e of this.entries) if (e.item.status === 'failed') this.retry(e.item.questionId)
  }

  /** 대기·재시도 타이머를 모두 멈추고 더 이상 보내지 않습니다 (화면을 떠날 때). resume() 으로 다시 시작할 수 있습니다. */
  dispose(): void {
    this.disposed = true
    for (const e of this.entries) {
      if (e.timer !== null) window.clearTimeout(e.timer)
      e.timer = null
    }
  }

  /**
   * dispose() 한 대기열을 다시 시작합니다. React StrictMode 는 마운트 직후 effect 의 정리 함수를 한 번 부른 뒤 다시 실행하므로,
   * dispose() 가 영구적이면 개발 서버에서 업로드가 시작되지 않습니다. 멈춰 있던 항목은 대기 상태로 되돌려 이어서 보냅니다.
   */
  resume(): void {
    if (!this.disposed) return
    this.disposed = false
    for (const e of this.entries) {
      const stalled = e.item.status === 'retrying' || (e.item.status === 'uploading' && !this.inflight.has(e))
      if (stalled) e.item = { ...e.item, status: 'queued' }
    }
    this.emit()
    void this.pump()
  }

  // useSyncExternalStore 용 (화살표 함수라 this 가 고정됩니다)
  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): readonly UploadItem[] => this.snapshot

  private emit(): void {
    this.snapshot = this.entries.map((e) => e.item)
    for (const listener of this.listeners) listener()
  }

  private update(entry: Entry<P>, patch: Partial<UploadItem>): void {
    entry.item = { ...entry.item, ...patch }
    this.emit()
  }

  private async pump(): Promise<void> {
    if (this.running || this.disposed) return
    this.running = true
    try {
      for (let entry = this.next(); entry && !this.disposed; entry = this.next()) {
        await this.attempt(entry)
      }
    } finally {
      this.running = false
    }
  }

  private next(): Entry<P> | undefined {
    return this.entries.find((e) => e.item.status === 'queued')
  }

  private async attempt(entry: Entry<P>): Promise<void> {
    const generation = entry.generation
    this.update(entry, { status: 'uploading', attempts: entry.item.attempts + 1 })
    this.inflight.add(entry)
    try {
      await this.send(entry.item.questionId, entry.payload)
      if (this.disposed || entry.generation !== generation) return // 그 사이 내용이 바뀐 답변의 결과는 버립니다 (바뀐 내용은 이어서 보냅니다).
      this.update(entry, { status: 'done', error: null })
    } catch (error) {
      if (this.disposed || entry.generation !== generation) return
      const { attempts, questionId } = entry.item
      if (this.shouldRetry(error) && attempts <= this.maxRetries) {
        // 잠깐 쉬었다가 다시 대기열로: 기다리는 동안 다른 질문의 업로드가 먼저 진행됩니다.
        this.update(entry, { status: 'retrying' })
        const delay = this.delays[Math.min(attempts - 1, this.delays.length - 1)] ?? 2000
        entry.timer = window.setTimeout(() => {
          entry.timer = null
          if (this.disposed || entry.generation !== generation || entry.item.questionId !== questionId || entry.item.status !== 'retrying') return
          this.update(entry, { status: 'queued' })
          void this.pump()
        }, delay)
      } else {
        this.update(entry, { status: 'failed', error: error instanceof Error ? error.message : '전송하지 못했어요.' })
      }
    } finally {
      this.inflight.delete(entry)
    }
  }
}
