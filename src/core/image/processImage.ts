import type { ImageElement, PixelBuffer, ScaleMode } from '../types'
import { createBuffer, scaleBufferNearest } from '../pixels'
import { quantizeBuffer } from './quantize'

export interface ImageProcessOptions {
  w: number
  h: number
  alphaThreshold: number
  scaleMode: ScaleMode
  quantize: number | null
}

/**
 * Promedio por caja, operando en **alpha premultiplicado**.
 *
 * Sin premultiplicar, el RGB de los píxeles transparentes (que suele ser negro o
 * basura) se filtraría al promedio y dejaría un halo oscuro alrededor de la
 * silueta al reducir un sprite.
 */
export function scaleBufferBox(src: PixelBuffer, w: number, h: number): PixelBuffer {
  const out = createBuffer(w, h)
  if (src.w === 0 || src.h === 0 || out.w === 0 || out.h === 0) return out

  for (let y = 0; y < out.h; y++) {
    const sy0 = Math.floor((y * src.h) / out.h)
    const sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * src.h) / out.h))
    for (let x = 0; x < out.w; x++) {
      const sx0 = Math.floor((x * src.w) / out.w)
      const sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * src.w) / out.w))

      let r = 0
      let g = 0
      let b = 0
      let a = 0
      let n = 0
      for (let sy = sy0; sy < sy1 && sy < src.h; sy++) {
        for (let sx = sx0; sx < sx1 && sx < src.w; sx++) {
          const si = (sy * src.w + sx) * 4
          const sa = src.data[si + 3] / 255
          r += src.data[si] * sa
          g += src.data[si + 1] * sa
          b += src.data[si + 2] * sa
          a += src.data[si + 3]
          n++
        }
      }
      if (n === 0) continue
      const di = (y * out.w + x) * 4
      const avgA = a / n
      if (avgA <= 0) continue
      const unmul = 255 / avgA
      out.data[di] = (r / n) * unmul
      out.data[di + 1] = (g / n) * unmul
      out.data[di + 2] = (b / n) * unmul
      out.data[di + 3] = avgA
    }
  }
  return out
}

/**
 * Elimina la transparencia según la regla del proyecto:
 *
 *   alpha <= umbral  → el píxel no se pinta (se descarta el color)
 *   alpha  > umbral  → se conserva el RGB y el alpha se fuerza a 255
 *
 * Con el umbral por defecto (0) sólo desaparecen los píxeles totalmente
 * transparentes, y todo lo demás queda 100% opaco: no sobrevive ni un píxel
 * semitransparente, que es justamente lo que arruina el aspecto de pixel art.
 */
export function flattenAlpha(buf: PixelBuffer, threshold: number): void {
  const t = Math.max(0, Math.min(255, threshold))
  for (let i = 0; i < buf.data.length; i += 4) {
    if (buf.data[i + 3] <= t) {
      buf.data[i] = 0
      buf.data[i + 1] = 0
      buf.data[i + 2] = 0
      buf.data[i + 3] = 0
    } else {
      buf.data[i + 3] = 255
    }
  }
}

/** Elige el modo de escalado por defecto según cuánto se reduce la imagen. */
export function suggestScaleMode(srcW: number, srcH: number, dstW: number, dstH: number): ScaleMode {
  const factor = Math.max(srcW / Math.max(1, dstW), srcH / Math.max(1, dstH))
  // Reducir mucho con nearest tira información y produce aliasing duro; a partir
  // de 4× conviene promediar. Por debajo, nearest conserva el pixel art original.
  return factor >= 4 ? 'box' : 'nearest'
}

export function processImage(src: PixelBuffer, opts: ImageProcessOptions): PixelBuffer {
  const w = Math.max(1, Math.round(opts.w))
  const h = Math.max(1, Math.round(opts.h))
  let out: PixelBuffer
  if (src.w === w && src.h === h) {
    out = { w, h, data: new Uint8ClampedArray(src.data) }
  } else if (opts.scaleMode === 'box') {
    out = scaleBufferBox(src, w, h)
  } else {
    out = scaleBufferNearest(src, w, h)
  }

  flattenAlpha(out, opts.alphaThreshold)
  if (opts.quantize && opts.quantize > 0) quantizeBuffer(out, opts.quantize)
  return out
}

export function processImageElement(el: ImageElement, src: PixelBuffer): PixelBuffer {
  return processImage(src, {
    w: el.w,
    h: el.h,
    alphaThreshold: el.alphaThreshold,
    scaleMode: el.scaleMode,
    quantize: el.quantize,
  })
}
