import type { Aggregation, ChartKind, ChartSuggestion, ColumnProfile, Dataset } from '../data/types'

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
  const categories = dataset.columns.filter((column) => column.kind === 'category' || column.kind === 'text')
  const numbers = dataset.columns.filter((column) => column.kind === 'number')
  const dates = dataset.columns.filter((column) => column.kind === 'date')
  const suggestions: ChartSuggestion[] = []

  if (categories[0]) suggestions.push(baseSpec('donut', categories[0].name, undefined, `${categories[0].name} mix`, 'See the shape of the dataset at a glance.', 'cyan'))
  if (categories[0] && numbers[0]) suggestions.push(baseSpec('bar', categories[0].name, numbers[0].name, `${numbers[0].name} by ${categories[0].name}`, `Compare ${numbers[0].name} across ${categories[0].name}.`, 'lime'))
  if (dates[0] && numbers[0]) suggestions.push(baseSpec('line', dates[0].name, numbers[0].name, `${numbers[0].name} over time`, `Follow how ${numbers[0].name} changes over ${dates[0].name}.`, 'orange'))
  if (numbers.length >= 2) suggestions.push(baseSpec('scatter', numbers[0].name, numbers[1].name, `${numbers[0].name} vs ${numbers[1].name}`, 'Look for clusters, outliers, and directional relationships.', 'pink'))
  if (numbers[0] && !suggestions.some((suggestion) => suggestion.spec.yColumn === numbers[0].name)) suggestions.push(baseSpec('area', dataset.columns[0].name, numbers[0].name, `${numbers[0].name} profile`, `Explore the distribution of ${numbers[0].name}.`, 'orange'))

  return suggestions.slice(0, 4)
}

export function columnOptionsForKind(columns: ColumnProfile[], kind: ChartKind, axis: 'x' | 'y'): ColumnProfile[] {
  if (kind === 'scatter') return columns.filter((column) => column.kind === 'number')
  if (axis === 'y') return columns.filter((column) => column.kind === 'number')
  return columns.filter((column) => column.kind !== 'boolean')
}
