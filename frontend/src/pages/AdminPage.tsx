import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  createAdminUser,
  deleteAdminUser,
  listAdminUsers,
  updateAdminUser,
  type DashboardUser,
  type DataType,
  type UserRole,
} from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import type { AdminUserFormState, AdminUserEditState } from '../types/ui'
import { Button, Checkbox, Input, Modal } from '../components/ui'

// 
// Constants
// 

const MENU_OPTIONS: { value: string; label: string }[] = [
  { value: 'user-logs', label: '사용자 로그' },
  { value: 'service-logs', label: '서비스 로그' },
  { value: 'batch-logs', label: '대량 배치 로그' },
  { value: 'partner-logs', label: '파트너 로그(호환)' },
  { value: 'admin', label: '관리자' },
]

const DATA_TYPE_OPTIONS: { value: DataType; label: string }[] = [
  { value: 'api_usage_logs', label: 'API 사용 로그' },
  { value: 'billing_logs', label: '청구 로그' },
  { value: 'conversations', label: '대화' },
  { value: 'error_logs', label: '오류 로그' },
  { value: 'event_logs', label: '이벤트 로그' },
]

const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  user: 'User',
}

const ROLE_BADGE_CLASS: Record<UserRole, string> = {
  super_admin: 'bg-purple-100 text-purple-800',
  admin: 'bg-blue-100 text-blue-800',
  user: 'bg-slate-100 text-slate-700',
}

const EMPTY_FORM: AdminUserFormState = {
  email: '',
  name: '',
  role: 'user',
  password: '',
  isActive: true,
  allowedMenus: [],
  allowedDataTypes: [],
}

// 
// Small UI Helpers
// 

function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={['inline-block rounded-full px-2 py-0.5 text-[10px] font-medium', className ?? '']
        .join(' ')
        .trim()}
    >
      {children}
    </span>
  )
}

function FormRow({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-slate-600">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
    </div>
  )
}

function CheckboxGroup<T extends string>({
  options,
  selected,
  onChange,
}: {
  options: { value: T; label: string }[]
  selected: T[]
  onChange: (next: T[]) => void
}) {
  const toggle = (val: T, checked: boolean) => {
    onChange(checked ? [...selected, val] : selected.filter((v) => v !== val))
  }
  return (
    <div className="flex flex-wrap gap-3">
      {options.map((opt) => (
        <Checkbox
          key={opt.value}
          label={opt.label}
          checked={selected.includes(opt.value)}
          onChange={(checked) => toggle(opt.value, checked)}
        />
      ))}
    </div>
  )
}

// 
// Add User Modal
// 

interface AddUserModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  authToken: string
}

