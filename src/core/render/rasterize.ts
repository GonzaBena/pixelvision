import type { Mask, PixelBuffer, PVElement, Rect, ImageElement } from '../types'
import {
  cloneBuffer,
  createBuffer,
  flipBuffer,
  parseColor,
  rotateBuffer,
} from '../pixels'
import { applyPalette } from '../image/quantize'
import { getPalette } from '../palettes'
import {
  ellipseMask,
  erodeMask,
  maskIsEmpty,
  paintMask,
  polyMaskFor,
  rectMask,
  subtractMask,
} from '../raster/mask'
import { strokeArrowHead, strokeLine } from '../raster/line'
import { stampOffset } from '../raster/brush'
import { renderText } from '../text/renderText'
import { processImageElement, processImage } from '../image/processImage'
import { getImageSource } from '../image/imageStore'
import { useEditor } from '../../state/store'

export interface RasterResult {
  buf: PixelBuffer
  /** Posición del búfer en el lienzo, ya con flip/rotación aplicados. */
  x: number
  y: number
}

const cache = new Map<string, { rev: number; result: RasterResult }>()
const quantizedCache = new Map<string, { key: string; buf: PixelBuffer }>()
const activeQuantizations = new Set<string>()

export function invalidateRaster(id?: string): void {
  if (id) cache.delete(id)
  else cache.clear()
}

/** Descarta entradas de caché de elementos que ya no existen. */
export function pruneRasterCache(liveIds: Iterable<string>): void {
  const keep = new Set(liveIds)
  for (const id of Array.from(cache.keys())) {
    if (!keep.has(id)) cache.delete(id)
  }
  for (const id of Array.from(quantizedCache.keys())) {
    if (!keep.has(id)) quantizedCache.delete(id)
  }
}

function triggerAsyncQuantize(el: ImageElement, src: PixelBuffer, cacheKey: string) {
  if (activeQuantizations.has(cacheKey)) return
  activeQuantizations.add(cacheKey)

  const st = useEditor.getState()
  st.setIsProcessing(true)

  const tempBuf = processImage(src, {
    w: el.w,
    h: el.h,
    alphaThreshold: el.alphaThreshold,
    scaleMode: el.scaleMode,
    quantize: null,
  })

  const worker = new Worker(
    new URL('../raster/raster.worker.ts', import.meta.url),
    { type: 'module' }
  )

  worker.onmessage = (e: MessageEvent) => {
    st.setIsProcessing(false)
    activeQuantizations.delete(cacheKey)

    const { buf } = e.data
    const revivedBuf = { w: buf.w, h: buf.h, data: buf.data }

    quantizedCache.set(el.id, { key: cacheKey, buf: revivedBuf })

    useEditor.getState().touch(el.id)
    worker.terminate()
  }

  worker.onerror = (err) => {
    console.error('Quantization worker error:', err)
    st.setIsProcessing(false)
    activeQuantizations.delete(cacheKey)
    worker.terminate()
  }

  worker.postMessage(
    {
      type: 'quantize',
      buf: tempBuf,
      count: el.quantize,
    },
    [tempBuf.data.buffer] as any
  )
}

export function rasterizeElement(el: PVElement): RasterResult {
  const hit = cache.get(el.id)
  if (hit && hit.rev === el.rev) return hit.result

  const base = rasterizeBase(el)
  const result = applyTransform(el, base)

  const activePalette = el.restrictPalette
  if (activePalette && el.type !== 'image') {
    const pal = getPalette(activePalette)
    if (pal && pal.colors.length > 0) {
      const palColors = pal.colors.map((c) => parseColor(c))
      result.buf = cloneBuffer(result.buf)
      applyPalette(result.buf, palColors)
    }
  }

  cache.set(el.id, { rev: el.rev, result })
  return result
}

/** Aplica espejado y rotación al búfer ya dibujado: vale igual para toda figura. */
function applyTransform(el: PVElement, base: RasterResult): RasterResult {
  let buf = base.buf
  const flipX = !!el.flipX
  const flipY = !!el.flipY
  const rot = el.rot ?? 0
  if (!flipX && !flipY && !rot) return base

  buf = flipBuffer(buf, flipX, flipY)
  if (rot) {
    const w = buf.w
    const h = buf.h
    buf = rotateBuffer(buf, rot)
    // Rotar alrededor del centro de la caja mantiene la figura donde el usuario
    // la ve, en vez de hacerla saltar cuando ancho y alto se intercambian.
    if (rot === 1 || rot === 3) {
      const cx = base.x + w / 2
      const cy = base.y + h / 2
      return { buf, x: Math.round(cx - buf.w / 2), y: Math.round(cy - buf.h / 2) }
    }
  }
  return { buf, x: base.x, y: base.y }
}

