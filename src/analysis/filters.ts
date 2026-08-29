import type { FilterRule, Row, Scalar } from '../data/types'

function matches(rowValue: Scalar, filter: FilterRule): boolean {
  if (rowValue === null) return false
  const left = String(rowValue).toLowerCase()
  const right = String(filter.value).toLowerCase()
  if (filter.operator === 'equals') return left === right
  if (filter.operator === 'contains') return left.includes(right)
  const leftNumber = Number(rowValue)
  const rightNumber = Number(filter.value)
  if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) return false
  return filter.operator === 'greaterThan' ? leftNumber > rightNumber : leftNumber < rightNumber
}

export function applyFilters(rows: Row[], filters: FilterRule[]): Row[] {
  if (!filters.length) return rows
  return rows.filter((row) => filters.every((filter) => matches(row[filter.column] ?? null, filter)))
}

export function filterLabel(filter: FilterRule): string {
  const operator = { equals: '=', contains: 'contains', greaterThan: '>', lessThan: '<' }[filter.operator]
  return `${filter.column} ${operator} ${filter.value}`
}

