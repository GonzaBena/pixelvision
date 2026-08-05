import type { BrushShape, Mask, PixelBuffer, RGBA } from '../types'
import { blendPixel, clearPixel } from '../pixels'
import { createMask, ellipseMask } from './mask'

const stampCache = new Map<string, Mask>()

/**
 * Sello del pincel de tamaño `size`.
 *
 * El sello se ancla de modo que el píxel bajo el cursor siempre quede cubierto:
 * ocupa de `-floor((size-1)/2)` a `+floor(size/2)`. Con size 1 es exactamente un
 * píxel, que es lo que hace falta para dibujar pixel art a mano.
 */
export function brushStamp(size: number, shape: BrushShape): Mask {
  const n = Math.max(1, Math.floor(size))
  const key = `${shape}:${n}`
  const hit = stampCache.get(key)
  if (hit) return hit
  let m: Mask
  if (shape === 'square' || n <= 2) {
    m = createMask(n, n)
    m.data.fill(1)
  } else {
    m = ellipseMask(n, n)
  }
  stampCache.set(key, m)
  return m
}

export function stampOffset(size: number): number {
  return Math.floor((Math.max(1, Math.floor(size)) - 1) / 2)
}

export function stampAt(
  buf: PixelBuffer,
  cx: number,
  cy: number,
  size: number,
  shape: BrushShape,
  color: RGBA,
  erase = false,
): void {
  const m = brushStamp(size, shape)
  const off = stampOffset(size)
  const ox = cx - off
  const oy = cy - off
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      if (!m.data[y * m.w + x]) continue
      if (erase) clearPixel(buf, ox + x, oy + y)
      else blendPixel(buf, ox + x, oy + y, color)
    }
  }
}