function rasterizeBase(el: PVElement): RasterResult {
  switch (el.type) {
    case 'freedraw':
      return { buf: el.buf, x: el.x, y: el.y }

    case 'rect':
      return shapeResult(el, rectMask(el.w, el.h, el.radius))

    case 'ellipse':
      return shapeResult(el, ellipseMask(el.w, el.h))

    case 'poly':
      return shapeResult(el, polyMaskFor(el.variant, el.w, el.h))

    case 'line': {
      // El búfer se agranda por el grosor del pincel, si no la punta del trazo
      // se recortaría contra el borde de la caja.
      const pad = stampOffset(el.strokeWidth) + Math.max(1, Math.ceil(el.strokeWidth))
      const arrowPad = el.arrow ? Math.max(4, el.strokeWidth * 3 + 3) : 0
      const bounds = lineBounds(el.dx, el.dy, pad + arrowPad)
      const buf = createBuffer(bounds.w, bounds.h)
      const color = parseColor(el.stroke)
      const x0 = -bounds.x
      const y0 = -bounds.y
      const x1 = el.dx - bounds.x
      const y1 = el.dy - bounds.y
      strokeLine(buf, x0, y0, x1, y1, color, el.strokeWidth, el.brushShape)
      if (el.arrow) {
        strokeArrowHead(buf, x0, y0, x1, y1, color, el.strokeWidth, el.brushShape)
      }
      return { buf, x: el.x + bounds.x, y: el.y + bounds.y }
    }

    case 'text': {
      const buf = renderText(el)
      return { buf, x: el.x, y: el.y }
    }

    case 'image': {
      const src = getImageSource(el.srcId)
      if (!src) return { buf: createBuffer(el.w, el.h), x: el.x, y: el.y }

      if (el.quantize && el.quantize > 0) {
        const cacheKey = `${el.srcId}_${el.w}x${el.h}_${el.scaleMode}_${el.alphaThreshold}_${el.quantize}`
        const hit = quantizedCache.get(el.id)
        if (hit && hit.key === cacheKey) {
          return { buf: hit.buf, x: el.x, y: el.y }
        }

        triggerAsyncQuantize(el, src, cacheKey)

        const unquantized = processImage(src, {
          w: el.w,
          h: el.h,
          alphaThreshold: el.alphaThreshold,
          scaleMode: el.scaleMode,
          quantize: null,
        })
        return { buf: unquantized, x: el.x, y: el.y }
      }

      return { buf: processImageElement(el, src), x: el.x, y: el.y }
    }
  }
}

function lineBounds(dx: number, dy: number, pad: number): Rect {
  const minX = Math.min(0, dx) - pad
  const minY = Math.min(0, dy) - pad
  const maxX = Math.max(0, dx) + pad
  const maxY = Math.max(0, dy) + pad
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

/**
 * Relleno y contorno de una figura cerrada.
 *
 * El contorno se obtiene como `máscara − erosión(máscara, grosor)`. Erosionar da
 * un borde de grosor uniforme en cualquier dirección; estampar un pincel a lo
 * largo del perímetro, en cambio, engorda las diagonales y deja el borde
 * irregular — inaceptable en pixel art.
 */
function shapeResult(
  el: { x: number; y: number; w: number; h: number; fill: string | null; stroke: string | null; strokeWidth: number },
  mask: Mask,
): RasterResult {
  const buf = createBuffer(mask.w, mask.h)
  const fill = parseColor(el.fill)
  const stroke = parseColor(el.stroke)
  const sw = Math.max(0, Math.floor(el.strokeWidth))

  if (fill[3] > 0) paintMask(buf, mask, 0, 0, fill)

  if (stroke[3] > 0 && sw > 0) {
    const inner = erodeMask(mask, sw)
    const ring = maskIsEmpty(inner) ? mask : subtractMask(mask, inner)
    paintMask(buf, ring, 0, 0, stroke)
  }
  return { buf, x: el.x, y: el.y }
}

/** Rasteriza sin usar ni poblar el caché. Sirve para previews y para aplanar. */
export function rasterizeFresh(el: PVElement): RasterResult {
  const base = rasterizeBase(el)
  const owned = base.buf === (el as { buf?: PixelBuffer }).buf ? cloneBuffer(base.buf) : base.buf
  return applyTransform(el, { buf: owned, x: base.x, y: base.y })
}
