import type { PixelBuffer, RGBA, Rect, Rotation } from './types'

export function createBuffer(w: number, h: number): PixelBuffer {
  const cw = Math.max(0, Math.floor(w))
  const ch = Math.max(0, Math.floor(h))
  return { w: cw, h: ch, data: new Uint8ClampedArray(cw * ch * 4) }
}

export function cloneBuffer(b: PixelBuffer): PixelBuffer {
  return { w: b.w, h: b.h, data: new Uint8ClampedArray(b.data) }
}

export function setPixel(b: PixelBuffer, x: number, y: number, c: RGBA): void {
  if (x < 0 || y < 0 || x >= b.w || y >= b.h) return
  const i = (y * b.w + x) * 4
  b.data[i] = c[0]
  b.data[i + 1] = c[1]
  b.data[i + 2] = c[2]
  b.data[i + 3] = c[3]
}

export function getPixel(b: PixelBuffer, x: number, y: number): RGBA {
  if (x < 0 || y < 0 || x >= b.w || y >= b.h) return [0, 0, 0, 0]
  const i = (y * b.w + x) * 4
  return [b.data[i], b.data[i + 1], b.data[i + 2], b.data[i + 3]]
}

/** Compone un píxel sobre el búfer con source-over. */
export function blendPixel(b: PixelBuffer, x: number, y: number, c: RGBA): void {
  if (x < 0 || y < 0 || x >= b.w || y >= b.h) return
  const sa = c[3]
  if (sa === 0) return
  const i = (y * b.w + x) * 4
  if (sa === 255) {
    b.data[i] = c[0]
    b.data[i + 1] = c[1]
    b.data[i + 2] = c[2]
    b.data[i + 3] = 255
    return
  }
  const da = b.data[i + 3]
  const outA = sa + ((da * (255 - sa)) / 255)
  if (outA <= 0) {
    b.data[i] = b.data[i + 1] = b.data[i + 2] = b.data[i + 3] = 0
    return
  }
  const dw = (da * (255 - sa)) / 255
  b.data[i] = (c[0] * sa + b.data[i] * dw) / outA
  b.data[i + 1] = (c[1] * sa + b.data[i + 1] * dw) / outA
  b.data[i + 2] = (c[2] * sa + b.data[i + 2] * dw) / outA
  b.data[i + 3] = outA
}

/** Deja el píxel totalmente transparente. */
export function clearPixel(b: PixelBuffer, x: number, y: number): void {
  if (x < 0 || y < 0 || x >= b.w || y >= b.h) return
  const i = (y * b.w + x) * 4
  b.data[i] = b.data[i + 1] = b.data[i + 2] = b.data[i + 3] = 0
}

/**
 * Compone `src` sobre `dst` en (ox, oy) con source-over.
 * `opacity` (0..1) escala el alpha de la fuente.
 */
export function blitOver(
  dst: PixelBuffer,
  src: PixelBuffer,
  ox: number,
  oy: number,
  opacity = 1,
): void {
  if (opacity <= 0) return
  const x0 = Math.max(0, -ox)
  const y0 = Math.max(0, -oy)
  const x1 = Math.min(src.w, dst.w - ox)
  const y1 = Math.min(src.h, dst.h - oy)
  const opaque = opacity >= 1

  for (let y = y0; y < y1; y++) {
    let si = (y * src.w + x0) * 4
    let di = ((y + oy) * dst.w + (x0 + ox)) * 4
    for (let x = x0; x < x1; x++, si += 4, di += 4) {
      let sa = src.data[si + 3]
      if (sa === 0) continue
      if (!opaque) sa = sa * opacity
      if (sa >= 255) {
        dst.data[di] = src.data[si]
        dst.data[di + 1] = src.data[si + 1]
        dst.data[di + 2] = src.data[si + 2]
        dst.data[di + 3] = 255
        continue
      }
      const da = dst.data[di + 3]
      const dw = (da * (255 - sa)) / 255
      const outA = sa + dw
      if (outA <= 0) {
        dst.data[di] = dst.data[di + 1] = dst.data[di + 2] = dst.data[di + 3] = 0
        continue
      }
      dst.data[di] = (src.data[si] * sa + dst.data[di] * dw) / outA
      dst.data[di + 1] = (src.data[si + 1] * sa + dst.data[di + 1] * dw) / outA
      dst.data[di + 2] = (src.data[si + 2] * sa + dst.data[di + 2] * dw) / outA
      dst.data[di + 3] = outA
    }
  }
}

