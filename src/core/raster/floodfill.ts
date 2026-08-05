import type { Mask, PixelBuffer, RGBA } from '../types'
import { createMask } from './mask'

function pixelAt(b: PixelBuffer, x: number, y: number, out: RGBA): void {
  const i = (y * b.w + x) * 4
  out[0] = b.data[i]
  out[1] = b.data[i + 1]
  out[2] = b.data[i + 2]
  out[3] = b.data[i + 3]
}

function matches(a: RGBA, b: RGBA, tolSq: number): boolean {
  // Transparente contra opaco nunca coincide, aunque el RGB sea parecido: si no,
  // el balde se escaparía por el fondo vacío del lienzo.
  if ((a[3] === 0) !== (b[3] === 0)) return false
  if (a[3] === 0 && b[3] === 0) return true
  const dr = a[0] - b[0]
  const dg = a[1] - b[1]
  const db = a[2] - b[2]
  const da = a[3] - b[3]
  return dr * dr + dg * dg + db * db + da * da <= tolSq
}

/**
 * Relleno por scanline, 4-conexo, iterativo.
 *
 * Devuelve la región alcanzada como máscara en vez de pintar directamente: así
 * el balde puede generar un elemento nuevo (modelo de objetos) en lugar de
 * modificar píxeles ajenos.
 *
 * `tolerance` va de 0 a 255 y se compara en distancia euclídea RGBA.
 */
export function floodFillMask(
  buf: PixelBuffer,
  startX: number,
  startY: number,
  tolerance = 0,
): Mask {
  const mask = createMask(buf.w, buf.h)
  const sx = Math.floor(startX)
  const sy = Math.floor(startY)
  if (sx < 0 || sy < 0 || sx >= buf.w || sy >= buf.h) return mask

  const target: RGBA = [0, 0, 0, 0]
  pixelAt(buf, sx, sy, target)
  const tolSq = tolerance * tolerance
  const probe: RGBA = [0, 0, 0, 0]

  const stack: number[] = [sx, sy]
  while (stack.length) {
    const y = stack.pop()!
    let x = stack.pop()!
    if (mask.data[y * buf.w + x]) continue

    // Retrocede al inicio del tramo contiguo.
    while (x >= 0) {
      pixelAt(buf, x, y, probe)
      if (!matches(probe, target, tolSq) || mask.data[y * buf.w + x]) break
      x--
    }
    x++

    let spanUp = false
    let spanDown = false
    for (; x < buf.w; x++) {
      const i = y * buf.w + x
      if (mask.data[i]) break
      pixelAt(buf, x, y, probe)
      if (!matches(probe, target, tolSq)) break
      mask.data[i] = 1

      if (y > 0) {
        pixelAt(buf, x, y - 1, probe)
        const ok = matches(probe, target, tolSq) && !mask.data[i - buf.w]
        if (ok && !spanUp) {
          stack.push(x, y - 1)
          spanUp = true
        } else if (!ok) {
          spanUp = false
        }
      }
      if (y < buf.h - 1) {
        pixelAt(buf, x, y + 1, probe)
        const ok = matches(probe, target, tolSq) && !mask.data[i + buf.w]
        if (ok && !spanDown) {
          stack.push(x, y + 1)
          spanDown = true
        } else if (!ok) {
          spanDown = false
        }
      }
    }
  }
  return mask
}
