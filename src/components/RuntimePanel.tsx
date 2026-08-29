import { useState } from 'react'
import type { ActivityEntry, RuntimeState } from '../data/types'

function StatusDot({ tone }: { tone: 'good' | 'warn' | 'muted' }) {
  return <span className={`status-dot status-dot--${tone}`} />
}

export function RuntimePanel({ runtime, activity }: { runtime: RuntimeState; activity: ActivityEntry[] }) {
  const [copied, setCopied] = useState(false)
  const instructions = 'Prism EDA is a local-first WebMCP app. Drop a CSV or JSON file, then ask your browser agent to call eda_get_dataset_profile, eda_list_charts, or eda_update_chart. In Chrome, enable chrome://flags/#enable-webmcp-testing first.'

  const copyInstructions = async () => {
    try {
      await navigator.clipboard.writeText(instructions)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  const webmcpTone = runtime.webmcp === 'registered' ? 'good' : runtime.webmcp === 'blocked' ? 'warn' : 'muted'
  const gpuTone = runtime.gpu === 'accelerated' ? 'good' : runtime.gpu === 'checking' ? 'muted' : 'warn'
  const webmcpLabel = runtime.webmcp === 'registered' ? 'Connected' : runtime.webmcp === 'blocked' ? 'Permission blocked' : 'Browser fallback'
  const gpuLabel = runtime.gpu === 'accelerated' ? 'Accelerated' : runtime.gpu === 'checking' ? 'Checking device' : 'CPU fallback'

  return (
    <aside className="runtime-panel panel">
      <div className="panel-heading">
        <div><div className="eyebrow">Agent Runtime</div><h2>Shared control plane</h2></div>
        <span className="runtime-signal"><StatusDot tone={webmcpTone} />{webmcpLabel}</span>
      </div>
      <p className="runtime-copy">The agent sees the same workspace as you. Every call is visible, typed, and reflected in the canvas.</p>
      <div className="runtime-status-grid">
        <div className="runtime-status"><StatusDot tone={webmcpTone} /><span>WebMCP</span><strong>{webmcpLabel}</strong></div>
        <div className="runtime-status"><StatusDot tone={gpuTone} /><span>WebGPU</span><strong>{gpuLabel}</strong></div>
      </div>
      <button className="button button--outline runtime-button" onClick={copyInstructions}>{copied ? 'Instructions copied' : 'Copy agent instructions'}</button>
      <div className="panel-section">
        <div className="section-label">Registered tools <span>{runtime.registeredTools.length}</span></div>
        <div className="tool-list">
          {runtime.registeredTools.length ? runtime.registeredTools.map((tool) => <div className="tool-row" key={tool}><span className="tool-glyph">◈</span><code>{tool}</code><span className="tool-state">ready</span></div>) : <div className="empty-mini">Load a dataset to expose dataset tools.</div>}
        </div>
      </div>
      <div className="panel-section activity-section">
        <div className="section-label">Activity trace</div>
        <div className="activity-list">
          {activity.slice(0, 7).map((item) => <div className="activity-row" key={item.id}><div className={`activity-icon activity-icon--${item.status}`}>{item.source === 'agent' ? 'A' : item.source === 'human' ? 'H' : '·'}</div><div><strong>{item.action.replaceAll('_', ' ')}</strong><span>{item.detail}</span></div><code>v{item.revision}</code></div>)}
          {!activity.length && <div className="empty-mini">Human and agent actions will appear here.</div>}
        </div>
      </div>
    </aside>
  )
}

