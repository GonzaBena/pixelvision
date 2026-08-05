import type { PixelBuffer, RGBA } from '../types'
import { colorDistanceSq } from '../pixels'

interface Box {
  colors: RGBA[]
  min: [number, number, number]
  max: [number, number, number]
}

function boxBounds(colors: RGBA[]): Pick<Box, 'min' | 'max'> {
  const min: [number, number, number] = [255, 255, 255]
  const max: [number, number, number] = [0, 0, 0]
  for (const c of colors) {
    for (let k = 0; k < 3; k++) {
      if (c[k] < min[k]) min[k] = c[k]
      if (c[k] > max[k]) max[k] = c[k]
    }
  }
  return { min, max }
}

function makeBox(colors: RGBA[]): Box {
  return { colors, ...boxBounds(colors) }
}

function longestAxis(b: Box): number {
  const r = b.max[0] - b.min[0]
  const g = b.max[1] - b.min[1]
  const bl = b.max[2] - b.min[2]
  if (r >= g && r >= bl) return 0
  return g >= bl ? 1 : 2
}

/**
 * Median cut: parte repetidamente la caja de color más ancha por su eje más
 * largo, hasta llegar a `count` cajas. El promedio de cada caja es una entrada
 * de la paleta resultante.
 */
export function medianCutPalette(pixels: RGBA[], count: number): RGBA[] {
  if (pixels.length === 0) return []
  const target = Math.max(1, Math.min(256, Math.floor(count)))
  let boxes: Box[] = [makeBox(pixels)]

  while (boxes.length < target) {
    let bestIdx = -1
    let bestRange = 0
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i]
      if (b.colors.length < 2) continue
      const axis = longestAxis(b)
      const range = b.max[axis] - b.min[axis]
      if (range > bestRange) {
        bestRange = range
        bestIdx = i
      }
    }
    if (bestIdx < 0) break

    const box = boxes[bestIdx]
    const axis = longestAxis(box)
    const sorted = box.colors.slice().sort((a, b) => a[axis] - b[axis])
    const mid = sorted.length >> 1
    const left = sorted.slice(0, mid)
    const right = sorted.slice(mid)
    if (left.length === 0 || right.length === 0) break
    boxes = [...boxes.slice(0, bestIdx), makeBox(left), makeBox(right), ...boxes.slice(bestIdx + 1)]
  }

  return boxes.map((b) => {
    let r = 0
    let g = 0
    let bl = 0
    for (const c of b.colors) {
      r += c[0]
      g += c[1]
      bl += c[2]
    }
    const n = b.colors.length || 1
    return [Math.round(r / n), Math.round(g / n), Math.round(bl / n), 255] as RGBA
  })
}

export function nearestColor(c: RGBA, palette: RGBA[]): RGBA {
  let best = palette[0]
  let bestD = Infinity
  for (const p of palette) {
    const d = colorDistanceSq(c, p)
    if (d < bestD) {
      bestD = d
      best = p
    }
  }
  return best
}

/** Reasigna cada píxel opaco al color más cercano de la paleta. */
export function applyPalette(buf: PixelBuffer, palette: RGBA[]): void {
  if (palette.length === 0) return
  const cache = new Map<number, RGBA>()
  for (let i = 0; i < buf.data.length; i += 4) {
    if (buf.data[i + 3] === 0) continue
    const key = (buf.data[i] << 16) | (buf.data[i + 1] << 8) | buf.data[i + 2]
    let mapped = cache.get(key)
    if (!mapped) {
      mapped = nearestColor([buf.data[i], buf.data[i + 1], buf.data[i + 2], 255], palette)
      cache.set(key, mapped)
    }
    buf.data[i] = mapped[0]
    buf.data[i + 1] = mapped[1]
    buf.data[i + 2] = mapped[2]
  }
}

/** Reduce el búfer a `count` colores con median cut, in place. */
export function quantizeBuffer(buf: PixelBuffer, count: number): void {
  const pixels: RGBA[] = []
  for (let i = 0; i < buf.data.length; i += 4) {
    if (buf.data[i + 3] === 0) continue
    pixels.push([buf.data[i], buf.data[i + 1], buf.data[i + 2], 255])
  }
  if (pixels.length === 0) return
  const palette = medianCutPalette(pixels, count)
  applyPalette(buf, palette)
}
