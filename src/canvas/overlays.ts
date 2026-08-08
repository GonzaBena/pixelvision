import type { BrushShape, Rect } from '../core/types'
import { parseColor } from '../core/pixels'
import { brushStamp, stampOffset } from '../core/raster/brush'
import type { ViewTransform } from './viewport'

const CHECKER_SIZE = 8

/** Opacidad de la preview del pincel: suficiente para juzgar el color, sin pasar por pintado. */
const PREVIEW_ALPHA = 0.7

/** Damero de transparencia, en el espacio del dispositivo para que no vibre al hacer zoom. */
export function drawCheckerboard(
  ctx: CanvasRenderingContext2D,
  t: ViewTransform,
  canvasW: number,
  canvasH: number,
): void {
  const w = canvasW * t.scale
  const h = canvasH * t.scale
  ctx.save()
  ctx.beginPath()
  ctx.rect(t.ox, t.oy, w, h)
  ctx.clip()
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(t.ox, t.oy, w, h)
  ctx.fillStyle = '#d9dbe0'
  const cols = Math.ceil(w / CHECKER_SIZE)
  const rows = Math.ceil(h / CHECKER_SIZE)
  for (let r = 0; r < rows; r++) {
    for (let c = r % 2; c < cols; c += 2) {
      ctx.fillRect(t.ox + c * CHECKER_SIZE, t.oy + r * CHECKER_SIZE, CHECKER_SIZE, CHECKER_SIZE)
    }
  }
  ctx.restore()
}

export function drawCanvasBorder(
  ctx: CanvasRenderingContext2D,
  t: ViewTransform,
  canvasW: number,
  canvasH: number,
): void {
  ctx.save()
  ctx.strokeStyle = 'rgba(120,130,150,0.9)'
  ctx.lineWidth = Math.max(1, Math.round(t.dpr))
  ctx.strokeRect(
    t.ox - ctx.lineWidth / 2,
    t.oy - ctx.lineWidth / 2,
    canvasW * t.scale + ctx.lineWidth,
    canvasH * t.scale + ctx.lineWidth,
  )
  ctx.restore()
}

/**
 * Grilla de píxeles y grilla de tiles.
 *
 * La de píxeles sólo aparece a partir de 8 device px por píxel: por debajo, las
 * líneas ocuparían tanto como el contenido y taparían el dibujo.
 */
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  t: ViewTransform,
  canvasW: number,
  canvasH: number,
  tileSize: number,
): void {
  const w = canvasW * t.scale
  const h = canvasH * t.scale
  const lw = Math.max(1, Math.round(t.dpr))

  if (t.scale >= 8) {
    ctx.save()
    ctx.strokeStyle = 'rgba(0,0,0,0.13)'
    ctx.lineWidth = lw
    ctx.beginPath()
    for (let x = 1; x < canvasW; x++) {
      const px = t.ox + x * t.scale + lw / 2
      ctx.moveTo(px, t.oy)
      ctx.lineTo(px, t.oy + h)
    }
    for (let y = 1; y < canvasH; y++) {
      const py = t.oy + y * t.scale + lw / 2
      ctx.moveTo(t.ox, py)
      ctx.lineTo(t.ox + w, py)
    }
    ctx.stroke()
    ctx.restore()
  }

  if (tileSize > 0 && t.scale * tileSize >= 8) {
    ctx.save()
    ctx.strokeStyle = 'rgba(35,90,190,0.55)'
    ctx.lineWidth = lw
    ctx.beginPath()
    for (let x = tileSize; x < canvasW; x += tileSize) {
      const px = t.ox + x * t.scale + lw / 2
      ctx.moveTo(px, t.oy)
      ctx.lineTo(px, t.oy + h)
    }
    for (let y = tileSize; y < canvasH; y += tileSize) {
      const py = t.oy + y * t.scale + lw / 2
      ctx.moveTo(t.ox, py)
      ctx.lineTo(t.ox + w, py)
    }
    ctx.stroke()
    ctx.restore()
  }
}

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export const HANDLE_IDS: HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

/** Centro de cada handle, en píxeles de dispositivo. */
export function handlePositions(
  t: ViewTransform,
  b: Rect,
): Record<HandleId, { x: number; y: number }> {
  const x0 = t.ox + b.x * t.scale
  const y0 = t.oy + b.y * t.scale
  const x1 = x0 + b.w * t.scale
  const y1 = y0 + b.h * t.scale
  const mx = (x0 + x1) / 2
  const my = (y0 + y1) / 2
  return {
    nw: { x: x0, y: y0 },
    n: { x: mx, y: y0 },
    ne: { x: x1, y: y0 },
    e: { x: x1, y: my },
    se: { x: x1, y: y1 },
    s: { x: mx, y: y1 },
    sw: { x: x0, y: y1 },
    w: { x: x0, y: my },
  }
}

