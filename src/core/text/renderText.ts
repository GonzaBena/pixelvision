import type { PixelBuffer, RGBA, TextElement } from '../types'
import { createBuffer, parseColor, setPixel } from '../pixels'
import { BITMAP_FONTS, getGlyph } from './fonts'

export interface TextMetrics {
  w: number
  h: number
}

function splitLines(text: string): string[][] {
  return text.split('\n').map((line) => Array.from(line))
}

export function measureText(el: TextElement): TextMetrics {
  if (el.fontId === 'system') return measureSystemText(el)
  const font = BITMAP_FONTS[el.fontId] ?? BITMAP_FONTS.pv5x7
  const scale = Math.max(1, Math.floor(el.scale))
  const lines = splitLines(el.text)
  const advance = (font.w + el.letterSpacing) * scale
  const lineStep = (font.h + el.lineSpacing) * scale
  let maxChars = 0
  for (const l of lines) maxChars = Math.max(maxChars, l.length)
  const w = maxChars === 0 ? 0 : maxChars * advance - el.letterSpacing * scale
  const h = lines.length === 0 ? 0 : lines.length * lineStep - el.lineSpacing * scale
  return { w: Math.max(0, w), h: Math.max(0, h) }
}

export function renderText(el: TextElement): PixelBuffer {
  if (el.fontId === 'system') return renderSystemText(el)
  return renderBitmapText(el)
}

function renderBitmapText(el: TextElement): PixelBuffer {
  const font = BITMAP_FONTS[el.fontId] ?? BITMAP_FONTS.pv5x7
  const scale = Math.max(1, Math.floor(el.scale))
  const color = parseColor(el.color)
  const lines = splitLines(el.text)
  const { w, h } = measureText(el)
  const buf = createBuffer(w, h)
  if (buf.w === 0 || buf.h === 0) return buf

  const advance = (font.w + el.letterSpacing) * scale
  const lineStep = (font.h + el.lineSpacing) * scale

  for (let li = 0; li < lines.length; li++) {
    const chars = lines[li]
    const lineW = chars.length === 0 ? 0 : chars.length * advance - el.letterSpacing * scale
    const originX = alignOffset(el.align, w, lineW)
    const originY = li * lineStep

    for (let ci = 0; ci < chars.length; ci++) {
      const glyph = getGlyph(font, chars[ci].codePointAt(0)!)
      const gx = originX + ci * advance
      for (let y = 0; y < glyph.h; y++) {
        for (let x = 0; x < glyph.w; x++) {
          if (!glyph.data[y * glyph.w + x]) continue
          // Cada píxel del glifo se expande a un bloque sólido de scale×scale:
          // así el texto crece sin perder el borde duro.
          for (let sy = 0; sy < scale; sy++) {
            for (let sx = 0; sx < scale; sx++) {
              setPixel(buf, gx + x * scale + sx, originY + y * scale + sy, color)
            }
          }
        }
      }
    }
  }
  return buf
}

function alignOffset(align: TextElement['align'], total: number, lineW: number): number {
  if (align === 'center') return Math.floor((total - lineW) / 2)
  if (align === 'right') return total - lineW
  return 0
}

// ---------------------------------------------------------------------------
// Fuente del sistema, umbralizada a 1 bit
// ---------------------------------------------------------------------------

function systemFontSpec(el: TextElement): string {
  const size = Math.max(4, Math.round(el.systemSize))
  return `${size}px ${el.systemFamily || 'monospace'}`
}

function getScratchCtx(w: number, h: number): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, w)
  canvas.height = Math.max(1, h)
  return canvas.getContext('2d', { willReadFrequently: true })
}

function measureSystemText(el: TextElement): TextMetrics {
  const ctx = getScratchCtx(8, 8)
  if (!ctx) return { w: 0, h: 0 }
  ctx.font = systemFontSpec(el)
  const lines = el.text.split('\n')
  const size = Math.max(4, Math.round(el.systemSize))
  const lineStep = size + el.lineSpacing
  let maxW = 0
  for (const line of lines) {
    maxW = Math.max(maxW, Math.ceil(ctx.measureText(line).width))
  }
  return {
    w: Math.max(0, maxW),
    h: lines.length === 0 ? 0 : lines.length * lineStep - el.lineSpacing,
  }
}

/**
 * Dibuja con la fuente del sistema y **umbraliza el alpha a 1 bit**. Es el paso
 * que convierte un glifo antialiaseado en pixel art: sin él, el texto llegaría
 * al lienzo con bordes grises que rompen la estética y arruinan el export.
 */
function renderSystemText(el: TextElement): PixelBuffer {
  const { w, h } = measureSystemText(el)
  const buf = createBuffer(w, h)
  if (buf.w === 0 || buf.h === 0) return buf
  const ctx = getScratchCtx(w, h)
  if (!ctx) return buf

  const size = Math.max(4, Math.round(el.systemSize))
  ctx.font = systemFontSpec(el)
  ctx.textBaseline = 'top'
  ctx.fillStyle = '#ffffff'
  const lines = el.text.split('\n')
  const lineStep = size + el.lineSpacing
  for (let i = 0; i < lines.length; i++) {
    const lineW = Math.ceil(ctx.measureText(lines[i]).width)
    ctx.fillText(lines[i], alignOffset(el.align, w, lineW), i * lineStep)
  }

  const src = ctx.getImageData(0, 0, w, h)
  const color: RGBA = parseColor(el.color)
  const threshold = Math.max(0, Math.min(255, el.systemThreshold))
  for (let i = 0; i < src.data.length; i += 4) {
    if (src.data[i + 3] <= threshold) continue
    buf.data[i] = color[0]
    buf.data[i + 1] = color[1]
    buf.data[i + 2] = color[2]
    buf.data[i + 3] = color[3]
  }
  return buf
}
