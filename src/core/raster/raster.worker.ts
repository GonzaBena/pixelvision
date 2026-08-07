import { floodFillMask } from './floodfill'
import { quantizeBuffer } from '../image/quantize'

self.onmessage = (e: MessageEvent) => {
  const { type } = e.data

  if (type === 'floodfill') {
    const { buf, startX, startY, tolerance } = e.data
    const mask = floodFillMask(buf, startX, startY, tolerance)

    let minX = mask.w
    let maxX = -1
    let minY = mask.h
    let maxY = -1

    const w = mask.w
    const h = mask.h
    const data = mask.data

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (data[y * w + x]) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }

    if (maxX === -1) {
      self.postMessage({ type: 'floodfill', empty: true })
      return
    }

    const croppedW = maxX - minX + 1
    const croppedH = maxY - minY + 1
    const croppedData = new Uint8Array(croppedW * croppedH)

    for (let y = 0; y < croppedH; y++) {
      const srcOffset = (minY + y) * w + minX
      const destOffset = y * croppedW
      croppedData.set(data.subarray(srcOffset, srcOffset + croppedW), destOffset)
    }

    self.postMessage(
      {
        type: 'floodfill',
        empty: false,
        dx: minX,
        dy: minY,
        w: croppedW,
        h: croppedH,
        data: croppedData,
      },
      [croppedData.buffer] as any
    )
  } else if (type === 'quantize') {
    const { buf, count } = e.data
    quantizeBuffer(buf, count)

    self.postMessage(
      {
        type: 'quantize',
        buf,
      },
      [buf.data.buffer] as any
    )
  }
}