function AddUserModal({ open, onClose, onSuccess, authToken }: AddUserModalProps) {
  const [form, setForm] = useState<AdminUserFormState>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setForm(EMPTY_FORM)
      setError(null)
    }
  }, [open])

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!form.email || !form.name || !form.password) {
      setError('이메일, 이름, 비밀번호는 필수입니다.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await createAdminUser(authToken, {
        email: form.email,
        name: form.name,
        role: form.role,
        password: form.password,
        isActive: form.isActive,
      })
      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '사용자 생성 실패')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="새 사용자 등록" maxWidth="md">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <FormRow label="이메일" required>
            <Input
              type="email"
              placeholder="user@example.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </FormRow>
          <FormRow label="이름" required>
            <Input
              placeholder="홍길동"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </FormRow>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormRow label="비밀번호" required>
            <Input
              type="password"
              placeholder="8자 이상"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
          </FormRow>
          <FormRow label="역할" required>
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </FormRow>
        </div>

        <FormRow label="계정 상태">
          <Checkbox
            label="활성 계정"
            checked={form.isActive}
            onChange={(checked) => setForm({ ...form, isActive: checked })}
          />
        </FormRow>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-4 space-y-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">권한 설정 (UI 미리보기 — 7-2 연동 예정)</p>
          <FormRow label="메뉴 접근 권한">
            <CheckboxGroup
              options={MENU_OPTIONS}
              selected={form.allowedMenus}
              onChange={(next) => setForm({ ...form, allowedMenus: next })}
            />
          </FormRow>
          <FormRow label="데이터 유형 접근 권한">
            <CheckboxGroup
              options={DATA_TYPE_OPTIONS}
              selected={form.allowedDataTypes}
              onChange={(next) => setForm({ ...form, allowedDataTypes: next as DataType[] })}
            />
          </FormRow>
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={submitting}>취소</Button>
          <Button variant="primary" type="submit" disabled={submitting}>
            {submitting ? '등록 중' : '등록'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// 
// Edit User Modal
// 

interface EditUserModalProps {
  user: DashboardUser | null
  onClose: () => void
  onSuccess: () => void
  authToken: string
}

function toEditState(u: DashboardUser | null): AdminUserEditState {
  return {
    id: u?.id ?? '',
    email: u?.email ?? '',
    name: u?.name ?? '',
    role: u?.role ?? 'user',
    isActive: u?.isActive ?? true,
    newPassword: '',
    allowedMenus: u?.allowedMenus ?? [],
    allowedDataTypes: u?.allowedDataTypes ?? [],
  }
}

function EditUserModal({ user, onClose, onSuccess, authToken }: EditUserModalProps) {
  const [form, setForm] = useState<AdminUserEditState>(() => toEditState(user))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (user) {
      setForm(toEditState(user))
      setError(null)
    }
  }, [user])

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!form.email || !form.name) {
      setError('이메일과 이름은 필수입니다.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await updateAdminUser(authToken, form.id, {
        email: form.email,
        name: form.name,
        role: form.role,
        isActive: form.isActive,
        ...(form.newPassword ? { password: form.newPassword } : {}),
      })
      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '정보 수정 실패')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={!!user} onClose={onClose} title="사용자 편집" maxWidth="md">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <FormRow label="이메일" required>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </FormRow>
          <FormRow label="이름" required>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </FormRow>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormRow label="역할">
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </FormRow>
          <FormRow label="계정 상태">
            <div className="flex items-center h-[38px]">
              <Checkbox
                label="활성 계정"
                checked={form.isActive}
                onChange={(checked) => setForm({ ...form, isActive: checked })}
              />
            </div>
          </FormRow>
        </div>

        <FormRow label="새 비밀번호 (변경 시만 입력)">
          <Input
            type="password"
            placeholder="변경하지 않으려면 비워두세요"
            value={form.newPassword}
            onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
          />
        </FormRow>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-4 space-y-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">권한 설정 (UI 미리보기 — 7-2 연동 예정)</p>
          <FormRow label="메뉴 접근 권한">
            <CheckboxGroup
              options={MENU_OPTIONS}
              selected={form.allowedMenus}
              onChange={(next) => setForm({ ...form, allowedMenus: next })}
            />
          </FormRow>
          <FormRow label="데이터 유형 접근 권한">
            <CheckboxGroup
              options={DATA_TYPE_OPTIONS}
              selected={form.allowedDataTypes}
              onChange={(next) => setForm({ ...form, allowedDataTypes: next as DataType[] })}
            />
          </FormRow>
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={submitting}>취소</Button>
          <Button variant="primary" type="submit" disabled={submitting}>
            {submitting ? '저장 중' : '저장'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// 
// Main Page
// 

export function AdminPage() {
  const { authToken, authUser } = useAuth()
  const canManageUsers = authUser?.role === 'super_admin' || authUser?.role === 'admin'

  const [users, setUsers] = useState<DashboardUser[]>([])
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<DashboardUser | null>(null)

  const fetchUsers = useCallback(async (token: string) => {
    setLoading(true)
    setFetchError(null)
    try {
      const result = await listAdminUsers(token)
      setUsers(result.users)
    } catch (err) {
      setUsers([])
      setFetchError(err instanceof Error ? err.message : '사용자 목록 조회 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (canManageUsers && authToken) {
      void fetchUsers(authToken)
    }
  }, [canManageUsers, authToken, fetchUsers])

  const handleToggleActive = async (user: DashboardUser) => {
    if (!authToken) return
    try {
      await updateAdminUser(authToken, user.id, { isActive: !user.isActive })
      await fetchUsers(authToken)
    } catch (err) {
      alert(err instanceof Error ? err.message : '상태 변경 실패')
    }
  }

  const handleDelete = async (user: DashboardUser) => {
    if (!authToken) return
    if (!confirm(`"${user.email}" 사용자를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return
    try {
      await deleteAdminUser(authToken, user.id)
      await fetchUsers(authToken)
    } catch (err) {
      alert(err instanceof Error ? err.message : '사용자 삭제 실패')
    }
  }

  if (!canManageUsers) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-sm text-red-600">접근 권한이 없습니다.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">사용자 관리</h1>
          <p className="mt-0.5 text-xs text-slate-500">대시보드 사용자 계정 및 권한을 관리합니다.</p>
        </div>
        <Button variant="primary" onClick={() => setIsAddModalOpen(true)}>
          + 사용자 추가
        </Button>
      </div>

      <section className="rounded-lg border bg-white">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-700">
            사용자 목록
            {!loading && (
              <span className="ml-2 font-normal text-slate-400">({users.length}명)</span>
            )}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => authToken && fetchUsers(authToken)}
            disabled={loading}
          >
            {loading ? '로딩 중' : '새로고침'}
          </Button>
        </div>

        {fetchError && (
          <div className="px-4 py-3">
            <p className="text-xs text-red-600">{fetchError}</p>
          </div>
        )}

        {!loading && !fetchError && users.length === 0 && (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-slate-500">등록된 사용자가 없습니다.</p>
          </div>
        )}

        {users.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="w-6 px-4 py-3 font-semibold">#</th>
                  <th className="px-4 py-3 font-semibold">이메일</th>
                  <th className="px-4 py-3 font-semibold">이름</th>
                  <th className="px-4 py-3 font-semibold">역할</th>
                  <th className="px-4 py-3 font-semibold">메뉴 권한</th>
                  <th className="px-4 py-3 font-semibold">데이터 권한</th>
                  <th className="px-4 py-3 font-semibold">상태</th>
                  <th className="px-4 py-3 font-semibold">수정일</th>
                  <th className="px-4 py-3 font-semibold">액션</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((user, idx) => (
                  <tr key={user.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 text-slate-400">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-slate-800">{user.email}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{user.name || '—'}</td>
                    <td className="px-4 py-3">
                      <Badge className={ROLE_BADGE_CLASS[user.role]}>
                        {ROLE_LABELS[user.role]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {user.allowedMenus && user.allowedMenus.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {user.allowedMenus.map((m) => (
                            <Badge key={m} className="bg-indigo-50 text-indigo-700">
                              {MENU_OPTIONS.find((o) => o.value === m)?.label ?? m}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {user.allowedDataTypes && user.allowedDataTypes.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {user.allowedDataTypes.map((dt) => (
                            <Badge key={dt} className="bg-emerald-50 text-emerald-700">
                              {DATA_TYPE_OPTIONS.find((o) => o.value === dt)?.label ?? dt}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        className={
                          user.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
                        }
                      >
                        {user.isActive ? '활성' : '비활성'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {new Date(user.updatedAt).toLocaleDateString('ko-KR')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="outline" onClick={() => setEditTarget(user)}>
                          편집
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleToggleActive(user)}
                          className={
                            user.isActive
                              ? 'border-amber-300 text-amber-700 hover:bg-amber-50'
                              : 'border-green-300 text-green-700 hover:bg-green-50'
                          }
                        >
                          {user.isActive ? '비활성화' : '활성화'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDelete(user)}
                          className="border-red-300 text-red-700 hover:bg-red-50"
                        >
                          삭제
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {authToken && (
        <AddUserModal
          open={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          onSuccess={() => fetchUsers(authToken)}
          authToken={authToken}
        />
      )}

      {authToken && (
        <EditUserModal
          user={editTarget}
          onClose={() => setEditTarget(null)}
          onSuccess={() => fetchUsers(authToken)}
          authToken={authToken}
        />
      )}
    </div>
  )
}
