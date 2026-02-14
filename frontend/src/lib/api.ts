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
  options?: Array<{ label: string; value: string | number | boolean }>
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
}

export interface QueryResponse {
  rows: Array<Record<string, unknown>>
  total?: number
  pageSize: number
  hasMore: boolean
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

export interface PartnerCustomerResolveResponse {
  partnerId: string
  customerIds: string[]
  customers: CustomerSearchItem[]
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080/api'

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
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

export function searchCustomers(query: string): Promise<CustomerSearchResponse> {
  const encoded = encodeURIComponent(query)
  return requestJson<CustomerSearchResponse>(`/customers/search?q=${encoded}`)
}

export function resolveCustomersByPartnerId(partnerId: string): Promise<PartnerCustomerResolveResponse> {
  const encoded = encodeURIComponent(partnerId)
  return requestJson<PartnerCustomerResolveResponse>(`/customers/by-partner?partnerId=${encoded}`)
}
