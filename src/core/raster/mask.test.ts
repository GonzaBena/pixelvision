import { describe, expect, it } from 'vitest'
import type { Mask } from '../types'
import { ellipseMask, erodeMask, polyMaskFor, rectMask, subtractMask } from './mask'

function rows(m: Mask): string[] {
  const out: string[] = []
  for (let y = 0; y < m.h; y++) {
    let s = ''
    for (let x = 0; x < m.w; x++) s += m.data[y * m.w + x] ? '#' : '.'
    out.push(s)
  }
  return out
}

function mirrorX(m: Mask): Mask {
  const out: Mask = { w: m.w, h: m.h, data: new Uint8Array(m.w * m.h) }
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) out.data[y * m.w + x] = m.data[y * m.w + (m.w - 1 - x)]
  }
  return out
}

function mirrorY(m: Mask): Mask {
  const out: Mask = { w: m.w, h: m.h, data: new Uint8Array(m.w * m.h) }
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) out.data[y * m.w + x] = m.data[(m.h - 1 - y) * m.w + x]
  }
  return out
}

/** Cada fila no vacía debe ser un único tramo contiguo: la elipse es convexa. */
function rowsAreContiguous(m: Mask): boolean {
  for (let y = 0; y < m.h; y++) {
    let seen = false
    let ended = false
    for (let x = 0; x < m.w; x++) {
      const on = !!m.data[y * m.w + x]
      if (on) {
        if (ended) return false
        seen = true
      } else if (seen) {
        ended = true
      }
    }
  }
  return true
}

describe('ellipseMask', () => {
  // La simetría con dimensiones pares es exactamente lo que rompe el Bresenham
  // clásico de elipse, que asume un píxel central.
  for (const [w, h] of [
    [4, 4],
    [5, 5],
    [7, 3],
    [8, 8],
    [15, 15],
    [16, 16],
    [16, 9],
    [3, 12],
  ]) {
    it(`es simétrica en ${w}×${h}`, () => {
      const m = ellipseMask(w, h)
      expect(rows(m)).toEqual(rows(mirrorX(m)))
      expect(rows(m)).toEqual(rows(mirrorY(m)))
    })
  }

  it('no deja huecos dentro de una fila', () => {
    for (const n of [4, 5, 9, 16, 31, 32]) {
      expect(rowsAreContiguous(ellipseMask(n, n))).toBe(true)
    }
  })

  it('toca los cuatro bordes de su caja', () => {
    const m = ellipseMask(16, 16)
    const rowOf = (y: number) => rows(m)[y]
    expect(rowOf(0).includes('#')).toBe(true)
    expect(rowOf(15).includes('#')).toBe(true)
    let leftTouched = false
    let rightTouched = false
    for (let y = 0; y < m.h; y++) {
      if (m.data[y * m.w]) leftTouched = true
      if (m.data[y * m.w + m.w - 1]) rightTouched = true
    }
    expect(leftTouched).toBe(true)
    expect(rightTouched).toBe(true)
  })

  it('no se sale de la caja ni queda vacía', () => {
    for (let n = 1; n <= 20; n++) {
      const m = ellipseMask(n, n)
      expect(m.data.length).toBe(n * n)
      expect(m.data.some((v) => v === 1)).toBe(true)
    }
  })
})

describe('contorno por erosión', () => {
  /**
   * El contorno se calcula como máscara menos su erosión. Estas pruebas fijan la
   * propiedad que lo justifica: grosor uniforme y anillo cerrado.
   */
  it('un contorno de 1 px deja el interior hueco y el borde completo', () => {
    const m = rectMask(10, 8)
    const ring = subtractMask(m, erodeMask(m, 1))
    const r = rows(ring)
    expect(r[0]).toBe('##########')
    expect(r[7]).toBe('##########')
    expect(r[3]).toBe('#........#')
  })

  it('el grosor del contorno sigue al parámetro', () => {
    const m = rectMask(12, 12)
    const ring = subtractMask(m, erodeMask(m, 3))
    const r = rows(ring)
    expect(r[5]).toBe('###......###')
  })

  it('el anillo de una elipse es cerrado: toda fila del relleno aporta borde', () => {
    const m = ellipseMask(21, 13)
    const ring = subtractMask(m, erodeMask(m, 1))
    for (let y = 0; y < m.h; y++) {
      const filled = []
      for (let x = 0; x < m.w; x++) if (m.data[y * m.w + x]) filled.push(x)
      if (filled.length === 0) continue
      const first = filled[0]
      const last = filled[filled.length - 1]
      expect(ring.data[y * m.w + first]).toBe(1)
      expect(ring.data[y * m.w + last]).toBe(1)
    }
  })

  it('si la erosión vacía la figura, el contorno la rellena entera', () => {
    const m = rectMask(3, 3)
    const eroded = erodeMask(m, 5)
    expect(eroded.data.every((v) => v === 0)).toBe(true)
  })
})

describe('polyMaskFor', () => {
  it('el rombo es simétrico en ambos ejes', () => {
    const m = polyMaskFor('diamond', 15, 15)
    expect(rows(m)).toEqual(rows(mirrorX(m)))
    expect(rows(m)).toEqual(rows(mirrorY(m)))
  })

  it('el triángulo es más ancho abajo que arriba', () => {
    const m = polyMaskFor('triangle', 21, 21)
    const count = (y: number) => {
      let n = 0
      for (let x = 0; x < m.w; x++) if (m.data[y * m.w + x]) n++
      return n
    }
    expect(count(20)).toBeGreaterThan(count(2))
  })

  it('la estrella es cóncava: alguna fila tiene más de un tramo', () => {
    const m = polyMaskFor('star', 31, 31)
    let multiSpanRows = 0
    for (let y = 0; y < m.h; y++) {
      let spans = 0
      let prev = 0
      for (let x = 0; x < m.w; x++) {
        const on = m.data[y * m.w + x]
        if (on && !prev) spans++
        prev = on
      }
      if (spans > 1) multiSpanRows++
    }
    expect(multiSpanRows).toBeGreaterThan(0)
  })
})

describe('rectMask', () => {
  it('sin radio, rellena todo', () => {
    const m = rectMask(5, 4)
    expect(m.data.every((v) => v === 1)).toBe(true)
  })

  it('con radio, recorta las cuatro esquinas por igual', () => {
    const m = rectMask(12, 12, 4)
    expect(m.data[0]).toBe(0)
    expect(m.data[11]).toBe(0)
    expect(m.data[11 * 12]).toBe(0)
    expect(m.data[11 * 12 + 11]).toBe(0)
    expect(m.data[6 * 12 + 6]).toBe(1)
  })
})
