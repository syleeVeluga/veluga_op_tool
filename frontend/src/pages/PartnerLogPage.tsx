import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  exportBatchConversationFile,
  fetchBatchDbList,
  postBatchConversationWorkflow,
  resolveCustomersByPartnerId,
  type BatchConversationWorkflowResponse,
} from '../lib/api'
import {
  toDatetimeLocalValue,
  toIsoString,
  triggerBlobDownload,
} from '../lib/utils'
import { Button, DataTable, Input } from '../components/ui'

const BATCH_RESULT_COLUMNS = [
  'occurredAt',
  'customerName',
  'customerId',
  'channelName',
  'channel',
  'sessionId',
  'questionText',
  'finalAnswerText',
  'creditUsed',
  'like',
  'finalAnswerModel',
  'questionCreatorType',
  'answerAt',
  'responseLatencyMs',
  'matchSource',
  'modelConfidence',
  'likeConfidence',
] as const

function parseCsvIds(raw: string): string[] {
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
}

export function BatchLogPage() {
  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const [batchDbName, setBatchDbName] = useState('')
  const [batchDbItems, setBatchDbItems] = useState<Array<{ name: string; dbName: string }>>([])
  const [batchDbLoading, setBatchDbLoading] = useState(false)

  const [partnerId, setPartnerId] = useState('')
  const [customerIdsInput, setCustomerIdsInput] = useState('')
  const [channelIdsInput, setChannelIdsInput] = useState('')
  const [startAt, setStartAt] = useState(toDatetimeLocalValue(sevenDaysAgo))
  const [endAt, setEndAt] = useState(toDatetimeLocalValue(now))

  const [customerBatchSize, setCustomerBatchSize] = useState(200)
  const [channelChunkSize, setChannelChunkSize] = useState(25)
  const [maxWorkers, setMaxWorkers] = useState(1)
  const [pauseMs, setPauseMs] = useState(200)
  const [maxRetries, setMaxRetries] = useState(2)
  const [rowLimit, setRowLimit] = useState(1000)
  const [includeTotal, setIncludeTotal] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exportLoading, setExportLoading] = useState(false)
  const [exportNotice, setExportNotice] = useState<string | null>(null)
  const [jsonGzipEnabled, setJsonGzipEnabled] = useState(false)
  const [result, setResult] = useState<BatchConversationWorkflowResponse | null>(null)

  const [partnerMemberCount, setPartnerMemberCount] = useState<number | null>(null)
  const [partnerResolveLoading, setPartnerResolveLoading] = useState(false)

  useEffect(() => {
    const load = async () => {
      setBatchDbLoading(true)
      try {
        const response = await fetchBatchDbList()
        setBatchDbItems(response.items)
        if (!batchDbName && response.items.length > 0) {
          setBatchDbName(response.items[0].dbName)
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : '배치 DB 목록 조회에 실패했습니다.')
      } finally {
        setBatchDbLoading(false)
      }
    }

    void load()
  }, [])

  const resultColumns = useMemo(() => {
    const rows = result?.rows ?? []
    if (rows.length === 0) {
      return [...BATCH_RESULT_COLUMNS]
    }

    const available = new Set(Object.keys(rows[0]))
    const ordered = BATCH_RESULT_COLUMNS.filter((column) => available.has(column))
    const extras = Object.keys(rows[0]).filter(
      (column) => !BATCH_RESULT_COLUMNS.includes(column as (typeof BATCH_RESULT_COLUMNS)[number]),
    )

    return [...ordered, ...extras]
  }, [result?.rows])

  const onResolvePartner = async () => {
    const normalizedPartnerId = partnerId.trim()
    if (!normalizedPartnerId) {
      setError('파트너 ID를 입력해 주세요.')
      return
    }

    setPartnerResolveLoading(true)
    setError(null)

    try {
      const resolved = await resolveCustomersByPartnerId(normalizedPartnerId)
      setPartnerMemberCount(resolved.customerIds.length)
    } catch (resolveError) {
      setPartnerMemberCount(null)
      setError(resolveError instanceof Error ? resolveError.message : '파트너 멤버 조회에 실패했습니다.')
    } finally {
      setPartnerResolveLoading(false)
    }
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!batchDbName.trim()) {
      setError('조회할 배치 DB를 선택해 주세요.')
      return
    }

    setLoading(true)
    setError(null)
    setExportNotice(null)

    try {
      const customerIds = parseCsvIds(customerIdsInput)
      const channelIds = parseCsvIds(channelIdsInput)

      const response = await postBatchConversationWorkflow({
        batchDbName: batchDbName.trim(),
        partnerId: partnerId.trim() || undefined,
        dateRange: {
          start: toIsoString(startAt),
          end: toIsoString(endAt),
        },
        chunkOptions: {
          customerBatchSize,
          channelChunkSize,
          maxWorkers,
          pauseMs,
          maxRetries,
        },
        filters: {
          customerIds: customerIds.length > 0 ? customerIds : undefined,
          channelIds: channelIds.length > 0 ? channelIds : undefined,
        },
        rowLimit,
        includeTotal,
      })

      setResult(response)
      setPartnerMemberCount(response.meta.memberCount)
    } catch (queryError) {
      setResult(null)
      setError(queryError instanceof Error ? queryError.message : '대량 배치 로그 조회에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const onExportClick = async (format: 'csv' | 'json') => {
    const rows = result?.rows ?? []

    if (rows.length === 0) {
      setExportNotice('내보내기는 조회 결과가 있을 때 사용할 수 있습니다.')
      return
    }

    setExportLoading(true)
    setExportNotice(null)

    try {
      const customerIds = parseCsvIds(customerIdsInput)
      const channelIds = parseCsvIds(channelIdsInput)

      const response = await exportBatchConversationFile(
        {
          batchDbName: batchDbName.trim(),
          partnerId: partnerId.trim() || undefined,
          dateRange: {
            start: toIsoString(startAt),
            end: toIsoString(endAt),
          },
          chunkOptions: {
            customerBatchSize,
            channelChunkSize,
            maxWorkers,
            pauseMs,
            maxRetries,
          },
          filters: {
            customerIds: customerIds.length > 0 ? customerIds : undefined,
            channelIds: channelIds.length > 0 ? channelIds : undefined,
          },
          rowLimit,
          includeTotal,
        },
        format,
        { gzip: format === 'json' ? jsonGzipEnabled : false },
      )
      triggerBlobDownload(response.blob, response.fileName)

      const label = format === 'json' && jsonGzipEnabled ? 'JSON(gzip)' : format.toUpperCase()
      setExportNotice(`${label} 다운로드를 시작했습니다.`)
    } catch (exportError) {
      setExportNotice(exportError instanceof Error ? exportError.message : '파일 내보내기에 실패했습니다.')
    } finally {
      setExportLoading(false)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <section className="rounded-lg border bg-white p-4 lg:col-span-4 h-fit">
        <h1 className="mb-3 text-sm font-semibold">대량 배치 로그</h1>

        <div className="mb-3 rounded-md border bg-slate-50 p-3 text-xs text-slate-700">
          <p>선택한 배치 DB에서 기간 기준으로 전체 사용자/채널 대화 로그를 분할 조회합니다.</p>
          <p className="mt-1">계정명/채널명은 프로덕션 DB(users/channels) 기준으로 함께 표시됩니다.</p>
        </div>

        <form className="space-y-3" onSubmit={onSubmit}>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-700">배치 DB 선택</span>
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
              value={batchDbName}
              onChange={(event) => setBatchDbName(event.target.value)}
              disabled={batchDbLoading || batchDbItems.length === 0}
            >
              {batchDbItems.length === 0 ? (
                <option value="">설정된 배치 DB가 없습니다</option>
              ) : (
                batchDbItems.map((item) => (
                  <option key={item.dbName} value={item.dbName}>
                    {item.name} ({item.dbName})
                  </option>
                ))
              )}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-700">파트너 ID (선택)</span>
            <Input
              value={partnerId}
              onChange={(event) => setPartnerId(event.target.value)}
              placeholder="입력 시 해당 파트너 멤버 범위로 제한"
            />
          </label>

          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={onResolvePartner}
              disabled={partnerResolveLoading || loading}
            >
              {partnerResolveLoading ? '멤버 확인 중...' : '파트너 멤버 확인'}
            </Button>
            {typeof partnerMemberCount === 'number' && (
                <div className="self-center text-xs text-slate-600">해당 파트너 멤버 수: {partnerMemberCount}</div>
            )}
          </div>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-700">고급 필터 - 계정 ID 목록 (선택)</span>
              <Input
                value={customerIdsInput}
                onChange={(event) => setCustomerIdsInput(event.target.value)}
                placeholder="예: user1,user2,user3"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-700">고급 필터 - 채널 ID 목록 (선택)</span>
              <Input
                value={channelIdsInput}
                onChange={(event) => setChannelIdsInput(event.target.value)}
                placeholder="예: channel1,channel2"
              />
            </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-700">시작 일시</span>
              <Input type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} required />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-700">종료 일시</span>
              <Input type="datetime-local" value={endAt} onChange={(event) => setEndAt(event.target.value)} required />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-xs text-slate-700">고객 배치</span>
              <Input type="number" min={1} max={500} value={customerBatchSize} onChange={(e) => setCustomerBatchSize(Number(e.target.value) || 200)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-slate-700">채널 청크</span>
              <Input type="number" min={1} max={100} value={channelChunkSize} onChange={(e) => setChannelChunkSize(Number(e.target.value) || 25)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-slate-700">동시 실행</span>
              <Input type="number" min={1} max={2} value={maxWorkers} onChange={(e) => setMaxWorkers(Number(e.target.value) || 1)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-slate-700">휴지시간(ms)</span>
              <Input type="number" min={0} max={5000} value={pauseMs} onChange={(e) => setPauseMs(Number(e.target.value) || 200)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-slate-700">재시도 횟수</span>
              <Input type="number" min={0} max={5} value={maxRetries} onChange={(e) => setMaxRetries(Number(e.target.value) || 2)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-slate-700">행 제한</span>
              <Input type="number" min={1} max={10000} value={rowLimit} onChange={(e) => setRowLimit(Number(e.target.value) || 1000)} />
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={includeTotal} onChange={(event) => setIncludeTotal(event.target.checked)} />
            전체 건수 포함
          </label>

          <Button type="submit" variant="primary" fullWidth disabled={loading}>
            {loading ? '대량 배치 로그 조회 중...' : '대량 배치 로그 조회 실행'}
          </Button>
        </form>
      </section>

      <section className="rounded-lg border bg-white p-4 lg:col-span-8 h-fit">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">실행 메타 / 결과</h2>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={loading || exportLoading || !result || result.rows.length === 0}
              onClick={() => {
                void onExportClick('csv')
              }}
            >
              {exportLoading ? '내보내는 중...' : 'CSV 다운로드'}
            </Button>
            <Button
              size="sm"
              disabled={loading || exportLoading || !result || result.rows.length === 0}
              onClick={() => {
                void onExportClick('json')
              }}
            >
              {exportLoading ? '내보내는 중...' : jsonGzipEnabled ? 'JSON 다운로드(.gz)' : 'JSON 다운로드'}
            </Button>
            <label className="flex items-center gap-1 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={jsonGzipEnabled}
                onChange={(event) => setJsonGzipEnabled(event.target.checked)}
                disabled={exportLoading}
              />
              JSON 압축(gzip)
            </label>
          </div>
        </div>

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        {exportNotice && <p className="mb-3 text-xs text-slate-600">{exportNotice}</p>}

        {result?.meta && (
          <div className="mb-3 space-y-2 rounded-md border bg-slate-50 p-3 text-xs text-slate-700">
            <p>
              batchDbName: {result.meta.batchDbName} / partnerId: {result.meta.partnerId ?? '-'} / memberCount: {result.meta.memberCount} / processedChunks: {result.meta.processedChunks} / failedChunks: {result.meta.failedChunks.length}
            </p>
            <p>
              elapsedMs: {result.meta.elapsedMs} / windows: {result.meta.executionPlan.windowCount} / estimatedTasks: {result.meta.executionPlan.estimatedTasks}
            </p>
            <p>
              실행 파라미터: customerBatchSize={result.meta.executionPlan.customerBatchSize}, channelChunkSize={result.meta.executionPlan.channelChunkSize}, maxWorkers={result.meta.executionPlan.maxWorkers}, pauseMs={result.meta.executionPlan.pauseMs}, maxRetries={result.meta.executionPlan.maxRetries}
            </p>
          </div>
        )}

        {result?.meta.failedChunks && result.meta.failedChunks.length > 0 && (
          <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <div className="font-semibold">실패 청크 ({result.meta.failedChunks.length})</div>
            <ul className="mt-1 list-inside list-disc">
              {result.meta.failedChunks.slice(0, 10).map((chunk) => (
                <li key={chunk.chunkId}>{chunk.chunkId} / attempts={chunk.attempts} / {chunk.reason}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mb-2 text-xs text-slate-600">
          조회 건수: {result?.rows.length ?? 0}
          {typeof result?.total === 'number' ? ` / 전체: ${result.total}` : ''}
          {result?.hasMore ? ' / 추가 페이지 있음' : ''}
        </div>

        <DataTable
          columns={resultColumns}
          rows={result?.rows ?? []}
          loading={loading}
          emptyMessage="대상 DB와 기간을 설정한 뒤 조회를 실행하세요."
        />
      </section>
    </div>
  )
}

export const PartnerLogPage = BatchLogPage
