import type { Scene } from './types'
import { renderScene } from './render/renderScene'

/**
 * Exporta el lienzo a PNG.
 *
 * Sale del mismo búfer que dibuja la pantalla, así que a escala 1× el archivo
 * coincide píxel a píxel con lo que se ve. El escalado usa nearest-neighbour con
 * el suavizado apagado: cualquier interpolación metería colores que el artista
 * nunca eligió.
 */
export async function exportPNG(scene: Scene, scale = 1): Promise<Blob> {
  const buf = renderScene(scene)
  const src = document.createElement('canvas')
  src.width = buf.w
  src.height = buf.h
  const sctx = src.getContext('2d')
  if (!sctx) throw new Error('No se pudo crear el contexto 2D para exportar')
  sctx.putImageData(new ImageData(buf.data, buf.w, buf.h), 0, 0)

  const k = Math.max(1, Math.floor(scale))
  if (k === 1) return canvasToBlob(src)

  const out = document.createElement('canvas')
  out.width = buf.w * k
  out.height = buf.h * k
  const octx = out.getContext('2d')
  if (!octx) throw new Error('No se pudo crear el contexto 2D para escalar')
  octx.imageSmoothingEnabled = false
  octx.drawImage(src, 0, 0, out.width, out.height)
  return canvasToBlob(out)
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b)
      else reject(new Error('El navegador no pudo generar el PNG'))
    }, 'image/png')
  })
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Se libera en el siguiente tick para no cortar la descarga en Firefox.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
