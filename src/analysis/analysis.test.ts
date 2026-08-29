import { describe, expect, it } from 'vitest'
import { applyFilters } from './filters'
import { suggestCharts } from './suggestions'
import type { Dataset, Row } from '../data/types'

const rows: Row[] = [
  { date: '2026-01-01', region: 'North', revenue: 100, orders: 10 },
  { date: '2026-01-02', region: 'South', revenue: 50, orders: 5 },
  { date: '2026-01-03', region: 'North', revenue: 90, orders: 9 },
]
const dataset: Dataset = { id: 'test', fileName: 'test.csv', format: 'csv', byteSize: 100, rowCount: rows.length, columns: [
  { name: 'date', kind: 'date', nullable: false, nullCount: 0, distinctCount: 3, examples: ['2026-01-01'] },
  { name: 'region', kind: 'category', nullable: false, nullCount: 0, distinctCount: 2, examples: ['North', 'South'] },
  { name: 'revenue', kind: 'number', nullable: false, nullCount: 0, distinctCount: 3, min: 50, max: 100, examples: ['100'] },
  { name: 'orders', kind: 'number', nullable: false, nullCount: 0, distinctCount: 3, min: 5, max: 10, examples: ['10'] },
], rows, previewRows: rows, loadedAt: new Date().toISOString() }

describe('analysis engine', () => {
  it('applies strict AND filters', () => {
    expect(applyFilters(rows, [{ id: 'f1', column: 'region', operator: 'equals', value: 'North' }, { id: 'f2', column: 'revenue', operator: 'greaterThan', value: 95 }])).toHaveLength(1)
  })

  it('suggests complementary chart types for a mixed dataset', () => {
    const kinds = suggestCharts(dataset).map((suggestion) => suggestion.spec.kind)
    expect(kinds).toEqual(expect.arrayContaining(['bar', 'line', 'scatter', 'donut']))
  })
})

