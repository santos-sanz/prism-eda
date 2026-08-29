import { describe, expect, it } from 'vitest'
import { WorkspaceController } from './workspace'
import { parseStructuredText } from '../data/parser'

describe('WorkspaceController', () => {
  it('shares chart updates and rejects unknown columns', () => {
    const controller = new WorkspaceController()
    controller.loadDataset(parseStructuredText('region,revenue\nNorth,10\nSouth,20', 'x.csv', 'csv'))
    const chartId = controller.getState().charts[0].id
    expect(controller.updateChart({ chartId, xColumn: 'missing' }, 'agent').ok).toBe(false)
    expect(controller.updateChart({ chartId, kind: 'bar', yColumn: 'revenue' }, 'agent').ok).toBe(true)
    expect(controller.getState().charts.find((chart) => chart.id === chartId)?.origin).toBe('agent')
  })

  it('applies a global filter and increments the shared revision', () => {
    const controller = new WorkspaceController()
    controller.loadDataset(parseStructuredText('region,revenue\nNorth,10\nSouth,20', 'x.csv', 'csv'))
    const before = controller.getState().revision
    expect(controller.setFilter({ column: 'region', operator: 'equals', value: 'North' }, 'agent').ok).toBe(true)
    expect(controller.getState().revision).toBeGreaterThan(before)
    expect(controller.getState().globalFilters).toHaveLength(1)
  })

  it('keeps scatter axes numeric when switching from a categorical chart', () => {
    const controller = new WorkspaceController()
    controller.loadDataset(parseStructuredText('region,revenue,orders\nNorth,10,2\nSouth,20,4', 'x.csv', 'csv'))
    const chartId = controller.getState().charts[0].id
    const result = controller.updateChart({ chartId, kind: 'scatter' }, 'human')
    expect(result.ok).toBe(true)
    expect(controller.getState().charts.find((chart) => chart.id === chartId)).toMatchObject({ kind: 'scatter', title: 'revenue vs orders', xColumn: 'revenue', yColumn: 'orders' })
  })

  it('uses a useful dimension when creating a fresh chart', () => {
    const controller = new WorkspaceController()
    controller.loadDataset(parseStructuredText('Id,region,revenue\n1,North,10\n2,South,20', 'x.csv', 'csv'))
    const result = controller.createChart({ kind: 'bar' }, 'agent')
    expect(result.ok).toBe(true)
    expect(controller.getState().charts.at(-1)).toMatchObject({ xColumn: 'region', yColumn: 'revenue', title: 'revenue by region' })
  })
})
