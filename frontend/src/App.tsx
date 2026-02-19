import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { DashboardLayout } from './layouts/DashboardLayout'
import { UserLogPage } from './pages/UserLogPage'
import { ServiceLogPage } from './pages/ServiceLogPage'
import { BatchLogPage } from './pages/PartnerLogPage'
import { AdminPage } from './pages/AdminPage'
import { LoginPage } from './pages/LoginPage'

function AccessDeniedPage() {
  return <div className="text-sm text-red-600">접근 권한이 없습니다.</div>
}

function AppRoutes() {
    const { authUser, authToken } = useAuth()

    const isAdmin = authUser?.role === 'super_admin' || authUser?.role === 'admin'
    const hasPartnerMenuAccess =
      authUser?.allowedMenus?.includes('batch-logs') ||
      authUser?.allowedMenus?.includes('partner-logs') ||
      isAdmin
    const hasPartnerDataAccess = authUser?.allowedDataTypes?.includes('conversations') ?? isAdmin
    const canAccessPartnerLogs = hasPartnerMenuAccess && hasPartnerDataAccess
    
    // If not authenticated, show Login
    if (!authToken || !authUser) {
        return <LoginPage />
    }
    
    return (
        <Routes>
            <Route element={<DashboardLayout />}>
                <Route path="/" element={<UserLogPage />} />
                <Route path="/service-logs" element={<ServiceLogPage />} />
                <Route
                  path="/batch-logs"
                  element={canAccessPartnerLogs ? <BatchLogPage /> : <AccessDeniedPage />}
                />
                <Route path="/partner-logs" element={<Navigate to="/batch-logs" replace />} />
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
