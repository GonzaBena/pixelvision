/**
 * Modelo de datos de PixelVision.
 *
 * El editor es "retenido": cada cosa dibujada queda como objeto editable (mover,
 * redimensionar, recolorear). Pero el único renderer es un rasterizador de enteros,
 * así que todo termina en una grilla de píxeles exacta, sin antialiasing.
 */

/**
 * Bloque RGBA de w*h*4 bytes, sin premultiplicar.
 *
 * El búfer se fija a `ArrayBuffer` (y no al `ArrayBufferLike` por defecto)
 * porque el constructor de `ImageData` rechaza los respaldados por
 * `SharedArrayBuffer`, y este búfer va derecho a la pantalla y al PNG.
 */
export interface PixelBuffer {
  w: number
  h: number
  data: Uint8ClampedArray<ArrayBuffer>
}

/** Máscara de cobertura: 1 = dentro de la figura, 0 = fuera. */
export interface Mask {
  w: number
  h: number
  data: Uint8Array
}

export type RGBA = [number, number, number, number]

export type PolyVariant = 'triangle' | 'diamond' | 'star' | 'hexagon'
export type ScaleMode = 'nearest' | 'box'
export type BrushShape = 'square' | 'circle'
export type TextAlign = 'left' | 'center' | 'right'
export type FontId = 'pv5x7' | 'pv3x5' | 'system'

/** Cuartos de vuelta en sentido horario. */
export type Rotation = 0 | 1 | 2 | 3

interface BaseElement {
  id: string
  /**
   * Se incrementa en cada mutación del contenido. El caché de rasterizado usa
   * (id, rev) como clave, así los trazos en vivo pueden mutar el búfer en el
   * lugar sin clonarlo en cada pointermove.
   */
  rev: number
  /** Esquina superior izquierda en coordenadas de píxel del lienzo. Siempre entera. */
  x: number
  y: number
  hidden?: boolean
  locked?: boolean
  name?: string
  /** Se aplican al búfer ya rasterizado, así valen igual para toda figura. */
  flipX?: boolean
  flipY?: boolean
  rot?: Rotation
  /** 0..1, multiplica el alpha del elemento al componer. */
  opacity?: number
}

export interface FreedrawElement extends BaseElement {
  type: 'freedraw'
  buf: PixelBuffer
}

export interface RectElement extends BaseElement {
  type: 'rect'
  w: number
  h: number
  stroke: string | null
  fill: string | null
  strokeWidth: number
  radius: number
}

export interface EllipseElement extends BaseElement {
  type: 'ellipse'
  w: number
  h: number
  stroke: string | null
  fill: string | null
  strokeWidth: number
}

export interface LineElement extends BaseElement {
  type: 'line'
  /** Punto final relativo a (x, y), así mover el elemento es sólo tocar x/y. */
  dx: number
  dy: number
  stroke: string
  strokeWidth: number
  brushShape: BrushShape
  /** Punta de flecha en el extremo final. */
  arrow?: boolean
}

export interface PolyElement extends BaseElement {
  type: 'poly'
  variant: PolyVariant
  w: number
  h: number
  stroke: string | null
  fill: string | null
  strokeWidth: number
}

export interface TextElement extends BaseElement {
  type: 'text'
  text: string
  fontId: FontId
  /** Escala entera de la fuente bitmap: 1 = tamaño nativo. */
  scale: number
  color: string
  letterSpacing: number
  lineSpacing: number
  align: TextAlign
  /** Sólo para fontId === 'system'. */
  systemFamily: string
  systemSize: number
  systemThreshold: number
}

export interface ImageElement extends BaseElement {
  type: 'image'
  w: number
  h: number
  /** Clave en el store de imágenes originales; permite reprocesar sin pérdida. */
  srcId: string
  /**
   * Regla de transparencia: alpha <= umbral => el píxel no se pinta;
   * alpha > umbral => se conserva el RGB y se fuerza alpha a 255.
   * Con el default 0, sólo los píxeles totalmente transparentes se descartan
   * y todo lo demás queda 100% opaco.
   */
  alphaThreshold: number
  scaleMode: ScaleMode
  /** Cantidad de colores para median-cut, o null para no cuantizar. */
  quantize: number | null
}

export type PVElement =
  | FreedrawElement
  | RectElement
  | EllipseElement
  | LineElement
  | PolyElement
  | TextElement
  | ImageElement

/** Elementos con caja delimitadora explícita y redimensionable. */
export type BoxElement = RectElement | EllipseElement | PolyElement | ImageElement

export function isBoxElement(el: PVElement): el is BoxElement {
  return el.type === 'rect' || el.type === 'ellipse' || el.type === 'poly' || el.type === 'image'
}

export function hasStrokeFill(
  el: PVElement,
): el is RectElement | EllipseElement | PolyElement {
  return el.type === 'rect' || el.type === 'ellipse' || el.type === 'poly'
}

export interface CanvasConfig {
  w: number
  h: number
  /** Color de fondo del lienzo, o null para transparente (damero). */
  background: string | null
}

export interface Scene {
  canvas: CanvasConfig
  /** El orden del array es el z-order: el último se dibuja arriba. */
  elements: PVElement[]
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}
