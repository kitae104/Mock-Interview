import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.tsx'
import { site } from '../config/site.ts'
import { cn } from '../lib/cn.ts'
import Logo from './Logo.tsx'
import Button from './ui/Button.tsx'
import { buttonClass } from './ui/styles.ts'

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn('text-sm font-medium', isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground')

// 취업 도우미 아래 화면(이력서·자기소개서·포트폴리오)에서도 메뉴를 활성으로 표시합니다.
const CAREER_PATHS = ['/career', '/resumes', '/cover-letters', '/portfolios']

const YEAR = new Date().getFullYear()

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const careerNavClass = () => navClass({ isActive: CAREER_PATHS.some((p) => pathname.startsWith(p)) })

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" aria-label={`${site.name} 홈`} className="shrink-0">
            <Logo />
          </Link>
          <nav className="ml-4 flex items-center gap-5 overflow-x-auto whitespace-nowrap">
            {user ? (
              <>
                <NavLink to="/dashboard" className={navClass}>
                  대시보드
                </NavLink>
                <NavLink to="/interviews" className={navClass}>
                  모의 면접
                </NavLink>
                <NavLink to="/chat" className={navClass}>
                  면접 코치에게 묻기
                </NavLink>
                <NavLink to="/career" className={careerNavClass}>
                  취업 도우미
                </NavLink>
                <NavLink to="/guide" className={navClass}>
                  준비 가이드
                </NavLink>
                <NavLink to="/how-to" className={navClass}>
                  이용 가이드
                </NavLink>
                <Button variant="outline" size="sm" onClick={handleLogout}>
                  로그아웃
                </Button>
              </>
            ) : (
              <>
                <NavLink to="/guide" className={navClass}>
                  준비 가이드
                </NavLink>
                <NavLink to="/how-to" className={navClass}>
                  이용 가이드
                </NavLink>
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
