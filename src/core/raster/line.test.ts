import { describe, expect, it } from 'vitest'
import { createBuffer, getPixel } from '../pixels'
import { bresenham, strokeLine } from './line'

const OCTANTS: Array<[number, number]> = [
  [12, 3],
  [3, 12],
  [-3, 12],
  [-12, 3],
  [-12, -3],
  [-3, -12],
  [3, -12],
  [12, -3],
]

describe('bresenham', () => {
  it.each(OCTANTS)('no deja huecos en el octante (%i, %i)', (dx, dy) => {
    const pts: Array<[number, number]> = []
    bresenham(20, 20, 20 + dx, 20 + dy, (x, y) => pts.push([x, y]))
    expect(pts[0]).toEqual([20, 20])
    expect(pts[pts.length - 1]).toEqual([20 + dx, 20 + dy])
    // Cada paso debe ser 8-adyacente: es lo que garantiza un trazo continuo
    // cuando el puntero salta varios píxeles entre muestras.
    for (let i = 1; i < pts.length; i++) {
      const sx = Math.abs(pts[i][0] - pts[i - 1][0])
      const sy = Math.abs(pts[i][1] - pts[i - 1][1])
      expect(Math.max(sx, sy)).toBe(1)
    }
  })

  it('un punto solo produce un píxel', () => {
    const pts: Array<[number, number]> = []
    bresenham(5, 5, 5, 5, (x, y) => pts.push([x, y]))
    expect(pts).toEqual([[5, 5]])
  })

  it('es simétrico al invertir los extremos', () => {
    const a: string[] = []
    const b: string[] = []
    bresenham(0, 0, 17, 6, (x, y) => a.push(`${x},${y}`))
    bresenham(17, 6, 0, 0, (x, y) => b.push(`${x},${y}`))
    expect(a.slice().sort()).toEqual(b.slice().sort())
  })
})

describe('strokeLine', () => {
  it('un salto grande de puntero igual sale continuo', () => {
    const buf = createBuffer(40, 40)
    strokeLine(buf, 2, 2, 37, 30, [0, 0, 0, 255], 1, 'square')
    // Recorrer columna por columna: no puede haber una columna intermedia vacía.
    for (let x = 2; x <= 37; x++) {
      let painted = false
      for (let y = 0; y < 40; y++) {
        if (getPixel(buf, x, y)[3] > 0) painted = true
      }
      expect(painted).toBe(true)
    }
  })

  it('el pincel de 1 px pinta exactamente un píxel por punto', () => {
    const buf = createBuffer(10, 10)
    strokeLine(buf, 3, 3, 3, 3, [255, 0, 0, 255], 1, 'square')
    let count = 0
    for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) if (getPixel(buf, x, y)[3] > 0) count++
    expect(count).toBe(1)
    expect(getPixel(buf, 3, 3)).toEqual([255, 0, 0, 255])
  })

  it('borrar deja los píxeles totalmente transparentes', () => {
    const buf = createBuffer(10, 10)
    strokeLine(buf, 0, 5, 9, 5, [0, 0, 255, 255], 1, 'square')
    strokeLine(buf, 0, 5, 9, 5, [0, 0, 0, 0], 1, 'square', true)
    for (let x = 0; x < 10; x++) expect(getPixel(buf, x, 5)).toEqual([0, 0, 0, 0])
  })

  it('el trazo no se sale del búfer', () => {
    const buf = createBuffer(8, 8)
    expect(() => strokeLine(buf, -20, -20, 40, 40, [0, 0, 0, 255], 5, 'circle')).not.toThrow()
  })
})
