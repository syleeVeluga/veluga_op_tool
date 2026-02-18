import type { UserRole, DataType } from '../lib/api'

export interface AuthSession {
  token: string
  user: {
    id: string
    email: string
    name: string
    role: UserRole
    mustChangePassword: boolean
    allowedMenus?: string[]
    allowedDataTypes?: DataType[]
  }
}

export interface AdminUserFormState {
  email: string
  name: string
  role: UserRole
  password: string
  isActive: boolean
  allowedMenus: string[]
  allowedDataTypes: DataType[]
}

export interface AdminUserEditState {
  id: string
  email: string
  name: string
  role: UserRole
  isActive: boolean
  newPassword: string
  allowedMenus: string[]
  allowedDataTypes: DataType[]
}

/** @deprecated replaced by modal-based AdminUserEditState */
export interface AdminUserEditDraft {
  email: string
  name: string
}

export type FilterInputState = Record<string, string | { min?: string; max?: string }>

export interface QueryUiSettings {
  dataType: DataType
  startAt: string
  endAt: string
  pageSize: number
  includeTotal: boolean
  sortOrder: 'asc' | 'desc'
}

export interface StoredFilterState {
  customerId: string
  filters: FilterInputState
}

export interface QueryHistoryItem {
  id: string
  executedAt: string
  dataType: DataType
  customerId: string
  rangeStart: string
  rangeEnd: string
  pageSize: number
  status: 'success' | 'failed'
  rowCount: number
  total?: number
  errorMessage?: string
}
