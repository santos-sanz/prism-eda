import type { ChartSpec, Dataset, Row } from '../data/types'
import { applyFilters } from './filters'

export interface ChartDatum {
  label: string
  value: number
  secondary?: number
}

export function chartRows(dataset: Dataset, chart: ChartSpec, globalFilters: ChartSpec['filters']): Row[] {
  return applyFilters(dataset.rows, [...globalFilters, ...chart.filters])
}

function numberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const result = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(result) ? result : null
}

export function aggregateChartData(dataset: Dataset, chart: ChartSpec, globalFilters: ChartSpec['filters']): ChartDatum[] {
  const rows = chartRows(dataset, chart, globalFilters)
  const groups = new Map<string, { total: number; count: number; numericCount: number }>()

  for (const row of rows) {
    const label = String(row[chart.xColumn] ?? 'Unknown')
    const current = groups.get(label) ?? { total: 0, count: 0, numericCount: 0 }
    current.count += 1
    if (!chart.yColumn) {
      current.total += 1
      current.numericCount += 1
    } else {
      const value = numberValue(row[chart.yColumn])
      if (value !== null) {
        current.total += value
        current.numericCount += 1
      }
    }
    groups.set(label, current)
  }

  const data = [...groups.entries()].map(([label, group]) => ({
    label,
    value: chart.aggregation === 'count' ? group.count : chart.aggregation === 'mean' ? group.total / Math.max(group.numericCount, 1) : group.total,
  }))
  if (chart.sort === 'asc') data.sort((a, b) => a.value - b.value)
  if (chart.sort === 'desc') data.sort((a, b) => b.value - a.value)
  return data.slice(0, chart.kind === 'scatter' ? 400 : 24)
}

export function scatterData(dataset: Dataset, chart: ChartSpec, globalFilters: ChartSpec['filters']): ChartDatum[] {
  if (!chart.yColumn) return []
  const hasFilters = globalFilters.length > 0 || chart.filters.length > 0
  const rows = hasFilters ? chartRows(dataset, chart, globalFilters) : dataset.sampledRows ?? dataset.rows
  return rows
    .map((row) => {
      const value = numberValue(row[chart.xColumn])
      const secondary = numberValue(row[chart.yColumn!])
      return value === null || secondary === null ? null : { label: String(row[chart.xColumn] ?? ''), value, secondary }
    })
    .filter((datum): datum is { label: string; value: number; secondary: number } => datum !== null)
    .slice(0, 600)
}
