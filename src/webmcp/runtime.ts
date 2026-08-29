import type { EdaToolResult, RuntimeState } from '../data/types'
import type { CreateChartInput, SetFilterInput, UpdateChartInput, WorkspaceController } from '../analysis/workspace'

type ToolAnnotations = { readOnlyHint?: boolean; untrustedContentHint?: boolean }
type ToolContext = { signal?: AbortSignal }
type ToolDefinition = {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  annotations?: ToolAnnotations
  execute: (input: unknown, context: ToolContext) => Promise<unknown> | unknown
}
type ModelContextLike = {
  registerTool: (tool: ToolDefinition, options?: { signal?: AbortSignal }) => Promise<unknown> | unknown
}

declare global {
  interface Document { modelContext?: ModelContextLike }
}

const chartKindSchema = { type: 'string', enum: ['bar', 'line', 'area', 'scatter', 'donut'], description: 'The visual form to use.' }
const columnSchema = { type: 'string', description: 'Exact column name from the dataset profile.' }

function textResult(result: EdaToolResult) {
  return { content: [{ type: 'text', text: JSON.stringify(result) }] }
}

function profile(controller: WorkspaceController): unknown {
  const state = controller.getState()
  if (!state.dataset) return { ok: false, message: 'No dataset is loaded.', revision: state.revision }
  return textResult({ ok: true, message: 'Dataset profile ready.', revision: state.revision, data: { fileName: state.dataset.fileName, format: state.dataset.format, rowCount: state.dataset.rowCount, columns: state.dataset.columns } })
}

function toolDefinitions(controller: WorkspaceController, runtime: () => RuntimeState, hasDataset: boolean): ToolDefinition[] {
  const common: ToolDefinition[] = [{
    name: 'eda_get_status',
    description: 'Read the current Prism EDA runtime, dataset availability, chart count, and GPU mode.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    execute: () => {
      const state = controller.getState()
      return textResult({ ok: true, message: 'Prism EDA status ready.', revision: state.revision, data: { runtime: runtime(), hasDataset: Boolean(state.dataset), chartCount: state.charts.length, selectedChartId: state.selectedChartId } })
    },
  }]
  if (!hasDataset) return common
  return [...common, {
    name: 'eda_get_dataset_profile',
    description: 'Return the active tabular dataset profile with exact column names, inferred types, null counts, cardinality, ranges, and examples.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute: () => profile(controller),
  }, {
    name: 'eda_list_charts',
    description: 'List the live charts in the current workspace so an agent can choose a chart to refine.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    execute: () => textResult({ ok: true, message: 'Chart list ready.', revision: controller.getState().revision, data: { charts: controller.listCharts() } }),
  }, {
    name: 'eda_create_chart',
    description: 'Create a new chart from the active dataset. Use exact column names from eda_get_dataset_profile.',
    inputSchema: { type: 'object', properties: { kind: chartKindSchema, xColumn: columnSchema, yColumn: columnSchema, title: { type: 'string', description: 'Optional short chart title.' } }, required: ['kind'] },
    execute: (input) => textResult(controller.createChart(input as CreateChartInput, 'agent')),
  }, {
    name: 'eda_update_chart',
    description: 'Edit an existing chart by changing its type, X axis, Y axis, or title. The canvas updates immediately.',
    inputSchema: { type: 'object', properties: { chartId: { type: 'string', description: 'Chart ID from eda_list_charts.' }, kind: chartKindSchema, xColumn: columnSchema, yColumn: { anyOf: [columnSchema, { type: 'null' }], description: 'Exact numeric column or null to count rows.' }, title: { type: 'string' } }, required: ['chartId'] },
    execute: (input) => textResult(controller.updateChart(input as UpdateChartInput, 'agent')),
  }, {
    name: 'eda_set_filter',
    description: 'Apply one reversible filter to the whole workspace or to one chart. Use an exact column name.',
    inputSchema: { type: 'object', properties: { chartId: { type: 'string', description: 'Optional chart ID; omit to filter every chart.' }, column: columnSchema, operator: { type: 'string', enum: ['equals', 'contains', 'greaterThan', 'lessThan'] }, value: { anyOf: [{ type: 'string' }, { type: 'number' }] } }, required: ['column', 'operator', 'value'] },
    execute: (input) => textResult(controller.setFilter(input as SetFilterInput, 'agent')),
  }, {
    name: 'eda_focus_chart',
    description: 'Focus a specific chart in the visible workspace so the human can inspect it.',
    inputSchema: { type: 'object', properties: { chartId: { type: 'string', description: 'Chart ID from eda_list_charts.' } }, required: ['chartId'] },
    execute: (input) => textResult(controller.focusChart((input as { chartId: string }).chartId, 'agent')),
  }, {
    name: 'eda_clear_filters',
    description: 'Clear all filters or only the filters on one chart. This is reversible through the activity trace only by reapplying the filter.',
    inputSchema: { type: 'object', properties: { chartId: { type: 'string', description: 'Optional chart ID.' } } },
    execute: (input) => textResult(controller.clearFilters((input as { chartId?: string }).chartId, 'agent')),
  }]
}

export async function registerWebMcpTools(controller: WorkspaceController, runtime: () => RuntimeState): Promise<{ status: RuntimeState['webmcp']; tools: string[]; cleanup: () => void }> {
  const modelContext = document.modelContext
  if (!modelContext) return { status: 'unsupported', tools: [], cleanup: () => undefined }
  const abortController = new AbortController()
  const definitions = toolDefinitions(controller, runtime, Boolean(controller.getState().dataset))
  try {
    for (const tool of definitions) await modelContext.registerTool(tool, { signal: abortController.signal })
    return { status: 'registered', tools: definitions.map((tool) => tool.name), cleanup: () => abortController.abort() }
  } catch {
    abortController.abort()
    return { status: 'blocked', tools: [], cleanup: () => undefined }
  }
}
