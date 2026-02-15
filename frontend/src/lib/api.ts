export type DataType =
  | 'conversations'
  | 'api_usage_logs'
  | 'event_logs'
  | 'error_logs'
  | 'billing_logs'
  | 'user_activities'

export interface SchemaColumn {
  key: string
  label: string
  type: string
}

export interface SchemaFilter {
  key: string
  label: string
  type: 'search' | 'select' | 'range'
  options?: Array<string | number | boolean | { label: string; value: string | number | boolean }>
}

export interface DataTypeSchema {
  columns: SchemaColumn[]
  filters: SchemaFilter[]
}

export type QueryFilterValue =
  | string
  | number
  | boolean
  | {
      min?: string | number
      max?: string | number
    }

export interface QueryRequestPayload {
  dataType: DataType
  customerId?: string
  customerIds?: string[]
  dateRange: {
    start: string
    end: string
  }
  filters?: Record<string, QueryFilterValue>
  columns?: string[]
  pageSize?: number
  includeTotal?: boolean
  includeSessionMessages?: boolean
  reportMode?: 'default' | 'customer'
  sortOrder?: 'asc' | 'desc'
  matchWindowSec?: number
}

export interface ExportFileResult {
  blob: Blob
  fileName: string
  mimeType: string
}

export interface QueryResponse {
  rows: Array<Record<string, unknown>>
  total?: number
  pageSize: number
  hasMore: boolean
  summary?: {
    totalRows?: number
    totalCreditUsed?: number
    fallbackCount?: number
    unmatchedCount?: number
  }
  nextCursor?: {
    afterTs: string
    afterId: string
  }
}

export interface CustomerSearchItem {
  id: string
  name?: string
  email?: string
}

export interface CustomerSearchResponse {
  customers: CustomerSearchItem[]
}

export interface CustomerChannelItem {
  channelId: string
  channelName?: string
}

export interface PartnerCustomerResolveResponse {
  partnerId: string
  customerIds: string[]
  customers: CustomerSearchItem[]
}

export type UserRole = 'super_admin' | 'admin' | 'user'

export interface AuthUser {
  id: string
  email: string
  name: string
  role: UserRole
  mustChangePassword: boolean
}

export interface DashboardUser {
  id: string
  email: string
  name: string
  role: UserRole
  mustChangePassword: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
}

function normalizeApiBaseUrl(rawBaseUrl: string | undefined): string {
  const base = (rawBaseUrl ?? 'http://localhost:8080/api').trim()
  const withoutTrailingSlash = base.replace(/\/+$/, '')
  const withoutAuthSuffix = withoutTrailingSlash.replace(/\/(api\/)?auth(?:\/.*)?$/i, '')
  const normalizedRoot = withoutAuthSuffix.replace(/\/+$/, '')

  if (/\/api$/i.test(normalizedRoot)) {
    return normalizedRoot
  }

  return `${normalizedRoot}/api`
}

const API_BASE_URL = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL)

function resolveDownloadFileName(contentDisposition: string | null, fallbackName: string): string {
  if (!contentDisposition) {
    return fallbackName
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1])
    } catch {
      return utf8Match[1]
    }
  }

  const plainMatch = contentDisposition.match(/filename="?([^";]+)"?/i)
  if (plainMatch?.[1]) {
    return plainMatch[1]
  }

  return fallbackName
}

async function requestJson<T>(path: string, init?: RequestInit, token?: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  })

  const body = await response.json().catch(() => null)

  if (!response.ok) {
    const message = body?.message ?? `Request failed (${response.status})`
    throw new Error(message)
  }

  return body as T
}

export function fetchSchema(dataType: DataType): Promise<DataTypeSchema> {
  return requestJson<DataTypeSchema>(`/schema/${dataType}`)
}

export function postDataQuery(payload: QueryRequestPayload): Promise<QueryResponse> {
  return requestJson<QueryResponse>('/data/query', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function exportDataFile(
  payload: QueryRequestPayload,
  format: 'csv' | 'json',
  options?: { gzip?: boolean },
): Promise<ExportFileResult> {
  const gzipQuery = format === 'json' && options?.gzip ? '?gzip=1' : ''
  const response = await fetch(`${API_BASE_URL}/data/export-${format}${gzipQuery}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const message = body?.message ?? `Request failed (${response.status})`
    throw new Error(message)
  }

  const fallbackName = `export.${format}${format === 'json' && options?.gzip ? '.gz' : ''}`
  const fileName = resolveDownloadFileName(response.headers.get('content-disposition'), fallbackName)
  const mimeType = response.headers.get('content-type') ?? 'application/octet-stream'
  const blob = await response.blob()

  return {
    blob,
    fileName,
    mimeType,
  }
}

export function searchCustomers(query: string): Promise<CustomerSearchResponse> {
  const encoded = encodeURIComponent(query)
  return requestJson<CustomerSearchResponse>(`/customers/search?q=${encoded}`)
}

export function resolveCustomersByPartnerId(partnerId: string): Promise<PartnerCustomerResolveResponse> {
  const encoded = encodeURIComponent(partnerId)
  return requestJson<PartnerCustomerResolveResponse>(`/customers/by-partner?partnerId=${encoded}`)
}

export function fetchCustomerChannels(
  dataType: DataType,
  customerId: string,
): Promise<{ channels: CustomerChannelItem[] }> {
  const encodedDataType = encodeURIComponent(dataType)
  const encodedCustomerId = encodeURIComponent(customerId)
  return requestJson<{ channels: CustomerChannelItem[] }>(
    `/customers/channels?dataType=${encodedDataType}&customerId=${encodedCustomerId}`,
  )
}

export function login(payload: { email: string; password: string }): Promise<{ token: string; user: AuthUser }> {
  return requestJson<{ token: string; user: AuthUser }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function fetchMe(token: string): Promise<{ user: DashboardUser | null }> {
  return requestJson<{ user: DashboardUser | null }>('/auth/me', undefined, token)
}

export function changeMyPassword(
  token: string,
  payload: { currentPassword: string; newPassword: string },
): Promise<{ ok: boolean; user: AuthUser | null }> {
  return requestJson<{ ok: boolean; user: AuthUser | null }>(
    '/auth/change-password',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token,
  )
}

export function listAdminUsers(token: string): Promise<{ users: DashboardUser[] }> {
  return requestJson<{ users: DashboardUser[] }>('/admin/users', undefined, token)
}

export function createAdminUser(
  token: string,
  payload: { email: string; name: string; role: UserRole; password: string; isActive?: boolean },
): Promise<{ user: DashboardUser }> {
  return requestJson<{ user: DashboardUser }>(
    '/admin/users',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token,
  )
}

export function updateAdminUser(
  token: string,
  userId: string,
  payload: { email?: string; name?: string; role?: UserRole; password?: string; isActive?: boolean },
): Promise<{ user: DashboardUser }> {
  return requestJson<{ user: DashboardUser }>(
    `/admin/users/${encodeURIComponent(userId)}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
    token,
  )
}

export function deleteAdminUser(token: string, userId: string): Promise<{ ok: boolean }> {
  return requestJson<{ ok: boolean }>(`/admin/users/${encodeURIComponent(userId)}`, { method: 'DELETE' }, token)
}
