import { api } from './client.ts'

export interface User {
  id: number
  email: string
  name: string
  role: 'USER' | 'ADMIN'
  createdAt: string
}

export interface TokenResponse {
  accessToken: string
  tokenType: string
  expiresIn: number
  user: User
}

export interface SignupInput {
  email: string
  password: string
  name: string
}

export interface LoginInput {
  email: string
  password: string
}

export const authApi = {
  signup: (input: SignupInput) => api<User>('/api/auth/signup', { method: 'POST', body: JSON.stringify(input) }),
  login: (input: LoginInput) => api<TokenResponse>('/api/auth/login', { method: 'POST', body: JSON.stringify(input) }),
  me: () => api<User>('/api/users/me'),
}
