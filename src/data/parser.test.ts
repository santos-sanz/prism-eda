import { describe, expect, it } from 'vitest'
import { DatasetParseError, parseStructuredText } from './parser'
import { MAX_FILE_BYTES, MAX_ROWS } from './types'

describe('parseStructuredText', () => {
  it('profiles a CSV and infers number, category, and date columns', () => {
    const dataset = parseStructuredText('date,region,revenue\n2026-01-01,North,120\n2026-01-02,South,80', 'sales.csv', 'csv')
    expect(dataset.rowCount).toBe(2)
    expect(dataset.columns.map((column) => column.kind)).toEqual(['date', 'category', 'number'])
    expect(dataset.columns[2].min).toBe(80)
  })

  it('accepts an object containing a data array', () => {
    const dataset = parseStructuredText(JSON.stringify({ data: [{ name: 'A', value: 1 }, { name: 'B', value: 2 }] }), 'sample.json', 'json')
    expect(dataset.format).toBe('json')
    expect(dataset.columns[1].kind).toBe('number')
  })

  it('rejects malformed JSON and non-tabular JSON', () => {
    expect(() => parseStructuredText('{nope', 'bad.json', 'json')).toThrow(DatasetParseError)
    expect(() => parseStructuredText(JSON.stringify([1, 2, 3]), 'bad.json', 'json')).toThrow('array of objects')
  })

  it('rejects empty input', () => {
    expect(() => parseStructuredText('  ', 'empty.csv', 'csv')).toThrow('file is empty')
  })

  it('normalizes common missing tokens and preserves duplicate headers', () => {
    const dataset = parseStructuredText('value,value,flag\n1,2,NA\n3,,true', 'messy.csv', 'csv')
    expect(dataset.columns.map((column) => column.name)).toEqual(['value', 'value_1', 'flag'])
    expect(dataset.rows[0].flag).toBeNull()
    expect(dataset.rows[1].value_1).toBeNull()
    expect(dataset.columns.find((column) => column.name === 'flag')?.nullCount).toBe(1)
  })

  it('rejects inconsistent CSV rows and accepts mixed scalar JSON values', () => {
    expect(() => parseStructuredText('a,b\n1\n2,3,4', 'bad.csv', 'csv')).toThrow('CSV parsing stopped')
    const dataset = parseStructuredText(JSON.stringify([{ value: 1 }, { value: 'unknown' }, { value: null }]), 'mixed.json', 'json')
    expect(dataset.columns[0].kind).toBe('category')
    expect(dataset.columns[0].nullCount).toBe(1)
  })

  it('enforces the local-first size and row guardrails before profiling', () => {
    expect(() => parseStructuredText('a\n1', 'large.csv', 'csv', MAX_FILE_BYTES + 1)).toThrow('larger than 25 MB')
    const tooManyRows = ['value,other', ...Array.from({ length: MAX_ROWS + 1 }, () => '1,2')].join('\n')
    expect(() => parseStructuredText(tooManyRows, 'rows.csv', 'csv')).toThrow('more than 250,000 rows')
  })
})
