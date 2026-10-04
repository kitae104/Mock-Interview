import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authApi } from '../api/auth.ts'
import { ApiError } from '../api/client.ts'
import { useAuth } from '../auth/AuthContext.tsx'
import Alert from '../components/ui/Alert.tsx'
import Button from '../components/ui/Button.tsx'
import Card from '../components/ui/Card.tsx'
import FormField from '../components/ui/FormField.tsx'
import { linkClass } from '../components/ui/styles.ts'

export default function SignupPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '', passwordConfirm: '' })
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setFieldErrors({})
    if (form.password !== form.passwordConfirm) {
      setFieldErrors({ passwordConfirm: '비밀번호가 일치하지 않습니다.' })
      return
    }
    setSubmitting(true)
    try {
      await authApi.signup({ name: form.name, email: form.email, password: form.password })
      await login({ email: form.email, password: form.password })
      navigate('/dashboard', { replace: true })
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
        setFieldErrors(err.errors)
      } else {
        setError('회원가입에 실패했습니다.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const update = (key: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [key]: e.target.value })

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-2xl font-bold">회원가입</h1>
      <Card className="mt-8">
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="이름" name="name" required value={form.name} onChange={update('name')} error={fieldErrors.name} />
          <FormField
            label="이메일"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={update('email')}
            error={fieldErrors.email}
          />
          <FormField
            label="비밀번호 (8자 이상)"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={form.password}
            onChange={update('password')}
            error={fieldErrors.password}
          />
          <FormField
            label="비밀번호 확인"
            name="passwordConfirm"
            type="password"
            autoComplete="new-password"
            required
            value={form.passwordConfirm}
            onChange={update('passwordConfirm')}
            error={fieldErrors.passwordConfirm}
          />
          {error && <Alert>{error}</Alert>}
          <Button type="submit" disabled={submitting} block>
            {submitting ? '가입 중...' : '가입하기'}
          </Button>
        </form>
      </Card>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        이미 계정이 있으신가요?{' '}
        <Link to="/login" className={linkClass}>
          로그인
        </Link>
      </p>
    </div>
  )
}
