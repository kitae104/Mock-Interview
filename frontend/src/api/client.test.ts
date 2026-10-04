import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError, AUTH_EXPIRED_EVENT, tokenStorage } from './client.ts'

// node 환경이라 브라우저 전역(localStorage, window, fetch)을 가짜로 채웁니다.
let storage: Map<string, string>
let fetchMock: ReturnType<typeof vi.fn>
let dispatched: Event[]

function lastRequest() {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit & { headers: Headers }]
  return { url, init, headers: init.headers }
}

beforeEach(() => {
  storage = new Map()
  dispatched = []
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, v),
    removeItem: (k: string) => void storage.delete(k),
  })
  vi.stubGlobal('window', { dispatchEvent: (e: Event) => dispatched.push(e) })
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('api() 의 Content-Type', () => {
  it('FormData 본문에는 Content-Type 을 넣지 않는다 (multipart 경계는 브라우저가 정함)', async () => {
    const form = new FormData()
    form.append('audio', new Blob(['abc'], { type: 'audio/webm' }), 'answer.webm')
    form.append('durationMs', '1234')

    await api('/api/interviews/1/questions/2/answer', { method: 'POST', body: form })

    const { init, headers } = lastRequest()
    expect(headers.has('Content-Type')).toBe(false)
    expect(init.body).toBe(form) // 본문을 JSON 문자열 등으로 바꾸지 않고 그대로 보낸다
    expect(init.method).toBe('POST')
  })

  it('JSON 문자열 본문에는 application/json 을 넣는다', async () => {
    await api('/api/ai/chat', { method: 'POST', body: JSON.stringify({ message: '안녕' }) })
    expect(lastRequest().headers.get('Content-Type')).toBe('application/json')
  })

  it('본문이 없는 요청(GET)에는 넣지 않는다', async () => {
    await api('/api/interviews')
    expect(lastRequest().headers.has('Content-Type')).toBe(false)
  })

  it('호출한 쪽이 정한 Content-Type 은 바꾸지 않는다', async () => {
    await api('/x', { method: 'POST', body: 'a=1', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
    expect(lastRequest().headers.get('Content-Type')).toBe('application/x-www-form-urlencoded')
  })
})

describe('api() 의 인증과 응답 처리', () => {
  it('토큰이 있으면 FormData 요청에도 Authorization 을 붙인다', async () => {
    tokenStorage.set('abc.def.ghi')
    await api('/upload', { method: 'POST', body: new FormData() })
    const { headers } = lastRequest()
    expect(headers.get('Authorization')).toBe('Bearer abc.def.ghi')
    expect(headers.has('Content-Type')).toBe(false)
  })

  it('204 는 undefined', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    expect(await api('/x', { method: 'DELETE' })).toBeUndefined()
  })

  it('오류 응답은 ApiError(상태, 메시지, 필드별 오류)로 던진다', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 400, message: '입력값을 확인해 주세요.', errors: { durationMs: '0 이상이어야 합니다.' } }), {
        status: 400,
      }),
    )
    const error = await api('/x', { method: 'POST', body: new FormData() }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(400)
    expect((error as ApiError).message).toBe('입력값을 확인해 주세요.')
    expect((error as ApiError).errors).toEqual({ durationMs: '0 이상이어야 합니다.' })
  })

  it('본문이 JSON 이 아닌 오류도 기본 문구로 던진다', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>Bad Gateway</html>', { status: 502 }))
    const error = (await api('/x').catch((e: unknown) => e)) as ApiError
    expect(error.status).toBe(502)
    expect(error.message).toBe('요청을 처리하지 못했습니다.')
  })

  it('토큰을 보냈는데 401 이면 토큰을 지우고 만료 이벤트를 알린다', async () => {
    tokenStorage.set('expired')
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ status: 401, message: '인증이 필요합니다.' }), { status: 401 }))
    await api('/x').catch(() => {})
    expect(tokenStorage.get()).toBeNull()
    expect(dispatched.map((e) => e.type)).toEqual([AUTH_EXPIRED_EVENT])
  })
})
