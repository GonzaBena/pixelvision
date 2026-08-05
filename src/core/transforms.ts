import type { PVElement, Rect, Rotation } from './types'
import { scaleBufferNearest } from './pixels'
import { measureText } from './text/renderText'
import { elementBounds } from './render/hitTest'

/**
 * Redimensiona un elemento a la caja dada.
 *
 * Las figuras procedurales sólo cambian de parámetros y se vuelven a rasterizar
 * desde cero, así que no pierden nada. Los elementos ráster se reescalan con
 * nearest-neighbour, que es la única interpolación que no inventa colores
 * intermedios.
 */
export function resizeElement(el: PVElement, box: Rect): Partial<PVElement> {
  const w = Math.max(1, Math.round(box.w))
  const h = Math.max(1, Math.round(box.h))
  const x = Math.round(box.x)
  const y = Math.round(box.y)

  switch (el.type) {
    case 'rect':
    case 'ellipse':
    case 'poly':
    case 'image':
      return { x, y, w, h }

    case 'freedraw':
      return { x, y, buf: scaleBufferNearest(el.buf, w, h) }

    case 'line':
      // Un eje que valía 0 tiene que seguir valiendo 0: si no, redimensionar una
      // línea horizontal o vertical la volvería diagonal.
      return {
        x,
        y,
        dx: el.dx === 0 ? 0 : Math.round(Math.sign(el.dx) * (w - 1)),
        dy: el.dy === 0 ? 0 : Math.round(Math.sign(el.dy) * (h - 1)),
      }

    case 'text': {
      // El texto no se estira: se elige la escala entera de fuente que mejor
      // entra en el alto pedido. Estirar glifos bitmap los rompe.
      const current = measureText(el)
      if (current.h <= 0) return { x, y }
      const perUnit = current.h / Math.max(1, el.scale)
      const scale = Math.max(1, Math.round(h / perUnit))
      return { x, y, scale }
    }
  }
}

/** Espejado acumulativo: aplicarlo dos veces vuelve al estado original. */
export function flipElement(el: PVElement, axis: 'x' | 'y'): Partial<PVElement> {
  return axis === 'x' ? { flipX: !el.flipX } : { flipY: !el.flipY }
}

export function rotateElement(el: PVElement, dir: 1 | -1): Partial<PVElement> {
  const rot = (((el.rot ?? 0) + dir + 4) % 4) as Rotation
  return { rot }
}

export function moveElement(el: PVElement, dx: number, dy: number): Partial<PVElement> {
  return { x: el.x + dx, y: el.y + dy }
}

/** Caja que envuelve varios elementos. */
export function boundsOf(els: PVElement[]): Rect | null {
  if (els.length === 0) return null
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const el of els) {
    const b = elementBounds(el)
    x0 = Math.min(x0, b.x)
    y0 = Math.min(y0, b.y)
    x1 = Math.max(x1, b.x + b.w)
    y1 = Math.max(y1, b.y + b.h)
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/**
 * Aplica el redimensionado de una caja contenedora a cada elemento, manteniendo
 * su posición relativa dentro de la selección.
 */
export function scaleWithin(el: PVElement, from: Rect, to: Rect): Partial<PVElement> {
  const b = elementBounds(el)
  const sx = to.w / Math.max(1, from.w)
  const sy = to.h / Math.max(1, from.h)
  return resizeElement(el, {
    x: to.x + (b.x - from.x) * sx,
    y: to.y + (b.y - from.y) * sy,
    w: Math.max(1, b.w * sx),
    h: Math.max(1, b.h * sy),
  })
}
