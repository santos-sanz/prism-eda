import { describe, expect, it } from 'vitest'
import { cpuHistogram } from './webgpu'

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
})

