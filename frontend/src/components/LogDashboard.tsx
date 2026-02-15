import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  type CustomerChannelItem,
  type CustomerSearchItem,
  type DataType,
  fetchSchema,
  fetchCustomerChannels,
  postDataQuery,
  searchCustomers,
  type DataTypeSchema,
} from '../lib/api'
import { DATA_TYPES, DATA_TYPE_GUIDE } from '../constants'
import { 
    asStringValue, 
    asRangeValue, 
    toIsoString, 
    buildFilters, 
    buildCsvContent, 
    projectRowsByColumns, 
    triggerFileDownload,
    toExportTimestamp
} from '../lib/utils'
import { 
    loadStoredFilterState, 
    saveStoredFilterState, 
    loadStoredColumns, 
    saveStoredColumns, 
    loadStoredQueryUiSettings,
    saveStoredQueryUiSettings,
    sanitizeStoredFilters
} from '../lib/storage'
import type { FilterInputState, QueryHistoryItem } from '../types/ui'

type DashboardMode = 'default' | 'service'

interface LogDashboardProps {
  mode?: DashboardMode
}

const SERVICE_REPORT_COLUMNS = [
  'occurredAt',
  'channel',
  'sessionId',
  'customerId',
  'questionText',
  'finalAnswerText',
  'like',
  'finalAnswerModel',
  'creditUsed',
  'sessionCreditTotal',
  'matchSource',
] as const