/** Caja mínima que contiene todos los píxeles no transparentes, o null si está vacío. */
export function bufferBounds(b: PixelBuffer): Rect | null {
  let minX = b.w
  let minY = b.h
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < b.h; y++) {
    let i = (y * b.w) * 4 + 3
    for (let x = 0; x < b.w; x++, i += 4) {
      if (b.data[i] === 0) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) return null
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

/** Recorta el búfer a la caja dada (coordenadas relativas al propio búfer). */
export function cropBuffer(b: PixelBuffer, r: Rect): PixelBuffer {
  const out = createBuffer(r.w, r.h)
  for (let y = 0; y < r.h; y++) {
    const sy = y + r.y
    if (sy < 0 || sy >= b.h) continue
    for (let x = 0; x < r.w; x++) {
      const sx = x + r.x
      if (sx < 0 || sx >= b.w) continue
      const si = (sy * b.w + sx) * 4
      const di = (y * r.w + x) * 4
      out.data[di] = b.data[si]
      out.data[di + 1] = b.data[si + 1]
      out.data[di + 2] = b.data[si + 2]
      out.data[di + 3] = b.data[si + 3]
    }
  }
  return out
}

/** Crece el búfer para que la caja `r` (relativa al búfer actual) entre entera. */
export function expandBuffer(b: PixelBuffer, r: Rect): { buf: PixelBuffer; dx: number; dy: number } {
  const minX = Math.min(0, r.x)
  const minY = Math.min(0, r.y)
  const maxX = Math.max(b.w, r.x + r.w)
  const maxY = Math.max(b.h, r.y + r.h)
  const nw = maxX - minX
  const nh = maxY - minY
  if (nw === b.w && nh === b.h && minX === 0 && minY === 0) return { buf: b, dx: 0, dy: 0 }
  const out = createBuffer(nw, nh)
  const dx = -minX
  const dy = -minY
  for (let y = 0; y < b.h; y++) {
    const si = (y * b.w) * 4
    const di = ((y + dy) * nw + dx) * 4
    out.data.set(b.data.subarray(si, si + b.w * 4), di)
  }
  return { buf: out, dx, dy }
}

/** Escalado nearest-neighbour: la única interpolación válida para pixel art. */
export function scaleBufferNearest(b: PixelBuffer, w: number, h: number): PixelBuffer {
  const out = createBuffer(w, h)
  if (b.w === 0 || b.h === 0 || out.w === 0 || out.h === 0) return out
  for (let y = 0; y < out.h; y++) {
    const sy = Math.min(b.h - 1, Math.floor((y * b.h) / out.h))
    for (let x = 0; x < out.w; x++) {
      const sx = Math.min(b.w - 1, Math.floor((x * b.w) / out.w))
      const si = (sy * b.w + sx) * 4
      const di = (y * out.w + x) * 4
      out.data[di] = b.data[si]
      out.data[di + 1] = b.data[si + 1]
      out.data[di + 2] = b.data[si + 2]
      out.data[di + 3] = b.data[si + 3]
    }
  }
  return out
}

export function flipBuffer(b: PixelBuffer, flipX: boolean, flipY: boolean): PixelBuffer {
  if (!flipX && !flipY) return b
  const out = createBuffer(b.w, b.h)
  for (let y = 0; y < b.h; y++) {
    const sy = flipY ? b.h - 1 - y : y
    for (let x = 0; x < b.w; x++) {
      const sx = flipX ? b.w - 1 - x : x
      const si = (sy * b.w + sx) * 4
      const di = (y * b.w + x) * 4
      out.data[di] = b.data[si]
      out.data[di + 1] = b.data[si + 1]
      out.data[di + 2] = b.data[si + 2]
      out.data[di + 3] = b.data[si + 3]
    }
  }
  return out
}

/** Rota en cuartos de vuelta horarios. Con rot 1 o 3, w y h se intercambian. */
export function rotateBuffer(b: PixelBuffer, rot: Rotation): PixelBuffer {
  if (!rot) return b
  const swap = rot === 1 || rot === 3
  const ow = swap ? b.h : b.w
  const oh = swap ? b.w : b.h
  const out = createBuffer(ow, oh)
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      let dx: number
      let dy: number
      if (rot === 1) {
        dx = b.h - 1 - y
        dy = x
      } else if (rot === 2) {
        dx = b.w - 1 - x
        dy = b.h - 1 - y
      } else {
        dx = y
        dy = b.w - 1 - x
      }
      const si = (y * b.w + x) * 4
      const di = (dy * ow + dx) * 4
      out.data[di] = b.data[si]
      out.data[di + 1] = b.data[si + 1]
      out.data[di + 2] = b.data[si + 2]
      out.data[di + 3] = b.data[si + 3]
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Colores
// ---------------------------------------------------------------------------

const HEX3 = /^#?([0-9a-f])([0-9a-f])([0-9a-f])([0-9a-f])?$/i
const HEX6 = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i

/** Acepta #rgb, #rgba, #rrggbb, #rrggbbaa y 'transparent'. */
export function parseColor(css: string | null | undefined): RGBA {
  if (!css) return [0, 0, 0, 0]
  const s = css.trim()
  if (s === 'transparent' || s === 'none') return [0, 0, 0, 0]
  let m = HEX6.exec(s)
  if (m) {
    return [
      parseInt(m[1], 16),
      parseInt(m[2], 16),
      parseInt(m[3], 16),
      m[4] === undefined ? 255 : parseInt(m[4], 16),
    ]
  }
  m = HEX3.exec(s)
  if (m) {
    const d = (v: string) => parseInt(v + v, 16)
    return [d(m[1]), d(m[2]), d(m[3]), m[4] === undefined ? 255 : d(m[4])]
  }
  return [0, 0, 0, 255]
}

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')

export function rgbaToHex(c: RGBA, includeAlpha = false): string {
  const base = `#${hex2(c[0])}${hex2(c[1])}${hex2(c[2])}`
  return includeAlpha && c[3] < 255 ? `${base}${hex2(c[3])}` : base
}

export function colorsEqual(a: RGBA, b: RGBA): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3]
}

/** Distancia euclídea al cuadrado en RGB; suficiente para elegir el color de paleta más cercano. */
export function colorDistanceSq(a: RGBA, b: RGBA): number {
  const dr = a[0] - b[0]
  const dg = a[1] - b[1]
  const db = a[2] - b[2]
  return dr * dr + dg * dg + db * db
}

export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / d + 2
        break
      case b:
        h = (r - g) / d + 4
        break
    }
    h /= 6
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  }
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100
  l /= 100
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0
  if (h >= 0 && h < 60) {
    r = c; g = x; b = 0
  } else if (h >= 60 && h < 120) {
    r = x; g = c; b = 0
  } else if (h >= 120 && h < 180) {
    r = 0; g = c; b = x
  } else if (h >= 180 && h < 240) {
    r = 0; g = x; b = c
  } else if (h >= 240 && h < 300) {
    r = x; g = 0; b = c
  } else {
    r = c; g = 0; b = x
  }
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ]
}

export function hslToHex(h: number, s: number, l: number): string {
  const [r, g, b] = hslToRgb(h, s, l)
  const hex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
}

export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const [r, g, b] = parseColor(hex)
  return rgbToHsl(r, g, b)
}

