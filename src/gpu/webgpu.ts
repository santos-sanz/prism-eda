import type { Dataset, GpuStatus } from '../data/types'

type GPUBufferLike = {
  mapAsync(mode: number): Promise<void>
  getMappedRange(): ArrayBuffer
  unmap(): void
  destroy?: () => void
}

type GPUQueueLike = {
  writeBuffer(buffer: GPUBufferLike, offset: number, data: ArrayBuffer | ArrayBufferView): void
  submit(commands: unknown[]): void
}

type GPUComputePassLike = {
  setPipeline(pipeline: unknown): void
  setBindGroup(index: number, group: unknown): void
  dispatchWorkgroups(count: number): void
  end(): void
}

type GPUCommandEncoderLike = {
  beginComputePass(): GPUComputePassLike
  copyBufferToBuffer(source: GPUBufferLike, sourceOffset: number, destination: GPUBufferLike, destinationOffset: number, size: number): void
  finish(): unknown
}

type GPUDeviceLike = {
  queue: GPUQueueLike
  createBuffer(descriptor: { size: number; usage: number }): GPUBufferLike
  createShaderModule(descriptor: { code: string }): unknown
  createBindGroupLayout(descriptor: { entries: unknown[] }): unknown
  createBindGroup(descriptor: { layout: unknown; entries: unknown[] }): unknown
  createPipelineLayout(descriptor: { bindGroupLayouts: unknown[] }): unknown
  createComputePipeline(descriptor: { layout: unknown; compute: { module: unknown; entryPoint: string } }): unknown
  createCommandEncoder(): GPUCommandEncoderLike
}

type GPUAdapterLike = { requestDevice(): Promise<GPUDeviceLike> }
type GPUApiLike = { requestAdapter(): Promise<GPUAdapterLike | null> }

const GPU_BUFFER_USAGE = {
  MAP_READ: 0x0001,
  COPY_SRC: 0x0004,
  COPY_DST: 0x0008,
  UNIFORM: 0x0040,
  STORAGE: 0x0080,
} as const
const GPU_MAP_READ = 0x0001
const GPU_COMPUTE_STAGE = 0x0004

function makeParams(min: number, max: number, count: number, stride: number): ArrayBuffer {
  const buffer = new ArrayBuffer(16)
  new Float32Array(buffer, 0, 2).set([min, max])
  new Uint32Array(buffer, 8, 2).set([count, stride])
  return buffer
}

export interface HistogramResult {
  bins: number[]
  min: number
  max: number
}

const HISTOGRAM_SHADER = `
struct Params { min: f32, max: f32, count: u32, stride: u32 }
@group(0) @binding(0) var<storage, read> values: array<f32>;
@group(0) @binding(1) var<storage, read_write> bins: array<atomic<u32>>;
@group(0) @binding(2) var<uniform> params: Params;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let index = id.x;
  if (index >= params.count) { return; }
  let span = max(params.max - params.min, 0.000001);
  let normalized = clamp((values[index] - params.min) / span, 0.0, 0.999999);
  atomicAdd(&bins[u32(normalized * 64.0)], 1u);
}
`

const SAMPLE_SHADER = `
struct Params { min: f32, max: f32, count: u32, stride: u32 }
@group(0) @binding(0) var<storage, read> values: array<f32>;
@group(0) @binding(1) var<storage, read_write> output: array<f32>;
@group(0) @binding(2) var<uniform> params: Params;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let index = id.x;
  if (index >= params.count || index % params.stride != 0u) { return; }
  output[index / params.stride] = values[index];
}
`

function numericValues(dataset: Dataset, column: string): number[] {
  return dataset.rows.map((row) => row[column]).filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
}

export class GpuAnalytics {
  private constructor(private readonly device: GPUDeviceLike) {}

  static async create(): Promise<{ analytics: GpuAnalytics | null; status: GpuStatus }> {
    const gpu = (navigator as Navigator & { gpu?: GPUApiLike }).gpu
    if (!gpu) return { analytics: null, status: 'unavailable' }
    try {
      const adapter = await gpu.requestAdapter()
      if (!adapter) return { analytics: null, status: 'fallback' }
      const device = await adapter.requestDevice()
      return { analytics: new GpuAnalytics(device), status: 'accelerated' }
    } catch {
      return { analytics: null, status: 'fallback' }
    }
  }

