import type { Mask, PixelBuffer, RGBA } from '../types'
import { blendPixel } from '../pixels'

export function createMask(w: number, h: number): Mask {
  const cw = Math.max(0, Math.floor(w))
  const ch = Math.max(0, Math.floor(h))
  return { w: cw, h: ch, data: new Uint8Array(cw * ch) }
}

export function maskGet(m: Mask, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= m.w || y >= m.h) return 0
  return m.data[y * m.w + x]
}

/**
 * Erosiona con vecindad 4-conexa: cae todo píxel interior que toque el exterior.
 * Aplicada N veces y restada del original, da un contorno de N píxeles de grosor
 * uniforme para *cualquier* figura — mucho más parejo que estampar un pincel a lo
 * largo del borde, que deja bultos en las diagonales.
 */
export function erodeMask(m: Mask, iterations: number): Mask {
  if (iterations <= 0) return m
  let src = m
  for (let it = 0; it < iterations; it++) {
    const out = createMask(src.w, src.h)
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const i = y * src.w + x
        if (!src.data[i]) continue
        // Fuera del búfer cuenta como exterior: así el borde del rectángulo se erosiona.
        if (
          x === 0 ||
          y === 0 ||
          x === src.w - 1 ||
          y === src.h - 1 ||
          !src.data[i - 1] ||
          !src.data[i + 1] ||
          !src.data[i - src.w] ||
          !src.data[i + src.w]
        ) {
          continue
        }
        out.data[i] = 1
      }
    }
    src = out
  }
  return src
}

/** a AND NOT b. Ambas máscaras deben tener las mismas dimensiones. */
export function subtractMask(a: Mask, b: Mask): Mask {
  const out = createMask(a.w, a.h)
  for (let i = 0; i < a.data.length; i++) {
    out.data[i] = a.data[i] && !b.data[i] ? 1 : 0
  }
  return out
}

export function maskIsEmpty(m: Mask): boolean {
  for (let i = 0; i < m.data.length; i++) if (m.data[i]) return false
  return true
}

/** Pinta el color donde la máscara vale 1, componiendo sobre lo que ya haya. */
export function paintMask(
  buf: PixelBuffer,
  m: Mask,
  ox: number,
  oy: number,
  color: RGBA,
): void {
  if (color[3] === 0) return
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      if (m.data[y * m.w + x]) blendPixel(buf, x + ox, y + oy, color)
    }
  }
}

// ---------------------------------------------------------------------------
// Generadores de máscara
// ---------------------------------------------------------------------------

export function rectMask(w: number, h: number, radius = 0): Mask {
  const m = createMask(w, h)
  if (m.w === 0 || m.h === 0) return m
  const r = Math.max(0, Math.min(radius, Math.floor(Math.min(m.w, m.h) / 2)))
  if (r === 0) {
    m.data.fill(1)
    return m
  }
  // Las esquinas se recortan con el cuadrante de un círculo de radio r, para que
  // el redondeo sea el mismo escalonado que produce el trazador de elipses.
  const corner = ellipseMask(r * 2, r * 2)
  m.data.fill(1)
  for (let y = 0; y < r; y++) {
    for (let x = 0; x < r; x++) {
      const inside = corner.data[y * corner.w + x]
      if (inside) continue
      m.data[y * m.w + x] = 0
      m.data[y * m.w + (m.w - 1 - x)] = 0
      m.data[(m.h - 1 - y) * m.w + x] = 0
      m.data[(m.h - 1 - y) * m.w + (m.w - 1 - x)] = 0
    }
  }
  return m
}

/**
 * Elipse inscrita en una caja de w×h, rellena.
 *
 * Usa el trazador de elipse por caja de Zingl (variante del punto medio con dos
 * centros): a diferencia del Bresenham clásico, que asume un píxel central, éste
 * sale simétrico también con dimensiones pares — un círculo de 16×16 se ve igual
 * de los cuatro lados.
 */
