import { describe, expect, it } from 'vitest'
import { createBuffer, setPixel } from '../pixels'
import { floodFillMask } from './floodfill'

function countMask(m: { data: Uint8Array }): number {
  let n = 0
  for (const v of m.data) if (v) n++
  return n
}

describe('floodFillMask', () => {
  it('rellena todo un búfer uniforme', () => {
    const buf = createBuffer(8, 8)
    const m = floodFillMask(buf, 0, 0, 0)
    expect(countMask(m)).toBe(64)
  })

  it('no se escapa de una región cerrada', () => {
    const buf = createBuffer(9, 9)
    // Marco cerrado de 1 px: el relleno del interior no debe tocar el exterior.
    for (let i = 2; i <= 6; i++) {
      setPixel(buf, i, 2, [0, 0, 0, 255])
      setPixel(buf, i, 6, [0, 0, 0, 255])
      setPixel(buf, 2, i, [0, 0, 0, 255])
      setPixel(buf, 6, i, [0, 0, 0, 255])
    }
    const m = floodFillMask(buf, 4, 4, 0)
    expect(countMask(m)).toBe(9) // el interior de 3×3
    expect(m.data[4 * 9 + 4]).toBe(1)
    expect(m.data[0]).toBe(0)
  })

  it('un agujero de 1 px en el marco deja escapar el relleno', () => {
    const buf = createBuffer(9, 9)
    for (let i = 2; i <= 6; i++) {
      setPixel(buf, i, 2, [0, 0, 0, 255])
      if (i !== 4) setPixel(buf, i, 6, [0, 0, 0, 255])
      setPixel(buf, 2, i, [0, 0, 0, 255])
      setPixel(buf, 6, i, [0, 0, 0, 255])
    }
    const m = floodFillMask(buf, 4, 4, 0)
    expect(m.data[0]).toBe(1)
  })

  it('nunca cruza entre transparente y opaco, por parecido que sea el RGB', () => {
    const buf = createBuffer(4, 1)
    setPixel(buf, 0, 0, [0, 0, 0, 0])
    setPixel(buf, 1, 0, [0, 0, 0, 0])
    setPixel(buf, 2, 0, [0, 0, 0, 255])
    setPixel(buf, 3, 0, [0, 0, 0, 255])
    const m = floodFillMask(buf, 0, 0, 255)
    expect(m.data[0]).toBe(1)
    expect(m.data[1]).toBe(1)
    expect(m.data[2]).toBe(0)
  })

  it('la tolerancia agrupa colores cercanos', () => {
    const buf = createBuffer(3, 1)
    setPixel(buf, 0, 0, [100, 100, 100, 255])
    setPixel(buf, 1, 0, [104, 100, 100, 255])
    setPixel(buf, 2, 0, [200, 100, 100, 255])

    expect(countMask(floodFillMask(buf, 0, 0, 0))).toBe(1)
    expect(countMask(floodFillMask(buf, 0, 0, 10))).toBe(2)
  })

  it('ignora un inicio fuera del búfer', () => {
    const buf = createBuffer(4, 4)
    expect(countMask(floodFillMask(buf, -1, 2, 0))).toBe(0)
    expect(countMask(floodFillMask(buf, 2, 99, 0))).toBe(0)
  })

  it('termina en una región grande sin desbordar la pila', () => {
    const buf = createBuffer(256, 256)
    const m = floodFillMask(buf, 128, 128, 0)
    expect(countMask(m)).toBe(256 * 256)
  })
})
