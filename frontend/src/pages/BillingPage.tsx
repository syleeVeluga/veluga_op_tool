import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  fetchBillingProjects,
  fetchBillingUsage,
  type BillingPlatform,
  type BillingProject,
  type BillingQueryResponse,
  type BillingUsageRow,
} from '../lib/api'
import {
  downloadRowsAsCsv,
  downloadRowsAsJson,
  toDatetimeLocalValue,
  toIsoString,
} from '../lib/utils'
import { useAuth } from '../contexts/AuthContext'
import { Button, DataTable } from '../components/ui'

const PLATFORM_OPTIONS: { value: BillingPlatform; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
]

const BUCKET_OPTIONS: { value: '1h' | '1d' | '1M'; label: string }[] = [
  { value: '1M', label: '월별 (1M)' },
  { value: '1d', label: '일별 (1d)' },
  { value: '1h', label: '시간별 (1h)' },
]

const GROUP_BY_OPTIONS: Record<BillingPlatform, { value: string; label: string }[]> = {
  openai: [
    { value: 'project_id', label: 'Project' },
    { value: 'model', label: 'Model' },
    { value: 'api_key_id', label: 'API Key' },
  ],
  anthropic: [
    { value: 'workspace_id', label: 'Workspace' },
    { value: 'model', label: 'Model' },
    { value: 'api_key_id', label: 'API Key' },
  ],
}

const RESULT_COLUMNS = [
  'date',
  'platform',
  'model',
  'project',
  'apiKeyId',
  'inputTokens',
  'outputTokens',
  'totalTokens',
  'costUsd',
] as const

const COLUMN_LABELS: Record<string, string> = {
  date: '날짜',
  platform: '플랫폼',
  model: '모델',
  project: '프로젝트',
  apiKeyId: 'API Key',
  inputTokens: '입력 토큰',
  outputTokens: '출력 토큰',
  totalTokens: '총 토큰',
  costUsd: '비용 (USD)',
}

const DISPLAY_COLUMNS = RESULT_COLUMNS.map((c) => COLUMN_LABELS[c] ?? c)
const RAW_COLUMNS = [...RESULT_COLUMNS] as string[]

function formatCost(value: number): string {
  if (value >= 1) return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return `$${value.toFixed(4)}`
}

function formatTokens(value: number): string {
  if (value === 0) return '-'
  return value.toLocaleString()
}

function formatDate(iso: string, monthly: boolean): string {
  try {
    if (monthly) {
      return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })
    }
    return new Date(iso).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  } catch {
    return iso
  }
}

/** 전월 value (4월이면 "2026-03") */
function previousMonthValue(): string {
  const now = new Date()
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
}

/** "2026-03" → "2026-03-01T00:00:00.000Z" */
function monthToStartIso(month: string): string {
  return `${month}-01T00:00:00.000Z`
}

/** "2026-03" → "2026-04-01T00:00:00.000Z" (다음 달 1일) */
function monthToEndIso(month: string): string {
  const [y, m] = month.split('-').map(Number)
  const ny = m === 12 ? y + 1 : y
  const nm = m === 12 ? 1 : m + 1
  return `${ny}-${String(nm).padStart(2, '0')}-01T00:00:00.000Z`
}

function toDisplayRows(rows: BillingUsageRow[], monthly: boolean): Array<Record<string, unknown>> {
  return rows.map((row) => ({
    [COLUMN_LABELS.date]: formatDate(row.date, monthly),
    [COLUMN_LABELS.platform]: row.platform === 'openai' ? 'OpenAI' : 'Anthropic',
    [COLUMN_LABELS.model]: row.model,
    [COLUMN_LABELS.project]: row.project ?? '-',
    [COLUMN_LABELS.apiKeyId]: row.apiKeyId ?? '-',
    [COLUMN_LABELS.inputTokens]: formatTokens(row.inputTokens),
    [COLUMN_LABELS.outputTokens]: formatTokens(row.outputTokens),
    [COLUMN_LABELS.totalTokens]: formatTokens(row.totalTokens),
    [COLUMN_LABELS.costUsd]: formatCost(row.costUsd),
  }))
}

function toExportRows(rows: BillingUsageRow[]): Array<Record<string, unknown>> {
  return rows.map((row) => ({
    date: row.date,
    platform: row.platform,
    model: row.model,
    project: row.project ?? '',
    apiKeyId: row.apiKeyId ?? '',
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    totalTokens: row.totalTokens,
    costUsd: row.costUsd,
  }))
}

