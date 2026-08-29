import { describe, expect, it, afterEach } from 'vitest'
import { parseStructuredText } from '../data/parser'
import { WorkspaceController } from '../analysis/workspace'
import { registerWebMcpTools } from './runtime'

const originalDocument = globalThis.document

afterEach(() => {
  Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument })
})

describe('WebMCP runtime', () => {
  it('gracefully falls back when modelContext is absent', async () => {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: {} })
    const result = await registerWebMcpTools(new WorkspaceController(), () => ({ webmcp: 'unsupported', gpu: 'fallback', registeredTools: [] }))
    expect(result.status).toBe('unsupported')
    expect(result.tools).toEqual([])
  })

  it('registers status and dataset tools against the shared controller', async () => {
    const tools: Array<{ name: string; execute: (input: unknown) => unknown }> = []
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { modelContext: { registerTool: async (tool: typeof tools[number]) => tools.push(tool) } } })
    const controller = new WorkspaceController()
    controller.loadDataset(parseStructuredText('region,revenue\nNorth,10\nSouth,20', 'x.csv', 'csv'))
    const result = await registerWebMcpTools(controller, () => controller.getState().runtime)
    expect(result.status).toBe('registered')
    expect(result.tools).toContain('eda_update_chart')
    const profileTool = tools.find((tool) => tool.name === 'eda_get_dataset_profile')
    expect(profileTool).toBeDefined()
    expect(await profileTool!.execute({})).toHaveProperty('content')
    result.cleanup()
  })
})

