import type { PixelBuffer } from '../types'

/**
 * Guarda los píxeles **originales** de cada imagen importada, sin procesar.
 *
 * Es lo que permite que el umbral de alpha, el modo de escalado y la
 * cuantización sean parámetros vivos del elemento: al cambiarlos se reprocesa
 * desde la fuente en vez de degradar un resultado ya degradado.
 */
const sources = new Map<string, PixelBuffer>()

let counter = 0

export function newSourceId(): string {
  counter += 1
  return `img_${Date.now().toString(36)}_${counter.toString(36)}`
}

export function putImageSource(id: string, buf: PixelBuffer): void {
  sources.set(id, buf)
}

export function getImageSource(id: string): PixelBuffer | undefined {
  return sources.get(id)
}

export function hasImageSource(id: string): boolean {
  return sources.has(id)
}

export function allImageSources(): Array<[string, PixelBuffer]> {
  return Array.from(sources.entries())
}

export function clearImageSources(): void {
  sources.clear()
}

/**
 * Fuentes referenciadas por una escena, para no persistir imágenes que ya no
 * están en el lienzo.
 *
 * Se filtra al serializar y nunca se borra de memoria: el historial sigue
 * guardando elementos que apuntan a estas fuentes, así que descartarlas haría
 * que deshacer el borrado de una imagen devolviera un hueco vacío.
 */
export function usedImageSources(srcIds: Iterable<string>): Array<[string, PixelBuffer]> {
  const keep = new Set(srcIds)
  return Array.from(sources.entries()).filter(([id]) => keep.has(id))
}

export async function decodeImageBlob(blob: Blob): Promise<PixelBuffer> {
  const bitmap = await createImageBitmap(blob)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('No se pudo crear el contexto 2D para decodificar la imagen')
    ctx.drawImage(bitmap, 0, 0)
    const img = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
    return { w: img.width, h: img.height, data: new Uint8ClampedArray(img.data) }
  } finally {
    bitmap.close()
  }
}