export function BillingPage() {
  const { authToken } = useAuth()

  const now = new Date()
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const [platform, setPlatform] = useState<BillingPlatform>('openai')
  const [startAt, setStartAt] = useState(toDatetimeLocalValue(thirtyDaysAgo))
  const [endAt, setEndAt] = useState(toDatetimeLocalValue(now))
  const [bucketWidth, setBucketWidth] = useState<'1h' | '1d' | '1M'>('1M')
  const [groupBy, setGroupBy] = useState<string[]>(['model'])

  // 월별 모드용
  const [selectedMonth, setSelectedMonth] = useState(previousMonthValue())

  // 프로젝트/워크스페이스 선택
  const [projects, setProjects] = useState<BillingProject[]>([])
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<BillingQueryResponse | null>(null)

  // 플랫폼 변경 시 프로젝트 목록 조회
  useEffect(() => {
    if (!authToken) return
    setProjects([])
    setSelectedProjectIds([])
    setProjectsLoading(true)
    fetchBillingProjects(authToken, platform)
      .then((res) => setProjects(res.projects))
      .catch(() => setProjects([]))
      .finally(() => setProjectsLoading(false))
  }, [authToken, platform])

  const isMonthly = bucketWidth === '1M'

  const handleGroupByToggle = (value: string) => {
    setGroupBy((prev) =>
      prev.includes(value)
        ? prev.filter((v) => v !== value)
        : [...prev, value],
    )
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!authToken) return

    setLoading(true)
    setError(null)
    setResult(null)

    const startDate = isMonthly ? monthToStartIso(selectedMonth) : toIsoString(startAt)
    const endDate = isMonthly ? monthToEndIso(selectedMonth) : toIsoString(endAt)

    try {
      const data = await fetchBillingUsage(authToken, {
        platform,
        startDate,
        endDate,
        bucketWidth,
        groupBy: groupBy.length > 0 ? groupBy : undefined,
        projectIds: selectedProjectIds.length > 0 ? selectedProjectIds : undefined,
      })
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const totalCost = result?.rows.reduce((sum, r) => sum + r.costUsd, 0) ?? 0
  const totalTokens = result?.rows.reduce((sum, r) => sum + r.totalTokens, 0) ?? 0

  const handleExportCsv = () => {
    if (!result?.rows.length) return
    downloadRowsAsCsv(`billing-${platform}`, toExportRows(result.rows), RAW_COLUMNS)
  }

  const handleExportJson = () => {
    if (!result?.rows.length) return
    downloadRowsAsJson(`billing-${platform}`, toExportRows(result.rows), RAW_COLUMNS)
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-slate-800">AI 비용 정산</h1>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border bg-white p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Platform */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">플랫폼</label>
            <select
              value={platform}
              onChange={(e) => {
                const p = e.target.value as BillingPlatform
                setPlatform(p)
                setGroupBy(['model'])
              }}
              className="w-full rounded-md border px-3 py-2 text-sm"
            >
              {PLATFORM_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Bucket width */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">집계 단위</label>
            <select
              value={bucketWidth}
              onChange={(e) => setBucketWidth(e.target.value as '1h' | '1d' | '1M')}
              className="w-full rounded-md border px-3 py-2 text-sm"
            >
              {BUCKET_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Date selection: month picker or datetime range */}
          {isMonthly ? (
            <div className="lg:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-600">정산 월</label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>
          ) : (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">시작일</label>
                <input
                  type="datetime-local"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">종료일</label>
                <input
                  type="datetime-local"
                  value={endAt}
                  onChange={(e) => setEndAt(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </div>
            </>
          )}
        </div>

        {/* Project / Workspace filter */}
        {projects.length > 0 && (
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              {platform === 'openai' ? '프로젝트' : '워크스페이스'}
              {selectedProjectIds.length === 0 && <span className="ml-1 text-slate-400">(전체)</span>}
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedProjectIds([])}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                  selectedProjectIds.length === 0
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                전체
              </button>
              {projects.map((p) => {
                const selected = selectedProjectIds.includes(p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() =>
                      setSelectedProjectIds((prev) =>
                        selected ? prev.filter((id) => id !== p.id) : [...prev, p.id],
                      )
                    }
                    className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                      selected
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {p.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}
        {projectsLoading && (
          <p className="text-xs text-slate-400">
            {platform === 'openai' ? '프로젝트' : '워크스페이스'} 목록 로딩 중...
          </p>
        )}

        {/* Group By */}
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">그룹 기준</label>
          <div className="flex flex-wrap gap-3">
            {GROUP_BY_OPTIONS[platform].map((opt) => (
              <label key={opt.value} className="flex items-center gap-1.5 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={groupBy.includes(opt.value)}
                  onChange={() => handleGroupByToggle(opt.value)}
                  className="rounded border-slate-300"
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        <Button type="submit" disabled={loading}>
          {loading ? '조회 중...' : '조회'}
        </Button>
      </form>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg border bg-white p-4">
              <div className="text-xs text-slate-500">총 비용</div>
              <div className="mt-1 text-lg font-bold text-slate-800">{formatCost(totalCost)}</div>
            </div>
            <div className="rounded-lg border bg-white p-4">
              <div className="text-xs text-slate-500">총 토큰</div>
              <div className="mt-1 text-lg font-bold text-slate-800">{totalTokens.toLocaleString()}</div>
            </div>
            <div className="rounded-lg border bg-white p-4">
              <div className="text-xs text-slate-500">조회 행 수</div>
              <div className="mt-1 text-lg font-bold text-slate-800">{result.rows.length.toLocaleString()}</div>
            </div>
          </div>

          {/* Export buttons */}
          {result.rows.length > 0 && (
            <div className="flex gap-2">
              <Button onClick={handleExportCsv} variant="outline">CSV 다운로드</Button>
              <Button onClick={handleExportJson} variant="outline">JSON 다운로드</Button>
            </div>
          )}

          {/* Data table */}
          <DataTable
            columns={DISPLAY_COLUMNS}
            rows={toDisplayRows(result.rows, isMonthly)}
            loading={loading}
          />
        </>
      )}
    </div>
  )
}
