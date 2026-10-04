import { type FormEvent, useEffect, useRef, useState } from 'react'
import { aiApi } from '../api/ai.ts'
import { ApiError } from '../api/client.ts'
import { cn } from '../lib/cn.ts'
import Alert from './ui/Alert.tsx'
import Button from './ui/Button.tsx'
import Input from './ui/Input.tsx'
import { cardClass } from './ui/styles.ts'

interface Message {
  role: 'user' | 'assistant'
  text: string
}

// AI 채팅 화면 본문 (POST /api/ai/chat). React 는 pages/ChatPage.tsx, Next 는 app/(protected)/chat/page.tsx 가 감쌉니다.
export default function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || sending) return
    setMessages((prev) => [...prev, { role: 'user', text }])
    setInput('')
    setSending(true)
    setError(null)
    try {
      const { reply } = await aiApi.chat(text)
      setMessages((prev) => [...prev, { role: 'assistant', text: reply }])
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '요청을 처리하지 못했습니다.')
    } finally {
      setSending(false)
    }
  }

  const handleReset = async () => {
    await aiApi.reset().catch(() => undefined)
    setMessages([])
    setError(null)
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-3xl flex-col px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">AI 채팅</h1>
        <Button variant="outline" size="sm" onClick={handleReset}>
          새 대화
        </Button>
      </div>
      <div className={cn(cardClass, 'mt-6 flex-1 space-y-3 overflow-y-auto p-4')}>
        {messages.length === 0 && <p className="text-sm text-muted-foreground">무엇이든 물어보세요.</p>}
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <p
              className={cn(
                'max-w-[80%] whitespace-pre-wrap rounded-control px-3 py-2 text-sm',
                m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
              )}
            >
              {m.text}
            </p>
          </div>
        ))}
        {sending && <p className="text-sm text-muted-foreground">답변을 기다리는 중…</p>}
        <div ref={bottomRef} />
      </div>
      {error && <Alert className="mt-3">{error}</Alert>}
      <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
        <Input
          className="flex-1"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="메시지를 입력하세요"
        />
        <Button type="submit" disabled={sending || !input.trim()}>
          보내기
        </Button>
      </form>
    </div>
  )
}