export function ellipseMask(w: number, h: number): Mask {
  const m = createMask(w, h)
  if (m.w === 0 || m.h === 0) return m
  if (m.w <= 2 || m.h <= 2) {
    m.data.fill(1)
    return m
  }

  const rowMin = new Int32Array(m.h).fill(m.w)
  const rowMax = new Int32Array(m.h).fill(-1)
  traceEllipseRect(0, 0, m.w - 1, m.h - 1, (x, y) => {
    if (y < 0 || y >= m.h) return
    if (x < rowMin[y]) rowMin[y] = x
    if (x > rowMax[y]) rowMax[y] = x
  })

  for (let y = 0; y < m.h; y++) {
    if (rowMax[y] < 0) continue
    const s = Math.max(0, rowMin[y])
    const e = Math.min(m.w - 1, rowMax[y])
    for (let x = s; x <= e; x++) m.data[y * m.w + x] = 1
  }
  return m
}

/** Trazador de elipse por caja de Zingl ("A Rasterizing Algorithm for Drawing Curves"). */
function traceEllipseRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  plot: (x: number, y: number) => void,
): void {
  let a = Math.abs(x1 - x0)
  const b = Math.abs(y1 - y0)
  let b1 = b & 1
  let dx = 4 * (1 - a) * b * b
  let dy = 4 * (b1 + 1) * a * a
  let err = dx + dy + b1 * a * a

  if (x0 > x1) {
    x0 = x1
    x1 += a
  }
  if (y0 > y1) y0 = y1
  y0 += (b + 1) >> 1
  y1 = y0 - b1
  a *= 8 * a
  b1 = 8 * b * b

  do {
    plot(x1, y0)
    plot(x0, y0)
    plot(x0, y1)
    plot(x1, y1)
    const e2 = 2 * err
    if (e2 <= dy) {
      y0++
      y1--
      dy += a
      err += dy
    }
    if (e2 >= dx || 2 * err > dy) {
      x0++
      x1--
      dx += b1
      err += dx
    }
  } while (x0 <= x1)

  // Remata las puntas de las elipses muy achatadas, donde el bucle corta antes.
  while (y0 - y1 < b) {
    plot(x0 - 1, y0)
    plot(x1 + 1, y0)
    y0++
    plot(x0 - 1, y1)
    plot(x1 + 1, y1)
    y1--
  }
}

/**
 * Relleno por scanline con regla par-impar, muestreando el centro de cada píxel.
 * Los puntos vienen en coordenadas del propio bounding box (0..w, 0..h).
 */
export function polygonMask(w: number, h: number, pts: Array<[number, number]>): Mask {
  const m = createMask(w, h)
  if (m.w === 0 || m.h === 0 || pts.length < 3) return m
  const xs: number[] = []
  for (let y = 0; y < m.h; y++) {
    const cy = y + 0.5
    xs.length = 0
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i]
      const [bx, by] = pts[(i + 1) % pts.length]
      if ((ay <= cy && by > cy) || (by <= cy && ay > cy)) {
        xs.push(ax + ((cy - ay) / (by - ay)) * (bx - ax))
      }
    }
    if (xs.length < 2) continue
    xs.sort((p, q) => p - q)
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const s = Math.max(0, Math.ceil(xs[i] - 0.5))
      const e = Math.min(m.w - 1, Math.floor(xs[i + 1] - 0.5))
      for (let x = s; x <= e; x++) m.data[y * m.w + x] = 1
    }
  }
  return m
}

/** Vértices normalizados (0..1) de cada figura poligonal, en sentido horario. */
export function polyPoints(
  variant: 'triangle' | 'diamond' | 'star' | 'hexagon',
): Array<[number, number]> {
  switch (variant) {
    case 'triangle':
      return [
        [0.5, 0],
        [1, 1],
        [0, 1],
      ]
    case 'diamond':
      return [
        [0.5, 0],
        [1, 0.5],
        [0.5, 1],
        [0, 0.5],
      ]
    case 'hexagon': {
      const pts: Array<[number, number]> = []
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 2
        pts.push([0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)])
      }
      return pts
    }
    case 'star': {
      const pts: Array<[number, number]> = []
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 0.5 : 0.5 * 0.42
        const a = (Math.PI / 5) * i - Math.PI / 2
        pts.push([0.5 + r * Math.cos(a), 0.5 + r * Math.sin(a)])
      }
      return pts
    }
  }
}

export function polyMaskFor(
  variant: 'triangle' | 'diamond' | 'star' | 'hexagon',
  w: number,
  h: number,
): Mask {
  const norm = polyPoints(variant)
  const pts = norm.map(([nx, ny]) => [nx * w, ny * h] as [number, number])
  return polygonMask(w, h, pts)
}
