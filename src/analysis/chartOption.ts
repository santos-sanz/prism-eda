import type { EChartsOption } from 'echarts'
import type { ChartSpec, Dataset } from '../data/types'
import { aggregateChartData, scatterData } from './chartData'

const colors = ['#b8ff5a', '#6de8ff', '#ffb36b', '#ff7ca8', '#a98cff', '#f2f4f7']

const base: EChartsOption = {
  animationDuration: 450,
  textStyle: { fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' },
  color: colors,
  grid: { left: 44, right: 20, top: 26, bottom: 38, containLabel: true },
  tooltip: { trigger: 'axis', backgroundColor: '#151c25', borderColor: '#2a3745', textStyle: { color: '#f2f4f7' } },
}

export function buildChartOption(dataset: Dataset, chart: ChartSpec, globalFilters: ChartSpec['filters']): EChartsOption {
  if (chart.kind === 'scatter') {
    const data = scatterData(dataset, chart, globalFilters).map((datum) => [datum.value, datum.secondary])
    return { ...base, tooltip: { ...base.tooltip, trigger: 'item' }, xAxis: { type: 'value', name: chart.xColumn, nameTextStyle: { color: '#82909f' }, axisLabel: { color: '#82909f' }, splitLine: { lineStyle: { color: '#202b36' } } }, yAxis: { type: 'value', name: chart.yColumn, nameTextStyle: { color: '#82909f' }, axisLabel: { color: '#82909f' }, splitLine: { lineStyle: { color: '#202b36' } } }, series: [{ type: 'scatter', data, symbolSize: 8, itemStyle: { color: '#ff7ca8', opacity: 0.72 } }] }
  }

  if (chart.kind === 'area' && chart.yColumn && dataset.numericHistograms?.[chart.yColumn]) {
    const histogram = dataset.numericHistograms[chart.yColumn]
    const span = Math.max(histogram.max - histogram.min, 0.000001)
    const labels = histogram.bins.map((_, index) => `${(histogram.min + (span * index) / 64).toFixed(1)}`)
    return { ...base, tooltip: { ...base.tooltip, trigger: 'axis' }, xAxis: { type: 'category', data: labels, axisLabel: { color: '#82909f', interval: 7 }, axisLine: { lineStyle: { color: '#2a3745' } } }, yAxis: { type: 'value', axisLabel: { color: '#82909f' }, splitLine: { lineStyle: { color: '#202b36' } } }, series: [{ name: chart.yColumn, type: 'line', smooth: true, data: histogram.bins, areaStyle: { color: 'rgba(255,179,107,.18)' }, lineStyle: { color: '#ffb36b', width: 3 }, symbol: 'none' }] }
  }

  const data = aggregateChartData(dataset, chart, globalFilters)
  if (chart.kind === 'donut') {
    return { ...base, tooltip: { ...base.tooltip, trigger: 'item' }, legend: { type: 'scroll', bottom: 0, textStyle: { color: '#82909f' } }, series: [{ type: 'pie', radius: ['52%', '75%'], center: ['50%', '46%'], itemStyle: { borderRadius: 8, borderColor: '#111820', borderWidth: 3 }, label: { show: false }, data: data.map((item) => ({ name: item.label, value: item.value })) }] }
  }

  const isCategoryAxis = chart.kind === 'bar' || chart.kind === 'line' || chart.kind === 'area'
  return { ...base, xAxis: { type: isCategoryAxis ? 'category' : 'value', data: data.map((item) => item.label), axisLabel: { color: '#82909f', rotate: data.length > 8 ? 30 : 0 }, axisLine: { lineStyle: { color: '#2a3745' } } }, yAxis: { type: 'value', axisLabel: { color: '#82909f' }, splitLine: { lineStyle: { color: '#202b36' } } }, series: [{ type: chart.kind === 'area' ? 'line' : chart.kind, data: data.map((item) => item.value), smooth: chart.kind === 'line' || chart.kind === 'area', areaStyle: chart.kind === 'area' ? { color: 'rgba(184,255,90,.14)' } : undefined, lineStyle: { width: chart.kind === 'area' ? 3 : 2 }, itemStyle: { borderRadius: chart.kind === 'bar' ? [5, 5, 0, 0] : undefined } }] }
}
