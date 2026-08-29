import type { ActivityEntry, ChartKind, ChartSpec, Dataset, EdaToolResult, FilterOperator, FilterRule, RuntimeState, WorkspaceState } from '../data/types'
import { chartNumericColumns, columnOptionsForKind, defaultFilterColumn, suggestCharts } from './suggestions'

export type WorkspaceListener = (state: WorkspaceState) => void

export type CreateChartInput = {
  kind: ChartKind
  xColumn?: string
  yColumn?: string
  title?: string
}

export type UpdateChartInput = {
  chartId: string
  kind?: ChartKind
  xColumn?: string
  yColumn?: string | null
  title?: string
  sort?: ChartSpec['sort']
}

export type SetFilterInput = {
  chartId?: string
  column: string
  operator: FilterOperator
  value: string | number
}

function isNumericColumn(dataset: Dataset, name: string): boolean {
  return dataset.columns.some((column) => column.name === name && column.kind === 'number')
}

function numericColumnNames(dataset: Dataset): string[] {
  return chartNumericColumns(dataset).map((column) => column.name)
}

function generatedChartTitle(kind: ChartKind, xColumn: string, yColumn?: string): string {
  if (kind === 'donut') return `${xColumn} mix`
  if (kind === 'scatter') return `${xColumn} vs ${yColumn ?? 'value'}`
  if (kind === 'area') return `${yColumn ?? xColumn} distribution`
  if (kind === 'line') return `${yColumn ?? 'Rows'} over ${xColumn}`
  return `${yColumn ?? 'Rows'} by ${xColumn}`
}

function defaultXColumn(dataset: Dataset, kind: ChartKind, numericColumns: string[]): string | undefined {
  const fallback = defaultFilterColumn(dataset)
  if (kind === 'scatter' || kind === 'area') return (numericColumns[0] ?? fallback) || undefined
  if (kind === 'line') return (dataset.columns.find((column) => column.kind === 'date')?.name ?? fallback) || undefined
  return fallback || undefined
}

const initialRuntime: RuntimeState = { webmcp: 'unsupported', gpu: 'checking', registeredTools: [] }

export function createInitialWorkspace(): WorkspaceState {
  return { dataset: null, charts: [], globalFilters: [], selectedChartId: null, revision: 0, runtime: initialRuntime, activity: [] }
}

function now() {
  return new Date().toISOString()
}

export class WorkspaceController {
  private state: WorkspaceState = createInitialWorkspace()
  private listeners = new Set<WorkspaceListener>()

