import { parseStructuredText } from './parser'

self.onmessage = (event: MessageEvent<{ text: string; fileName: string; byteSize: number }>) => {
  try {
    const dataset = parseStructuredText(event.data.text, event.data.fileName, /\.json$/i.test(event.data.fileName) ? 'json' : 'csv', event.data.byteSize)
    self.postMessage({ ok: true, dataset })
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : 'Could not parse this dataset.' })
  }
}

