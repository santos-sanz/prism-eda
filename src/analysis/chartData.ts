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

function numberValue(value: unknown): number {
  const result = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(result) ? result : 0
}

export function aggregateChartData(dataset: Dataset, chart: ChartSpec, globalFilters: ChartSpec['filters']): ChartDatum[] {
  const rows = chartRows(dataset, chart, globalFilters)
  const groups = new Map<string, { total: number; count: number; secondary?: number }>()

  for (const row of rows) {
    const label = String(row[chart.xColumn] ?? 'Unknown')
    const current = groups.get(label) ?? { total: 0, count: 0 }
    const rawValue = chart.yColumn ? row[chart.yColumn] : 1
    const value = numberValue(rawValue)
    current.total += value
    current.count += 1
    groups.set(label, current)
  }

  const data = [...groups.entries()].map(([label, group]) => ({
    label,
    value: chart.aggregation === 'count' ? group.count : chart.aggregation === 'mean' ? group.total / Math.max(group.count, 1) : group.total,
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
    .map((row) => ({ label: String(row[chart.xColumn] ?? ''), value: numberValue(row[chart.xColumn]), secondary: numberValue(row[chart.yColumn!]) }))
    .filter((datum) => Number.isFinite(datum.value) && Number.isFinite(datum.secondary))
    .slice(0, 600)
}
