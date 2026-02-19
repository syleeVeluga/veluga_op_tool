import { NavLink } from 'react-router-dom'
import { LayoutDashboard, MessageSquareText, Database, UserCog, LogOut } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

export function Sidebar() {
  const { authUser, logout } = useAuth()
  const isAdmin = authUser?.role === 'super_admin' || authUser?.role === 'admin'
  const hasPartnerMenuAccess =
    authUser?.allowedMenus?.includes('batch-logs') ||
    authUser?.allowedMenus?.includes('partner-logs') ||
    isAdmin
  const hasPartnerDataAccess =
    authUser?.allowedDataTypes?.includes('conversations') ?? isAdmin
  const canAccessPartnerLogs = hasPartnerMenuAccess && hasPartnerDataAccess

  return (
    <div className="flex h-screen w-64 flex-col border-r bg-slate-900 text-white flex-shrink-0">
      <div className="flex h-16 items-center border-b border-slate-700 px-6 font-bold text-lg">
        Log Dashboard
      </div>

      <nav className="flex-1 space-y-1 p-4 overflow-y-auto">
        <div className="mb-2 px-2 text-xs font-semibold text-slate-400 uppercase">
          User Account
        </div>
        <NavLink
          to="/"
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              isActive ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`
          }
        >
          <LayoutDashboard size={18} />
          사용자 로그
        </NavLink>
        <NavLink
          to="/service-logs"
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              isActive ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`
          }
        >
          <MessageSquareText size={18} />
          서비스 로그
        </NavLink>

        {canAccessPartnerLogs && (
          <NavLink
            to="/batch-logs"
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <Database size={18} />
            대량 배치 로그
          </NavLink>
        )}

        {isAdmin && (
          <>
            <div className="mt-6 mb-2 px-2 text-xs font-semibold text-slate-400 uppercase">
              Admin
            </div>
            <NavLink
              to="/admin/users"
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <UserCog size={18} />
              사용자 관리
            </NavLink>
          </>
        )}
      </nav>

      <div className="border-t border-slate-700 p-4">
        <div className="mb-2 flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300">
                {authUser?.name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="overflow-hidden">
                <div className="truncate text-sm font-medium text-white">{authUser?.name}</div>
                <div className="truncate text-xs text-slate-400">{authUser?.email}</div>
            </div>
        </div>
        <button
          onClick={logout}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <LogOut size={14} />
          로그아웃
        </button>
      </div>
    </div>
  )
}