  getState() { return this.state }
  subscribe(listener: WorkspaceListener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  hydrate(state: WorkspaceState) {
    this.state = { ...state, runtime: this.state.runtime, activity: state.activity ?? [] }
    this.notify()
  }

  setRuntime(runtime: Partial<RuntimeState>) {
    this.state = { ...this.state, runtime: { ...this.state.runtime, ...runtime } }
    this.notify()
  }

  attachNumericHistograms(histograms: NonNullable<Dataset['numericHistograms']>, sampledRows?: Dataset['sampledRows']) {
    if (!this.state.dataset) return
    this.state = { ...this.state, dataset: { ...this.state.dataset, numericHistograms: histograms, ...(sampledRows ? { sampledRows } : {}) } }
    this.notify()
  }

  loadDataset(dataset: Dataset, source: 'human' | 'agent' = 'human'): EdaToolResult {
    const suggestions = suggestCharts(dataset)
    const charts = suggestions.map((suggestion, index) => ({ ...suggestion.spec, id: `chart_${index + 1}` }))
    this.state = {
      ...this.state,
      dataset,
      charts,
      globalFilters: [],
      selectedChartId: charts[0]?.id ?? null,
      revision: this.state.revision + 1,
    }
    this.addActivity(source, 'load_dataset', `${dataset.fileName} · ${dataset.rowCount.toLocaleString()} rows · ${dataset.columns.length} columns`, 'success')
    return this.result(true, `Loaded ${dataset.fileName} and suggested ${charts.length} charts.`)
  }

  createChart(input: CreateChartInput, source: 'human' | 'agent' = 'human'): EdaToolResult {
    const dataset = this.state.dataset
    if (!dataset) return this.fail('Load a dataset before creating a chart.')
    const kind = input.kind
    const numericColumns = numericColumnNames(dataset)
    const xColumn = input.xColumn ?? defaultXColumn(dataset, kind, numericColumns)
    const yColumn = input.yColumn ?? (kind === 'scatter' ? numericColumns.find((column) => column !== xColumn) : numericColumns[0])
    if (!xColumn || !dataset.columns.some((column) => column.name === xColumn)) return this.fail(`Unknown x-axis column: ${xColumn ?? '(missing)'}`)
    if (kind === 'scatter' && !yColumn) return this.fail('Scatter charts need both an x-axis and a y-axis column.')
    if (kind === 'scatter' && !isNumericColumn(dataset, xColumn)) return this.fail(`Scatter x-axis must be numeric: ${xColumn}`)
    if (kind === 'scatter' && xColumn === yColumn) return this.fail('Scatter charts need two different numeric columns for their axes.')
    if ((kind === 'scatter' || kind === 'bar' || kind === 'line' || kind === 'area') && yColumn) {
      const yProfile = dataset.columns.find((column) => column.name === yColumn)
      if (!yProfile) return this.fail(`Unknown y-axis column: ${yColumn}`)
      if (yProfile.kind !== 'number') return this.fail(`${kind} y-axis must be numeric: ${yColumn}`)
    }
    const chart: ChartSpec = {
      id: `chart_${this.state.revision + this.state.charts.length + 1}`,
      title: input.title ?? generatedChartTitle(kind, xColumn, yColumn),
      kind,
      xColumn,
      yColumn: kind === 'donut' ? undefined : yColumn,
      aggregation: kind === 'donut' ? 'count' : 'mean',
      filters: [],
      sort: kind === 'bar' || kind === 'donut' ? 'desc' : 'none',
      reason: 'Created from the shared human and agent workspace.',
      origin: source,
    }
    this.state = { ...this.state, charts: [...this.state.charts, chart], selectedChartId: chart.id, revision: this.state.revision + 1 }
    this.addActivity(source, 'create_chart', chart.title, 'success')
    return this.result(true, `Created ${chart.title}.`, chart)
  }

  updateChart(input: UpdateChartInput, source: 'human' | 'agent' = 'human'): EdaToolResult {
    const dataset = this.state.dataset
    const chart = this.state.charts.find((item) => item.id === input.chartId)
    if (!dataset) return this.fail('Load a dataset before editing charts.')
    if (!chart) return this.fail(`Chart ${input.chartId} does not exist.`)
    const kind = input.kind ?? chart.kind
    let xColumn = input.xColumn ?? chart.xColumn
    let yColumn = input.yColumn === null ? undefined : input.yColumn ?? chart.yColumn
    if (kind === 'scatter') {
      const numericColumns = numericColumnNames(dataset)
      if (!isNumericColumn(dataset, xColumn) && input.xColumn === undefined) xColumn = numericColumns[0] ?? xColumn
      if ((!yColumn || yColumn === xColumn) && input.yColumn === undefined) yColumn = numericColumns.find((column) => column !== xColumn)
    }
    if (!dataset.columns.some((column) => column.name === xColumn)) return this.fail(`Unknown x-axis column: ${xColumn}`)
    if (kind === 'scatter' && !isNumericColumn(dataset, xColumn)) return this.fail(`Scatter x-axis must be numeric: ${xColumn}`)
    if (yColumn) {
      const yProfile = dataset.columns.find((column) => column.name === yColumn)
      if (!yProfile) return this.fail(`Unknown y-axis column: ${yColumn}`)
      if ((kind === 'scatter' || kind === 'bar' || kind === 'line' || kind === 'area') && yProfile.kind !== 'number') return this.fail(`${kind} y-axis must be numeric: ${yColumn}`)
    }
    if (kind === 'scatter' && !yColumn) return this.fail('Scatter charts need both an x-axis and a y-axis column.')
    if (kind === 'scatter' && xColumn === yColumn) return this.fail('Scatter charts need two different numeric columns for their axes.')
    const nextYColumn = kind === 'donut' ? undefined : yColumn
    const next = { ...chart, kind, xColumn, yColumn: nextYColumn, title: input.title ?? generatedChartTitle(kind, xColumn, nextYColumn), sort: input.sort ?? chart.sort, origin: source }
    this.state = { ...this.state, charts: this.state.charts.map((item) => item.id === chart.id ? next : item), selectedChartId: chart.id, revision: this.state.revision + 1 }
    this.addActivity(source, 'update_chart', `${chart.title} → ${next.kind}`, 'success')
    return this.result(true, `Updated ${next.title}.`, next)
  }

  setFilter(input: SetFilterInput, source: 'human' | 'agent' = 'human'): EdaToolResult {
    if (!this.state.dataset) return this.fail('Load a dataset before filtering.')
    if (!this.state.dataset.columns.some((column) => column.name === input.column)) return this.fail(`Unknown filter column: ${input.column}`)
    if (input.chartId && !this.state.charts.some((chart) => chart.id === input.chartId)) return this.fail(`Chart ${input.chartId} does not exist.`)
    const filter: FilterRule = { id: `filter_${this.state.revision + 1}`, column: input.column, operator: input.operator, value: input.value }
    if (input.chartId) {
      this.state = { ...this.state, charts: this.state.charts.map((chart) => chart.id === input.chartId ? { ...chart, filters: [...chart.filters, filter] } : chart), selectedChartId: input.chartId, revision: this.state.revision + 1 }
    } else {
      this.state = { ...this.state, globalFilters: [...this.state.globalFilters, filter], revision: this.state.revision + 1 }
    }
    this.addActivity(source, 'set_filter', `${input.column} ${input.operator} ${input.value}`, 'success')
    return this.result(true, `Applied filter to ${input.chartId ? 'chart' : 'workspace'}.`, filter)
  }

  clearFilters(chartId?: string, source: 'human' | 'agent' = 'human'): EdaToolResult {
    if (chartId && !this.state.charts.some((chart) => chart.id === chartId)) return this.fail(`Chart ${chartId} does not exist.`)
    this.state = chartId
      ? { ...this.state, charts: this.state.charts.map((chart) => chart.id === chartId ? { ...chart, filters: [] } : chart), revision: this.state.revision + 1 }
      : { ...this.state, globalFilters: [], charts: this.state.charts.map((chart) => ({ ...chart, filters: [] })), revision: this.state.revision + 1 }
    this.addActivity(source, 'clear_filters', chartId ? `Chart ${chartId}` : 'Workspace', 'success')
    return this.result(true, 'Cleared filters.')
  }

  focusChart(chartId: string, source: 'human' | 'agent' = 'human'): EdaToolResult {
    if (!this.state.charts.some((chart) => chart.id === chartId)) return this.fail(`Chart ${chartId} does not exist.`)
    this.state = { ...this.state, selectedChartId: chartId, revision: this.state.revision + 1 }
    this.addActivity(source, 'focus_chart', chartId, 'success')
    return this.result(true, `Focused ${chartId}.`)
  }

  listCharts() { return this.state.charts.map(({ id, title, kind, xColumn, yColumn, filters, origin }) => ({ id, title, kind, xColumn, yColumn, filters, origin })) }

  private addActivity(source: ActivityEntry['source'], action: string, detail: string, status: ActivityEntry['status']) {
    this.state = { ...this.state, activity: [{ id: `${Date.now()}_${Math.random().toString(16).slice(2)}`, source, action, detail, createdAt: now(), revision: this.state.revision, status }, ...this.state.activity].slice(0, 30) }
    this.notify()
  }

  private result(ok: boolean, message: string, data?: unknown): EdaToolResult {
    return { ok, message, revision: this.state.revision, ...(data === undefined ? {} : { data }) }
  }

  private fail(message: string): EdaToolResult {
    this.addActivity('agent', 'validation_error', message, 'error')
    return this.result(false, message)
  }

  private notify() { for (const listener of this.listeners) listener(this.state) }
}

export function availableColumns(state: WorkspaceState, kind: ChartKind, axis: 'x' | 'y') {
  return state.dataset ? columnOptionsForKind(state.dataset.columns, kind, axis) : []
}
