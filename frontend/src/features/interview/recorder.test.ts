import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AnswerRecorder, isRecordingSupported, pickAudioMimeType } from './recorder.ts'

// node 환경이라 MediaRecorder, MediaStream 을 가짜로 채웁니다.
let supported: Set<string>
let created: FakeRecorder[]

class FakeRecorder {
  static isTypeSupported = (type: string) => supported.has(type)
  state: 'inactive' | 'recording' = 'inactive'
  mimeType: string
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  onerror: (() => void) | null = null
  startedWith: number | undefined
  stream: unknown
  options: { mimeType: string; audioBitsPerSecond: number }

  constructor(stream: unknown, options: { mimeType: string; audioBitsPerSecond: number }) {
    this.stream = stream
    this.options = options
    this.mimeType = options.mimeType
    created.push(this)
  }

  start(timeslice?: number) {
    this.state = 'recording'
    this.startedWith = timeslice
  }

  stop() {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['abc', 'def']) })
    this.onstop?.()
  }
}

class FakeMediaStream {
  tracks: unknown[]

  constructor(tracks: unknown[]) {
    this.tracks = tracks
  }
}

const track = (readyState: 'live' | 'ended' = 'live') => ({ kind: 'audio', readyState })
const streamWith = (audioTracks: unknown[]) => ({ getAudioTracks: () => audioTracks, getVideoTracks: () => [{ kind: 'video' }] }) as unknown as MediaStream

beforeEach(() => {
  supported = new Set(['audio/webm;codecs=opus', 'audio/webm'])
  created = []
  vi.stubGlobal('MediaRecorder', FakeRecorder)
  vi.stubGlobal('MediaStream', FakeMediaStream)
  vi.stubGlobal('window', globalThis)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('pickAudioMimeType', () => {
  it('webm/opus 를 가장 먼저 고른다', () => {
    supported = new Set(['audio/mp4', 'audio/webm', 'audio/webm;codecs=opus'])
    expect(pickAudioMimeType()).toBe('audio/webm;codecs=opus')
  })

  it('opus 가 안 되면 webm, 그것도 안 되면 mp4 순서', () => {
    supported = new Set(['audio/webm', 'audio/mp4'])
    expect(pickAudioMimeType()).toBe('audio/webm')
    supported = new Set(['audio/mp4'])
    expect(pickAudioMimeType()).toBe('audio/mp4')
    supported = new Set(['audio/mp4;codecs=mp4a.40.2', 'audio/mp4'])
    expect(pickAudioMimeType()).toBe('audio/mp4;codecs=mp4a.40.2')
  })

  it('지원하는 형식이 없거나 MediaRecorder 가 없으면 null', () => {
    supported = new Set()
    expect(pickAudioMimeType()).toBeNull()
    vi.stubGlobal('MediaRecorder', undefined)
    expect(isRecordingSupported()).toBe(false)
    expect(pickAudioMimeType()).toBeNull()
  })
})

describe('AnswerRecorder', () => {
  it('지원하지 않는 브라우저에서는 한국어 안내와 함께 만들 수 없다', () => {
    supported = new Set()
    expect(() => new AnswerRecorder(streamWith([track()]))).toThrow('지원하지 않아요')
  })

  it('마이크 트랙이 없거나 이미 끝났으면 만들 수 없다', () => {
    expect(() => new AnswerRecorder(streamWith([]))).toThrow('마이크')
    expect(() => new AnswerRecorder(streamWith([track('ended')]))).toThrow('마이크')
  })

  it('오디오 트랙만 담은 스트림으로 녹음한다 (영상은 섞이지 않음)', () => {
    const live = track()
    const recorder = new AnswerRecorder(streamWith([live]))
    recorder.start()
    const [fake] = created
    expect((fake.stream as FakeMediaStream).tracks).toEqual([live])
    expect(fake.options).toEqual({ mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 64_000 })
    expect(fake.startedWith).toBe(1000)
    expect(recorder.isRecording).toBe(true)
  })

  it('stop() 하면 녹음한 Blob 과 시간을 돌려준다', async () => {
    vi.useFakeTimers()
    const recorder = new AnswerRecorder(streamWith([track()]))
    recorder.start()
    await vi.advanceTimersByTimeAsync(3500)
    const result = await recorder.stop()
    expect(result.mimeType).toBe('audio/webm;codecs=opus')
    expect(result.blob.type).toBe('audio/webm;codecs=opus')
    expect(result.blob.size).toBe(6)
    expect(result.durationMs).toBeGreaterThanOrEqual(3500)
    expect(result.timedOut).toBe(false)
    expect(recorder.isRecording).toBe(false)
  })

  it('최대 시간이 되면 자동으로 끝나고 timedOut 이다', async () => {
    vi.useFakeTimers()
    const recorder = new AnswerRecorder(streamWith([track()]))
    recorder.start({ maxSeconds: 10 })
    await vi.advanceTimersByTimeAsync(9_900)
    expect(recorder.isRecording).toBe(true)
    await vi.advanceTimersByTimeAsync(200)
    expect(recorder.isRecording).toBe(false)
    const result = await recorder.result
    expect(result.timedOut).toBe(true)
    expect(result.durationMs).toBeGreaterThanOrEqual(10_000)
    // 자동으로 끝난 뒤에 stop() 해도 같은 결과
    expect(await recorder.stop()).toBe(result)
  })

  it('녹음 중 경과 시간을 알려 준다', async () => {
    vi.useFakeTimers()
    const ticks: number[] = []
    const recorder = new AnswerRecorder(streamWith([track()]))
    recorder.start({ onTick: (ms) => ticks.push(ms) })
    await vi.advanceTimersByTimeAsync(1000)
    expect(ticks.length).toBe(5) // 0.2초마다
    expect(ticks.at(-1)).toBeGreaterThanOrEqual(1000)
    await recorder.stop()
    const count = ticks.length
    await vi.advanceTimersByTimeAsync(1000)
    expect(ticks.length).toBe(count) // 끝난 뒤에는 더 알리지 않는다
  })

  it('두 번 시작할 수 없고, 시작하지 않고 결과를 기다리면 거절된다', async () => {
    const recorder = new AnswerRecorder(streamWith([track()]))
    await expect(recorder.result).rejects.toThrow('시작하지 않았어요')
    recorder.start()
    expect(() => recorder.start()).toThrow('이미 녹음 중')
  })

  it('cancel() 하면 녹음을 멈춘다', () => {
    const recorder = new AnswerRecorder(streamWith([track()]))
    recorder.start({ maxSeconds: 5 })
    recorder.cancel()
    expect(recorder.isRecording).toBe(false)
  })
})