export function LogDashboard({ mode = 'default' }: LogDashboardProps) {
  const initialQuerySettings = loadStoredQueryUiSettings()

  const [dataType, setDataType] = useState<DataType>(initialQuerySettings.dataType)
  const [customerId, setCustomerId] = useState('')
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerOptions, setCustomerOptions] = useState<CustomerSearchItem[]>([])
  const [customerLoading, setCustomerLoading] = useState(false)
  const [customerError, setCustomerError] = useState<string | null>(null)
  const [channelOptions, setChannelOptions] = useState<CustomerChannelItem[]>([])
  const [channelLoading, setChannelLoading] = useState(false)
  const [channelError, setChannelError] = useState<string | null>(null)
  const [startAt, setStartAt] = useState(initialQuerySettings.startAt)
  const [endAt, setEndAt] = useState(initialQuerySettings.endAt)
  const [pageSize, setPageSize] = useState(initialQuerySettings.pageSize)
  const [includeTotal, setIncludeTotal] = useState(initialQuerySettings.includeTotal)
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(initialQuerySettings.sortOrder)

  const [schema, setSchema] = useState<DataTypeSchema | null>(null)
  const [schemaLoading, setSchemaLoading] = useState(false)
  const [schemaError, setSchemaError] = useState<string | null>(null)

  const [filterInputs, setFilterInputs] = useState<FilterInputState>({})
  const [selectedColumns, setSelectedColumns] = useState<string[]>([])

  const [rows, setRows] = useState<Array<Record<string, unknown>>>([])
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [total, setTotal] = useState<number | undefined>(undefined)
  const [hasMore, setHasMore] = useState(false)
  const [queryLoading, setQueryLoading] = useState(false)
  const [queryError, setQueryError] = useState<string | null>(null)
  const [queryHistory, setQueryHistory] = useState<QueryHistoryItem[]>([])
  const [exportNotice, setExportNotice] = useState<string | null>(null)
  const [reportSummary, setReportSummary] = useState<Record<string, unknown> | null>(null)

  const isServiceMode = mode === 'service'

  const selectedGuide = DATA_TYPE_GUIDE[dataType]
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
  const supportsChannelSelection =
    Boolean(channelFilterKey) &&
    (dataType === 'conversations' || dataType === 'api_usage_logs')
  const selectedChannel = channelFilterKey ? asStringValue(filterInputs[channelFilterKey]) : ''

  const availableColumns = useMemo(() => {
    if (rows.length > 0) {
      return Object.keys(rows[0])
    }
    return schema?.columns.map((c) => c.key) ?? []
  }, [rows, schema])

  const resultColumns = useMemo(() => {
    if (isServiceMode) {
      const set = new Set(availableColumns)
      const ordered = SERVICE_REPORT_COLUMNS.filter((column) => set.has(column))
      const extras = availableColumns.filter(
        (column) =>
          !SERVICE_REPORT_COLUMNS.includes(column as (typeof SERVICE_REPORT_COLUMNS)[number]) &&
          column !== 'matchScore',
      )
      return [...ordered, ...extras]
    }

    if (selectedColumns.length === 0) {
      return availableColumns
    }

    const set = new Set(availableColumns)
    return selectedColumns.filter((column) => set.has(column))
  }, [availableColumns, isServiceMode, selectedColumns])

  useEffect(() => {
    if (isServiceMode && dataType !== 'conversations') {
      setDataType('conversations')
      return
    }

    void (async () => {
      setSchemaLoading(true)
      setSchemaError(null)
      try {
        const result = await fetchSchema(dataType)
        setSchema(result)
        
        // Reset filters when schema changes
        setFilterInputs({}) 
        
        // Load stored filters or columns if needed
        const storedFilters = loadStoredFilterState(dataType)
        if (storedFilters) {
           // We might apply stored filters here, but need to validate against new schema
           // For now, let's just use what we have or sanitize
           setCustomerId(storedFilters.customerId)
           // Defer setting filters until schema is ready? 
           // Implementation note: The original App.tsx loaded filter inputs from storage.
           // We'll mimic basic behavior or reset.
           setFilterInputs(sanitizeStoredFilters(result, storedFilters.filters))
        }

        const storedColumns = loadStoredColumns(dataType)
        if (storedColumns) {
            setSelectedColumns(storedColumns)
        } else {
            setSelectedColumns([])
        }

      } catch (error) {
        setSchemaError(error instanceof Error ? error.message : '스키마 로딩 실패')
        setSchema(null)
      } finally {
        setSchemaLoading(false)
      }
    })()
  }, [dataType, isServiceMode])

  // Debounced customer search
  useEffect(() => {
    if (!customerQuery.trim() || customerQuery.length < 2) {
      setCustomerOptions([])
      return
    }

    const timer = setTimeout(() => {
      void (async () => {
        setCustomerLoading(true)
        setCustomerError(null)
        try {
          const results = await searchCustomers(customerQuery)
          setCustomerOptions(results.customers)
        } catch (error) {
          setCustomerError(error instanceof Error ? error.message : '검색 실패')
        } finally {
          setCustomerLoading(false)
        }
      })()
    }, 500)

    return () => clearTimeout(timer)
  }, [customerQuery])

  // Save UI settings
  useEffect(() => {
    saveStoredQueryUiSettings({
        dataType,
        startAt,
        endAt,
        pageSize,
        includeTotal,
        sortOrder,
    })
  }, [dataType, startAt, endAt, pageSize, includeTotal, sortOrder])

  // Save Column settings
  useEffect(() => {
      if (selectedColumns.length > 0) {
          saveStoredColumns(dataType, selectedColumns)
      }
  }, [dataType, selectedColumns])

  // Save Filter State
  useEffect(() => {
    if (!schema) {
      return
    }
    const sanitized = sanitizeStoredFilters(schema, filterInputs)
    saveStoredFilterState(dataType, customerId, sanitized)
  }, [customerId, dataType, filterInputs, schema])


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

  const resolveCustomerIdFromInputs = async (): Promise<string | null> => {
    const normalizedCustomerId = customerId.trim()
    if (normalizedCustomerId) {
      return normalizedCustomerId
    }

    const keyword = customerQuery.trim()
    if (!keyword) {
      return null
    }

    if (keyword.length < 2) {
      throw new Error('사용자명 검색은 2글자 이상 입력해 주세요.')
    }

    setCustomerLoading(true)
    setCustomerError(null)

    try {
      const result = await searchCustomers(keyword)
      const customers = result.customers
      setCustomerOptions(customers)

      if (customers.length === 0) {
        throw new Error('입력한 사용자명으로 조회 가능한 사용자를 찾지 못했습니다.')
      }

      const normalizedKeyword = keyword.toLowerCase()
      const exactMatch = customers.find((customer) => {
        const id = customer.id.toLowerCase()
        const name = (customer.name ?? '').trim().toLowerCase()
        const email = (customer.email ?? '').trim().toLowerCase()
        return id === normalizedKeyword || name === normalizedKeyword || email === normalizedKeyword
      })

      const resolvedCustomer =
        exactMatch ?? (customers.length === 1 ? customers[0] : null)

      if (!resolvedCustomer) {
        throw new Error('동일 검색어 결과가 여러 건입니다. 자동완성 목록에서 사용자를 선택해 주세요.')
      }

      setCustomerId(resolvedCustomer.id)
      return resolvedCustomer.id
    } finally {
      setCustomerLoading(false)
    }
  }

  const onLoadCustomerChannels = async () => {
    if (!channelFilterKey) {
      return
    }

    let normalizedCustomerId = customerId.trim()

    if (!normalizedCustomerId) {
      try {
        normalizedCustomerId = (await resolveCustomerIdFromInputs()) ?? ''
      } catch (error) {
        const message = error instanceof Error ? error.message : '사용자명 기반 ID 확인에 실패했습니다.'
        setChannelError(message)
        setCustomerError(message)
        setChannelOptions([])
        return
      }
    }

    if (!normalizedCustomerId) {
      const message = 'Customer ID를 입력해 주세요.'
      setChannelError(message)
      setCustomerError(message)
      setChannelOptions([])
      return
    }

    setChannelLoading(true)
    setChannelError(null)
    setChannelOptions([])

    try {
      const result = await fetchCustomerChannels(dataType, normalizedCustomerId)
      const channels = [...result.channels].sort((left, right) =>
        left.channelId.localeCompare(right.channelId),
      )

      setChannelOptions(channels)

      if (channels.length === 0) {
        setChannelError('해당 조건에서 선택 가능한 채널이 없습니다.')
      }
    } catch (error) {
      setChannelError(error instanceof Error ? error.message : '채널 조회 실패')
      setChannelOptions([])
    } finally {
      setChannelLoading(false)
    }
  }

  const executeQuery = async (overrideFilterInputs?: FilterInputState) => {
    let normalizedCustomerId = customerId.trim()
    const requestStart = toIsoString(startAt)
    const requestEnd = toIsoString(endAt)

    if (!normalizedCustomerId) {
      try {
        normalizedCustomerId = (await resolveCustomerIdFromInputs()) ?? ''
      } catch (error) {
        const message = error instanceof Error ? error.message : '사용자명 기반 ID 확인에 실패했습니다.'
        setQueryError(message)
        setCustomerError(message)
        return
      }
    }

    if (!normalizedCustomerId) {
      const message = 'Customer ID를 입력해 주세요.'
      setQueryError(message)
      setCustomerError(message)
      return
    }

    setQueryLoading(true)
    setQueryError(null)
    setExportNotice(null)

    try {
      const result = await postDataQuery({
        dataType,
        customerId: normalizedCustomerId,
        dateRange: {
          start: requestStart,
          end: requestEnd,
        },
        filters: buildFilters(schema, overrideFilterInputs ?? filterInputs),
        columns: selectedColumns,
        pageSize,
        includeTotal,
        sortOrder,
        ...(isServiceMode
          ? {
              includeSessionMessages: true,
              reportMode: 'customer' as const,
              matchWindowSec: 60,
            }
          : {}),
      })

      setRows(result.rows)
      setTotal(result.total)
      setHasMore(result.hasMore)
      setReportSummary(isServiceMode ? (result.summary as Record<string, unknown> | undefined) ?? null : null)
      const historyItem: QueryHistoryItem = {
        id: `${Date.now()}-success`,
        executedAt: new Date().toISOString(),
        dataType,
        customerId: normalizedCustomerId,
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
      setReportSummary(null)
      setQueryError(errorMessage)
      const historyItem: QueryHistoryItem = {
        id: `${Date.now()}-failed`,
        executedAt: new Date().toISOString(),
        dataType,
        customerId: normalizedCustomerId,
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

  const toggleColumn = (column: string) => {
    setSelectedColumns((prev) =>
      prev.includes(column) ? prev.filter((item) => item !== column) : [...prev, column],
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <section className="rounded-lg border bg-white p-4 lg:col-span-4 h-fit">
          <h2 className="mb-4 text-sm font-semibold">필터 패널</h2>

          <form className="space-y-4" onSubmit={onSubmit}>
            
            {/* Customer Search */}
            {selectedGuide.supportsUserLookup && (
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
            )}

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Data Type</span>
              <select
                className="w-full rounded-md border px-3 py-2 text-sm"
                value={dataType}
                onChange={(e) => setDataType(e.target.value as DataType)}
                disabled={isServiceMode}
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
              <p className="mt-1 text-xs text-slate-600">{isServiceMode ? selectedGuide.serviceDescription ?? selectedGuide.description : selectedGuide.description}</p>
              <p className="mt-1 text-xs text-slate-600">조회 식별자 키: {selectedGuide.customerKey}</p>
            </div>

            {/* Customer ID Input */}
            <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Customer ID</span>
                <input
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    value={customerId}
                    onChange={(e) => {
                    const nextCustomerId = e.target.value
                    setCustomerId(nextCustomerId)
                    setCustomerError(null)
                    setChannelOptions([])
                    setChannelError(null)
                    }}
                    placeholder={selectedGuide.customerExample}
                    required
                />
                <div className="mt-1 text-xs text-slate-500">{isServiceMode ? selectedGuide.serviceCustomerInputHint ?? selectedGuide.customerInputHint : selectedGuide.customerInputHint}</div>
            </label>

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
                  <p className="text-xs text-slate-500">Customer ID 기준(기간 무관)으로 채널 목록을 불러온 뒤 선택할 수 있습니다.</p>
                </div>

                {channelError && <p className="text-xs text-red-600">{channelError}</p>}
                {!channelError && channelOptions.length > 0 && (
                  <p className="text-xs text-emerald-700">선택 가능한 채널 {channelOptions.length}개</p>
                )}

                {channelOptions.length > 0 && channelFilterKey && (
                  <div className="max-h-40 overflow-auto rounded-md border bg-white">
                    <ul className="divide-y">
                      {channelOptions.map((channel) => (
                        <li key={channel.channelId}>
                          <button
                            type="button"
                            className={`w-full px-3 py-2 text-left text-xs hover:bg-slate-100 ${selectedChannel === channel.channelId ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-700'}`}
                            onClick={() => {
                              const nextFilterInputs: FilterInputState = {
                                ...filterInputs,
                                [channelFilterKey]: channel.channelId,
                              }

                              setFilterInputs((prev) => ({
                                ...prev,
                                [channelFilterKey]: channel.channelId,
                              }))

                              if (dataType === 'conversations') {
                                void executeQuery(nextFilterInputs)
                              }
                            }}
                          >
                            {channel.channelName
                              ? `${channel.channelId} (${channel.channelName})`
                              : channel.channelId}
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
                  onChange={(e) => {
                    setStartAt(e.target.value)
                    e.currentTarget.blur()
                  }}
                  required
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">End</span>
                <input
                  type="datetime-local"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  value={endAt}
                  onChange={(e) => {
                    setEndAt(e.target.value)
                    e.currentTarget.blur()
                  }}
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

            <div className="rounded-md border bg-slate-50 p-3">
              <div className="mb-2 text-xs font-semibold text-slate-700">기본 정렬</div>
              <div className="inline-flex rounded-md border border-slate-300 bg-white p-1">
                <button
                  type="button"
                  className={`rounded px-3 py-1 text-xs font-medium ${sortOrder === 'asc' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
                  onClick={() => setSortOrder('asc')}
                >
                  오름차순
                </button>
                <button
                  type="button"
                  className={`rounded px-3 py-1 text-xs font-medium ${sortOrder === 'desc' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
                  onClick={() => setSortOrder('desc')}
                >
                  최신순
                </button>
              </div>
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

        <section className="rounded-lg border bg-white p-4 lg:col-span-8 h-fit">
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

          {isServiceMode && reportSummary && (
            <div className="mb-3 rounded-md border bg-slate-50 p-3 text-xs text-slate-700">
              요약 · 질문수: {String(reportSummary.totalRows ?? rows.length)} / unmatched: {String(reportSummary.unmatchedCount ?? 0)} / fallback: {String(reportSummary.fallbackCount ?? 0)} / totalCreditUsed: {String(reportSummary.totalCreditUsed ?? 0)}
            </div>
          )}

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

          {!isServiceMode && availableColumns.length > 0 && (
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
    </div>
  )
}
