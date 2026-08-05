import { describe, expect, it } from 'vitest'
import type { TextElement } from '../types'
import { getPixel } from '../pixels'
import { DEFAULT_TOOL_OPTIONS, createText } from '../elements'
import { BITMAP_FONTS, getGlyph } from './fonts'
import { measureText, renderText } from './renderText'

function text(str: string, patch: Partial<TextElement> = {}): TextElement {
  const el = createText(0, 0, { ...DEFAULT_TOOL_OPTIONS, letterSpacing: 1, lineSpacing: 1 }, str)
  return { ...(el as TextElement), color: '#ff0000', ...patch }
}

function glyphKey(cp: number): string {
  const g = getGlyph(BITMAP_FONTS.pv5x7, cp)
  return Array.from(g.data).join('')
}

describe('fuente bitmap 5×7', () => {
  it('trae los caracteres del español y no caen al glifo de reemplazo', () => {
    const fallback = Array.from(BITMAP_FONTS.pv5x7.fallback.data).join('')
    for (const ch of 'áéíóúüñÁÉÍÓÚÜÑ¿¡«»') {
      expect(glyphKey(ch.codePointAt(0)!), `falta el glifo de "${ch}"`).not.toBe(fallback)
    }
  })

  it('distingue la vocal acentuada de la sin acento', () => {
    for (const [plain, accented] of [
      ['a', 'á'],
      ['e', 'é'],
      ['i', 'í'],
      ['o', 'ó'],
      ['u', 'ú'],
      ['n', 'ñ'],
      ['N', 'Ñ'],
    ]) {
      expect(glyphKey(plain.codePointAt(0)!)).not.toBe(glyphKey(accented.codePointAt(0)!))
    }
  })

  it('la ñ y la Ñ llevan tilde encima del cuerpo de la letra', () => {
    for (const ch of 'ñÑ') {
      const g = getGlyph(BITMAP_FONTS.pv5x7, ch.codePointAt(0)!)
      let topRowsLit = 0
      for (let x = 0; x < g.w; x++) if (g.data[x]) topRowsLit++
      expect(topRowsLit, `"${ch}" no tiene tilde`).toBeGreaterThan(0)
    }
  })

  it('cubre ASCII imprimible completo', () => {
    const fallback = Array.from(BITMAP_FONTS.pv5x7.fallback.data).join('')
    const missing: string[] = []
    for (let cp = 33; cp <= 126; cp++) {
      if (glyphKey(cp) === fallback) missing.push(String.fromCodePoint(cp))
    }
    expect(missing).toEqual([])
  })

  it('la fuente diminuta mapea minúsculas a su mayúscula', () => {
    const lower = getGlyph(BITMAP_FONTS.pv3x5, 'a'.codePointAt(0)!)
    const upper = getGlyph(BITMAP_FONTS.pv3x5, 'A'.codePointAt(0)!)
    expect(Array.from(lower.data)).toEqual(Array.from(upper.data))
  })
})

describe('measureText', () => {
  it('mide una línea con el avance y el interletrado', () => {
    // 3 caracteres de 5 px + 2 separaciones de 1 px = 17
    expect(measureText(text('abc'))).toEqual({ w: 17, h: 7 })
  })

  it('mide varias líneas usando la más ancha', () => {
    const m = measureText(text('ab\nabcde'))
    expect(m.w).toBe(29) // 5 caracteres: 5*5 + 4*1
    expect(m.h).toBe(15) // 2 líneas: 2*7 + 1 de separación
  })

  it('el texto vacío no tiene ancho pero conserva el alto de una línea', () => {
    // El alto no nulo es intencional: el editor flotante se ancla debajo del
    // elemento, así que un alto 0 lo dejaría tapando el punto donde se escribe.
    expect(measureText(text(''))).toEqual({ w: 0, h: 7 })
    const buf = renderText(text(''))
    expect(buf.data.length).toBe(0)
  })

  it('la escala multiplica ambas dimensiones', () => {
    const one = measureText(text('hola', { scale: 1 }))
    const three = measureText(text('hola', { scale: 3 }))
    expect(three.w).toBe(one.w * 3)
    expect(three.h).toBe(one.h * 3)
  })
})

describe('renderText', () => {
  it('el búfer tiene exactamente el tamaño medido', () => {
    const el = text('Pixel')
    const m = measureText(el)
    const buf = renderText(el)
    expect([buf.w, buf.h]).toEqual([m.w, m.h])
  })

  it('sólo usa el color pedido o transparencia total: sin antialiasing', () => {
    const buf = renderText(text('Añóx'))
    for (let i = 0; i < buf.data.length; i += 4) {
      const a = buf.data[i + 3]
      expect(a === 0 || a === 255).toBe(true)
      if (a === 255) {
        expect([buf.data[i], buf.data[i + 1], buf.data[i + 2]]).toEqual([255, 0, 0])
      }
    }
  })

  it('la escala expande cada píxel del glifo a un bloque sólido', () => {
    const one = renderText(text('L', { scale: 1 }))
    const two = renderText(text('L', { scale: 2 }))
    // Cada píxel encendido a escala 1 debe ser un bloque de 2×2 a escala 2.
    for (let y = 0; y < one.h; y++) {
      for (let x = 0; x < one.w; x++) {
        const on = getPixel(one, x, y)[3] > 0
        for (const [dx, dy] of [
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1],
        ]) {
          expect(getPixel(two, x * 2 + dx, y * 2 + dy)[3] > 0).toBe(on)
        }
      }
    }
  })

  it('centrar reparte el sobrante a los lados', () => {
    const buf = renderText(text('ab\nabcd', { align: 'center' }))
    // La línea corta arranca desplazada, no pegada al borde izquierdo.
    let firstLit = -1
    for (let x = 0; x < buf.w && firstLit < 0; x++) {
      if (getPixel(buf, x, 1)[3] > 0) firstLit = x
    }
    expect(firstLit).toBeGreaterThan(0)
  })

  it('alinear a la derecha pega la línea corta al borde derecho', () => {
    const buf = renderText(text('ab\nabcd', { align: 'right' }))
    let lastLit = -1
    for (let x = buf.w - 1; x >= 0 && lastLit < 0; x--) {
      for (let y = 0; y < 7; y++) if (getPixel(buf, x, y)[3] > 0) lastLit = x
    }
    expect(lastLit).toBeGreaterThanOrEqual(buf.w - 5)
  })

  it('un carácter desconocido cae al glifo de reemplazo sin romper', () => {
    const buf = renderText(text('\u{1F600}'))
    expect(buf.w).toBeGreaterThan(0)
    let lit = 0
    for (let i = 3; i < buf.data.length; i += 4) if (buf.data[i] > 0) lit++
    expect(lit).toBeGreaterThan(0)
  })

  it('los saltos de línea producen filas separadas', () => {
    const oneLine = renderText(text('a'))
    const twoLines = renderText(text('a\na'))
    expect(twoLines.h).toBe(oneLine.h * 2 + 1)
  })
})
