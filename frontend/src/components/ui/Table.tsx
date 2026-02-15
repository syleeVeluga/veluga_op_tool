import { Skeleton } from './Skeleton'

type DataTableProps = {
  columns: string[]
  rows: Array<Record<string, unknown>>
  loading?: boolean
  emptyMessage?: string
}

function toCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }

  if (typeof value === 'object') {
    return JSON.stringify(value)
  }

  return String(value)
}

export function DataTable({
  columns,
  rows,
  loading = false,
  emptyMessage = '조회 결과가 없습니다.',
}: DataTableProps) {
  if (loading) {
    return (
      <div className="space-y-2 rounded-md border p-3">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-5/6" />
      </div>
    )
  }

  if (rows.length === 0 || columns.length === 0) {
    return <p className="text-sm text-slate-500">{emptyMessage}</p>
  }

  return (
    <div className="overflow-auto rounded-md border">
      <table className="min-w-full border-collapse text-left text-xs">
        <thead className="bg-slate-100 text-slate-700">
          <tr>
            {columns.map((column) => (
              <th key={column} className="border-b px-2 py-2 font-semibold">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="odd:bg-white even:bg-slate-50">
              {columns.map((column) => (
                <td key={`${rowIndex}-${column}`} className="max-w-xs border-b px-2 py-2 align-top">
                  {toCellValue(row[column])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
