import { describe, expect, it } from 'vitest'
import { createBuffer, getPixel, setPixel } from '../pixels'
import { flattenAlpha, processImage, scaleBufferBox, suggestScaleMode } from './processImage'

describe('flattenAlpha — la regla de transparencia del proyecto', () => {
  it('descarta sólo lo totalmente transparente y vuelve opaco todo lo demás', () => {
    const buf = createBuffer(4, 1)
    setPixel(buf, 0, 0, [10, 20, 30, 0]) // totalmente transparente
    setPixel(buf, 1, 0, [40, 50, 60, 1]) // apenas visible
    setPixel(buf, 2, 0, [70, 80, 90, 128]) // medio transparente
    setPixel(buf, 3, 0, [100, 110, 120, 255]) // ya opaco

    flattenAlpha(buf, 0)

    expect(getPixel(buf, 0, 0)).toEqual([0, 0, 0, 0])
    expect(getPixel(buf, 1, 0)).toEqual([40, 50, 60, 255])
    expect(getPixel(buf, 2, 0)).toEqual([70, 80, 90, 255])
    expect(getPixel(buf, 3, 0)).toEqual([100, 110, 120, 255])
  })

  it('no deja ningún píxel semitransparente', () => {
    const buf = createBuffer(16, 16)
    for (let i = 0; i < 256; i++) {
      setPixel(buf, i % 16, Math.floor(i / 16), [i, i, i, i])
    }
    flattenAlpha(buf, 0)
    for (let i = 3; i < buf.data.length; i += 4) {
      expect(buf.data[i] === 0 || buf.data[i] === 255).toBe(true)
    }
  })

  it('subir el umbral recorta también los bordes tenues', () => {
    const buf = createBuffer(3, 1)
    setPixel(buf, 0, 0, [255, 0, 0, 40])
    setPixel(buf, 1, 0, [255, 0, 0, 128])
    setPixel(buf, 2, 0, [255, 0, 0, 200])

    flattenAlpha(buf, 128)

    expect(getPixel(buf, 0, 0)[3]).toBe(0)
    expect(getPixel(buf, 1, 0)[3]).toBe(0) // el umbral es inclusivo
    expect(getPixel(buf, 2, 0)).toEqual([255, 0, 0, 255])
  })
})

describe('scaleBufferBox', () => {
  it('promedia en alpha premultiplicado y no arrastra el color de lo transparente', () => {
    // Dos píxeles: uno rojo opaco y uno negro totalmente transparente. Sin
    // premultiplicar, el promedio saldría rojo oscuro; con premultiplicado, el
    // color transparente no aporta y el resultado sigue siendo rojo puro.
    const src = createBuffer(2, 1)
    setPixel(src, 0, 0, [255, 0, 0, 255])
    setPixel(src, 1, 0, [0, 0, 0, 0])

    const out = scaleBufferBox(src, 1, 1)
    const p = getPixel(out, 0, 0)
    expect(p[0]).toBe(255)
    expect(p[1]).toBe(0)
    expect(p[2]).toBe(0)
    expect(p[3]).toBe(128) // (255 + 0) / 2
  })

  it('conserva un color uniforme al reducir', () => {
    const src = createBuffer(8, 8)
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) setPixel(src, x, y, [12, 200, 90, 255])
    const out = scaleBufferBox(src, 2, 2)
    expect(getPixel(out, 0, 0)).toEqual([12, 200, 90, 255])
    expect(getPixel(out, 1, 1)).toEqual([12, 200, 90, 255])
  })
})

describe('processImage', () => {
  it('preserva la silueta de un sprite con fondo transparente', () => {
    const src = createBuffer(4, 4)
    // Un cuadrado opaco de 2×2 en el centro, con el resto transparente.
    for (const [x, y] of [
      [1, 1],
      [2, 1],
      [1, 2],
      [2, 2],
    ]) {
      setPixel(src, x, y, [0, 128, 255, 255])
    }

    const out = processImage(src, { w: 4, h: 4, alphaThreshold: 0, scaleMode: 'nearest', quantize: null })

    expect(getPixel(out, 0, 0)[3]).toBe(0)
    expect(getPixel(out, 1, 1)).toEqual([0, 128, 255, 255])
    expect(getPixel(out, 3, 3)[3]).toBe(0)
  })

  it('cuantizar reduce la cantidad de colores distintos', () => {
    const src = createBuffer(16, 16)
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) setPixel(src, x, y, [x * 16, y * 16, (x + y) * 8, 255])
    }
    const out = processImage(src, { w: 16, h: 16, alphaThreshold: 0, scaleMode: 'nearest', quantize: 4 })
    const seen = new Set<string>()
    for (let i = 0; i < out.data.length; i += 4) {
      seen.add(`${out.data[i]},${out.data[i + 1]},${out.data[i + 2]}`)
    }
    expect(seen.size).toBeLessThanOrEqual(4)
  })

  it('el tamaño de salida es exactamente el pedido', () => {
    const src = createBuffer(37, 91)
    const out = processImage(src, { w: 12, h: 20, alphaThreshold: 0, scaleMode: 'box', quantize: null })
    expect(out.w).toBe(12)
    expect(out.h).toBe(20)
  })
})

describe('suggestScaleMode', () => {
  it('promedia al reducir mucho y usa nearest cuando el cambio es leve', () => {
    expect(suggestScaleMode(1024, 1024, 64, 64)).toBe('box')
    expect(suggestScaleMode(64, 64, 32, 32)).toBe('nearest')
    expect(suggestScaleMode(16, 16, 64, 64)).toBe('nearest')
  })
})
