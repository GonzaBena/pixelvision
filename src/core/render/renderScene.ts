import type { PixelBuffer, PVElement, Scene } from '../types'
import { blitOver, createBuffer, parseColor } from '../pixels'
import { pruneRasterCache, rasterizeElement } from './rasterize'

/**
 * Compone la escena entera en un búfer del tamaño exacto del lienzo.
 *
 * Éste es el único lugar donde nace la imagen: la pantalla después sólo escala
 * este resultado con nearest-neighbour. Que el render y el export salgan del
 * mismo búfer es lo que garantiza que el PNG exportado coincida píxel a píxel
 * con lo que se ve en pantalla.
 */
export function renderScene(scene: Scene, extra?: PVElement | null): PixelBuffer {
  const { w, h, background } = scene.canvas
  const out = createBuffer(w, h)

  if (background) {
    const bg = parseColor(background)
    if (bg[3] > 0) {
      for (let i = 0; i < out.data.length; i += 4) {
        out.data[i] = bg[0]
        out.data[i + 1] = bg[1]
        out.data[i + 2] = bg[2]
        out.data[i + 3] = bg[3]
      }
    }
  }

  for (const el of scene.elements) {
    if (el.hidden) continue
    const r = rasterizeElement(el)
    blitOver(out, r.buf, r.x, r.y, el.opacity ?? 1)
  }

  // El elemento en curso (preview de la figura que se está arrastrando) se
  // dibuja arriba de todo sin entrar todavía a la escena.
  if (extra && !extra.hidden) {
    const r = rasterizeElement(extra)
    blitOver(out, r.buf, r.x, r.y, extra.opacity ?? 1)
  }

  pruneRasterCache([...scene.elements.map((e) => e.id), ...(extra ? [extra.id] : [])])
  return out
}

export function bufferToImageData(buf: PixelBuffer): ImageData {
  return new ImageData(buf.data, buf.w, buf.h)
}
