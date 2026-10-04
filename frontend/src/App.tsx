import { Route, Routes } from 'react-router-dom'
import ProtectedRoute from './auth/ProtectedRoute.tsx'
import Layout from './components/Layout.tsx'
import DashboardPage from './pages/DashboardPage.tsx'
import InterviewCheckPage from './pages/InterviewCheckPage.tsx'
import InterviewDetailPage from './pages/InterviewDetailPage.tsx'
import InterviewListPage from './pages/InterviewListPage.tsx'
import InterviewNewPage from './pages/InterviewNewPage.tsx'
import InterviewRunPage from './pages/InterviewRunPage.tsx'
import LandingPage from './pages/LandingPage.tsx'
import LoginPage from './pages/LoginPage.tsx'
import NotFoundPage from './pages/NotFoundPage.tsx'
import SignupPage from './pages/SignupPage.tsx'
import ChatPage from './pages/ChatPage.tsx'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<LandingPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="signup" element={<SignupPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="interviews" element={<InterviewListPage />} />
          <Route path="interviews/new" element={<InterviewNewPage />} />
          <Route path="interviews/:id" element={<InterviewDetailPage />} />
          <Route path="interviews/:id/check" element={<InterviewCheckPage />} />
          <Route path="interviews/:id/run" element={<InterviewRunPage />} />
          <Route path="chat" element={<ChatPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
