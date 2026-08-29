import type { Dataset } from '../data/types'

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function DatasetPanel({ dataset }: { dataset: Dataset }) {
  return (
    <aside className="dataset-panel panel">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">Active dataset</div>
          <h2>{dataset.fileName}</h2>
        </div>
        <span className="format-badge">{dataset.format.toUpperCase()}</span>
      </div>
      <div className="stat-grid">
        <div><strong>{dataset.rowCount.toLocaleString()}</strong><span>rows</span></div>
        <div><strong>{dataset.columns.length}</strong><span>columns</span></div>
        <div><strong>{formatBytes(dataset.byteSize)}</strong><span>source</span></div>
      </div>
      <div className="panel-section">
        <div className="section-label">Column profile</div>
        <div className="column-list">
          {dataset.columns.map((column) => (
            <div className="column-row" key={column.name}>
              <div className="column-row__name"><span className={`type-dot type-dot--${column.kind}`} />{column.name}</div>
              <span className="column-kind">{column.kind}</span>
              <span className="column-meta">{column.distinctCount.toLocaleString()} unique</span>
            </div>
          ))}
        </div>
      </div>
      <div className="panel-section preview-section">
        <div className="section-label">Preview</div>
        <div className="preview-table-wrap">
          <table className="preview-table">
            <thead><tr>{dataset.columns.slice(0, 3).map((column) => <th key={column.name}>{column.name}</th>)}</tr></thead>
            <tbody>{dataset.previewRows.map((row, index) => <tr key={index}>{dataset.columns.slice(0, 3).map((column) => <td key={column.name}>{String(row[column.name] ?? '—')}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </div>
    </aside>
  )
}

