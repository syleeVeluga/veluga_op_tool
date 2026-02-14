import { Outlet } from 'react-router-dom'
import { Sidebar } from '../components/Sidebar'

export function DashboardLayout() {
  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar />
      <div className="flex-1 overflow-auto">
        <main className="min-h-screen p-6">
            <Outlet />
        </main>
      </div>
    </div>
  )
}
