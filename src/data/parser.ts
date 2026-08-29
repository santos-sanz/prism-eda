import Papa from 'papaparse'
import type { ColumnKind, ColumnProfile, Dataset, Row, Scalar } from './types'
import { MAX_FILE_BYTES, MAX_ROWS } from './types'

export class DatasetParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DatasetParseError'
  }
}

function makeUniqueHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>()
  return headers.map((header, index) => {
    const base = header.trim() || `column_${index + 1}`
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    return count === 0 ? base : `${base}_${count + 1}`
  })
}

function parseScalar(value: unknown): Scalar {
  if (value === null || value === undefined) return null
  if (typeof value === 'number' || typeof value === 'boolean') return value
  const text = String(value).trim()
  if (!text) return null
  if (/^(?:na|n\/a|null|none|nan|missing)$/i.test(text)) return null
  if (/^(true|false)$/i.test(text)) return text.toLowerCase() === 'true'
  if (/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) {
    const number = Number(text)
    if (Number.isFinite(number)) return number
  }
  return text
}

function isDateValue(value: Scalar): boolean {
  if (typeof value !== 'string') return false
  if (!/[\d/-]/.test(value) || !/[/-]/.test(value)) return false
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp)
}

function inferKind(values: Scalar[], columnName: string): ColumnKind {
  const nonNull = values.filter((value): value is Exclude<Scalar, null> => value !== null)
  if (!nonNull.length) return 'text'
  const numericRatio = nonNull.filter((value) => typeof value === 'number').length / nonNull.length
  const booleanRatio = nonNull.filter((value) => typeof value === 'boolean').length / nonNull.length
  const dateRatio = nonNull.filter(isDateValue).length / nonNull.length
  const uniqueCount = new Set(nonNull.map(String)).size

  if (booleanRatio >= 0.9) return 'boolean'
  if (dateRatio >= 0.8 && !/id|year|count|number/i.test(columnName)) return 'date'
  if (numericRatio >= 0.8) return 'number'
  if (uniqueCount <= Math.min(50, Math.max(8, values.length * 0.2))) return 'category'
  return 'text'
}

function profileColumns(rows: Row[], headers: string[]): ColumnProfile[] {
  return headers.map((name) => {
    const values = rows.map((row) => row[name] ?? null)
    const nonNull = values.filter((value): value is Exclude<Scalar, null> => value !== null)
    const kind = inferKind(values, name)
    const numericValues = nonNull.filter((value): value is number => typeof value === 'number')
    const min = numericValues.reduce((current, value) => Math.min(current, value), Number.POSITIVE_INFINITY)
    const max = numericValues.reduce((current, value) => Math.max(current, value), Number.NEGATIVE_INFINITY)
    return {
      name,
      kind,
      nullable: values.length !== nonNull.length,
      nullCount: values.length - nonNull.length,
      distinctCount: new Set(nonNull.map(String)).size,
      ...(numericValues.length ? { min, max } : {}),
      examples: [...new Set(nonNull.map(String))].slice(0, 3),
    }
  })
}

function stableId(fileName: string, rows: Row[]): string {
  const seed = `${fileName}:${rows.length}:${Object.keys(rows[0] ?? {}).join('|')}`
  let hash = 2166136261
  for (const character of seed) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return `ds_${(hash >>> 0).toString(16)}`
}

export function parseStructuredText(text: string, fileName = 'dataset.csv', formatHint?: 'csv' | 'json', byteSize = new TextEncoder().encode(text).byteLength): Dataset {
  if (!text.trim()) throw new DatasetParseError('The file is empty. Add a header row and at least one record.')
  if (byteSize > MAX_FILE_BYTES) throw new DatasetParseError('This dataset is larger than 25 MB. Try a smaller export for the local workspace.')

  const format = formatHint ?? (/\.json$/i.test(fileName) ? 'json' : 'csv')
  let rawRows: unknown[]
  let headers: string[]

  if (format === 'json') {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new DatasetParseError('That JSON could not be parsed. Check commas, quotes, and brackets.')
    }
    const candidate = Array.isArray(parsed) ? parsed : (parsed as { data?: unknown } | null)?.data
    if (!Array.isArray(candidate) || !candidate.length || candidate.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
      throw new DatasetParseError('JSON must be an array of objects or an object with a data array.')
    }
    rawRows = candidate
    headers = makeUniqueHeaders([...new Set(candidate.flatMap((item) => Object.keys(item as Record<string, unknown>)))])
  } else {
    const result = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: 'greedy', dynamicTyping: false })
    if (result.errors.length) throw new DatasetParseError(`CSV parsing stopped on row ${result.errors[0].row ?? 'unknown'}: ${result.errors[0].message}`)
    rawRows = result.data
    headers = makeUniqueHeaders(result.meta.fields ?? Object.keys(result.data[0] ?? {}))
  }

  if (rawRows.length > MAX_ROWS) throw new DatasetParseError('This dataset has more than 250,000 rows. Use a representative sample for the local workspace.')
  const rows = rawRows.map((raw) => {
    const source = raw as Record<string, unknown>
    return Object.fromEntries(headers.map((header) => [header, parseScalar(source[header] ?? source[header.replace(/_\d+$/, '')])]))
  })
  if (!rows.length || !headers.length) throw new DatasetParseError('No tabular records were found in this file.')

  return {
    id: stableId(fileName, rows),
    fileName,
    format,
    byteSize,
    rowCount: rows.length,
    columns: profileColumns(rows, headers),
    rows,
    previewRows: rows.slice(0, 5),
    loadedAt: new Date().toISOString(),
  }
}

export async function parseFile(file: File): Promise<Dataset> {
  if (file.size > MAX_FILE_BYTES) throw new DatasetParseError('This dataset is larger than 25 MB. Try a smaller export for the local workspace.')
  const text = await file.text()
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./parser.worker.ts', import.meta.url), { type: 'module' })
    const cleanup = () => worker.terminate()
    worker.onmessage = (event: MessageEvent<{ ok: boolean; dataset?: Dataset; error?: string }>) => {
      cleanup()
      if (event.data.ok && event.data.dataset) resolve(event.data.dataset)
      else reject(new DatasetParseError(event.data.error ?? 'Could not read this dataset.'))
    }
    worker.onerror = () => {
      cleanup()
      try {
        resolve(parseStructuredText(text, file.name, /\.json$/i.test(file.name) ? 'json' : 'csv', file.size))
      } catch (error) {
        reject(error)
      }
    }
    worker.postMessage({ text, fileName: file.name, byteSize: file.size })
  })
}