  async histogram(values: number[]): Promise<HistogramResult | null> {
    if (!values.length) return null
    const min = Math.min(...values)
    const max = Math.max(...values)
    try {
      const valueBuffer = this.device.createBuffer({ size: values.length * 4, usage: GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_DST })
      const binsBuffer = this.device.createBuffer({ size: 64 * 4, usage: GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_SRC | GPU_BUFFER_USAGE.COPY_DST })
      const resultBuffer = this.device.createBuffer({ size: 64 * 4, usage: GPU_BUFFER_USAGE.MAP_READ | GPU_BUFFER_USAGE.COPY_DST })
      const paramsBuffer = this.device.createBuffer({ size: 16, usage: GPU_BUFFER_USAGE.UNIFORM | GPU_BUFFER_USAGE.COPY_DST })
      this.device.queue.writeBuffer(valueBuffer, 0, new Float32Array(values))
      this.device.queue.writeBuffer(binsBuffer, 0, new Uint32Array(64))
      this.device.queue.writeBuffer(paramsBuffer, 0, makeParams(min, max, values.length, 1))

      const layout = this.device.createBindGroupLayout({ entries: [
        { binding: 0, visibility: GPU_COMPUTE_STAGE, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: GPU_COMPUTE_STAGE, buffer: { type: 'storage' } },
        { binding: 2, visibility: GPU_COMPUTE_STAGE, buffer: { type: 'uniform' } },
      ] })
      const pipeline = this.device.createComputePipeline({
        layout: this.device.createPipelineLayout({ bindGroupLayouts: [layout] }),
        compute: { module: this.device.createShaderModule({ code: HISTOGRAM_SHADER }), entryPoint: 'main' },
      })
      const group = this.device.createBindGroup({ layout, entries: [
        { binding: 0, resource: { buffer: valueBuffer } },
        { binding: 1, resource: { buffer: binsBuffer } },
        { binding: 2, resource: { buffer: paramsBuffer } },
      ] })
      const encoder = this.device.createCommandEncoder()
      const pass = encoder.beginComputePass()
      pass.setPipeline(pipeline)
      pass.setBindGroup(0, group)
      pass.dispatchWorkgroups(Math.ceil(values.length / 64))
      pass.end()
      encoder.copyBufferToBuffer(binsBuffer, 0, resultBuffer, 0, 64 * 4)
      this.device.queue.submit([encoder.finish()])
      await resultBuffer.mapAsync(GPU_MAP_READ)
      const bins = [...new Uint32Array(resultBuffer.getMappedRange())].map(Number)
      resultBuffer.unmap()
      valueBuffer.destroy?.()
      binsBuffer.destroy?.()
      resultBuffer.destroy?.()
      paramsBuffer.destroy?.()
      return { bins, min, max }
    } catch {
      return null
    }
  }

  async sample(values: number[], maxPoints = 600): Promise<number[]> {
    if (values.length <= maxPoints) return values
    const stride = Math.ceil(values.length / maxPoints)
    try {
      const outputLength = Math.ceil(values.length / stride)
      const valueBuffer = this.device.createBuffer({ size: values.length * 4, usage: GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_DST })
      const outputBuffer = this.device.createBuffer({ size: outputLength * 4, usage: GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_SRC })
      const resultBuffer = this.device.createBuffer({ size: outputLength * 4, usage: GPU_BUFFER_USAGE.MAP_READ | GPU_BUFFER_USAGE.COPY_DST })
      const paramsBuffer = this.device.createBuffer({ size: 16, usage: GPU_BUFFER_USAGE.UNIFORM | GPU_BUFFER_USAGE.COPY_DST })
      this.device.queue.writeBuffer(valueBuffer, 0, new Float32Array(values))
      this.device.queue.writeBuffer(paramsBuffer, 0, makeParams(0, 0, values.length, stride))
      const layout = this.device.createBindGroupLayout({ entries: [
        { binding: 0, visibility: GPU_COMPUTE_STAGE, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: GPU_COMPUTE_STAGE, buffer: { type: 'storage' } },
        { binding: 2, visibility: GPU_COMPUTE_STAGE, buffer: { type: 'uniform' } },
      ] })
      const pipeline = this.device.createComputePipeline({
        layout: this.device.createPipelineLayout({ bindGroupLayouts: [layout] }),
        compute: { module: this.device.createShaderModule({ code: SAMPLE_SHADER }), entryPoint: 'main' },
      })
      const group = this.device.createBindGroup({ layout, entries: [
        { binding: 0, resource: { buffer: valueBuffer } },
        { binding: 1, resource: { buffer: outputBuffer } },
        { binding: 2, resource: { buffer: paramsBuffer } },
      ] })
      const encoder = this.device.createCommandEncoder()
      const pass = encoder.beginComputePass()
      pass.setPipeline(pipeline)
      pass.setBindGroup(0, group)
      pass.dispatchWorkgroups(Math.ceil(values.length / 64))
      pass.end()
      encoder.copyBufferToBuffer(outputBuffer, 0, resultBuffer, 0, outputLength * 4)
      this.device.queue.submit([encoder.finish()])
      await resultBuffer.mapAsync(GPU_MAP_READ)
      const sample = [...new Float32Array(resultBuffer.getMappedRange())]
      resultBuffer.unmap()
      valueBuffer.destroy?.()
      outputBuffer.destroy?.()
      resultBuffer.destroy?.()
      paramsBuffer.destroy?.()
      return sample
    } catch {
      return values.filter((_, index) => index % stride === 0).slice(0, maxPoints)
    }
  }

  async prepare(dataset: Dataset): Promise<Record<string, HistogramResult>> {
    const result: Record<string, HistogramResult> = {}
    for (const column of dataset.columns.filter((item) => item.kind === 'number').slice(0, 4)) {
      const histogram = await this.histogram(numericValues(dataset, column.name))
      if (histogram) result[column.name] = histogram
    }
    return result
  }
}

export function cpuHistogram(values: number[], binCount = 64): HistogramResult | null {
  if (!values.length) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const bins = Array.from({ length: binCount }, () => 0)
  const span = Math.max(max - min, 0.000001)
  for (const value of values) bins[Math.min(binCount - 1, Math.floor(((value - min) / span) * binCount))] += 1
  return { bins, min, max }
}

export function cpuSample<T>(values: T[], maxPoints = 600): T[] {
  if (values.length <= maxPoints) return values
  const stride = Math.ceil(values.length / maxPoints)
  return values.filter((_, index) => index % stride === 0).slice(0, maxPoints)
}
