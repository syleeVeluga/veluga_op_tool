import type { DataType, DataTypeSchema } from './api'
import type { AuthSession, FilterInputState, QueryUiSettings, StoredFilterState } from '../types/ui'
import { DATA_TYPES } from '../constants'
import { asRangeValue, toDatetimeLocalValue } from './utils'

const QUERY_SETTINGS_STORAGE_KEY = 'user-log-dashboard:query-settings:v1'
const FILTER_SETTINGS_STORAGE_KEY = 'user-log-dashboard:filter-settings:v1'
const AUTH_SESSION_STORAGE_KEY = 'user-log-dashboard:auth-session:v1'
const COLUMN_SETTINGS_STORAGE_KEY = 'user-log-dashboard:selected-columns:v1'

export function loadStoredFilterState(dataType: DataType): StoredFilterState | null {
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

export function saveStoredFilterState(dataType: DataType, customerId: string, filters: FilterInputState): void {
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

export function loadAuthSession(): AuthSession | null {
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

export function saveAuthSession(session: AuthSession | null): void {
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

export function sanitizeStoredFilters(schema: DataTypeSchema, candidate: FilterInputState): FilterInputState {
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

export function loadStoredColumns(dataType: DataType): string[] | null {
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

export function saveStoredColumns(dataType: DataType, columns: string[]): void {
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

export function getDefaultQueryUiSettings(): QueryUiSettings {
  const now = new Date()
  const before = new Date(now)
  before.setDate(before.getDate() - 7)

  return {
    dataType: 'api_usage_logs',
    startAt: toDatetimeLocalValue(before),
    endAt: toDatetimeLocalValue(now),
    pageSize: 100,
    includeTotal: true,
    sortOrder: 'asc',
  }
}

export function loadStoredQueryUiSettings(): QueryUiSettings {
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

    const sortOrderCandidate =
      parsed.sortOrder ?? parsed.serviceSortOrder
    const safeSortOrder =
      sortOrderCandidate === 'asc' || sortOrderCandidate === 'desc'
        ? sortOrderCandidate
        : defaults.sortOrder

    return {
      dataType: safeDataType,
      startAt: startCandidate,
      endAt: endCandidate,
      pageSize: safePageSize,
      includeTotal: safeIncludeTotal,
      sortOrder: safeSortOrder,
    }
  } catch {
    return defaults
  }
}

export function saveStoredQueryUiSettings(settings: QueryUiSettings): void {
  try {
    window.localStorage.setItem(QUERY_SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // ignore localStorage failures
  }
}
