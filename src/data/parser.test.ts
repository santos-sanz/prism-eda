import { describe, expect, it } from 'vitest'
import { DatasetParseError, parseStructuredText } from './parser'

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
})

