import type {
  BrushShape,
  FontId,
  FreedrawElement,
  Mask,
  PolyVariant,
  PVElement,
  Rect,
  TextAlign,
} from './types'
import { createBuffer, parseColor, setPixel } from './pixels'
import { rasterizeFresh } from './render/rasterize'
import { bufferBounds, cropBuffer } from './pixels'

let idCounter = 0

export function newId(prefix = 'el'): string {
  idCounter += 1
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}`
}

/** Propiedades compartidas por las herramientas de dibujo. */
export interface ToolOptions {
  stroke: string
  fill: string | null
  strokeWidth: number
  brushSize: number
  brushShape: BrushShape
  radius: number
  opacity: number
  arrow: boolean
  tolerance: number
  fontId: FontId
  fontScale: number
  letterSpacing: number
  lineSpacing: number
  align: TextAlign
  systemFamily: string
  systemSize: number
  systemThreshold: number
}

export const DEFAULT_TOOL_OPTIONS: ToolOptions = {
  stroke: '#1e1e1e',
  fill: null,
  strokeWidth: 1,
  brushSize: 1,
  brushShape: 'square',
  radius: 0,
  opacity: 1,
  arrow: false,
  tolerance: 0,
  fontId: 'pv5x7',
  fontScale: 1,
  letterSpacing: 1,
  lineSpacing: 1,
  align: 'left',
  systemFamily: 'monospace',
  systemSize: 12,
  systemThreshold: 128,
}

function base(x: number, y: number) {
  return { id: newId(), rev: 0, x, y }
}

export function createFreedraw(x: number, y: number, w: number, h: number): FreedrawElement {
  return { ...base(x, y), type: 'freedraw', buf: createBuffer(w, h) }
}

export function createRect(r: Rect, o: ToolOptions): PVElement {
  return {
    ...base(r.x, r.y),
    type: 'rect',
    w: r.w,
    h: r.h,
    stroke: o.stroke,
    fill: o.fill,
    strokeWidth: o.strokeWidth,
    radius: o.radius,
    opacity: o.opacity,
  }
}

export function createEllipse(r: Rect, o: ToolOptions): PVElement {
  return {
    ...base(r.x, r.y),
    type: 'ellipse',
    w: r.w,
    h: r.h,
    stroke: o.stroke,
    fill: o.fill,
    strokeWidth: o.strokeWidth,
    opacity: o.opacity,
  }
}

export function createPoly(variant: PolyVariant, r: Rect, o: ToolOptions): PVElement {
  return {
    ...base(r.x, r.y),
    type: 'poly',
    variant,
    w: r.w,
    h: r.h,
    stroke: o.stroke,
    fill: o.fill,
    strokeWidth: o.strokeWidth,
    opacity: o.opacity,
  }
}

export function createLine(
  x: number,
  y: number,
  dx: number,
  dy: number,
  o: ToolOptions,
): PVElement {
  return {
    ...base(x, y),
    type: 'line',
    dx,
    dy,
    stroke: o.stroke,
    strokeWidth: o.strokeWidth,
    brushShape: o.brushShape,
    arrow: o.arrow,
    opacity: o.opacity,
  }
}

export function createText(x: number, y: number, o: ToolOptions, text = ''): PVElement {
  return {
    ...base(x, y),
    type: 'text',
    text,
    fontId: o.fontId,
    scale: o.fontScale,
    color: o.stroke,
    letterSpacing: o.letterSpacing,
    lineSpacing: o.lineSpacing,
    align: o.align,
    systemFamily: o.systemFamily,
    systemSize: o.systemSize,
    systemThreshold: o.systemThreshold,
    opacity: o.opacity,
  }
}

/** Convierte una máscara pintada de un color en un elemento de trazo. */
export function freedrawFromMask(mask: Mask, color: string, ox: number, oy: number): FreedrawElement | null {
  const el = createFreedraw(ox, oy, mask.w, mask.h)
  const c = parseColor(color)
  for (let y = 0; y < mask.h; y++) {
    for (let x = 0; x < mask.w; x++) {
      if (mask.data[y * mask.w + x]) setPixel(el.buf, x, y, c)
    }
  }
  const bounds = bufferBounds(el.buf)
  if (!bounds) return null
  el.buf = cropBuffer(el.buf, bounds)
  el.x += bounds.x
  el.y += bounds.y
  return el
}

/**
 * "Aplanar a píxeles": rasteriza el elemento y lo reemplaza por un trazo libre
 * con exactamente esos píxeles.
 *
 * Es el puente entre los dos modelos: mientras la figura es un objeto se puede
 * redimensionar sin pérdida, pero para retocarla píxel a píxel con el pincel o
 * el borrador tiene que dejar de ser procedural.
 */
export function flattenElement(el: PVElement): FreedrawElement | null {
  if (el.type === 'freedraw') return el
  const r = rasterizeFresh(el)
  const bounds = bufferBounds(r.buf)
  if (!bounds) return null
  const flat: FreedrawElement = {
    ...base(r.x + bounds.x, r.y + bounds.y),
    type: 'freedraw',
    buf: cropBuffer(r.buf, bounds),
    name: el.name,
    opacity: el.opacity,
    locked: el.locked,
    hidden: el.hidden,
  }
  return flat
}

export function elementLabel(el: PVElement): string {
  if (el.name) return el.name
  switch (el.type) {
    case 'freedraw':
      return 'Trazo'
    case 'rect':
      return 'Rectángulo'
    case 'ellipse':
      return 'Elipse'
    case 'line':
      return el.arrow ? 'Flecha' : 'Línea'
    case 'poly':
      return {
        triangle: 'Triángulo',
        diamond: 'Rombo',
        star: 'Estrella',
        hexagon: 'Hexágono',
      }[el.variant]
    case 'text':
      return el.text.split('\n')[0].slice(0, 18) || 'Texto'
    case 'image':
      return 'Imagen'
  }
}

/** Normaliza una caja arrastrada para que w y h nunca sean negativos ni cero. */
export function normalizeRect(x0: number, y0: number, x1: number, y1: number): Rect {
  const x = Math.min(x0, x1)
  const y = Math.min(y0, y1)
  return {
    x,
    y,
    w: Math.max(1, Math.abs(x1 - x0) + 1),
    h: Math.max(1, Math.abs(y1 - y0) + 1),
  }
}
