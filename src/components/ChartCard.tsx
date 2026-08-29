import { useEffect, useMemo, useRef, useState } from 'react'
import * as echarts from 'echarts/core'
import { BarChart, LineChart, PieChart, ScatterChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TitleComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { ChartKind, ChartSpec, Dataset, FilterOperator } from '../data/types'
import { buildChartOption } from '../analysis/chartOption'
import { filterLabel } from '../analysis/filters'
import { columnOptionsForKind } from '../analysis/suggestions'

echarts.use([BarChart, LineChart, PieChart, ScatterChart, GridComponent, LegendComponent, TitleComponent, TooltipComponent, CanvasRenderer])

type Props = {
  chart: ChartSpec
  dataset: Dataset
  globalFilters: ChartSpec['filters']
  selected: boolean
  onFocus: () => void
  onUpdate: (input: { chartId: string; kind?: ChartKind; xColumn?: string; yColumn?: string | null }) => void
  onFilter: (input: { chartId?: string; column: string; operator: FilterOperator; value: string | number }) => void
  onClearFilters: (chartId?: string) => void
}

const chartKinds: Array<{ value: ChartKind; label: string }> = [
  { value: 'bar', label: 'Bars' },
  { value: 'line', label: 'Line' },
  { value: 'area', label: 'Area' },
  { value: 'scatter', label: 'Scatter' },
  { value: 'donut', label: 'Donut' },
]

export function ChartCard({ chart, dataset, globalFilters, selected, onFocus, onUpdate, onFilter, onClearFilters }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<echarts.ECharts | null>(null)
  const [filterColumn, setFilterColumn] = useState(dataset.columns[0]?.name ?? '')
  const [filterOperator, setFilterOperator] = useState<FilterOperator>('equals')
  const [filterValue, setFilterValue] = useState('')
  const xOptions = useMemo(() => columnOptionsForKind(dataset.columns, chart.kind, 'x'), [dataset.columns, chart.kind])
  const yOptions = useMemo(() => columnOptionsForKind(dataset.columns, chart.kind, 'y'), [dataset.columns, chart.kind])

  useEffect(() => {
    if (!containerRef.current) return
    const instance = echarts.init(containerRef.current, undefined, { renderer: 'canvas' })
    instanceRef.current = instance
    const resize = () => instance.resize()
    window.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('resize', resize)
      instance.dispose()
      instanceRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!instanceRef.current) return
    instanceRef.current.setOption(buildChartOption(dataset, chart, globalFilters), true)
  }, [dataset, chart, globalFilters])

  const submitFilter = () => {
    if (!filterColumn || !filterValue.trim()) return
    const numeric = Number(filterValue)
    onFilter({ chartId: chart.id, column: filterColumn, operator: filterOperator, value: filterOperator === 'equals' && Number.isFinite(numeric) && filterValue.trim() !== '' ? numeric : filterValue.trim() })
    setFilterValue('')
  }

  return (
    <article className={`chart-card ${selected ? 'is-selected' : ''}`} onClick={onFocus} data-testid={`chart-card-${chart.id}`}>
      <header className="chart-card__header">
        <div>
          <div className="eyebrow">{chart.origin === 'agent' ? 'Agent edited' : 'Suggested view'}</div>
          <h3>{chart.title}</h3>
        </div>
        <span className="chart-chip">{chart.kind}</span>
      </header>
      <p className="chart-reason">{chart.reason}</p>
      <div ref={containerRef} className="chart-canvas" aria-label={`${chart.title} chart`} />
      <div className="chart-controls" onClick={(event) => event.stopPropagation()}>
        <label>
          <span>Type</span>
          <select value={chart.kind} onChange={(event) => onUpdate({ chartId: chart.id, kind: event.target.value as ChartKind })}>
            {chartKinds.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
          </select>
        </label>
        <label>
          <span>X axis</span>
          <select value={chart.xColumn} onChange={(event) => onUpdate({ chartId: chart.id, xColumn: event.target.value })}>
            {xOptions.map((column) => <option key={column.name} value={column.name}>{column.name}</option>)}
          </select>
        </label>
        {chart.kind !== 'donut' && (
          <label>
            <span>Y axis</span>
            <select value={chart.yColumn ?? ''} onChange={(event) => onUpdate({ chartId: chart.id, yColumn: event.target.value || null })}>
              <option value="">Count rows</option>
              {yOptions.map((column) => <option key={column.name} value={column.name}>{column.name}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="chart-card__footer" onClick={(event) => event.stopPropagation()}>
        <div className="filter-list">
          {[...globalFilters, ...chart.filters].map((filter) => <span className="filter-pill" key={filter.id}>{filterLabel(filter)}</span>)}
          {!globalFilters.length && !chart.filters.length && <span className="muted">No filters</span>}
        </div>
        <details className="filter-popover">
          <summary>+ Filter</summary>
          <div className="filter-form">
            <select value={filterColumn} onChange={(event) => setFilterColumn(event.target.value)}>
              {dataset.columns.map((column) => <option key={column.name} value={column.name}>{column.name}</option>)}
            </select>
            <select value={filterOperator} onChange={(event) => setFilterOperator(event.target.value as FilterOperator)}>
              <option value="equals">equals</option>
              <option value="contains">contains</option>
              <option value="greaterThan">greater than</option>
              <option value="lessThan">less than</option>
            </select>
            <input value={filterValue} placeholder="value" onChange={(event) => setFilterValue(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && submitFilter()} />
            <button className="button button--small" onClick={submitFilter}>Apply</button>
          </div>
        </details>
        {chart.filters.length > 0 && <button className="text-button" onClick={() => onClearFilters(chart.id)}>Clear</button>}
      </div>
    </article>
  )
}
