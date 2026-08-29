import type { Aggregation, ChartKind, ChartSuggestion, ColumnProfile, Dataset } from '../data/types'

function isIdentifier(column: ColumnProfile): boolean {
  return /^(id|.*(?:id|key|index|uuid))$/i.test(column.name)
}

function usefulCategories(dataset: Dataset): ColumnProfile[] {
  const maxDistinct = Math.min(50, Math.max(8, dataset.rowCount * 0.2))
  return dataset.columns.filter((column) => {
    if (isIdentifier(column)) return false
    return column.kind === 'category' || (column.kind === 'text' && column.distinctCount <= maxDistinct)
  })
}

export function defaultFilterColumn(dataset: Dataset): string {
  return usefulCategories(dataset)[0]?.name ?? chartNumericColumns(dataset)[0]?.name ?? dataset.columns[0]?.name ?? ''
}

export function chartNumericColumns(dataset: Dataset): ColumnProfile[] {
  const numbers = dataset.columns.filter((column) => column.kind === 'number' && !isIdentifier(column))
  const continuousThreshold = Math.min(20, Math.max(5, dataset.rowCount * 0.05))
  const continuous = numbers.filter((column) => column.distinctCount >= continuousThreshold)
  const candidates = continuous.length >= 2 ? continuous : numbers
  return candidates
    .map((column, index) => ({ column, index }))
    .sort((left, right) => measureScore(right.column) - measureScore(left.column) || left.index - right.index)
    .map(({ column }) => column)
}

function measureScore(column: ColumnProfile): number {
  if (/revenue|price|sales|fare/i.test(column.name)) return 5
  if (/amount|profit|margin|value|income|cost|spend/i.test(column.name)) return 4
  if (/total/i.test(column.name)) return 2
  if (/area|size|volume|distance|duration/i.test(column.name)) return 1
  return 0
}

function baseSpec(kind: ChartKind, xColumn: string, yColumn: string | undefined, title: string, reason: string, accent: ChartSuggestion['accent']): ChartSuggestion {
  return {
    id: `suggestion_${kind}`,
    title,
    description: reason,
    accent,
    spec: {
      title,
      kind,
      xColumn,
      yColumn,
      aggregation: (yColumn ? 'mean' : 'count') as Aggregation,
      filters: [],
      sort: kind === 'bar' || kind === 'donut' ? 'desc' : 'none',
      reason,
      origin: 'suggested' as const,
    },
  }
}

export function suggestCharts(dataset: Dataset): ChartSuggestion[] {
  const categories = usefulCategories(dataset)
  const numbers = chartNumericColumns(dataset)
  const dates = dataset.columns.filter((column) => column.kind === 'date')
  const suggestions: ChartSuggestion[] = []

  if (categories[0]) suggestions.push(baseSpec('donut', categories[0].name, undefined, `${categories[0].name} mix`, 'See the shape of the dataset at a glance.', 'cyan'))
  if (categories[0] && numbers[0]) suggestions.push(baseSpec('bar', categories[0].name, numbers[0].name, `${numbers[0].name} by ${categories[0].name}`, `Compare ${numbers[0].name} across ${categories[0].name}.`, 'lime'))
  if (dates[0] && numbers[0]) suggestions.push(baseSpec('line', dates[0].name, numbers[0].name, `${numbers[0].name} over time`, `Follow how ${numbers[0].name} changes over ${dates[0].name}.`, 'orange'))
  if (numbers.length >= 2) suggestions.push(baseSpec('scatter', numbers[0].name, numbers[1].name, `${numbers[0].name} vs ${numbers[1].name}`, 'Look for clusters, outliers, and directional relationships.', 'pink'))
  if (numbers[0]) suggestions.push(baseSpec('area', numbers[0].name, numbers[0].name, `${numbers[0].name} distribution`, `Explore the distribution of ${numbers[0].name}.`, 'orange'))

  return suggestions.slice(0, 4)
}

export function columnOptionsForKind(columns: ColumnProfile[], kind: ChartKind, axis: 'x' | 'y'): ColumnProfile[] {
  if (kind === 'scatter') return columns.filter((column) => column.kind === 'number' && !isIdentifier(column))
  if (axis === 'y') return columns.filter((column) => column.kind === 'number')
  return columns.filter((column) => column.kind !== 'boolean')
}
