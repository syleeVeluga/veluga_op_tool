import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  changeMyPassword,
  createAdminUser,
  type CustomerSearchItem,
  type DataType,
  type DataTypeSchema,
  deleteAdminUser,
  fetchMe,
  type DashboardUser,
  login,
  listAdminUsers,
  type QueryFilterValue,
  type UserRole,
  fetchSchema,
  postDataQuery,
  resolveCustomersByPartnerId,
  searchCustomers,
  updateAdminUser,
} from './lib/api'

const DATA_TYPES: DataType[] = [
  'conversations',
  'api_usage_logs',
  'event_logs',
  'error_logs',
  'billing_logs',
  'user_activities',
]

interface DataTypeGuide {
  label: string
  description: string
  customerKey: string
  customerInputHint: string
  customerExample: string
  supportsUserLookup: boolean
  supportsPartnerLookup: boolean
}

const DATA_TYPE_GUIDE: Record<DataType, DataTypeGuide> = {
  conversations: {
    label: '대화 로그',
    description: '채팅/대화 단위 로그를 조회합니다.',
    customerKey: 'creator (사용자 ID)',
    customerInputHint: '사용자 ID가 필요합니다. 이메일/이름을 알면 상단 고객 검색으로 찾을 수 있습니다.',
    customerExample: '예: 65f0c1e2d3a4b5c6d7e8f901',
    supportsUserLookup: true,
    supportsPartnerLookup: true,
  },
  api_usage_logs: {
    label: 'API 사용 로그',
    description: '토큰/크레딧 사용량 중심 로그를 조회합니다.',
    customerKey: 'creator (사용자 ID)',
    customerInputHint: '사용자 ID가 필요합니다. 이메일/이름으로 고객 검색 후 자동 입력할 수 있습니다.',
    customerExample: '예: 65f0c1e2d3a4b5c6d7e8f901',
    supportsUserLookup: true,
    supportsPartnerLookup: true,
  },
  event_logs: {
    label: '이벤트 로그',
    description: '서비스 이벤트/행동성 로그를 조회합니다.',
    customerKey: 'user_id',
    customerInputHint: 'user_id를 입력하세요. 운영자가 알고 있는 사용자 ID를 그대로 사용합니다.',
    customerExample: '예: user_123456',
    supportsUserLookup: false,
    supportsPartnerLookup: false,
  },
  error_logs: {
    label: '에러 로그',
    description: '오류/예외 중심 로그를 조회합니다.',
    customerKey: 'ip',
    customerInputHint: '이 데이터 타입은 고객 식별값으로 IP를 사용합니다.',
    customerExample: '예: 203.0.113.10',
    supportsUserLookup: false,
    supportsPartnerLookup: false,
  },
  billing_logs: {
    label: '결제/플랜 이력',
    description: '구독/플랜 변경 및 만료 관련 로그를 조회합니다.',
    customerKey: 'user (사용자 ID)',
    customerInputHint: '사용자 ID가 필요합니다. 이메일/이름으로 고객 검색 후 입력 가능합니다.',
    customerExample: '예: 65f0c1e2d3a4b5c6d7e8f901',
    supportsUserLookup: true,
    supportsPartnerLookup: true,
  },
  user_activities: {
    label: '사용자 활동 로그',
    description: '세션/채널 기반 활동 로그를 조회합니다.',
    customerKey: 'channel',
    customerInputHint: '운영자가 알고 있는 채널 ID를 Customer ID에 그대로 입력하세요.',
    customerExample: '예: channel_abc123',
    supportsUserLookup: false,
    supportsPartnerLookup: false,
  },
}

const COLUMN_SETTINGS_STORAGE_KEY = 'user-log-dashboard:selected-columns:v1'
const QUERY_SETTINGS_STORAGE_KEY = 'user-log-dashboard:query-settings:v1'
const FILTER_SETTINGS_STORAGE_KEY = 'user-log-dashboard:filter-settings:v1'
const AUTH_SESSION_STORAGE_KEY = 'user-log-dashboard:auth-session:v1'

interface AuthSession {
  token: string
  user: {
    id: string
    email: string
    name: string
    role: UserRole
    mustChangePassword: boolean
  }
}

interface AdminUserFormState {
  email: string
  name: string
  role: UserRole
  password: string
  isActive: boolean
}

interface AdminUserEditDraft {
  email: string
  name: string
}

type FilterInputState = Record<string, string | { min?: string; max?: string }>

function asStringValue(value: FilterInputState[string]): string {
  return typeof value === 'string' ? value : ''
}

function asRangeValue(value: FilterInputState[string]): { min?: string; max?: string } {
  return typeof value === 'object' && value ? value : {}
}

function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const y = date.getFullYear()
  const m = pad(date.getMonth() + 1)
  const d = pad(date.getDate())
  const hh = pad(date.getHours())
  const mm = pad(date.getMinutes())
  return `${y}-${m}-${d}T${hh}:${mm}`
}

function toIsoString(value: string): string {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString()
}

function buildFilters(schema: DataTypeSchema | null, values: FilterInputState): Record<string, QueryFilterValue> | undefined {
  if (!schema) {
    return undefined
  }

  const filters: Record<string, QueryFilterValue> = {}

  for (const filter of schema.filters) {
    const raw = values[filter.key]

    if (filter.type === 'range') {
      const range = typeof raw === 'object' && raw ? raw : {}
      const min = range.min?.trim()
      const max = range.max?.trim()
      if (min || max) {
        filters[filter.key] = {
          ...(min ? { min } : {}),
          ...(max ? { max } : {}),
        }
      }
      continue
    }

    if (typeof raw === 'string' && raw.trim()) {
      filters[filter.key] = raw.trim()
    }
  }

  return Object.keys(filters).length > 0 ? filters : undefined
}

function loadStoredColumns(dataType: DataType): string[] | null {
  try {
    const raw = window.localStorage.getItem(COLUMN_SETTINGS_STORAGE_KEY)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>
    const candidate = parsed[dataType]

    if (!Array.isArray(candidate)) {
      return null
    }

    return candidate.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  } catch {
    return null
  }
}