export function handleRadius(t: ViewTransform): number {
  return 5 * t.dpr
}

export function drawSelection(
  ctx: CanvasRenderingContext2D,
  t: ViewTransform,
  b: Rect,
  withHandles: boolean,
): void {
  const lw = Math.max(1, Math.round(t.dpr))
  ctx.save()
  ctx.strokeStyle = '#6965db'
  ctx.lineWidth = lw
  ctx.setLineDash([4 * t.dpr, 3 * t.dpr])
  ctx.strokeRect(
    t.ox + b.x * t.scale - lw / 2,
    t.oy + b.y * t.scale - lw / 2,
    b.w * t.scale + lw,
    b.h * t.scale + lw,
  )
  ctx.setLineDash([])

  if (withHandles) {
    const r = handleRadius(t)
    const pos = handlePositions(t, b)
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = '#6965db'
    ctx.lineWidth = Math.max(1, 1.5 * t.dpr)
    for (const id of HANDLE_IDS) {
      const p = pos[id]
      ctx.beginPath()
      ctx.rect(p.x - r / 2, p.y - r / 2, r, r)
      ctx.fill()
      ctx.stroke()
    }
  }
  ctx.restore()
}

export function drawMarquee(ctx: CanvasRenderingContext2D, t: ViewTransform, b: Rect): void {
  ctx.save()
  ctx.fillStyle = 'rgba(105,101,219,0.12)'
  ctx.strokeStyle = 'rgba(105,101,219,0.9)'
  ctx.lineWidth = Math.max(1, Math.round(t.dpr))
  ctx.fillRect(t.ox + b.x * t.scale, t.oy + b.y * t.scale, b.w * t.scale, b.h * t.scale)
  ctx.strokeRect(t.ox + b.x * t.scale, t.oy + b.y * t.scale, b.w * t.scale, b.h * t.scale)
  ctx.restore()
}

/**
 * Contorno del sello del pincel bajo el cursor.
 *
 * Muestra exactamente qué píxeles se van a pintar, que no es obvio con tamaños
 * pares (el sello no queda centrado en el píxel del cursor) ni con el sello
 * redondo.
 */
