import { DataTypeSchema, QueryFilterValue } from './api'
import { FilterInputState } from '../types/ui'

export function asStringValue(value: FilterInputState[string]): string {
  return typeof value === 'string' ? value : ''
}

export function asRangeValue(value: FilterInputState[string]): { min?: string; max?: string } {
  return typeof value === 'object' && value ? value : {}
}

export function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const y = date.getFullYear()
  const m = pad(date.getMonth() + 1)
  const d = pad(date.getDate())
  const hh = pad(date.getHours())
  const mm = pad(date.getMinutes())
  return `${y}-${m}-${d}T${hh}:${mm}`
}

export function toIsoString(value: string): string {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString()
}

export function buildFilters(schema: DataTypeSchema | null, values: FilterInputState): Record<string, QueryFilterValue> | undefined {
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

export function toExportTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const y = date.getFullYear()
  const m = pad(date.getMonth() + 1)
  const d = pad(date.getDate())
  const hh = pad(date.getHours())
  const mm = pad(date.getMinutes())
  const ss = pad(date.getSeconds())
  return `${y}${m}${d}-${hh}${mm}${ss}`
}

export function toExportString(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }

  if (typeof value === 'object') {
    return JSON.stringify(value)
  }

  return String(value)
}

export function escapeCsvCell(value: string): string {
  const escaped = value.replaceAll('"', '""')
  const needsQuote = /[",\n\r]/.test(escaped)
  return needsQuote ? `"${escaped}"` : escaped
}

export function buildCsvContent(rows: Array<Record<string, unknown>>, columns: string[]): string {
  const header = columns.map((column) => escapeCsvCell(column)).join(',')
  const body = rows
    .map((row) => columns.map((column) => escapeCsvCell(toExportString(row[column]))).join(','))
    .join('\n')

  return body ? `${header}\n${body}` : header
}

export function projectRowsByColumns(rows: Array<Record<string, unknown>>, columns: string[]): Array<Record<string, unknown>> {
  return rows.map((row) => {
    const projected: Record<string, unknown> = {}

    for (const column of columns) {
      projected[column] = row[column] ?? null
    }

    return projected
  })
}

export function triggerFileDownload(content: string, fileName: string, mimeType: string, withBom = false): void {
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