function saveStoredColumns(dataType: DataType, columns: string[]): void {
  try {
    const raw = window.localStorage.getItem(COLUMN_SETTINGS_STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    const next = {
      ...parsed,
      [dataType]: columns,
    }

    window.localStorage.setItem(COLUMN_SETTINGS_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // ignore localStorage failures
  }
}

interface QueryUiSettings {
  dataType: DataType
  startAt: string
  endAt: string
  pageSize: number
  includeTotal: boolean
}

function getDefaultQueryUiSettings(): QueryUiSettings {
  const now = new Date()
  const before = new Date(now)
  before.setDate(before.getDate() - 7)

  return {
    dataType: 'api_usage_logs',
    startAt: toDatetimeLocalValue(before),
    endAt: toDatetimeLocalValue(now),
    pageSize: 100,
    includeTotal: true,
  }
}

function loadStoredQueryUiSettings(): QueryUiSettings {
  const defaults = getDefaultQueryUiSettings()

  try {
    const raw = window.localStorage.getItem(QUERY_SETTINGS_STORAGE_KEY)
    if (!raw) {
      return defaults
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>

    const dataTypeCandidate = typeof parsed.dataType === 'string' ? parsed.dataType : defaults.dataType
    const safeDataType = DATA_TYPES.includes(dataTypeCandidate as DataType)
      ? (dataTypeCandidate as DataType)
      : defaults.dataType

    const startCandidate = typeof parsed.startAt === 'string' ? parsed.startAt : defaults.startAt
    const endCandidate = typeof parsed.endAt === 'string' ? parsed.endAt : defaults.endAt

    const parsedPageSize =
      typeof parsed.pageSize === 'number'
        ? parsed.pageSize
        : typeof parsed.pageSize === 'string'
          ? Number(parsed.pageSize)
          : defaults.pageSize

    const safePageSize = Number.isInteger(parsedPageSize) && parsedPageSize > 0 && parsedPageSize <= 1000
      ? parsedPageSize
      : defaults.pageSize

    const includeTotalCandidate = parsed.includeTotal
    const safeIncludeTotal =
      typeof includeTotalCandidate === 'boolean'
        ? includeTotalCandidate
        : defaults.includeTotal

    return {
      dataType: safeDataType,
      startAt: startCandidate,
      endAt: endCandidate,
      pageSize: safePageSize,
      includeTotal: safeIncludeTotal,
    }
  } catch {
    return defaults
  }
}

function saveStoredQueryUiSettings(settings: QueryUiSettings): void {
  try {
    window.localStorage.setItem(QUERY_SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // ignore localStorage failures
  }
}

interface StoredFilterState {
  customerId: string
  filters: FilterInputState
}

interface QueryHistoryItem {
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

function loadStoredFilterState(dataType: DataType): StoredFilterState | null {
  try {
    const raw = window.localStorage.getItem(FILTER_SETTINGS_STORAGE_KEY)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>
    const item = parsed[dataType]

    if (!item || typeof item !== 'object') {
      return null
    }

    const candidate = item as Record<string, unknown>
    const customerId = typeof candidate.customerId === 'string' ? candidate.customerId : ''
    const filters =
      candidate.filters && typeof candidate.filters === 'object' && !Array.isArray(candidate.filters)
        ? (candidate.filters as FilterInputState)
        : {}

    return {
      customerId,
      filters,
    }
  } catch {
    return null
  }
}

function saveStoredFilterState(dataType: DataType, customerId: string, filters: FilterInputState): void {
  try {
    const raw = window.localStorage.getItem(FILTER_SETTINGS_STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}

    const next = {
      ...parsed,
      [dataType]: {
        customerId,
        filters,
      },
    }

    window.localStorage.setItem(FILTER_SETTINGS_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // ignore localStorage failures
  }
}

function loadAuthSession(): AuthSession | null {
  try {
    const raw = window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as AuthSession
    if (!parsed?.token || !parsed?.user?.id) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

function saveAuthSession(session: AuthSession | null): void {
  try {
    if (!session) {
      window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY)
      return
    }

    window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session))
  } catch {
    // ignore localStorage failures
  }
}

function sanitizeStoredFilters(schema: DataTypeSchema, candidate: FilterInputState): FilterInputState {
  const next: FilterInputState = {}
  const schemaFilterMap = new Map(schema.filters.map((filter) => [filter.key, filter]))

  for (const [key, value] of Object.entries(candidate)) {
    const schemaFilter = schemaFilterMap.get(key)
    if (!schemaFilter) {
      continue
    }

    if (schemaFilter.type === 'range') {
      const range = asRangeValue(value)
      const min = typeof range.min === 'string' ? range.min : undefined
      const max = typeof range.max === 'string' ? range.max : undefined

      if (min || max) {
        next[key] = {
          ...(min ? { min } : {}),
          ...(max ? { max } : {}),
        }
      }
      continue
    }

    if (typeof value === 'string') {
      next[key] = value
    }
  }

  return next
}

function toExportTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const y = date.getFullYear()
  const m = pad(date.getMonth() + 1)
  const d = pad(date.getDate())
  const hh = pad(date.getHours())
  const mm = pad(date.getMinutes())
  const ss = pad(date.getSeconds())
  return `${y}${m}${d}-${hh}${mm}${ss}`
}

function toExportString(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }

  if (typeof value === 'object') {
    return JSON.stringify(value)
  }

  return String(value)
}

function escapeCsvCell(value: string): string {
  const escaped = value.replaceAll('"', '""')
  const needsQuote = /[",\n\r]/.test(escaped)
  return needsQuote ? `"${escaped}"` : escaped
}

function buildCsvContent(rows: Array<Record<string, unknown>>, columns: string[]): string {
  const header = columns.map((column) => escapeCsvCell(column)).join(',')
  const body = rows
    .map((row) => columns.map((column) => escapeCsvCell(toExportString(row[column]))).join(','))
    .join('\n')

  return body ? `${header}\n${body}` : header
}

function projectRowsByColumns(rows: Array<Record<string, unknown>>, columns: string[]): Array<Record<string, unknown>> {
  return rows.map((row) => {
    const projected: Record<string, unknown> = {}

    for (const column of columns) {
      projected[column] = row[column] ?? null
    }

    return projected
  })
}

function triggerFileDownload(content: string, fileName: string, mimeType: string, withBom = false): void {
  const blob = new Blob(withBom ? ['\uFEFF', content] : [content], { type: mimeType })
  const url = window.URL.createObjectURL(blob)
  const link = window.document.createElement('a')

  link.href = url
  link.download = fileName
  window.document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

function App() {
  const initialQuerySettings = loadStoredQueryUiSettings()
  const initialSession = loadAuthSession()

  const [authToken, setAuthToken] = useState<string>(initialSession?.token ?? '')
  const [authUser, setAuthUser] = useState<AuthSession['user'] | null>(initialSession?.user ?? null)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [passwordCurrent, setPasswordCurrent] = useState('')
  const [passwordNext, setPasswordNext] = useState('')
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordLoading, setPasswordLoading] = useState(false)

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

  const [dataType, setDataType] = useState<DataType>(initialQuerySettings.dataType)
  const [customerId, setCustomerId] = useState('')
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerOptions, setCustomerOptions] = useState<CustomerSearchItem[]>([])
  const [customerLoading, setCustomerLoading] = useState(false)
  const [customerError, setCustomerError] = useState<string | null>(null)
  const [channelOptions, setChannelOptions] = useState<string[]>([])
  const [channelLoading, setChannelLoading] = useState(false)
  const [channelError, setChannelError] = useState<string | null>(null)
  const [partnerId, setPartnerId] = useState('')
  const [partnerCustomerIds, setPartnerCustomerIds] = useState<string[]>([])
  const [partnerCustomers, setPartnerCustomers] = useState<CustomerSearchItem[]>([])
  const [partnerResolveLoading, setPartnerResolveLoading] = useState(false)
  const [partnerResolveError, setPartnerResolveError] = useState<string | null>(null)
  const [startAt, setStartAt] = useState(initialQuerySettings.startAt)
  const [endAt, setEndAt] = useState(initialQuerySettings.endAt)
  const [pageSize, setPageSize] = useState(initialQuerySettings.pageSize)
  const [includeTotal, setIncludeTotal] = useState(initialQuerySettings.includeTotal)

  const [schema, setSchema] = useState<DataTypeSchema | null>(null)
  const [schemaLoading, setSchemaLoading] = useState(false)
  const [schemaError, setSchemaError] = useState<string | null>(null)

  const [filterInputs, setFilterInputs] = useState<FilterInputState>({})
  const [selectedColumns, setSelectedColumns] = useState<string[]>([])

  const [rows, setRows] = useState<Array<Record<string, unknown>>>([])
  const [total, setTotal] = useState<number | undefined>(undefined)
  const [hasMore, setHasMore] = useState(false)
  const [queryLoading, setQueryLoading] = useState(false)
  const [queryError, setQueryError] = useState<string | null>(null)
  const [queryHistory, setQueryHistory] = useState<QueryHistoryItem[]>([])
  const [exportNotice, setExportNotice] = useState<string | null>(null)

  const selectedGuide = DATA_TYPE_GUIDE[dataType]
  const canManageUsers = authUser?.role === 'super_admin' || authUser?.role === 'admin'
  const isPartnerResolvedMode = selectedGuide.supportsPartnerLookup && partnerId.trim().length > 0 && partnerCustomerIds.length > 0
  const channelFilterKey = useMemo(() => {
    if (!schema) {
      return null
    }

    const exactChannel = schema.filters.find((filter) => filter.key === 'channel')
    if (exactChannel) {
      return exactChannel.key
    }

    const fallbackChannel = schema.filters.find((filter) => /channel/i.test(filter.key))
    return fallbackChannel?.key ?? null
  }, [schema])
  const supportsChannelSelection = Boolean(channelFilterKey)
  const selectedChannel = channelFilterKey ? asStringValue(filterInputs[channelFilterKey]) : ''

  const availableColumns = useMemo(() => {
    if (rows.length > 0) {
      return Object.keys(rows[0])
    }
    return schema?.columns.map((c) => c.key) ?? []
  }, [rows, schema])

  const resultColumns = useMemo(() => {
    if (selectedColumns.length === 0) {
      return availableColumns
    }

    const set = new Set(availableColumns)
    return selectedColumns.filter((column) => set.has(column))
  }, [availableColumns, selectedColumns])

  const onExportClick = (format: 'csv' | 'json') => {
    const formatLabel = format.toUpperCase()

    if (rows.length === 0) {
      setExportNotice(`${formatLabel} 내보내기는 조회 결과가 있을 때 활성화됩니다.`)
      return
    }

    if (resultColumns.length === 0) {
      setExportNotice('내보낼 컬럼이 없습니다. 표시 컬럼을 확인해 주세요.')
      return
    }

    const timestamp = toExportTimestamp(new Date())
    const baseName = `user-log-${dataType}-${timestamp}`

    try {
      if (format === 'csv') {
        const csv = buildCsvContent(rows, resultColumns)
        triggerFileDownload(csv, `${baseName}.csv`, 'text/csv;charset=utf-8', true)
      } else {
        const projectedRows = projectRowsByColumns(rows, resultColumns)
        const json = JSON.stringify(projectedRows, null, 2)
        triggerFileDownload(json, `${baseName}.json`, 'application/json;charset=utf-8')
      }

      setExportNotice(`${formatLabel} 파일 다운로드를 시작했습니다.`)
    } catch {
      setExportNotice(`${formatLabel} 내보내기에 실패했습니다. 다시 시도해 주세요.`)
    }
  }

  const onResolvePartnerUsers = async () => {
    const normalizedPartnerId = partnerId.trim()

    if (!normalizedPartnerId) {
      setPartnerResolveError('partner ID를 입력해 주세요.')
      setPartnerCustomerIds([])
      setPartnerCustomers([])
      return
    }

    setPartnerResolveLoading(true)
    setPartnerResolveError(null)

    try {
      const result = await resolveCustomersByPartnerId(normalizedPartnerId)
      setPartnerCustomerIds(result.customerIds)
      setPartnerCustomers(result.customers)

      if (result.customerIds.length === 0) {
        setPartnerResolveError('해당 partner ID로 조회 가능한 사용자 ID를 찾지 못했습니다.')
      }
    } catch (error) {
      setPartnerCustomerIds([])
      setPartnerCustomers([])
      setPartnerResolveError(error instanceof Error ? error.message : 'partner ID 조회 실패')
    } finally {
      setPartnerResolveLoading(false)
    }
  }

  const onLoadCustomerChannels = async () => {
    if (!channelFilterKey) {
      return
    }

    const normalizedCustomerId = customerId.trim()
    const normalizedCustomerIds = partnerCustomerIds
      .map((item) => item.trim())
      .filter((item) => item.length > 0)

    if (!normalizedCustomerId && normalizedCustomerIds.length === 0) {
      setChannelError('Customer ID 또는 Partner ID 기반 사용자 목록이 필요합니다.')
      setChannelOptions([])
      return
    }

    setChannelLoading(true)
    setChannelError(null)
    setChannelOptions([])

    const filters = buildFilters(schema, filterInputs)
    if (filters && channelFilterKey in filters) {
      delete filters[channelFilterKey]
    }

    try {
      const result = await postDataQuery({
        dataType,
        ...(normalizedCustomerIds.length > 0
          ? { customerIds: normalizedCustomerIds }
          : { customerId: normalizedCustomerId }),
        dateRange: {
          start: toIsoString(startAt),
          end: toIsoString(endAt),
        },
        filters,
        columns: [channelFilterKey],
        pageSize: 1000,
        includeTotal: false,
      })

      const uniqueChannels = Array.from(
        new Set(
          result.rows
            .map((row) => String(row[channelFilterKey] ?? '').trim())
            .filter((value) => value.length > 0),
        ),
      ).sort((left, right) => left.localeCompare(right))

      setChannelOptions(uniqueChannels)

      if (uniqueChannels.length === 0) {
        setChannelError('해당 조건에서 선택 가능한 채널이 없습니다.')
      }
    } catch (error) {
      setChannelError(error instanceof Error ? error.message : '채널 조회 실패')
      setChannelOptions([])
    } finally {
      setChannelLoading(false)
    }
  }

  const fetchAdminUserList = async (token: string) => {
    if (!canManageUsers) {
      return
    }

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

  const onLoginSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!loginEmail.trim() || !loginPassword.trim()) {
      setLoginError('이메일과 비밀번호를 입력해 주세요.')
      return
    }

    setLoginLoading(true)
    setLoginError(null)

    try {
      const result = await login({
        email: loginEmail.trim(),
        password: loginPassword,
      })

      const session: AuthSession = {
        token: result.token,
        user: result.user,
      }

      setAuthToken(result.token)
      setAuthUser(result.user)
      saveAuthSession(session)
      setLoginPassword('')
      setPasswordNotice(result.user.mustChangePassword ? '초기 비밀번호입니다. 즉시 변경해 주세요.' : null)
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : '로그인 실패')
    } finally {
      setLoginLoading(false)
    }
  }

  const onLogout = () => {
    setAuthToken('')
    setAuthUser(null)
    setAdminUsers([])
    setAdminUsersError(null)
    setPasswordCurrent('')
    setPasswordNext('')
    setPasswordNotice(null)
    setPasswordError(null)
    saveAuthSession(null)
  }

  const onSubmitChangePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!authToken || !authUser) {
      setPasswordError('로그인이 필요합니다.')
      return
    }

    setPasswordLoading(true)
    setPasswordError(null)
    setPasswordNotice(null)

    try {
      const result = await changeMyPassword(authToken, {
        currentPassword: passwordCurrent,
        newPassword: passwordNext,
      })

      const nextUser = result.user ?? authUser
      const nextSession: AuthSession = {
        token: authToken,
        user: nextUser,
      }

      setAuthUser(nextUser)
      saveAuthSession(nextSession)
      setPasswordCurrent('')
      setPasswordNext('')
      setPasswordNotice('비밀번호를 변경했습니다.')
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : '비밀번호 변경 실패')
    } finally {
      setPasswordLoading(false)
    }
  }

  const onCreateUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!authToken || !canManageUsers) {
      return
    }

    setAdminUsersLoading(true)
    setAdminUsersError(null)

    try {
      await createAdminUser(authToken, {
        email: adminForm.email.trim(),
        name: adminForm.name.trim(),
        role: adminForm.role,
        password: adminForm.password,
        isActive: adminForm.isActive,
      })

      setAdminForm({
        email: '',
        name: '',
        role: 'user',
        password: '',
        isActive: true,
      })

      await fetchAdminUserList(authToken)
    } catch (error) {
      setAdminUsersError(error instanceof Error ? error.message : '사용자 생성 실패')
    } finally {
      setAdminUsersLoading(false)
    }
  }

  const onToggleActive = async (user: DashboardUser) => {
    if (!authToken || !canManageUsers) {
      return
    }

    try {
      await updateAdminUser(authToken, user.id, { isActive: !user.isActive })
      await fetchAdminUserList(authToken)
    } catch (error) {
      setAdminUsersError(error instanceof Error ? error.message : '사용자 상태 변경 실패')
    }
  }

  const onSaveUserProfile = async (user: DashboardUser) => {
    if (!authToken || !canManageUsers) {
      return
    }

    const draft = adminUserEdits[user.id]
    if (!draft) {
      return
    }

    const nextEmail = draft.email.trim()
    const nextName = draft.name.trim()

    if (!nextEmail || !nextName) {
      setAdminUsersError('이메일과 이름은 비워둘 수 없습니다.')
      return
    }

    if (nextEmail === user.email && nextName === user.name) {
      return
    }

    try {
      await updateAdminUser(authToken, user.id, {
        email: nextEmail,
        name: nextName,
      })
      await fetchAdminUserList(authToken)
    } catch (error) {
      setAdminUsersError(error instanceof Error ? error.message : '사용자 정보 수정 실패')
    }
  }

  const onChangeRole = async (user: DashboardUser, role: UserRole) => {
    if (!authToken || !canManageUsers) {
      return
    }

    try {
      await updateAdminUser(authToken, user.id, { role })
      await fetchAdminUserList(authToken)
    } catch (error) {
      setAdminUsersError(error instanceof Error ? error.message : '역할 변경 실패')
    }
  }

  const onResetUserPassword = async (user: DashboardUser) => {
    if (!authToken || !canManageUsers) {
      return
    }

    const nextPassword = window.prompt(`새 비밀번호를 입력하세요 (${user.email})`)
    if (!nextPassword || nextPassword.trim().length < 8) {
      return
    }

    try {
      await updateAdminUser(authToken, user.id, { password: nextPassword.trim() })
      await fetchAdminUserList(authToken)
    } catch (error) {
      setAdminUsersError(error instanceof Error ? error.message : '비밀번호 재설정 실패')
    }
  }

  const onDeleteUser = async (user: DashboardUser) => {
    if (!authToken || !canManageUsers) {
      return
    }

    if (!window.confirm(`${user.email} 사용자를 삭제할까요?`)) {
      return
    }

    try {
      await deleteAdminUser(authToken, user.id)
      await fetchAdminUserList(authToken)
    } catch (error) {
      setAdminUsersError(error instanceof Error ? error.message : '사용자 삭제 실패')
    }
  }

  useEffect(() => {
    let active = true

    async function loadSchema() {
      setSchemaLoading(true)
      setSchemaError(null)

      try {
        const result = await fetchSchema(dataType)
        if (!active) {
          return
        }

        setSchema(result)
        const schemaColumns = result.columns.map((column) => column.key)
        const schemaColumnSet = new Set(schemaColumns)
        const stored = loadStoredColumns(dataType)
        const storedFilterState = loadStoredFilterState(dataType)

        if (storedFilterState) {
          setCustomerId(storedFilterState.customerId)
          setFilterInputs(sanitizeStoredFilters(result, storedFilterState.filters))
        } else {
          setCustomerId('')
          setFilterInputs({})
        }

        if (stored && stored.length > 0) {
          const validStoredColumns = stored.filter((column) => schemaColumnSet.has(column))
          if (validStoredColumns.length > 0) {
            setSelectedColumns(validStoredColumns)
          } else {
            setSelectedColumns(schemaColumns)
          }
        } else {
          setSelectedColumns(schemaColumns)
        }
      } catch (error) {
        if (!active) {
          return
        }
        setSchema(null)
        setSchemaError(error instanceof Error ? error.message : '스키마 조회 실패')
      } finally {
        if (active) {
          setSchemaLoading(false)
        }
      }
    }

    loadSchema()
    return () => {
      active = false
    }
  }, [dataType])

  useEffect(() => {
    if (!authToken) {
      return
    }

    let active = true

    void fetchMe(authToken)
      .then((result) => {
        if (!active || !result.user) {
          return
        }

        const nextUser: AuthSession['user'] = {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          role: result.user.role,
          mustChangePassword: result.user.mustChangePassword,
        }

        setAuthUser(nextUser)
        saveAuthSession({ token: authToken, user: nextUser })
      })
      .catch(() => {
        if (!active) {
          return
        }

        onLogout()
      })

    return () => {
      active = false
    }
  }, [authToken])

  useEffect(() => {
    if (!authToken || !authUser) {
      setAdminUsers([])
      return
    }

    if (authUser.role !== 'super_admin' && authUser.role !== 'admin') {
      setAdminUsers([])
      return
    }

    void fetchAdminUserList(authToken)
  }, [authToken, authUser?.id, authUser?.role])

  useEffect(() => {
    setAdminUserEdits((prev) => {
      const next: Record<string, AdminUserEditDraft> = {}

      for (const user of adminUsers) {
        next[user.id] = prev[user.id] ?? {
          email: user.email,
          name: user.name,
        }
      }

      return next
    })
  }, [adminUsers])

  useEffect(() => {
    if (DATA_TYPE_GUIDE[dataType].supportsUserLookup) {
      return
    }

    setCustomerQuery('')
    setCustomerOptions([])
    setCustomerError(null)
    setCustomerLoading(false)
    setPartnerId('')
    setPartnerCustomerIds([])
    setPartnerCustomers([])
    setPartnerResolveError(null)
    setPartnerResolveLoading(false)
  }, [dataType])

  useEffect(() => {
    setChannelOptions([])
    setChannelLoading(false)
    setChannelError(null)
  }, [dataType])

  useEffect(() => {
    setChannelOptions([])
    setChannelError(null)

    if (!channelFilterKey) {
      return
    }

    setFilterInputs((prev) => {
      if (!(channelFilterKey in prev)) {
        return prev
      }

      const next = { ...prev }
      delete next[channelFilterKey]
      return next
    })
  }, [channelFilterKey, customerId, partnerCustomerIds])

  useEffect(() => {
    const keyword = customerQuery.trim()

    if (!selectedGuide.supportsUserLookup) {
      setCustomerOptions([])
      setCustomerLoading(false)
      setCustomerError(null)
      return
    }

    if (keyword.length < 2) {
      setCustomerOptions([])
      setCustomerLoading(false)
      setCustomerError(null)
      return
    }

    let active = true
    setCustomerLoading(true)
    setCustomerError(null)

    const timer = window.setTimeout(async () => {
      try {
        const result = await searchCustomers(keyword)
        if (!active) {
          return
        }
        setCustomerOptions(result.customers)
      } catch (error) {
        if (!active) {
          return
        }
        setCustomerOptions([])
        setCustomerError(error instanceof Error ? error.message : '고객 검색 실패')
      } finally {
        if (active) {
          setCustomerLoading(false)
        }
      }
    }, 300)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [customerQuery, selectedGuide.supportsUserLookup])

  const toggleColumn = (columnKey: string) => {
    setSelectedColumns((prev) => {
      if (prev.includes(columnKey)) {
        if (prev.length === 1) {
          return prev
        }
        return prev.filter((column) => column !== columnKey)
      }

      return [...prev, columnKey]
    })
  }

  useEffect(() => {
    if (!schema || selectedColumns.length === 0) {
      return
    }

    const schemaColumnSet = new Set(schema.columns.map((column) => column.key))
    const validColumns = selectedColumns.filter((column) => schemaColumnSet.has(column))

    if (validColumns.length === 0) {
      return
    }

    saveStoredColumns(dataType, validColumns)
  }, [dataType, schema, selectedColumns])

  useEffect(() => {
    saveStoredQueryUiSettings({
      dataType,
      startAt,
      endAt,
      pageSize,
      includeTotal,
    })
  }, [dataType, startAt, endAt, pageSize, includeTotal])

  useEffect(() => {
    if (!schema) {
      return
    }

    const sanitized = sanitizeStoredFilters(schema, filterInputs)
    saveStoredFilterState(dataType, customerId, sanitized)
  }, [customerId, dataType, filterInputs, schema])

  const executeQuery = async (overrideFilterInputs?: FilterInputState) => {
    const normalizedCustomerId = customerId.trim()
    const normalizedCustomerIds = partnerCustomerIds
    const requestStart = toIsoString(startAt)
    const requestEnd = toIsoString(endAt)

    if (!normalizedCustomerId && normalizedCustomerIds.length === 0) {
      setQueryError('Customer ID 또는 Partner ID 기반 사용자 목록이 필요합니다.')
      return
    }

    setQueryLoading(true)
    setQueryError(null)
    setExportNotice(null)

    try {
      const result = await postDataQuery({
        dataType,
        ...(normalizedCustomerIds.length > 0
          ? { customerIds: normalizedCustomerIds }
          : { customerId: normalizedCustomerId }),
        dateRange: {
          start: requestStart,
          end: requestEnd,
        },
        filters: buildFilters(schema, overrideFilterInputs ?? filterInputs),
        columns: selectedColumns,
        pageSize,
        includeTotal,
      })

      setRows(result.rows)
      setTotal(result.total)
      setHasMore(result.hasMore)
      const historyItem: QueryHistoryItem = {
        id: `${Date.now()}-success`,
        executedAt: new Date().toISOString(),
        dataType,
        customerId:
          normalizedCustomerIds.length > 0
            ? `partner:${partnerId.trim()} (${normalizedCustomerIds.length} users)`
            : normalizedCustomerId,
        rangeStart: requestStart,
        rangeEnd: requestEnd,
        pageSize,
        status: 'success',
        rowCount: result.rows.length,
        total: result.total,
      }

      setQueryHistory((prev) => [historyItem, ...prev].slice(0, 10))
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '조회 실패'
      setRows([])
      setTotal(undefined)
      setHasMore(false)
      setQueryError(errorMessage)
      const historyItem: QueryHistoryItem = {
        id: `${Date.now()}-failed`,
        executedAt: new Date().toISOString(),
        dataType,
        customerId:
          normalizedCustomerIds.length > 0
            ? `partner:${partnerId.trim()} (${normalizedCustomerIds.length} users)`
            : normalizedCustomerId,
        rangeStart: requestStart,
        rangeEnd: requestEnd,
        pageSize,
        status: 'failed',
        rowCount: 0,
        errorMessage,
      }

      setQueryHistory((prev) => [historyItem, ...prev].slice(0, 10))
    } finally {
      setQueryLoading(false)
    }
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await executeQuery()
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <h1 className="text-lg font-semibold">User Log Dashboard</h1>
          <div className="flex items-center gap-2">
            {authUser ? (
              <>
                <span className="rounded-md bg-emerald-100 px-2 py-1 text-xs text-emerald-700">
                  {authUser.email} · {authUser.role}
                </span>
                <button
                  type="button"
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  onClick={onLogout}
                >
                  로그아웃
                </button>
              </>
            ) : (
              <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">로그인이 필요합니다</span>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-4 px-4 py-6 sm:px-6 lg:grid-cols-12 lg:px-8">
        {!authUser ? (
          <section className="rounded-lg border bg-white p-4 lg:col-span-12">
            <h2 className="mb-3 text-sm font-semibold">로그인</h2>
            <form className="max-w-md space-y-3" onSubmit={onLoginSubmit}>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">이메일</span>
                <input
                  type="email"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="user@veluga.io"
                  required
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">비밀번호</span>
                <input
                  type="password"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                />
              </label>
              {loginError && <p className="text-xs text-red-600">{loginError}</p>}
              <button
                type="submit"
                className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                disabled={loginLoading}
              >
                {loginLoading ? '로그인 중...' : '로그인'}
              </button>
            </form>
          </section>
        ) : (
          <>
            <section className="rounded-lg border bg-white p-4 lg:col-span-12">
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <h2 className="mb-2 text-sm font-semibold">사용자 메뉴 · 비밀번호 변경</h2>
                  <form className="space-y-2" onSubmit={onSubmitChangePassword}>
                    <input
                      type="password"
                      className="w-full rounded-md border px-3 py-2 text-sm"
                      placeholder="현재 비밀번호"
                      value={passwordCurrent}
                      onChange={(e) => setPasswordCurrent(e.target.value)}
                      required
                    />
                    <input
                      type="password"
                      className="w-full rounded-md border px-3 py-2 text-sm"
                      placeholder="새 비밀번호 (8자 이상)"
                      value={passwordNext}
                      onChange={(e) => setPasswordNext(e.target.value)}
                      minLength={8}
                      required
                    />
                    {passwordError && <p className="text-xs text-red-600">{passwordError}</p>}
                    {passwordNotice && <p className="text-xs text-emerald-700">{passwordNotice}</p>}
                    <button
                      type="submit"
                      className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={passwordLoading}
                    >
                      {passwordLoading ? '변경 중...' : '내 비밀번호 변경'}
                    </button>
                  </form>
                </div>

                {canManageUsers && (
                  <div>
                    <h2 className="mb-2 text-sm font-semibold">관리자 기능 · 사용자 추가</h2>
                    <form className="grid grid-cols-1 gap-2 sm:grid-cols-2" onSubmit={onCreateUser}>
                      <input
                        type="email"
                        className="rounded-md border px-3 py-2 text-sm"
                        placeholder="email"
                        value={adminForm.email}
                        onChange={(e) => setAdminForm((prev) => ({ ...prev, email: e.target.value }))}
                        required
                      />
                      <input
                        className="rounded-md border px-3 py-2 text-sm"
                        placeholder="name"
                        value={adminForm.name}
                        onChange={(e) => setAdminForm((prev) => ({ ...prev, name: e.target.value }))}
                        required
                      />
                      <select
                        className="rounded-md border px-3 py-2 text-sm"
                        value={adminForm.role}
                        onChange={(e) => setAdminForm((prev) => ({ ...prev, role: e.target.value as UserRole }))}
                      >
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                        <option value="super_admin">super_admin</option>
                      </select>
                      <input
                        type="password"
                        className="rounded-md border px-3 py-2 text-sm"
                        placeholder="초기 비밀번호"
                        minLength={8}
                        value={adminForm.password}
                        onChange={(e) => setAdminForm((prev) => ({ ...prev, password: e.target.value }))}
                        required
                      />
                      <label className="flex items-center gap-2 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={adminForm.isActive}
                          onChange={(e) => setAdminForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                        />
                        활성 사용자
                      </label>
                      <button
                        type="submit"
                        className="rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={adminUsersLoading}
                      >
                        사용자 추가
                      </button>
                    </form>
                  </div>
                )}
              </div>

              {canManageUsers && (
                <div className="mt-4 rounded-md border bg-slate-50 p-3">
                  <div className="mb-2 text-xs font-semibold text-slate-700">사용자 목록</div>
                  {adminUsersLoading && <p className="text-xs text-slate-500">로딩 중...</p>}
                  {adminUsersError && <p className="text-xs text-red-600">{adminUsersError}</p>}
                  {!adminUsersLoading && adminUsers.length === 0 && (
                    <p className="text-xs text-slate-500">등록된 사용자가 없습니다.</p>
                  )}
                  {!adminUsersLoading && adminUsers.length > 0 && (
                    <div className="overflow-auto rounded-md border bg-white">
                      <table className="min-w-full border-collapse text-left text-xs">
                        <thead className="bg-slate-100 text-slate-700">
                          <tr>
                            <th className="border-b px-2 py-2">email</th>
                            <th className="border-b px-2 py-2">name</th>
                            <th className="border-b px-2 py-2">role</th>
                            <th className="border-b px-2 py-2">active</th>
                            <th className="border-b px-2 py-2">actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {adminUsers.map((user) => (
                            <tr key={user.id} className="odd:bg-white even:bg-slate-50">
                              <td className="border-b px-2 py-2">
                                <input
                                  type="email"
                                  className="w-full min-w-44 rounded border px-2 py-1"
                                  value={adminUserEdits[user.id]?.email ?? user.email}
                                  onChange={(e) =>
                                    setAdminUserEdits((prev) => ({
                                      ...prev,
                                      [user.id]: {
                                        email: e.target.value,
                                        name: prev[user.id]?.name ?? user.name,
                                      },
                                    }))
                                  }
                                />
                              </td>
                              <td className="border-b px-2 py-2">
                                <input
                                  className="w-full min-w-32 rounded border px-2 py-1"
                                  value={adminUserEdits[user.id]?.name ?? user.name}
                                  onChange={(e) =>
                                    setAdminUserEdits((prev) => ({
                                      ...prev,
                                      [user.id]: {
                                        email: prev[user.id]?.email ?? user.email,
                                        name: e.target.value,
                                      },
                                    }))
                                  }
                                />
                              </td>
                              <td className="border-b px-2 py-2">
                                <select
                                  className="rounded border px-1 py-1"
                                  value={user.role}
                                  onChange={(e) => onChangeRole(user, e.target.value as UserRole)}
                                >
                                  <option value="user">user</option>
                                  <option value="admin">admin</option>
                                  <option value="super_admin">super_admin</option>
                                </select>
                              </td>
                              <td className="border-b px-2 py-2">{user.isActive ? 'Y' : 'N'}</td>
                              <td className="border-b px-2 py-2">
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
                </div>
              )}
            </section>

        <section className="rounded-lg border bg-white p-4 lg:col-span-4">
          <h2 className="mb-4 text-sm font-semibold">필터 패널</h2>

          <form className="space-y-4" onSubmit={onSubmit}>
            {selectedGuide.supportsUserLookup ? (
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">고객 검색 (자동완성)</span>
                <input
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={customerQuery}
                  onChange={(e) => setCustomerQuery(e.target.value)}
                  placeholder="이름/이메일/ID 2글자 이상"
                />
                <div className="mt-1 text-xs text-slate-500">선택 시 Customer ID 필드가 자동 입력됩니다.</div>
                {customerLoading && <div className="mt-1 text-xs text-slate-500">검색 중...</div>}
                {customerError && <div className="mt-1 text-xs text-red-600">{customerError}</div>}
                {!customerLoading && customerOptions.length > 0 && (
                  <ul className="mt-2 max-h-40 overflow-auto rounded-md border bg-white">
                    {customerOptions.map((customer) => (
                      <li key={customer.id}>
                        <button
                          type="button"
                          className="w-full px-3 py-2 text-left text-xs hover:bg-slate-100"
                          onClick={() => {
                            setCustomerId(customer.id)
                            setCustomerQuery('')
                            setCustomerOptions([])
                            setChannelOptions([])
                            setChannelError(null)
                          }}
                        >
                          <div className="font-medium text-slate-800">{customer.id}</div>
                          <div className="text-slate-500">
                            {customer.name || '-'}
                            {customer.email ? ` · ${customer.email}` : ''}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </label>
            ) : (
              <div className="rounded-md border border-dashed bg-white p-3 text-xs text-slate-600">
                이 데이터 타입은 자동완성 검색 대신 운영자가 알고 있는 식별값을 직접 입력해 조회합니다.
              </div>
            )}

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Data Type</span>
              <select
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={dataType}
                onChange={(e) => setDataType(e.target.value as DataType)}
              >
                {DATA_TYPES.map((item) => (
                  <option key={item} value={item}>
                    {DATA_TYPE_GUIDE[item].label} ({item})
                  </option>
                ))}
              </select>
            </label>

            <div className="rounded-md border bg-slate-50 p-3">
              <div className="text-xs font-semibold text-slate-700">Data Type 안내</div>
              <p className="mt-1 text-xs text-slate-600">{selectedGuide.description}</p>
              <p className="mt-1 text-xs text-slate-600">조회 식별자 키: {selectedGuide.customerKey}</p>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Customer ID</span>
              <input
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={customerId}
                onChange={(e) => {
                  setCustomerId(e.target.value)
                  setChannelOptions([])
                  setChannelError(null)
                }}
                placeholder={selectedGuide.customerExample}
                required={!isPartnerResolvedMode}
              />
              <div className="mt-1 text-xs text-slate-500">{selectedGuide.customerInputHint}</div>
            </label>

            {selectedGuide.supportsPartnerLookup && (
              <div className="space-y-2 rounded-md border bg-slate-50 p-3">
                <div className="text-xs font-semibold text-slate-700">Partner ID 기반 사용자 확장</div>
                <div className="flex gap-2">
                  <input
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    value={partnerId}
                    onChange={(e) => {
                      setPartnerId(e.target.value)
                      setPartnerCustomerIds([])
                      setPartnerCustomers([])
                      setPartnerResolveError(null)
                      setChannelOptions([])
                      setChannelError(null)
                    }}
                    placeholder="partner ID 입력 (users._id)"
                  />
                  <button
                    type="button"
                    className="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={onResolvePartnerUsers}
                    disabled={partnerResolveLoading}
                  >
                    {partnerResolveLoading ? '확인 중...' : '사용자 불러오기'}
                  </button>
                </div>
                <p className="text-xs text-slate-500">partner ID를 기준으로 users.members 목록을 customerIds로 확장해 일괄 조회합니다.</p>
                {partnerResolveError && <p className="text-xs text-red-600">{partnerResolveError}</p>}
                {!partnerResolveError && partnerCustomerIds.length > 0 && (
                  <p className="text-xs text-emerald-700">조회 대상 사용자 {partnerCustomerIds.length}명 로드됨</p>
                )}
                {partnerCustomers.length > 0 && (
                  <div className="max-h-24 overflow-auto rounded-md border bg-white p-2">
                    <ul className="space-y-1 text-xs text-slate-600">
                      {partnerCustomers.slice(0, 20).map((customer) => (
                        <li key={customer.id}>
                          {customer.id}
                          {customer.email ? ` · ${customer.email}` : ''}
                        </li>
                      ))}
                    </ul>
                    {partnerCustomers.length > 20 && (
                      <p className="mt-1 text-[11px] text-slate-500">외 {partnerCustomers.length - 20}명</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {supportsChannelSelection && (
              <div className="space-y-2 rounded-md border bg-slate-50 p-3">
                <div className="text-xs font-semibold text-slate-700">1단계 · 채널 조회/선택</div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={onLoadCustomerChannels}
                    disabled={channelLoading || queryLoading || schemaLoading}
                  >
                    {channelLoading ? '채널 조회 중...' : '채널 조회'}
                  </button>
                  <p className="text-xs text-slate-500">Customer ID 기준으로 채널 목록을 불러온 뒤 선택할 수 있습니다.</p>
                </div>

                {channelError && <p className="text-xs text-red-600">{channelError}</p>}
                {!channelError && channelOptions.length > 0 && (
                  <p className="text-xs text-emerald-700">선택 가능한 채널 {channelOptions.length}개</p>
                )}

                {channelOptions.length > 0 && channelFilterKey && (
                  <div className="max-h-40 overflow-auto rounded-md border bg-white">
                    <ul className="divide-y">
                      {channelOptions.map((channel) => (
                        <li key={channel}>
                          <button
                            type="button"
                            className={`w-full px-3 py-2 text-left text-xs hover:bg-slate-100 ${selectedChannel === channel ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-700'}`}
                            onClick={() => {
                              const nextFilterInputs: FilterInputState = {
                                ...filterInputs,
                                [channelFilterKey]: channel,
                              }

                              setFilterInputs((prev) => ({
                                ...prev,
                                [channelFilterKey]: channel,
                              }))

                              if (dataType === 'conversations') {
                                void executeQuery(nextFilterInputs)
                              }
                            }}
                          >
                            {channel}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="rounded-md border border-dashed bg-white p-3 text-xs text-slate-600">
              2단계 · 아래 조건을 확인한 뒤 로그 조회를 실행합니다.
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Start</span>
                <input
                  type="datetime-local"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                  required
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">End</span>
                <input
                  type="datetime-local"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={endAt}
                  onChange={(e) => setEndAt(e.target.value)}
                  required
                />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Page Size</span>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value) || 100)}
                />
              </label>

              <label className="mt-6 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={includeTotal}
                  onChange={(e) => setIncludeTotal(e.target.checked)}
                />
                Include Total
              </label>
            </div>

            <div className="space-y-3 rounded-md border bg-slate-50 p-3">
              <div className="text-xs font-semibold text-slate-700">Schema Filters</div>
              {schemaLoading && <p className="text-xs text-slate-500">스키마 로딩 중...</p>}
              {schemaError && <p className="text-xs text-red-600">{schemaError}</p>}
              {!schemaLoading && !schemaError && schema?.filters.length === 0 && (
                <p className="text-xs text-slate-500">사용 가능한 추가 필터가 없습니다.</p>
              )}

              {schema?.filters.map((filter) => {
                if (filter.type === 'range') {
                  const range = asRangeValue(filterInputs[filter.key])
                  const minValue = range.min ?? ''
                  const maxValue = range.max ?? ''

                  return (
                    <div key={filter.key}>
                      <div className="mb-1 text-xs text-slate-600">{filter.label}</div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          className="rounded-md border px-2 py-1 text-sm"
                          placeholder="min"
                          value={minValue}
                          onChange={(e) =>
                            setFilterInputs((prev) => ({
                              ...prev,
                              [filter.key]: {
                                ...asRangeValue(prev[filter.key]),
                                min: e.target.value,
                              },
                            }))
                          }
                        />
                        <input
                          className="rounded-md border px-2 py-1 text-sm"
                          placeholder="max"
                          value={maxValue}
                          onChange={(e) =>
                            setFilterInputs((prev) => ({
                              ...prev,
                              [filter.key]: {
                                ...asRangeValue(prev[filter.key]),
                                max: e.target.value,
                              },
                            }))
                          }
                        />
                      </div>
                    </div>
                  )
                }

                if (filter.type === 'select' && filter.options && filter.options.length > 0) {
                  return (
                    <label key={filter.key} className="block">
                      <span className="mb-1 block text-xs text-slate-600">{filter.label}</span>
                      <select
                        className="w-full rounded-md border px-2 py-1 text-sm"
                        value={asStringValue(filterInputs[filter.key])}
                        onChange={(e) =>
                          setFilterInputs((prev) => ({
                            ...prev,
                            [filter.key]: e.target.value,
                          }))
                        }
                      >
                        <option value="">선택 안함</option>
                        {filter.options.map((option) => (
                          <option key={String(option.value)} value={String(option.value)}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )
                }

                return (
                  <label key={filter.key} className="block">
                    <span className="mb-1 block text-xs text-slate-600">{filter.label}</span>
                    <input
                      className="w-full rounded-md border px-2 py-1 text-sm"
                      value={asStringValue(filterInputs[filter.key])}
                      onChange={(e) =>
                        setFilterInputs((prev) => ({
                          ...prev,
                          [filter.key]: e.target.value,
                        }))
                      }
                    />
                  </label>
                )
              })}
            </div>

            <button
              type="submit"
              disabled={queryLoading || schemaLoading}
              className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {queryLoading ? '로그 조회 중...' : '로그 조회'}
            </button>
          </form>
        </section>

        <section className="rounded-lg border bg-white p-4 lg:col-span-8">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">결과 영역</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={rows.length === 0 || queryLoading}
                onClick={() => onExportClick('csv')}
              >
                CSV 다운로드
              </button>
              <button
                type="button"
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={rows.length === 0 || queryLoading}
                onClick={() => onExportClick('json')}
              >
                JSON 다운로드
              </button>
              <div className="text-xs text-slate-600">
                rows: {rows.length}
                {typeof total === 'number' ? ` / total: ${total}` : ''}
                {hasMore ? ' / hasMore: true' : ''}
              </div>
            </div>
          </div>

          {exportNotice && <p className="mb-3 text-xs text-slate-600">{exportNotice}</p>}

          <div className="mb-3 rounded-md border bg-slate-50 p-3">
            <div className="mb-2 text-xs font-semibold text-slate-700">실행 이력 (최근 10건)</div>
            {queryHistory.length === 0 ? (
              <p className="text-xs text-slate-500">아직 실행 이력이 없습니다.</p>
            ) : (
              <ul className="space-y-1">
                {queryHistory.map((item) => (
                  <li key={item.id} className="text-xs text-slate-700">
                    <span className={item.status === 'success' ? 'text-emerald-600' : 'text-red-600'}>
                      [{item.status}]
                    </span>{' '}
                    {new Date(item.executedAt).toLocaleString()} · {item.dataType} · {item.customerId || '-'} · rows {item.rowCount}
                    {typeof item.total === 'number' ? ` / total ${item.total}` : ''}
                    {item.errorMessage ? ` · ${item.errorMessage}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {availableColumns.length > 0 && (
            <div className="mb-3 rounded-md border bg-slate-50 p-3">
              <div className="mb-2 text-xs font-semibold text-slate-700">표시 컬럼</div>
              <div className="flex flex-wrap gap-3">
                {availableColumns.map((column) => (
                  <label key={column} className="flex items-center gap-1 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={selectedColumns.includes(column)}
                      onChange={() => toggleColumn(column)}
                    />
                    {column}
                  </label>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-slate-500">최소 1개 컬럼은 항상 선택됩니다.</p>
            </div>
          )}

          {queryError && <p className="mb-3 text-sm text-red-600">{queryError}</p>}

          {rows.length === 0 ? (
            <p className="text-sm text-slate-500">조회 결과가 없습니다. 왼쪽 필터에서 조건을 입력한 뒤 조회를 실행하세요.</p>
          ) : (
            <div className="overflow-auto rounded-md border">
              <table className="min-w-full border-collapse text-left text-xs">
                <thead className="bg-slate-100 text-slate-700">
                  <tr>
                    {resultColumns.map((column) => (
                      <th key={column} className="border-b px-2 py-2 font-semibold">
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rowIndex) => (
                    <tr key={rowIndex} className="odd:bg-white even:bg-slate-50">
                      {resultColumns.map((column) => (
                        <td key={`${rowIndex}-${column}`} className="max-w-xs border-b px-2 py-2 align-top">
                          {typeof row[column] === 'object' && row[column] !== null
                            ? JSON.stringify(row[column])
                            : String(row[column] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
          </>
        )}
      </main>
    </div>
  )
}

export default App
