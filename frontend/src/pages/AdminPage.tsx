import { useEffect, useState, FormEvent } from 'react'
import {
  createAdminUser,
  deleteAdminUser,
  listAdminUsers,
  updateAdminUser,
  DashboardUser,
  UserRole
} from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { AdminUserFormState, AdminUserEditDraft } from '../types/ui'

export function AdminPage() {
  const { authToken, authUser } = useAuth()
  const canManageUsers = authUser?.role === 'super_admin' || authUser?.role === 'admin'

  const [adminUsers, setAdminUsers] = useState<DashboardUser[]>([])
  const [adminUsersLoading, setAdminUsersLoading] = useState(false)
  const [adminUsersError, setAdminUsersError] = useState<string | null>(null)
  
  const [adminForm, setAdminForm] = useState<AdminUserFormState>({
    email: '',
    name: '',
    role: 'user',
    password: '',
    isActive: true,
  })
  const [adminUserEdits, setAdminUserEdits] = useState<Record<string, AdminUserEditDraft>>({})

  useEffect(() => {
      if (canManageUsers && authToken) {
          void fetchAdminUserList(authToken)
      }
  }, [canManageUsers, authToken])

  const fetchAdminUserList = async (token: string) => {
    setAdminUsersLoading(true)
    setAdminUsersError(null)

    try {
      const result = await listAdminUsers(token)
      setAdminUsers(result.users)
    } catch (error) {
      setAdminUsers([])
      setAdminUsersError(error instanceof Error ? error.message : '사용자 목록 조회 실패')
    } finally {
      setAdminUsersLoading(false)
    }
  }

  const onAdminFormSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!authToken) return
    if (!adminForm.email || !adminForm.name || !adminForm.password) {
      alert('필수 정보를 입력해 주세요.')
      return
    }

    try {
      await createAdminUser(authToken, adminForm)
      setAdminForm({
        email: '',
        name: '',
        role: 'user',
        password: '',
        isActive: true,
      })
      await fetchAdminUserList(authToken)
    } catch (error) {
      alert(error instanceof Error ? error.message : '사용자 생성 실패')
    }
  }

  const onDeleteUser = async (user: DashboardUser) => {
    if (!authToken) return
    if (!confirm(`${user.email} 사용자를 삭제하시겠습니까?`)) return

    try {
      await deleteAdminUser(authToken, user.id)
      await fetchAdminUserList(authToken)
    } catch (error) {
      alert(error instanceof Error ? error.message : '사용자 삭제 실패')
    }
  }

  const onResetUserPassword = async (user: DashboardUser) => {
    if (!authToken) return
    const newPassword = prompt(`${user.email} 사용자의 새로운 비밀번호를 입력하세요.`)
    if (!newPassword) return

    try {
      await updateAdminUser(authToken, user.id, { password: newPassword })
      alert('비밀번호가 변경되었습니다.')
    } catch (error) {
      alert(error instanceof Error ? error.message : '비밀번호 변경 실패')
    }
  }

  const onToggleActive = async (user: DashboardUser) => {
    if (!authToken) return

    try {
      await updateAdminUser(authToken, user.id, { isActive: !user.isActive })
      await fetchAdminUserList(authToken)
    } catch (error) {
      alert(error instanceof Error ? error.message : '상태 변경 실패')
    }
  }

  const onSaveUserProfile = async (user: DashboardUser) => {
    if (!authToken) return
    const draft = adminUserEdits[user.id]
    if (!draft) return

    try {
      await updateAdminUser(authToken, user.id, {
        name: draft.name,
        email: draft.email,
      })
      
      const nextEdits = { ...adminUserEdits }
      delete nextEdits[user.id]
      setAdminUserEdits(nextEdits)
      
      await fetchAdminUserList(authToken)
    } catch (error) {
      alert(error instanceof Error ? error.message : '정보 수정 실패')
    }
  }

  if (!canManageUsers) {
      return (
          <div className="p-4 text-red-600">
              접근 권한이 없습니다.
          </div>
      )
  }

  return (
    <div className="space-y-6">
        <h1 className="text-2xl font-bold">사용자 관리 (Admin)</h1>

        <section className="rounded-lg border bg-white p-4">
            <h2 className="mb-4 text-sm font-semibold">새 사용자 등록</h2>
            <form className="flex flex-wrap items-end gap-3" onSubmit={onAdminFormSubmit}>
            <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Name</span>
                <input
                className="w-32 rounded-md border px-3 py-2 text-sm"
                value={adminForm.name}
                onChange={(e) => setAdminForm({ ...adminForm, name: e.target.value })}
                required
                />
            </label>
            <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Email</span>
                <input
                type="email"
                className="w-48 rounded-md border px-3 py-2 text-sm"
                value={adminForm.email}
                onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })}
                required
                />
            </label>
            <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Password</span>
                <input
                type="password"
                className="w-32 rounded-md border px-3 py-2 text-sm"
                value={adminForm.password}
                onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
                required
                />
            </label>
            <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Role</span>
                <select
                className="w-24 rounded-md border px-2 py-2 text-sm"
                value={adminForm.role}
                onChange={(e) => setAdminForm({ ...adminForm, role: e.target.value as UserRole })}
                >
                <option value="user">user</option>
                <option value="admin">admin</option>
                <option value="super_admin">super_admin</option>
                </select>
            </label>
            <label className="flex items-center gap-2 pb-2 text-sm">
                <input
                type="checkbox"
                checked={adminForm.isActive}
                onChange={(e) => setAdminForm({ ...adminForm, isActive: e.target.checked })}
                />
                Active
            </label>
            <button
                type="submit"
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
                등록
            </button>
            </form>
        </section>

        <section className="rounded-lg border bg-white p-4">
            <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold">사용자 목록</h2>
            <button
                onClick={() => authToken && fetchAdminUserList(authToken)}
                className="text-xs text-slate-500 hover:text-slate-900"
            >
                새로고침
            </button>
            </div>

            {adminUsersLoading && <p className="text-xs text-slate-500">목록 로딩 중...</p>}
            {adminUsersError && <p className="text-xs text-red-600">{adminUsersError}</p>}
            {!adminUsersLoading && adminUsers.length === 0 && (
            <p className="text-xs text-slate-500">등록된 사용자가 없습니다.</p>
            )}

            {!adminUsersLoading && adminUsers.length > 0 && (
            <div className="overflow-auto">
                <table className="min-w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700">
                    <tr>
                    <th className="px-2 py-2">ID</th>
                    <th className="px-2 py-2">Email</th>
                    <th className="px-2 py-2">Name</th>
                    <th className="px-2 py-2">Role</th>
                    <th className="px-2 py-2">Active</th>
                    <th className="px-2 py-2">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y">
                    {adminUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50">
                        <td className="px-2 py-2 text-slate-500">{user.id}</td>
                        <td className="px-2 py-2">
                        <input
                            className="w-full rounded border-transparent bg-transparent px-1 py-0.5 hover:border-slate-300 focus:border-slate-500 focus:bg-white"
                            value={adminUserEdits[user.id]?.email ?? user.email}
                            onChange={(e) =>
                            setAdminUserEdits((prev) => ({
                                ...prev,
                                [user.id]: {
                                ...(prev[user.id] ?? { name: user.name }),
                                email: e.target.value,
                                },
                            }))
                            }
                        />
                        </td>
                        <td className="px-2 py-2">
                        <input
                            className="w-full rounded border-transparent bg-transparent px-1 py-0.5 hover:border-slate-300 focus:border-slate-500 focus:bg-white"
                            value={adminUserEdits[user.id]?.name ?? user.name}
                            onChange={(e) =>
                            setAdminUserEdits((prev) => ({
                                ...prev,
                                [user.id]: {
                                ...(prev[user.id] ?? { email: user.email }),
                                name: e.target.value,
                                },
                            }))
                            }
                        />
                        </td>
                        <td className="px-2 py-2">{user.role}</td>
                        <td className="px-2 py-2">{user.isActive ? 'Y' : 'N'}</td>
                        <td className="px-2 py-2">
                        <div className="flex flex-wrap gap-1">
                            <button
                            type="button"
                            className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-100"
                            onClick={() => onSaveUserProfile(user)}
                            >
                            저장
                            </button>
                            <button
                            type="button"
                            className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-100"
                            onClick={() => onToggleActive(user)}
                            >
                            활성토글
                            </button>
                            <button
                            type="button"
                            className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-100"
                            onClick={() => onResetUserPassword(user)}
                            >
                            암호재설정
                            </button>
                            <button
                            type="button"
                            className="rounded border border-red-300 bg-white px-2 py-1 text-[11px] text-red-700 hover:bg-red-50"
                            onClick={() => onDeleteUser(user)}
                            >
                            삭제
                            </button>
                        </div>
                        </td>
                    </tr>
                    ))}
                </tbody>
                </table>
            </div>
            )}
        </section>
    </div>
  )
}
