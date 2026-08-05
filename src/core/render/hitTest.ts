import type { PVElement, Rect, Scene } from '../types'
import { rasterizeElement } from './rasterize'

export function elementBounds(el: PVElement): Rect {
  const r = rasterizeElement(el)
  return { x: r.x, y: r.y, w: r.buf.w, h: r.buf.h }
}

export function unionBounds(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const r of rects) {
    x0 = Math.min(x0, r.x)
    y0 = Math.min(y0, r.y)
    x1 = Math.max(x1, r.x + r.w)
    y1 = Math.max(y1, r.y + r.h)
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

export function rectContains(r: Rect, x: number, y: number): boolean {
  return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

/**
 * Selección por píxel: gana el elemento más alto cuyo píxel opaco está bajo el
 * cursor. Es lo que hace que clickear el hueco de una dona seleccione lo que
 * está detrás, en vez de la dona.
 */
export function hitTest(scene: Scene, x: number, y: number): PVElement | null {
  for (let i = scene.elements.length - 1; i >= 0; i--) {
    const el = scene.elements[i]
    if (el.hidden || el.locked) continue
    const r = rasterizeElement(el)
    const lx = Math.floor(x) - r.x
    const ly = Math.floor(y) - r.y
    if (lx < 0 || ly < 0 || lx >= r.buf.w || ly >= r.buf.h) continue
    if (r.buf.data[(ly * r.buf.w + lx) * 4 + 3] > 0) return el
  }
  return null
}

/**
 * Variante tolerante para elementos finos (líneas de 1 px, textos chicos): si
 * ningún píxel cae justo bajo el cursor, se acepta un acierto dentro de `slop`
 * píxeles. Sin esto, seleccionar una línea diagonal fina es un ejercicio de
 * puntería.
 */
export function hitTestWithSlop(scene: Scene, x: number, y: number, slop: number): PVElement | null {
  const exact = hitTest(scene, x, y)
  if (exact || slop <= 0) return exact

  for (let i = scene.elements.length - 1; i >= 0; i--) {
    const el = scene.elements[i]
    if (el.hidden || el.locked) continue
    const r = rasterizeElement(el)
    for (let dy = -slop; dy <= slop; dy++) {
      for (let dx = -slop; dx <= slop; dx++) {
        const lx = Math.floor(x) + dx - r.x
        const ly = Math.floor(y) + dy - r.y
        if (lx < 0 || ly < 0 || lx >= r.buf.w || ly >= r.buf.h) continue
        if (r.buf.data[(ly * r.buf.w + lx) * 4 + 3] > 0) return el
      }
    }
  }
  return null
}

/** Elementos cuyo bounding box intersecta la marquesina de selección. */
export function elementsInRect(scene: Scene, sel: Rect): PVElement[] {
  return scene.elements.filter((el) => {
    if (el.hidden || el.locked) return false
    return rectsIntersect(elementBounds(el), sel)
  })
}
