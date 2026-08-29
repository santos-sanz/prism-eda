import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ChartKind, Dataset, FilterOperator } from './data/types'
import { DatasetParseError, parseFile } from './data/parser'
import { cpuHistogram, cpuSample, GpuAnalytics } from './gpu/webgpu'
import { loadWorkspace, saveWorkspace } from './persistence/storage'
import { WorkspaceController } from './analysis/workspace'
import { ChartCard } from './components/ChartCard'
import { DatasetPanel } from './components/DatasetPanel'
import { RuntimePanel } from './components/RuntimePanel'
import { registerWebMcpTools } from './webmcp/runtime'
import './App.css'

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

function StatusIcon({ type }: { type: 'local' | 'gpu' | 'agent' }) {
  return <span className={`top-icon top-icon--${type}`}>{type === 'local' ? '⌂' : type === 'gpu' ? '✦' : '◈'}</span>
}

function App() {
  const controller = useMemo(() => new WorkspaceController(), [])
  const subscribe = useCallback((listener: () => void) => controller.subscribe(() => listener()), [controller])
  const getSnapshot = useCallback(() => controller.getState(), [controller])
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const [loading, setLoading] = useState(false)
  const [hydrating, setHydrating] = useState(true)
  const [error, setError] = useState('')
  const [gpuAnalytics, setGpuAnalytics] = useState<GpuAnalytics | null>(null)
  const [globalFilterColumn, setGlobalFilterColumn] = useState('')
  const [globalFilterValue, setGlobalFilterValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    loadWorkspace().then((saved) => {
      if (active && saved?.dataset) controller.hydrate(saved)
      if (active) setHydrating(false)
    })
    return () => { active = false }
  }, [controller])

  useEffect(() => {
    let active = true
    let cleanup: () => void = () => undefined
    registerWebMcpTools(controller, () => controller.getState().runtime).then((result) => {
      if (!active) {
        result.cleanup()
        return
      }
      cleanup = result.cleanup
      controller.setRuntime({ webmcp: result.status, registeredTools: result.tools })
    })
    return () => {
      active = false
      cleanup()
    }
  }, [controller, state.dataset?.id])

  useEffect(() => {
    if (!state.dataset) return
    void saveWorkspace(state)
  }, [state.revision, state.dataset?.id, state.dataset?.numericHistograms, state.dataset?.sampledRows])

  useEffect(() => {
    let active = true
    GpuAnalytics.create().then(({ analytics, status }) => {
      if (!active) return
      setGpuAnalytics(analytics)
      controller.setRuntime({ gpu: status })
    })
    return () => { active = false }
  }, [controller])

  useEffect(() => {
    const dataset = state.dataset
    if (!dataset || dataset.numericHistograms || state.runtime.gpu === 'checking') return
    let active = true
    const numericColumns = dataset.columns.filter((column) => column.kind === 'number').slice(0, 4)
    const prepare = async () => {
      const histograms: NonNullable<Dataset['numericHistograms']> = {}
      const rowIndices = dataset.rows.map((_, index) => index)
      const sampledIndices = gpuAnalytics ? await gpuAnalytics.sample(rowIndices) : cpuSample(rowIndices)
      const sampledRows = sampledIndices.map((value) => dataset.rows[Math.round(value)]).filter((row): row is NonNullable<typeof row> => Boolean(row))
      if (gpuAnalytics) {
        Object.assign(histograms, await gpuAnalytics.prepare(dataset))
      } else {
        for (const column of numericColumns) {
          const values = dataset.rows.map((row) => row[column.name]).filter((value): value is number => typeof value === 'number')
          const histogram = cpuHistogram(values)
          if (histogram) histograms[column.name] = histogram
        }
      }
      if (active && Object.keys(histograms).length) controller.attachNumericHistograms(histograms, sampledRows)
    }
    void prepare()
    return () => { active = false }
  }, [controller, gpuAnalytics, state.dataset?.id, state.dataset?.numericHistograms, state.runtime.gpu])

  useEffect(() => {
    if (state.dataset && !globalFilterColumn) setGlobalFilterColumn(state.dataset.columns[0]?.name ?? '')
  }, [state.dataset, globalFilterColumn])

  const importDataset = async (file: File) => {
    setLoading(true)
    setError('')
    try {
      const dataset = await parseFile(file)
      controller.loadDataset(dataset, 'human')
    } catch (cause) {
      setError(cause instanceof DatasetParseError ? cause.message : 'Could not load this dataset.')
    } finally {
      setLoading(false)
    }
  }

  const loadDemo = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/demo-retail.csv')
      if (!response.ok) throw new Error('Demo file unavailable.')
      const file = new File([await response.blob()], 'demo-retail.csv', { type: 'text/csv' })
      await importDataset(file)
    } catch {
      setError('The demo dataset could not be loaded. Try dropping a local CSV instead.')
      setLoading(false)
    }
  }

  const applyGlobalFilter = () => {
    if (!globalFilterColumn || !globalFilterValue.trim()) return
    const numeric = Number(globalFilterValue)
    controller.setFilter({ column: globalFilterColumn, operator: 'equals', value: Number.isFinite(numeric) ? numeric : globalFilterValue.trim() }, 'human')
    setGlobalFilterValue('')
  }

  const handleUpdate = (input: { chartId: string; kind?: ChartKind; xColumn?: string; yColumn?: string | null }) => controller.updateChart(input, 'human')
  const handleFilter = (input: { chartId?: string; column: string; operator: FilterOperator; value: string | number }) => controller.setFilter(input, 'human')
  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const file = event.dataTransfer.files[0]
    if (file) void importDataset(file)
  }

  if (hydrating) return <div className="loading-screen"><div className="brand-mark">P</div><p>Restoring local workspace…</p></div>

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup"><div className="brand-mark">P</div><div><div className="brand-name">PRISM <span>EDA</span></div><div className="brand-subtitle">explore the shape of your data</div></div></div>
        <div className="topbar-status"><div className="top-status"><StatusIcon type="local" /><span><strong>Local only</strong><small>your file stays here</small></span></div><div className="top-status"><StatusIcon type="gpu" /><span><strong>{state.runtime.gpu === 'accelerated' ? 'WebGPU ready' : 'CPU fallback'}</strong><small>compute on device</small></span></div><div className="top-status"><StatusIcon type="agent" /><span><strong>Agent-ready</strong><small>WebMCP surface</small></span></div></div>
        <button className="button button--outline topbar-button" onClick={() => inputRef.current?.click()}>{state.dataset ? 'New dataset' : 'Open dataset'} <span>⌘ O</span></button>
        <input ref={inputRef} className="visually-hidden" type="file" accept=".csv,.json,text/csv,application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importDataset(file); event.target.value = '' }} />
      </header>

      {!state.dataset ? (
        <main className="landing-main">
          <section className="landing-hero"><div className="eyebrow eyebrow--bright">LOCAL-FIRST EXPLORATION</div><h1>See what your data<br /><em>has been waiting to say.</em></h1><p>Drop a dataset. Prism profiles the shape, proposes the views, and lets you explore side by side with your agent.</p></section>
          <section className="drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
            <div className="drop-orbit"><span>↓</span></div><h2>Drop your data here</h2><p>CSV or JSON · up to 25 MB · processed in your browser</p><div className="drop-actions"><button className="button button--primary" onClick={() => inputRef.current?.click()}>Choose a file</button><button className="text-button text-button--bright" onClick={() => void loadDemo()}>Try sample dataset <span>→</span></button></div>{loading && <div className="loading-line"><span /> Reading locally…</div>}
          </section>
          <div className="landing-foot"><span><i className="tiny-dot tiny-dot--lime" /> No upload</span><span><i className="tiny-dot tiny-dot--cyan" /> Instant profile</span><span><i className="tiny-dot tiny-dot--orange" /> Agent-ready workspace</span></div>
        </main>
      ) : (
        <main className="workspace-main">
          <div className="workspace-head"><div><div className="eyebrow eyebrow--bright">EXPLORATION WORKSPACE</div><h1>{state.charts.length ? 'Your first read on the data.' : 'Ready to explore.'}</h1><p>Loaded {formatDate(new Date(state.dataset.loadedAt))} · {state.dataset.rowCount.toLocaleString()} rows profiled locally.</p></div><div className="workspace-actions"><button className="button button--outline" onClick={() => controller.createChart({ kind: 'bar' }, 'human')}>+ Add view</button><button className="button button--primary" onClick={() => inputRef.current?.click()}>Load another</button></div></div>
          <div className="global-filter-bar"><div className="global-filter-label"><span className="filter-spark">⌁</span><strong>Shape the view</strong><span>Global filter</span></div><select value={globalFilterColumn} onChange={(event) => setGlobalFilterColumn(event.target.value)}>{state.dataset.columns.map((column) => <option key={column.name} value={column.name}>{column.name}</option>)}</select><input value={globalFilterValue} placeholder="equals…" onChange={(event) => setGlobalFilterValue(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && applyGlobalFilter()} /><button className="button button--small" onClick={applyGlobalFilter}>Apply filter</button>{state.globalFilters.length > 0 && <button className="text-button" onClick={() => controller.clearFilters(undefined, 'human')}>Clear all ({state.globalFilters.length})</button>}</div>
          <div className="workspace-grid"><DatasetPanel dataset={state.dataset} /><section className="charts-area"><div className="section-toolbar"><div><span className="section-kicker">Suggested views</span><span className="section-count">{state.charts.length} live charts</span></div><span className="revision-badge">workspace v{state.revision}</span></div><div className="charts-grid">{state.charts.map((chart) => <ChartCard key={chart.id} chart={chart} dataset={state.dataset!} globalFilters={state.globalFilters} selected={state.selectedChartId === chart.id} onFocus={() => controller.focusChart(chart.id, 'human')} onUpdate={handleUpdate} onFilter={handleFilter} onClearFilters={(chartId) => controller.clearFilters(chartId, 'human')} />)}</div>{!state.charts.length && <div className="empty-workspace"><span>✦</span><h2>No chart could be suggested yet.</h2><p>Add columns with a numeric or categorical signal, then try again.</p></div>}</section><RuntimePanel runtime={state.runtime} activity={state.activity} /></div>
        </main>
      )}
      {error && <div className="error-toast"><span>!</span><div><strong>Could not load dataset</strong><p>{error}</p></div><button onClick={() => setError('')}>×</button></div>}
    </div>
  )
}

export default App
