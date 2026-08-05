import type { BrushShape, PixelBuffer, RGBA } from '../types'
import { stampAt } from './brush'

/**
 * Bresenham entero. Es la base de todo trazo: garantiza una cadena de píxeles
 * 8-conexa sin huecos, así un arrastre rápido del puntero (que sólo produce
 * muestras salteadas) igual sale como una línea continua.
 */
export function bresenham(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  plot: (x: number, y: number) => void,
): void {
  let x = Math.round(x0)
  let y = Math.round(y0)
  const ex = Math.round(x1)
  const ey = Math.round(y1)
  const dx = Math.abs(ex - x)
  const dy = -Math.abs(ey - y)
  const sx = x < ex ? 1 : -1
  const sy = y < ey ? 1 : -1
  let err = dx + dy

  for (;;) {
    plot(x, y)
    if (x === ex && y === ey) return
    const e2 = 2 * err
    if (e2 >= dy) {
      err += dy
      x += sx
    }
    if (e2 <= dx) {
      err += dx
      y += sy
    }
  }
}

export function strokeLine(
  buf: PixelBuffer,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: RGBA,
  width: number,
  shape: BrushShape = 'square',
  erase = false,
): void {
  bresenham(x0, y0, x1, y1, (x, y) => stampAt(buf, x, y, width, shape, color, erase))
}

/**
 * Punta de flecha en (x1, y1): dos segmentos rectos a ±28° de la dirección del
 * trazo. Se rasterizan con el mismo Bresenham para que no desentonen.
 */
export function strokeArrowHead(
  buf: PixelBuffer,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: RGBA,
  width: number,
  shape: BrushShape = 'square',
): void {
  const dx = x1 - x0
  const dy = y1 - y0
  const len = Math.hypot(dx, dy)
  if (len < 1) return
  const angle = Math.atan2(dy, dx)
  const head = Math.max(4, Math.min(len * 0.35, width * 3 + 3))
  const spread = 0.48 // ~28°
  for (const s of [-1, 1]) {
    const a = angle + Math.PI + s * spread
    strokeLine(
      buf,
      x1,
      y1,
      Math.round(x1 + Math.cos(a) * head),
      Math.round(y1 + Math.sin(a) * head),
      color,
      width,
      shape,
    )
  }
}
