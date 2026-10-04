import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.tsx'
import { site } from '../config/site.ts'
import { cn } from '../lib/cn.ts'
import Button from './ui/Button.tsx'
import { buttonClass } from './ui/styles.ts'

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn('text-sm font-medium', isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground')

const YEAR = new Date().getFullYear()

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="font-heading text-lg font-bold text-primary">
            {site.name}
          </Link>
          <nav className="flex items-center gap-6">
            {user ? (
              <>
                <NavLink to="/dashboard" className={navClass}>
                  대시보드
                </NavLink>
                <NavLink to="/chat" className={navClass}>
                  AI 채팅
                </NavLink>
                <Button variant="outline" size="sm" onClick={handleLogout}>
                  로그아웃
                </Button>
              </>
            ) : (
              <>
                <NavLink to="/login" className={navClass}>
                  로그인
                </NavLink>
                <Link to="/signup" className={buttonClass({ size: 'sm' })}>
                  회원가입
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        © {YEAR} {site.name}
      </footer>
    </div>
  )
}
