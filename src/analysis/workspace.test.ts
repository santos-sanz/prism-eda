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
})