export function drawBrushCursor(
  ctx: CanvasRenderingContext2D,
  t: ViewTransform,
  px: number,
  py: number,
  size: number,
  shape: BrushShape,
  previewColor?: string | null,
): void {
  const m = brushStamp(size, shape)
  const off = stampOffset(size)
  const ox = px - off
  const oy = py - off

  // Relleno de previsualización: muestra el color que va a quedar, en los
  // píxeles exactos que va a ocupar. Va por debajo del contorno y con algo de
  // transparencia, para que se lea como "todavía no pintado".
  if (previewColor) {
    const c = parseColor(previewColor)
    if (c[3] > 0) {
      ctx.save()
      ctx.globalAlpha = PREVIEW_ALPHA
      ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`
      for (let y = 0; y < m.h; y++) {
        for (let x = 0; x < m.w; x++) {
          if (!m.data[y * m.w + x]) continue
          ctx.fillRect(t.ox + (ox + x) * t.scale, t.oy + (oy + y) * t.scale, t.scale, t.scale)
        }
      }
      ctx.restore()
    }
  }

  // Sólo se traza el borde exterior del sello: cada arista que da a un píxel
  // apagado (o al exterior de la máscara).
  const path = new Path2D()
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      if (!m.data[y * m.w + x]) continue
      const sx = t.ox + (ox + x) * t.scale
      const sy = t.oy + (oy + y) * t.scale
      const on = (dx: number, dy: number) => {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) return false
        return !!m.data[ny * m.w + nx]
      }
      if (!on(0, -1)) {
        path.moveTo(sx, sy)
        path.lineTo(sx + t.scale, sy)
      }
      if (!on(0, 1)) {
        path.moveTo(sx, sy + t.scale)
        path.lineTo(sx + t.scale, sy + t.scale)
      }
      if (!on(-1, 0)) {
        path.moveTo(sx, sy)
        path.lineTo(sx, sy + t.scale)
      }
      if (!on(1, 0)) {
        path.moveTo(sx + t.scale, sy)
        path.lineTo(sx + t.scale, sy + t.scale)
      }
    }
  }

  // Halo claro y encima línea oscura: el contorno tiene que leerse igual sobre
  // el damero, sobre un fondo negro y sobre el propio color de la preview.
  const lw = Math.max(1, Math.round(t.dpr))
  ctx.save()
  ctx.lineWidth = lw * 3
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'
  ctx.stroke(path)
  ctx.lineWidth = lw
  ctx.strokeStyle = 'rgba(0,0,0,0.9)'
  ctx.stroke(path)
  ctx.restore()
}

export function drawMeasureOverlay(
  ctx: CanvasRenderingContext2D,
  t: ViewTransform,
  pts: { sx: number; sy: number; ex: number; ey: number }
): void {
  const { sx, sy, ex, ey } = pts
  const dpr = t.dpr
  const lw = Math.max(1, Math.round(dpr))
  
  // Transform coordinates to screen pixels (center of pixel)
  const startX = t.ox + sx * t.scale + t.scale / 2
  const startY = t.oy + sy * t.scale + t.scale / 2
  const endX = t.ox + ex * t.scale + t.scale / 2
  const endY = t.oy + ey * t.scale + t.scale / 2
  
  const dx = ex - sx
  const dy = ey - sy
  const dist = Math.hypot(dx, dy)
  
  ctx.save()
  
  // 1. Dotted helper lines for X and Y components
  ctx.strokeStyle = 'rgba(236, 72, 153, 0.45)' // Pink with transparency
  ctx.lineWidth = lw
  ctx.setLineDash([4 * dpr, 3 * dpr])
  
  if (dx !== 0) {
    ctx.beginPath()
    ctx.moveTo(startX, startY)
    ctx.lineTo(endX, startY)
    ctx.stroke()
  }
  
  if (dy !== 0) {
    ctx.beginPath()
    ctx.moveTo(endX, startY)
    ctx.lineTo(endX, endY)
    ctx.stroke()
  }
  
  ctx.setLineDash([])
  
  // 2. Direct distance diagonal line
  ctx.strokeStyle = '#ec4899' // Solid pink
  ctx.lineWidth = Math.max(2, 2 * dpr)
  ctx.beginPath()
  ctx.moveTo(startX, startY)
  ctx.lineTo(endX, endY)
  ctx.stroke()
  
  // 3. Extent marker points
  ctx.fillStyle = '#ec4899'
  ctx.beginPath()
  ctx.arc(startX, startY, 4 * dpr, 0, Math.PI * 2)
  ctx.fill()
  
  ctx.fillStyle = '#ffffff'
  ctx.strokeStyle = '#ec4899'
  ctx.lineWidth = lw * 1.5
  ctx.beginPath()
  ctx.arc(endX, endY, 5 * dpr, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  
  // 4. Draw labels
  ctx.font = `${Math.max(10, Math.round(11 * dpr))}px system-ui, sans-serif`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  
  const drawLabel = (text: string, tx: number, ty: number) => {
    const textWidth = ctx.measureText(text).width
    const paddingX = 6 * dpr
    const paddingY = 4 * dpr
    const rectW = textWidth + paddingX * 2
    const rectH = Math.max(10, Math.round(11 * dpr)) + paddingY * 2
    const rx = tx - rectW / 2
    const ry = ty - rectH / 2
    
    // Draw bubble
    ctx.fillStyle = 'rgba(30, 30, 40, 0.85)'
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'
    ctx.lineWidth = lw
    ctx.beginPath()
    if (ctx.roundRect) {
      ctx.roundRect(rx, ry, rectW, rectH, 4 * dpr)
    } else {
      ctx.rect(rx, ry, rectW, rectH)
    }
    ctx.fill()
    ctx.stroke()
    
    // Draw text inside bubble
    ctx.fillStyle = '#ffffff'
    ctx.fillText(text, tx, ty)
  }
  
  // DX label (horizontal center)
  if (dx !== 0) {
    const labelX = (startX + endX) / 2
    const labelY = startY + (dy >= 0 ? -12 * dpr : 12 * dpr)
    drawLabel(`ΔX: ${Math.abs(dx)} px`, labelX, labelY)
  }
  
  // DY label (vertical center)
  if (dy !== 0) {
    const labelX = endX + (dx >= 0 ? 34 * dpr : -34 * dpr)
    const labelY = (startY + endY) / 2
    drawLabel(`ΔY: ${Math.abs(dy)} px`, labelX, labelY)
  }
  
  // Diagonal distance label (D)
  if (dist > 0 && dx !== 0 && dy !== 0) {
    const labelX = (startX + endX) / 2
    const labelY = (startY + endY) / 2
    const angle = Math.atan2(dy, dx)
    const perpAngle = angle + Math.PI / 2
    const offsetDist = 18 * dpr
    const shiftedX = labelX + Math.cos(perpAngle) * offsetDist
    const shiftedY = labelY + Math.sin(perpAngle) * offsetDist
    drawLabel(`D: ${dist.toFixed(1)} px`, shiftedX, shiftedY)
  } else if (dist > 0) {
    // Purely horizontal or vertical distance
    const labelX = (startX + endX) / 2
    const labelY = (startY + endY) / 2
    const offset = dx !== 0 ? (dy >= 0 ? -12 * dpr : 12 * dpr) : (dx >= 0 ? 34 * dpr : -34 * dpr)
    drawLabel(`D: ${dist.toFixed(1)} px`, labelX + (dx !== 0 ? 0 : offset), labelY + (dy !== 0 ? 0 : offset))
  }
  
  ctx.restore()
}
