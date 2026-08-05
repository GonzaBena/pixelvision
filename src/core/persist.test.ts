import { beforeEach, describe, expect, it } from 'vitest'
import type { ImageElement, Scene } from './types'
import { createBuffer, getPixel, setPixel } from './pixels'
import { DEFAULT_TOOL_OPTIONS, createEllipse, createFreedraw, createText } from './elements'
import { clearImageSources, getImageSource, putImageSource } from './image/imageStore'
import { deserializeProject, serializeProject } from './persist'

function sampleScene(): Scene {
  const fd = createFreedraw(3, 4, 6, 5)
  setPixel(fd.buf, 0, 0, [255, 0, 0, 255])
  setPixel(fd.buf, 5, 4, [0, 128, 255, 200])

  const img: ImageElement = {
    id: 'img1',
    rev: 2,
    type: 'image',
    x: 10,
    y: 12,
    w: 8,
    h: 8,
    srcId: 'src1',
    alphaThreshold: 40,
    scaleMode: 'box',
    quantize: 8,
  }

  return {
    canvas: { w: 48, h: 32, background: '#1d2b53' },
    elements: [
      fd,
      createEllipse({ x: 1, y: 1, w: 20, h: 14 }, { ...DEFAULT_TOOL_OPTIONS, fill: '#00ff00' }),
      createText(5, 20, DEFAULT_TOOL_OPTIONS, 'Añó\nñ'),
      img,
    ],
  }
}

describe('proyecto en JSON', () => {
  beforeEach(() => {
    clearImageSources()
    const src = createBuffer(4, 4)
    setPixel(src, 1, 1, [9, 8, 7, 6])
    setPixel(src, 3, 3, [255, 255, 255, 255])
    putImageSource('src1', src)
  })

  it('el ida y vuelta conserva lienzo, elementos y píxeles', () => {
    const original = sampleScene()
    const back = deserializeProject(serializeProject(original))

    expect(back.canvas).toEqual({ w: 48, h: 32, background: '#1d2b53' })
    expect(back.elements.map((e) => e.type)).toEqual(['freedraw', 'ellipse', 'text', 'image'])

    const fd = back.elements[0]
    if (fd.type !== 'freedraw') throw new Error('se esperaba un trazo')
    expect([fd.buf.w, fd.buf.h]).toEqual([6, 5])
    expect(getPixel(fd.buf, 0, 0)).toEqual([255, 0, 0, 255])
    // El alpha parcial también tiene que sobrevivir al base64.
    expect(getPixel(fd.buf, 5, 4)).toEqual([0, 128, 255, 200])
  })

  it('conserva los parámetros de importación de la imagen', () => {
    const back = deserializeProject(serializeProject(sampleScene()))
    const img = back.elements[3]
    if (img.type !== 'image') throw new Error('se esperaba una imagen')
    expect(img.alphaThreshold).toBe(40)
    expect(img.scaleMode).toBe('box')
    expect(img.quantize).toBe(8)
  })

  it('restaura los píxeles originales de la imagen, no los procesados', () => {
    const json = serializeProject(sampleScene())
    clearImageSources()
    expect(getImageSource('src1')).toBeUndefined()

    deserializeProject(json)
    const src = getImageSource('src1')
    expect(src).toBeDefined()
    // Se guarda tal cual vino: alpha 6 sin aplanar, que es lo que permite
    // reprocesar el umbral después sin pérdida.
    expect(getPixel(src!, 1, 1)).toEqual([9, 8, 7, 6])
    expect(getPixel(src!, 3, 3)).toEqual([255, 255, 255, 255])
  })

  it('el texto con acentos sobrevive intacto', () => {
    const back = deserializeProject(serializeProject(sampleScene()))
    const t = back.elements[2]
    if (t.type !== 'text') throw new Error('se esperaba un texto')
    expect(t.text).toBe('Añó\nñ')
  })

  it('sólo persiste las imágenes que la escena usa', () => {
    putImageSource('huerfana', createBuffer(2, 2))
    const json = serializeProject(sampleScene())
    expect(json).toContain('src1')
    expect(json).not.toContain('huerfana')
  })

  it('rechaza un archivo que no es un proyecto de PixelVision', () => {
    expect(() => deserializeProject('{"format":"otra-cosa"}')).toThrow(/no es un proyecto/i)
    expect(() => deserializeProject('esto no es json')).toThrow()
  })

  it('un lienzo vacío también va y vuelve', () => {
    const empty: Scene = { canvas: { w: 16, h: 16, background: null }, elements: [] }
    const back = deserializeProject(serializeProject(empty))
    expect(back).toEqual(empty)
  })
})
