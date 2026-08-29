import { expect, test } from '@playwright/test'

test('loads the local-first landing experience', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Drop your data here')).toBeVisible()
  await expect(page.getByText('No upload')).toBeVisible()
})

test('loads sample data and exposes editable live views', async ({ page }) => {
  await page.goto('/')
  await page.getByText('Try sample dataset').click()
  await expect(page.getByRole('heading', { name: 'demo-retail.csv' })).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('[data-testid^="chart-card-"]')).toHaveCount(4)
  await expect(page.getByText('Shared control plane')).toBeVisible()
  await expect(page.getByText('workspace v')).toBeVisible()
  await expect(page.locator('.global-filter-bar select')).toHaveValue('region')

  const firstChart = page.locator('[data-testid="chart-card-chart_1"]')
  await firstChart.locator('.chart-controls select').first().selectOption('bar')
  await expect(firstChart.locator('.chart-chip')).toHaveText('bar')
})

test('registers real WebMCP tools and mutates the shared canvas', async ({ page }) => {
  await page.addInitScript(() => {
    const target = window as Window & { __webmcpTools: Array<{ name: string; execute: (input: unknown) => Promise<unknown> }> }
    target.__webmcpTools = []
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: { registerTool: async (tool: { name: string; execute: (input: unknown) => Promise<unknown> }) => { target.__webmcpTools.push(tool) } },
    })
  })
  await page.goto('/')
  await page.getByText('Try sample dataset').click()
  await expect(page.getByRole('heading', { name: 'demo-retail.csv' })).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.tool-row')).toHaveCount(8)
  const toolNames = await page.evaluate(() => [...new Set((window as Window & { __webmcpTools: Array<{ name: string }> }).__webmcpTools.map((tool) => tool.name))])
  expect(toolNames).toEqual(expect.arrayContaining(['eda_get_status', 'eda_get_dataset_profile', 'eda_list_charts', 'eda_update_chart']))
  await page.evaluate(async () => {
    const tools = (window as Window & { __webmcpTools: Array<{ name: string; execute: (input: unknown) => Promise<unknown> }> }).__webmcpTools
    const update = tools.find((tool) => tool.name === 'eda_update_chart')
    await update?.execute({ chartId: 'chart_2', kind: 'scatter' })
  })
  await expect(page.locator('[data-testid="chart-card-chart_2"] .chart-chip')).toHaveText('scatter')
  await expect(page.locator('[data-testid="chart-card-chart_2"] h3')).toHaveText('revenue vs margin')
  await expect(page.getByText('agent', { exact: false }).first()).toBeVisible()
})
