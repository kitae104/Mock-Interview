const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''
const TOKEN_KEY = 'accessToken'
export const AUTH_EXPIRED_EVENT = 'auth:expired'

export interface ApiErrorBody {
  status: number
  message: string
  errors?: Record<string, string>
}

export class ApiError extends Error {
  readonly status: number
  readonly errors: Record<string, string>

  constructor(body: ApiErrorBody) {
    super(body.message)
    this.status = body.status
    this.errors = body.errors ?? {}
  }
}

export const tokenStorage = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const token = tokenStorage.get()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers })
  if (!res.ok) {
    // 토큰을 보냈는데 401 이면 만료·무효 토큰: 지우고 AuthContext 에 알려 로그아웃 상태로 만듭니다.
    if (res.status === 401 && token) {
      tokenStorage.clear()
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
    }
    const body = (await res.json().catch(() => null)) as Partial<ApiErrorBody> | null
    throw new ApiError({
      status: body?.status ?? res.status,
      message: body?.message || '요청을 처리하지 못했습니다.',
      errors: body?.errors,
    })
  }
  if (res.status === 204) {
    return undefined as T
  }
  return (await res.json()) as T
}
