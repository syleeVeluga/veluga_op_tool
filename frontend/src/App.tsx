import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { DashboardLayout } from './layouts/DashboardLayout'
import { UserLogPage } from './pages/UserLogPage'
import { ServiceLogPage } from './pages/ServiceLogPage'
import { AdminPage } from './pages/AdminPage'
import { LoginPage } from './pages/LoginPage'

function AppRoutes() {
    const { authUser, authToken } = useAuth()
    
    // If not authenticated, show Login
    if (!authToken || !authUser) {
        return <LoginPage />
    }
    
    return (
        <Routes>
            <Route element={<DashboardLayout />}>
                <Route path="/" element={<UserLogPage />} />
              <Route path="/service-logs" element={<ServiceLogPage />} />
                <Route path="/admin/users" element={<AdminPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
        </Routes>
    )
}

function App() {
  const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'

  return (
    <BrowserRouter basename={basename}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
