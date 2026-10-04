import { api } from './client.ts'

export interface ChatReply {
  reply: string
}

export const aiApi = {
  chat: (message: string) => api<ChatReply>('/api/ai/chat', { method: 'POST', body: JSON.stringify({ message }) }),
  reset: () => api<void>('/api/ai/chat', { method: 'DELETE' }),
}
