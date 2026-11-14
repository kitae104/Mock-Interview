import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import ProtectedRoute from './auth/ProtectedRoute.tsx'
import Layout from './components/Layout.tsx'
import DashboardPage from './pages/DashboardPage.tsx'
import InterviewCheckPage from './pages/InterviewCheckPage.tsx'
import InterviewGuidePage from './pages/InterviewGuidePage.tsx'
import InterviewDetailPage from './pages/InterviewDetailPage.tsx'
import InterviewListPage from './pages/InterviewListPage.tsx'
import InterviewNewPage from './pages/InterviewNewPage.tsx'
import InterviewResultPage from './pages/InterviewResultPage.tsx'
import InterviewRunPage from './pages/InterviewRunPage.tsx'
import LandingPage from './pages/LandingPage.tsx'
import LoginPage from './pages/LoginPage.tsx'
import NotFoundPage from './pages/NotFoundPage.tsx'
import SignupPage from './pages/SignupPage.tsx'
import UsageGuidePage from './pages/UsageGuidePage.tsx'
import CareerHubPage from './pages/CareerHubPage.tsx'
import ChatPage from './pages/ChatPage.tsx'
import CoverLetterEditPage from './pages/CoverLetterEditPage.tsx'
import CoverLetterListPage from './pages/CoverLetterListPage.tsx'
import PortfolioEditPage from './pages/PortfolioEditPage.tsx'
import PortfolioListPage from './pages/PortfolioListPage.tsx'
import ResumeEditPage from './pages/ResumeEditPage.tsx'
import ResumeListPage from './pages/ResumeListPage.tsx'

// 비언어 분석 확인용 화면은 개발 서버에서만 등록합니다 (운영 빌드에는 코드도 들어가지 않습니다).
const DevAnalyzerPage = import.meta.env.DEV ? lazy(() => import('./pages/DevAnalyzerPage.tsx')) : null

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<LandingPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="signup" element={<SignupPage />} />
        <Route path="guide" element={<InterviewGuidePage />} />
        <Route path="how-to" element={<UsageGuidePage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="interviews" element={<InterviewListPage />} />
          <Route path="interviews/new" element={<InterviewNewPage />} />
          <Route path="interviews/:id" element={<InterviewDetailPage />} />
          <Route path="interviews/:id/check" element={<InterviewCheckPage />} />
          <Route path="interviews/:id/run" element={<InterviewRunPage />} />
          <Route path="interviews/:id/result" element={<InterviewResultPage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="career" element={<CareerHubPage />} />
          <Route path="resumes" element={<ResumeListPage />} />
          <Route path="resumes/new" element={<ResumeEditPage />} />
          <Route path="resumes/:id" element={<ResumeEditPage />} />
          <Route path="cover-letters" element={<CoverLetterListPage />} />
          <Route path="cover-letters/new" element={<CoverLetterEditPage />} />
          <Route path="cover-letters/:id" element={<CoverLetterEditPage />} />
          <Route path="portfolios" element={<PortfolioListPage />} />
          <Route path="portfolios/new" element={<PortfolioEditPage />} />
          <Route path="portfolios/:id" element={<PortfolioEditPage />} />
          {DevAnalyzerPage && (
            <Route
              path="dev/analyzer"
              element={
                <Suspense fallback={<p className="px-6 py-12 text-sm text-muted-foreground">불러오는 중...</p>}>
                  <DevAnalyzerPage />
                </Suspense>
              }
            />
          )}
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
