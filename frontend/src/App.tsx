import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  type CustomerSearchItem,
  type DataType,
  type DataTypeSchema,
  type QueryFilterValue,
  fetchSchema,
  postDataQuery,
  searchCustomers,
} from './lib/api'

const DATA_TYPES: DataType[] = [
  'conversations',
  'api_usage_logs',
  'event_logs',
  'error_logs',
  'billing_logs',
  'user_activities',
]

const COLUMN_SETTINGS_STORAGE_KEY = 'user-log-dashboard:selected-columns:v1'

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

function App() {
  const [dataType, setDataType] = useState<DataType>('api_usage_logs')
  const [customerId, setCustomerId] = useState('')
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerOptions, setCustomerOptions] = useState<CustomerSearchItem[]>([])
  const [customerLoading, setCustomerLoading] = useState(false)
  const [customerError, setCustomerError] = useState<string | null>(null)
  const [startAt, setStartAt] = useState(() => {
    const now = new Date()
    const before = new Date(now)
    before.setDate(before.getDate() - 7)
    return toDatetimeLocalValue(before)
  })
  const [endAt, setEndAt] = useState(() => toDatetimeLocalValue(new Date()))
  const [pageSize, setPageSize] = useState(100)
  const [includeTotal, setIncludeTotal] = useState(true)

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
        setFilterInputs({})
        const schemaColumns = result.columns.map((column) => column.key)
        const schemaColumnSet = new Set(schemaColumns)
        const stored = loadStoredColumns(dataType)

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
    const keyword = customerQuery.trim()

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
  }, [customerQuery])

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

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    setQueryLoading(true)
    setQueryError(null)

    try {
      const result = await postDataQuery({
        dataType,
        customerId: customerId.trim(),
        dateRange: {
          start: toIsoString(startAt),
          end: toIsoString(endAt),
        },
        filters: buildFilters(schema, filterInputs),
        columns: selectedColumns,
        pageSize,
        includeTotal,
      })

      setRows(result.rows)
      setTotal(result.total)
      setHasMore(result.hasMore)
    } catch (error) {
      setRows([])
      setTotal(undefined)
      setHasMore(false)
      setQueryError(error instanceof Error ? error.message : '조회 실패')
    } finally {
      setQueryLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <h1 className="text-lg font-semibold">User Log Dashboard</h1>
          <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">Filter + Query MVP</span>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-4 px-4 py-6 sm:px-6 lg:grid-cols-12 lg:px-8">
        <section className="rounded-lg border bg-white p-4 lg:col-span-4">
          <h2 className="mb-4 text-sm font-semibold">필터 패널</h2>

          <form className="space-y-4" onSubmit={onSubmit}>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Data Type</span>
              <select
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={dataType}
                onChange={(e) => setDataType(e.target.value as DataType)}
              >
                {DATA_TYPES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Customer ID</span>
              <input
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                placeholder="customerId 입력"
                required
              />
            </label>

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
              {queryLoading ? '조회 중...' : '조회 실행'}
            </button>
          </form>
        </section>

        <section className="rounded-lg border bg-white p-4 lg:col-span-8">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">결과 영역</h2>
            <div className="text-xs text-slate-600">
              rows: {rows.length}
              {typeof total === 'number' ? ` / total: ${total}` : ''}
              {hasMore ? ' / hasMore: true' : ''}
            </div>
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
      </main>
    </div>
  )
}

export default App
