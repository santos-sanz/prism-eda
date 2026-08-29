export type Scalar = string | number | boolean | null
export type Row = Record<string, Scalar>

export type ColumnKind = 'number' | 'date' | 'category' | 'boolean' | 'text'

export interface ColumnProfile {
  name: string
  kind: ColumnKind
  nullable: boolean
  nullCount: number
  distinctCount: number
  min?: number
  max?: number
  examples: string[]
}

export interface Dataset {
  id: string
  fileName: string
  format: 'csv' | 'json'
  byteSize: number
  rowCount: number
  columns: ColumnProfile[]
  rows: Row[]
  previewRows: Row[]
  loadedAt: string
  numericHistograms?: Record<string, { bins: number[]; min: number; max: number }>
  sampledRows?: Row[]
}

export type ChartKind = 'bar' | 'line' | 'area' | 'scatter' | 'donut'
export type Aggregation = 'count' | 'sum' | 'mean'
export type FilterOperator = 'equals' | 'contains' | 'greaterThan' | 'lessThan'

export interface FilterRule {
  id: string
  column: string
  operator: FilterOperator
  value: string | number
}

export interface ChartSpec {
  id: string
  title: string
  kind: ChartKind
  xColumn: string
  yColumn?: string
  aggregation: Aggregation
  filters: FilterRule[]
  sort: 'asc' | 'desc' | 'none'
  reason: string
  origin: 'suggested' | 'human' | 'agent'
}

export interface ChartSuggestion {
  id: string
  title: string
  description: string
  spec: Omit<ChartSpec, 'id'>
  accent: 'lime' | 'cyan' | 'orange' | 'pink'
}

export type GpuStatus = 'checking' | 'accelerated' | 'fallback' | 'unavailable'

export interface RuntimeState {
  webmcp: 'registered' | 'unsupported' | 'blocked'
  gpu: GpuStatus
  registeredTools: string[]
}

export interface ActivityEntry {
  id: string
  source: 'human' | 'agent' | 'system'
  action: string
  detail: string
  createdAt: string
  revision: number
  status: 'success' | 'error' | 'info'
}

export interface WorkspaceState {
  dataset: Dataset | null
  charts: ChartSpec[]
  globalFilters: FilterRule[]
  selectedChartId: string | null
  revision: number
  runtime: RuntimeState
  activity: ActivityEntry[]
}

export interface EdaToolResult {
  ok: boolean
  message: string
  revision: number
  data?: unknown
}

export const MAX_FILE_BYTES = 25 * 1024 * 1024
export const MAX_ROWS = 250_000
