import { cloneBuffer } from './pixels'
import type { PixelBuffer } from './types'

// WeakSet de datos congelados. Se usa Uint8ClampedArray (objeto JS) como clave.
// El GC limpia automáticamente las entradas cuando los buffers se liberan.
const frozenData = new WeakSet<Uint8ClampedArray>()

/**
 * Congela el buffer: marca su data como de solo lectura lógica.
 * Llamar múltiples veces es seguro (idempotente).
 */
export function freezeBuffer(buf: PixelBuffer): void {
  frozenData.add(buf.data)
}

/**
 * Devuelve el buffer tal cual si es escribible, o una copia si está congelado.
 * Úsalo antes de cualquier mutación in-place sobre un PixelBuffer.
 */
export function ensureWritable(buf: PixelBuffer): PixelBuffer {
  if (frozenData.has(buf.data)) return cloneBuffer(buf)
  return buf
}
