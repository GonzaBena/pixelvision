import { describe, expect, it } from 'vitest'
import type { FreedrawElement, PVElement, Scene } from '../types'
import { createBuffer, getPixel, setPixel } from '../pixels'
import { DEFAULT_TOOL_OPTIONS, createEllipse, createRect } from '../elements'
import { renderScene } from './renderScene'
import { invalidateRaster } from './rasterize'
import { hitTest } from './hitTest'

function scene(elements: PVElement[], w = 16, h = 16): Scene {
  invalidateRaster()
  return { canvas: { w, h, background: null }, elements }
}

function solid(x: number, y: number, w: number, h: number, color: [number, number, number, number]): PVElement {
  const buf = createBuffer(w, h)
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) setPixel(buf, xx, yy, color)
  return { id: `s${x}_${y}_${color.join('')}`, rev: 0, x, y, type: 'freedraw', buf }
}

const RED: [number, number, number, number] = [255, 0, 0, 255]
const BLUE: [number, number, number, number] = [0, 0, 255, 255]

describe('renderScene', () => {
  it('compone en z-order: el último elemento del array queda arriba', () => {
    const out = renderScene(scene([solid(0, 0, 8, 8, RED), solid(0, 0, 8, 8, BLUE)]))
    expect(getPixel(out, 2, 2)).toEqual(BLUE)
  })

  it('el orden inverso da el resultado inverso', () => {
    const out = renderScene(scene([solid(0, 0, 8, 8, BLUE), solid(0, 0, 8, 8, RED)]))
    expect(getPixel(out, 2, 2)).toEqual(RED)
  })

  it('el resultado tiene exactamente el tamaño del lienzo', () => {
    const out = renderScene(scene([solid(0, 0, 4, 4, RED)], 23, 41))
    expect(out.w).toBe(23)
    expect(out.h).toBe(41)
    expect(out.data.length).toBe(23 * 41 * 4)
  })

  it('recorta lo que se sale del lienzo en vez de desbordar', () => {
    const out = renderScene(scene([solid(14, 14, 8, 8, RED)]))
    expect(getPixel(out, 15, 15)).toEqual(RED)
    expect(out.data.length).toBe(16 * 16 * 4)
  })

  it('los elementos ocultos no se dibujan', () => {
    const el = solid(0, 0, 8, 8, RED)
    el.hidden = true
    expect(getPixel(renderScene(scene([el])), 1, 1)[3]).toBe(0)
  })

  it('el fondo del lienzo queda debajo de todo', () => {
    const s = scene([solid(0, 0, 4, 4, RED)])
    s.canvas.background = '#00ff00'
    const out = renderScene(s)
    expect(getPixel(out, 1, 1)).toEqual(RED)
    expect(getPixel(out, 10, 10)).toEqual([0, 255, 0, 255])
  })

  it('el elemento en curso se dibuja arriba sin entrar a la escena', () => {
    const s = scene([solid(0, 0, 8, 8, RED)])
    const draft = solid(0, 0, 8, 8, BLUE)
    expect(getPixel(renderScene(s, draft), 1, 1)).toEqual(BLUE)
    expect(s.elements).toHaveLength(1)
  })

  it('la opacidad del elemento mezcla con lo de abajo', () => {
    const top = solid(0, 0, 8, 8, BLUE)
    top.opacity = 0.5
    const out = renderScene(scene([solid(0, 0, 8, 8, RED), top]))
    const p = getPixel(out, 1, 1)
    expect(p[0]).toBeGreaterThan(100)
    expect(p[2]).toBeGreaterThan(100)
  })
})

describe('figuras procedurales', () => {
  it('un rectángulo relleno cubre su caja exacta', () => {
    const el = createRect({ x: 3, y: 4, w: 6, h: 5 }, { ...DEFAULT_TOOL_OPTIONS, fill: '#ff0000', strokeWidth: 0 })
    const out = renderScene(scene([el]))
    expect(getPixel(out, 3, 4)).toEqual(RED)
    expect(getPixel(out, 8, 8)).toEqual(RED)
    expect(getPixel(out, 2, 4)[3]).toBe(0)
    expect(getPixel(out, 9, 8)[3]).toBe(0)
  })

  it('una elipse sin relleno queda hueca en el centro', () => {
    const el = createEllipse(
      { x: 0, y: 0, w: 15, h: 15 },
      { ...DEFAULT_TOOL_OPTIONS, fill: null, stroke: '#ff0000', strokeWidth: 1 },
    )
    const out = renderScene(scene([el]))
    expect(getPixel(out, 7, 7)[3]).toBe(0)
    expect(getPixel(out, 7, 0)).toEqual(RED)
  })

  it('el trazo no produce colores intermedios: no hay antialiasing', () => {
    const el = createEllipse(
      { x: 0, y: 0, w: 16, h: 16 },
      { ...DEFAULT_TOOL_OPTIONS, fill: '#ff0000', strokeWidth: 0 },
    )
    const out = renderScene(scene([el]))
    for (let i = 0; i < out.data.length; i += 4) {
      const a = out.data[i + 3]
      expect(a === 0 || a === 255).toBe(true)
      if (a === 255) expect([out.data[i], out.data[i + 1], out.data[i + 2]]).toEqual([255, 0, 0])
    }
  })
})

describe('hitTest', () => {
  it('elige el elemento más alto que tenga un píxel opaco en el punto', () => {
    const bottom = solid(0, 0, 8, 8, RED)
    const top = solid(4, 4, 8, 8, BLUE)
    const s = scene([bottom, top])
    expect(hitTest(s, 1, 1)?.id).toBe(bottom.id)
    expect(hitTest(s, 5, 5)?.id).toBe(top.id)
  })

  it('atraviesa el hueco de una figura sin relleno', () => {
    const behind = solid(6, 6, 3, 3, RED)
    const ring = createEllipse(
      { x: 0, y: 0, w: 15, h: 15 },
      { ...DEFAULT_TOOL_OPTIONS, fill: null, stroke: '#0000ff', strokeWidth: 1 },
    )
    const s = scene([behind, ring])
    // El centro del anillo es transparente, así que gana lo que está detrás.
    expect(hitTest(s, 7, 7)?.id).toBe(behind.id)
  })

  it('devuelve null donde no hay nada', () => {
    expect(hitTest(scene([solid(0, 0, 4, 4, RED)]), 12, 12)).toBeNull()
  })

  it('ignora los elementos bloqueados', () => {
    const el = solid(0, 0, 8, 8, RED)
    el.locked = true
    expect(hitTest(scene([el]), 2, 2)).toBeNull()
  })
})

describe('dynamic palette restriction', () => {
  it('renders elements snapped to the restricted palette without mutating their original properties', () => {
    // A red solid freedraw element. PICO-8 red is #ff004d ([255, 0, 77, 255])
    const el = solid(0, 0, 8, 8, RED)
    const s = scene([el])

    // Apply PICO-8 restriction
    el.restrictPalette = 'pico8'

    const out = renderScene(s)
    // Red [255, 0, 0, 255] should be snapped to PICO-8 red [255, 0, 77, 255]
    expect(getPixel(out, 2, 2)).toEqual([255, 0, 77, 255])

    // Verify the original element buffer was not mutated
    expect(getPixel((el as FreedrawElement).buf, 2, 2)).toEqual(RED)

    // Remove palette restriction
    el.restrictPalette = null
    invalidateRaster() // Clear cache
    const outFree = renderScene(s)
    // Should render in original red [255, 0, 0, 255]
    expect(getPixel(outFree, 2, 2)).toEqual(RED)
  })
})

