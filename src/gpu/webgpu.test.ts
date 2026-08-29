import { describe, expect, it } from 'vitest'
import { cpuHistogram, cpuSample } from './webgpu'

describe('CPU analytics fallback', () => {
  it('creates stable bins equivalent to the GPU contract', () => {
    const histogram = cpuHistogram([0, 1, 2, 3, 4], 4)
    expect(histogram?.bins.reduce((sum, value) => sum + value, 0)).toBe(5)
    expect(histogram?.min).toBe(0)
    expect(histogram?.max).toBe(4)
  })

  it('returns null for an empty numeric column', () => {
    expect(cpuHistogram([])).toBeNull()
  })

  it('keeps deterministic bounded samples for dense arrays', () => {
    expect(cpuSample(Array.from({ length: 1200 }, (_, index) => index), 600)).toHaveLength(600)
    expect(cpuSample([1, 2, 3], 600)).toEqual([1, 2, 3])
  })

  it('computes dense histograms without spreading a large argument list', () => {
    const histogram = cpuHistogram(Array.from({ length: 250_000 }, (_, index) => index % 1000))
    expect(histogram?.bins.reduce((sum, value) => sum + value, 0)).toBe(250_000)
  })
})
