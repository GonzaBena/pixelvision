import type { Viewport } from '../state/store'

export const ZOOM_LEVELS = [
  0.0625, 0.125, 0.25, 0.333, 0.5, 1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64,
]

export const MIN_ZOOM = ZOOM_LEVELS[0]
export const MAX_ZOOM = ZOOM_LEVELS[ZOOM_LEVELS.length - 1]

export interface ViewTransform {
  /** Píxeles de dispositivo por píxel del lienzo. Entero cuando es >= 1. */
  scale: number
  /** Origen del lienzo en píxeles de dispositivo, ya redondeado. */
  ox: number
  oy: number
  dpr: number
}

/**
 * Píxeles de dispositivo por píxel del lienzo.
 *
 * Redondear a entero es lo que evita el defecto más visible de un editor de
 * pixel art: con un dpr fraccionario (1.25, 1.5) o un zoom no entero, un píxel
 * de cada N sale un device-pixel más ancho y la grilla se ve irregular. Por
 * debajo de 1 no hay entero posible, y a esa escala el aliasing no molesta.
 */
export function deviceScale(zoom: number, dpr: number): number {
  const raw = zoom * dpr
  return raw >= 1 ? Math.round(raw) : raw
}

export function computeTransform(vp: Viewport, dpr: number): ViewTransform {
  return {
    scale: deviceScale(vp.zoom, dpr),
    // El origen también se redondea a device pixels: si no, el redondeo del
    // destino de drawImage desplaza medio píxel y vuelve a romper la uniformidad.
    ox: Math.round(vp.panX * dpr),
    oy: Math.round(vp.panY * dpr),
    dpr,
  }
}

/** Zoom efectivo en px CSS, que puede diferir levemente del solicitado por el redondeo. */
export function effectiveZoom(t: ViewTransform): number {
  return t.scale / t.dpr
}

/** Coordenada CSS relativa al stage → coordenada de píxel del lienzo (fraccionaria). */
export function screenToCanvas(t: ViewTransform, cssX: number, cssY: number) {
  return {
    x: (cssX * t.dpr - t.ox) / t.scale,
    y: (cssY * t.dpr - t.oy) / t.scale,
  }
}

/** Igual que screenToCanvas pero devuelve el índice entero del píxel. */
export function screenToPixel(t: ViewTransform, cssX: number, cssY: number) {
  const p = screenToCanvas(t, cssX, cssY)
  return { x: Math.floor(p.x), y: Math.floor(p.y) }
}

/** Coordenada de píxel del lienzo → CSS relativa al stage. */
export function canvasToScreen(t: ViewTransform, px: number, py: number) {
  return {
    x: (px * t.scale + t.ox) / t.dpr,
    y: (py * t.scale + t.oy) / t.dpr,
  }
}

export function nextZoom(zoom: number, dir: 1 | -1): number {
  if (dir > 0) {
    for (const z of ZOOM_LEVELS) if (z > zoom + 1e-6) return z
    return MAX_ZOOM
  }
  for (let i = ZOOM_LEVELS.length - 1; i >= 0; i--) {
    if (ZOOM_LEVELS[i] < zoom - 1e-6) return ZOOM_LEVELS[i]
  }
  return MIN_ZOOM
}

/** Cambia el zoom manteniendo fijo el punto del lienzo que está bajo el cursor. */
export function zoomAt(
  vp: Viewport,
  newZoom: number,
  cssX: number,
  cssY: number,
): Viewport {
  const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom))
  const canvasX = (cssX - vp.panX) / vp.zoom
  const canvasY = (cssY - vp.panY) / vp.zoom
  return {
    zoom: z,
    panX: cssX - canvasX * z,
    panY: cssY - canvasY * z,
  }
}

/** Centra y encuadra el lienzo dentro del stage, con margen. */
export function fitToView(
  canvasW: number,
  canvasH: number,
  stageW: number,
  stageH: number,
  padding = 48,
): Viewport {
  const availW = Math.max(1, stageW - padding * 2)
  const availH = Math.max(1, stageH - padding * 2)
  const raw = Math.min(availW / canvasW, availH / canvasH)
  // Se baja al escalón de zoom disponible más cercano para no aterrizar en un
  // factor raro que desdibuje la grilla.
  let zoom = MIN_ZOOM
  for (const z of ZOOM_LEVELS) if (z <= raw) zoom = z
  return {
    zoom,
    panX: (stageW - canvasW * zoom) / 2,
    panY: (stageH - canvasH * zoom) / 2,
  }
}
