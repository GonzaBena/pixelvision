import { useCallback, useEffect, useRef, useState } from 'react'
import type { FreedrawElement, ImageElement, PixelBuffer, PVElement, Rect } from '../core/types'
import { bufferBounds, cloneBuffer, createBuffer, cropBuffer, expandBuffer, parseColor, rgbaToHex } from '../core/pixels'
import { ensureWritable } from '../core/cow'
import { renderScene } from '../core/render/renderScene'
import { hitTestWithSlop } from '../core/render/hitTest'
import { elementBounds, elementsInRect, unionBounds } from '../core/render/hitTest'
import { stampAt, stampOffset } from '../core/raster/brush'
import { strokeLine } from '../core/raster/line'
import {
  createEllipse,
  createFreedraw,
  createLine,
  createPoly,
  createRect,
  createText,
  flattenElement,
  freedrawFromMask,
  newId,
  normalizeRect,
} from '../core/elements'
import { scaleWithin, scaleSelectionUniformly } from '../core/transforms'
import { decodeImageBlob, newSourceId, putImageSource } from '../core/image/imageStore'
import { suggestScaleMode } from '../core/image/processImage'
import { selectionBounds, useEditor, type EditorState } from '../state/store'
import { ContextMenu } from '../ui/ContextMenu'
import { MoveModal, ScaleModal } from '../ui/ContextMenuModals'
import {
  computeTransform,
  fitToView,
  screenToPixel,
  zoomAt,
  type ViewTransform,
} from './viewport'
import {
  drawBrushCursor,
  drawCanvasBorder,
  drawCheckerboard,
  drawGrid,
  drawMarquee,
  drawSelection,
  handlePositions,
  handleRadius,
  HANDLE_IDS,
  type HandleId,
} from './overlays'
import { TextOverlay } from './TextOverlay'

type Interaction =
  | { kind: 'none' }
  | { kind: 'pan'; pointerId: number; cssX: number; cssY: number; panX: number; panY: number }
  | {
      kind: 'paint'
      pointerId: number
      id: string
      sx: number
      sy: number
      lastX: number
      lastY: number
      erase: boolean
      startTime: number
      moveCount: number
      pushedHistory: boolean
      baseBuf: PixelBuffer
      baseX: number
      baseY: number
      shiftActive: boolean
    }
  | { kind: 'eraseObjects'; pointerId: number; startTime: number; moveCount: number; pushedHistory: boolean }
  | { kind: 'shape'; pointerId: number; sx: number; sy: number; startTime: number; pushedHistory: boolean }
  | {
      kind: 'move'
      pointerId: number
      orig: Array<{ id: string; x: number; y: number }>
      sx: number
      sy: number
      startTime: number
      pushedHistory: boolean
    }
  | {
      kind: 'resize'
      pointerId: number
      handle: HandleId
      from: Rect
      orig: PVElement[]
      startTime: number
      pushedHistory: boolean
    }
  | { kind: 'marquee'; pointerId: number; sx: number; sy: number }

const SHAPE_TOOLS = new Set(['rect', 'ellipse', 'triangle', 'diamond', 'star', 'hexagon'])
const LINE_TOOLS = new Set(['line', 'arrow'])

function copyBufferInto(dst: PixelBuffer, src: PixelBuffer, ox: number, oy: number): void {
  const x0 = Math.max(0, -ox)
  const y0 = Math.max(0, -oy)
  const x1 = Math.min(src.w, dst.w - ox)
  const y1 = Math.min(src.h, dst.h - oy)
  for (let y = y0; y < y1; y++) {
    let si = (y * src.w + x0) * 4
    let di = ((y + oy) * dst.w + (x0 + ox)) * 4
    for (let x = x0; x < x1; x++, si += 4, di += 4) {
      dst.data[di] = src.data[si]
      dst.data[di + 1] = src.data[si + 1]
      dst.data[di + 2] = src.data[si + 2]
      dst.data[di + 3] = src.data[si + 3]
    }
  }
}

export function CanvasStage() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const baseRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const offscreenRef = useRef<HTMLCanvasElement | null>(null)

  const interaction = useRef<Interaction>({ kind: 'none' })
  const cursorPx = useRef<{ x: number; y: number } | null>(null)
  const marquee = useRef<Rect | null>(null)
  const spaceDown = useRef(false)
  /** Grupo de trazos activo: los trazos seguidos con las mismas opciones se acumulan en un elemento. */
  const strokeGroup = useRef<{ id: string; key: string } | null>(null)
  const dprRef = useRef(1)

  /** Punteros táctiles activos para soporte de gestos multitáctiles. */
  const activePointers = useRef<Map<number, { x: number; y: number }>>(new Map())
  const isMultiTouchGesture = useRef(false)
  const pinchState = useRef<{
    dist: number
    centerCss: { x: number; y: number }
    zoom: number
    panX: number
    panY: number
  } | null>(null)

  const [size, setSize] = useState({ w: 0, h: 0 })
  const [cursorLabel, setCursorLabel] = useState('default')
  const [dropping, setDropping] = useState(false)
  const [loadingImage, setLoadingImage] = useState(false)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; visible: boolean }>({
    x: 0,
    y: 0,
    visible: false,
  })
  const [isMoveOpen, setIsMoveOpen] = useState(false)
  const [isScaleOpen, setIsScaleOpen] = useState(false)

  const requestDraw = useRef<() => void>(() => {})
  const requestOverlayRedraw = useRef<() => void>(() => {})

  const bucketWorkerRef = useRef<Worker | null>(null)
  const cachedComposite = useRef<{ version: number; w: number; h: number; imageData: ImageData } | null>(null)
  useEffect(() => {
    return () => {
      if (bucketWorkerRef.current) {
        bucketWorkerRef.current.terminate()
      }
    }
  }, [])

  // --- Medición del stage -----------------------------------------------------
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const ro = new ResizeObserver(() => {
      const r = wrap.getBoundingClientRect()
      setSize({ w: r.width, h: r.height })
    })
    ro.observe(wrap)
    const r = wrap.getBoundingClientRect()
    setSize({ w: r.width, h: r.height })
    return () => ro.disconnect()
  }, [])

  // Encuadre inicial una vez que se conoce el tamaño del stage.
  const didFit = useRef(false)
  useEffect(() => {
    if (didFit.current || size.w === 0 || size.h === 0) return
    didFit.current = true
    const st = useEditor.getState()
    useEditor.setState({ viewport: fitToView(st.scene.canvas.w, st.scene.canvas.h, size.w, size.h) })
  }, [size])

  // Prevenir zoom nativo del navegador en dispositivos móviles durante gestos multitáctiles
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return

    const preventDefaultMultiTouch = (e: TouchEvent) => {
      if (e.touches.length >= 2 && e.cancelable) {
        e.preventDefault()
      }
    }

    const preventGesture = (e: Event) => {
      if (e.cancelable) e.preventDefault()
    }

    wrap.addEventListener('touchstart', preventDefaultMultiTouch, { passive: false })
    wrap.addEventListener('touchmove', preventDefaultMultiTouch, { passive: false })
    wrap.addEventListener('gesturestart', preventGesture, { passive: false })
    wrap.addEventListener('gesturechange', preventGesture, { passive: false })
    wrap.addEventListener('gestureend', preventGesture, { passive: false })

    return () => {
      wrap.removeEventListener('touchstart', preventDefaultMultiTouch)
      wrap.removeEventListener('touchmove', preventDefaultMultiTouch)
      wrap.removeEventListener('gesturestart', preventGesture)
      wrap.removeEventListener('gesturechange', preventGesture)
      wrap.removeEventListener('gestureend', preventGesture)
    }
  }, [])

  // --- Bucle de dibujo --------------------------------------------------------

  const drawBase = useCallback(() => {
    const base = baseRef.current
    const wrap = wrapRef.current
    if (!base || !wrap) return

    const dpr = window.devicePixelRatio || 1
    dprRef.current = dpr
    const pxW = Math.max(1, Math.round(size.w * dpr))
    const pxH = Math.max(1, Math.round(size.h * dpr))
    if (base.width !== pxW || base.height !== pxH) {
      base.width = pxW
      base.height = pxH
    }

    const st = useEditor.getState()
    const t = computeTransform(st.viewport, dpr)
    const cw = st.scene.canvas.w
    const ch = st.scene.canvas.h

    const bctx = base.getContext('2d')
    if (!bctx) return
    bctx.setTransform(1, 0, 0, 1, 0, 0)
    bctx.clearRect(0, 0, pxW, pxH)
    bctx.imageSmoothingEnabled = false
    drawCheckerboard(bctx, t, cw, ch)

    if (!offscreenRef.current) offscreenRef.current = document.createElement('canvas')
    const off = offscreenRef.current
    if (off.width !== cw || off.height !== ch) {
      off.width = cw
      off.height = ch
    }

    const octx = off.getContext('2d')
    if (octx) {
      const cache = cachedComposite.current
      if (!cache || cache.version !== st.version || cache.w !== cw || cache.h !== ch) {
        const buf = renderScene(st.scene, st.draft)
        cachedComposite.current = {
          version: st.version,
          w: cw,
          h: ch,
          imageData: new ImageData(buf.data, cw, ch),
        }
      }
      octx.putImageData(cachedComposite.current!.imageData, 0, 0)
      bctx.drawImage(off, 0, 0, cw, ch, t.ox, t.oy, cw * t.scale, ch * t.scale)
    }
    drawCanvasBorder(bctx, t, cw, ch)
  }, [size])

  const drawOverlay = useCallback(() => {
    const overlay = overlayRef.current
    const wrap = wrapRef.current
    if (!overlay || !wrap) return

    const dpr = window.devicePixelRatio || 1
    const pxW = Math.max(1, Math.round(size.w * dpr))
    const pxH = Math.max(1, Math.round(size.h * dpr))
    if (overlay.width !== pxW || overlay.height !== pxH) {
      overlay.width = pxW
      overlay.height = pxH
    }

    const st = useEditor.getState()
    const t = computeTransform(st.viewport, dpr)
    const cw = st.scene.canvas.w
    const ch = st.scene.canvas.h

    const octx2 = overlay.getContext('2d')
    if (!octx2) return
    octx2.setTransform(1, 0, 0, 1, 0, 0)
    octx2.clearRect(0, 0, pxW, pxH)
    if (st.showGrid) drawGrid(octx2, t, cw, ch, st.showTileGrid)

    const bounds = selectionBounds(st)
    if (bounds && st.tool === 'select') drawSelection(octx2, t, bounds, true)
    if (st.selection.length > 1 && st.keyObjectId && st.tool === 'select') {
      const keyEl = st.scene.elements.find((e) => e.id === st.keyObjectId)
      if (keyEl) {
        const keyBounds = elementBounds(keyEl)
        octx2.save()
        octx2.strokeStyle = '#6965db'
        octx2.lineWidth = Math.max(2, Math.round(t.dpr * 2))
        octx2.strokeRect(
          t.ox + keyBounds.x * t.scale - octx2.lineWidth / 2,
          t.oy + keyBounds.y * t.scale - octx2.lineWidth / 2,
          keyBounds.w * t.scale + octx2.lineWidth,
          keyBounds.h * t.scale + octx2.lineWidth,
        )
        octx2.restore()
      }
    }
    if (marquee.current) drawMarquee(octx2, t, marquee.current)

    const c = cursorPx.current
    const showCursor =
      c && c.x >= 0 && c.y >= 0 && c.x < cw && c.y < ch && interaction.current.kind !== 'pan'
    if (showCursor && (st.tool === 'brush' || st.tool === 'eraser')) {
      const preview =
        st.tool === 'brush' && interaction.current.kind !== 'paint' ? st.options.stroke : null
      drawBrushCursor(octx2, t, c.x, c.y, st.options.brushSize, st.options.brushShape, preview)
    }
  }, [size])

  useEffect(() => {
    let raf = 0
    const redrawFlags = { base: false, overlay: false }

    const flush = () => {
      raf = 0
      if (redrawFlags.base) {
        drawBase()
        drawOverlay()
        redrawFlags.base = false
        redrawFlags.overlay = false
      } else if (redrawFlags.overlay) {
        drawOverlay()
        redrawFlags.overlay = false
      }
    }

    const scheduleBase = () => {
      redrawFlags.base = true
      if (!raf) raf = requestAnimationFrame(flush)
    }
    const scheduleOverlay = () => {
      redrawFlags.overlay = true
      if (!raf) raf = requestAnimationFrame(flush)
    }

    requestDraw.current = scheduleBase
    requestOverlayRedraw.current = scheduleOverlay

    const unsub = useEditor.subscribe((state, prevState) => {
      const baseChanged =
        state.version !== prevState.version ||
        state.draft !== prevState.draft ||
        state.viewport !== prevState.viewport ||
        state.scene.canvas.w !== prevState.scene.canvas.w ||
        state.scene.canvas.h !== prevState.scene.canvas.h ||
        state.scene.canvas.background !== prevState.scene.canvas.background

      const overlayChanged =
        state.showGrid !== prevState.showGrid ||
        state.showTileGrid !== prevState.showTileGrid ||
        state.selection !== prevState.selection ||
        state.tool !== prevState.tool ||
        state.options.brushSize !== prevState.options.brushSize ||
        state.options.brushShape !== prevState.options.brushShape

      if (baseChanged) {
        scheduleBase()
      } else if (overlayChanged) {
        scheduleOverlay()
      }
    })

    scheduleBase()
    const onDpr = () => scheduleBase()
    window.addEventListener('resize', onDpr)
    return () => {
      unsub()
      window.removeEventListener('resize', onDpr)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [drawBase, drawOverlay])

  // --- Utilidades de coordenadas ---------------------------------------------
  const getTransform = (): ViewTransform =>
    computeTransform(useEditor.getState().viewport, dprRef.current)

  const localCss = (e: { clientX: number; clientY: number }) => {
    const r = wrapRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const toPixel = (e: { clientX: number; clientY: number }) => {
    const css = localCss(e)
    return screenToPixel(getTransform(), css.x, css.y)
  }

  /**
   * Cuando growToFit corre el origen del lienzo (creció hacia arriba o hacia la
   * izquierda), todo lo que la interacción en curso tenía cacheado en
   * coordenadas de píxel queda desfasado un frame. Sin este ajuste, un trazo o
   * arrastre que dispara el crecimiento pega un salto visible.
   */
  const shiftDrag = (dx: number, dy: number, p: { x: number; y: number }) => {
    if (!dx && !dy) return
    p.x += dx
    p.y += dy
    const it = interaction.current
    switch (it.kind) {
      case 'paint':
        it.sx += dx
        it.sy += dy
        it.lastX += dx
        it.lastY += dy
        it.baseX += dx
        it.baseY += dy
        break
      case 'shape':
      case 'marquee':
        it.sx += dx
        it.sy += dy
        break
      case 'move':
        it.sx += dx
        it.sy += dy
        for (const o of it.orig) {
          o.x += dx
          o.y += dy
        }
        break
      case 'resize':
        it.from = { x: it.from.x + dx, y: it.from.y + dy, w: it.from.w, h: it.from.h }
        for (const o of it.orig) {
          o.x += dx
          o.y += dy
        }
        break
    }
    if (marquee.current) {
      marquee.current = { ...marquee.current, x: marquee.current.x + dx, y: marquee.current.y + dy }
    }
  }

  // --- Herramientas -----------------------------------------------------------

  /** Devuelve el elemento de trazo donde acumular, creando uno si hace falta. */
  const strokeTarget = (st: EditorState): FreedrawElement => {
    const o = st.options
    const key = `${o.stroke}|${o.brushSize}|${o.brushShape}|${o.opacity}`
    if (strokeGroup.current?.key === key) {
      const existing = st.scene.elements.find((e) => e.id === strokeGroup.current!.id)
      if (existing && existing.type === 'freedraw') return existing
    }
    // Arranca vacío: ensureFreedrawCovers lo va agrandando a medida que el
    // trazo lo necesita, así una firma chica no reserva un búfer del lienzo
    // entero y un trazo que se va de los bordes tampoco queda recortado.
    const fd = createFreedraw(0, 0, 0, 0)
    fd.opacity = o.opacity
    st.addElement(fd)
    strokeGroup.current = { id: fd.id, key }
    
    const actual = useEditor.getState().scene.elements.find((e) => e.id === fd.id)
    if (actual && actual.type === 'freedraw') return actual
    return fd
  }

  /** Agranda el búfer de un trazo libre para que `localRect` (relativo a su
   * propio origen) entre entero, reanclando el elemento si creció hacia
   * arriba/izquierda. */
  const ensureFreedrawCovers = (fd: FreedrawElement, localRect: Rect) => {
    const st = useEditor.getState()
    const cw = st.scene.canvas.w
    const ch = st.scene.canvas.h

    const gx = localRect.x + fd.x
    const gy = localRect.y + fd.y
    const x0 = Math.max(0, gx)
    const y0 = Math.max(0, gy)
    const x1 = Math.min(cw, gx + localRect.w)
    const y1 = Math.min(ch, gy + localRect.h)

    if (x1 <= x0 || y1 <= y0) return

    const croppedLocal = {
      x: x0 - fd.x,
      y: y0 - fd.y,
      w: x1 - x0,
      h: y1 - y0,
    }

    fd.buf = ensureWritable(fd.buf)
    const grown = expandBuffer(fd.buf, croppedLocal)
    if (grown.buf === fd.buf) return
    fd.buf = grown.buf
    fd.x -= grown.dx
    fd.y -= grown.dy
  }

  const beginPaint = (st: EditorState, px: number, py: number, erase: boolean, pointerId: number) => {
    if (erase) {
      const hit = hitTestWithSlop(st.scene, px, py, 0)
      // Se empuja historial recién cuando hay algo que borrar: si no, cada clic
      // al vacío gastaría un paso de deshacer.
      if (!hit) return
      st.pushHistory()
      let target = hit
      if (hit.type !== 'freedraw') {
        // Para borrar píxel a píxel la figura tiene que dejar de ser procedural.
        const flat = flattenElement(hit)
        if (!flat) return
        st.replaceElement(hit.id, flat)
        target = flat
      }
      const fd = target as FreedrawElement
      fd.buf = ensureWritable(fd.buf)
      stampAt(fd.buf, px - fd.x, py - fd.y, st.options.brushSize, st.options.brushShape, [0, 0, 0, 0], true)
      st.touch(fd.id)
      interaction.current = {
        kind: 'paint',
        pointerId,
        id: fd.id,
        sx: px,
        sy: py,
        lastX: px,
        lastY: py,
        erase: true,
        startTime: Date.now(),
        moveCount: 0,
        pushedHistory: true,
        baseBuf: cloneBuffer(fd.buf),
        baseX: fd.x,
        baseY: fd.y,
        shiftActive: false,
      }
      return
    }

    st.pushHistory()
    const fd = strokeTarget(st)
    const off = stampOffset(st.options.brushSize)
    const n = Math.max(1, Math.floor(st.options.brushSize))

    const cw = st.scene.canvas.w
    const ch = st.scene.canvas.h
    const isOutside = px < 0 || py < 0 || px >= cw || py >= ch

    if (isOutside) {
      const g = st.growToFit({ x: px - off, y: py - off, w: n, h: n })
      px += g.dx
      py += g.dy
    }

    ensureFreedrawCovers(fd, { x: px - fd.x - off, y: py - fd.y - off, w: n, h: n })
    const color = parseColor(st.options.stroke)
    stampAt(fd.buf, px - fd.x, py - fd.y, st.options.brushSize, st.options.brushShape, color)
    st.touch(fd.id)
    st.pushRecentColor(st.options.stroke)
    interaction.current = {
      kind: 'paint',
      pointerId,
      id: fd.id,
      sx: px,
      sy: py,
      lastX: px,
      lastY: py,
      erase: false,
      startTime: Date.now(),
      moveCount: 0,
      pushedHistory: true,
      baseBuf: cloneBuffer(fd.buf),
      baseX: fd.x,
      baseY: fd.y,
      shiftActive: false,
    }
  }

  const doBucket = (st: EditorState, px: number, py: number) => {
    const composed = renderScene(st.scene)
    st.setIsProcessing(true)
    const strokeColor = st.options.stroke
    const restrictPalette = st.options.restrictPalette
    const opacity = st.options.opacity

    if (!bucketWorkerRef.current) {
      bucketWorkerRef.current = new Worker(
        new URL('../core/raster/raster.worker.ts', import.meta.url),
        { type: 'module' }
      )
    }

    const worker = bucketWorkerRef.current
    const bufToSend = {
      w: composed.w,
      h: composed.h,
      data: composed.data,
    }

    worker.onmessage = (e: MessageEvent) => {
      st.setIsProcessing(false)
      const { empty, dx, dy, w, h, data } = e.data
      if (empty) return

      const croppedMask = {
        w,
        h,
        data,
      }

      const el = freedrawFromMask(croppedMask, strokeColor, dx, dy, restrictPalette)
      if (!el) return
      el.opacity = opacity

      const currentSt = useEditor.getState()
      currentSt.pushHistory()
      currentSt.addElement(el)
      currentSt.pushRecentColor(strokeColor)
      // El balde produce un objeto nuevo, así que corta el grupo de trazos activo.
      strokeGroup.current = null
    }

    worker.onerror = (err) => {
      console.error('Worker error in flood fill:', err)
      st.setIsProcessing(false)
    }

    worker.postMessage(
      {
        type: 'floodfill',
        buf: bufToSend,
        startX: px,
        startY: py,
        tolerance: st.options.tolerance,
      },
      [bufToSend.data.buffer] as any
    )
  }

  const doEyedropper = (st: EditorState, px: number, py: number) => {
    const composed = renderScene(st.scene)
    if (px < 0 || py < 0 || px >= composed.w || py >= composed.h) return
    const i = (py * composed.w + px) * 4
    const a = composed.data[i + 3]
    if (a === 0) return
    const hex = rgbaToHex([composed.data[i], composed.data[i + 1], composed.data[i + 2], 255])
    st.setOptions({ stroke: hex })
    st.pushRecentColor(hex)
  }

  const makeShape = (st: EditorState, box: Rect): PVElement | null => {
    const o = st.options
    switch (st.tool) {
      case 'rect':
        return createRect(box, o)
      case 'ellipse':
        return createEllipse(box, o)
      case 'triangle':
        return createPoly('triangle', box, o)
      case 'diamond':
        return createPoly('diamond', box, o)
      case 'star':
        return createPoly('star', box, o)
      case 'hexagon':
        return createPoly('hexagon', box, o)
      default:
        return null
    }
  }

  const dragBox = (sx: number, sy: number, ex: number, ey: number, shift: boolean, alt: boolean): Rect => {
    let x1 = ex
    let y1 = ey
    if (shift) {
      const d = Math.max(Math.abs(ex - sx), Math.abs(ey - sy))
      x1 = sx + (ex < sx ? -d : d)
      y1 = sy + (ey < sy ? -d : d)
    }
    if (alt) return normalizeRect(sx - (x1 - sx), sy - (y1 - sy), x1, y1)
    return normalizeRect(sx, sy, x1, y1)
  }

  // --- Eventos de puntero -----------------------------------------------------

  const onPointerDown = (e: React.PointerEvent) => {
    const st = useEditor.getState()
    if (st.isProcessing) return
    const css = localCss(e)
    const p = toPixel(e)

    if (e.button === 2) {
      if (st.tool === 'brush') {
        ;(e.target as Element).setPointerCapture(e.pointerId)
        beginPaint(st, p.x, p.y, true, e.pointerId)
      }
      return
    }

    if (e.pointerType === 'touch') {
      activePointers.current.set(e.pointerId, css)
    }

    if (activePointers.current.size >= 2) {
      isMultiTouchGesture.current = true

      // Al detectar 2 o más dedos, deshacer cualquier trazo o figura inicial
      // provocado por el primer dedo al apoyar la mano para hacer zoom/paneo.
      const it = interaction.current
      if (it.kind !== 'none') {
        if (st.draft) st.setDraft(null)
        marquee.current = null

        const isRecent =
          'startTime' in it &&
          (Date.now() - it.startTime < 400 || ('moveCount' in it && it.moveCount <= 1))

        if ('pushedHistory' in it && it.pushedHistory && isRecent) {
          st.undo()
        }
        strokeGroup.current = null
        interaction.current = { kind: 'none' }
      }

      const pointers = Array.from(activePointers.current.values())
      const p1 = pointers[0]
      const p2 = pointers[1]
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y)
      const centerCss = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
      pinchState.current = {
        dist,
        centerCss,
        zoom: st.viewport.zoom,
        panX: st.viewport.panX,
        panY: st.viewport.panY,
      }
      requestDraw.current()
      return
    }

    // Si estamos en medio de un gesto multitáctil, no permitir iniciar interacciones simples.
    if (isMultiTouchGesture.current) {
      return
    }

    if (st.tool === 'text') {
      // El texto no arrastra, así que no necesita capturar el puntero; y hay que
      // frenar el foco por defecto para que el clic no se lo quite al campo que
      // está por abrirse.
      e.preventDefault()
    } else {
      ;(e.target as Element).setPointerCapture(e.pointerId)
    }

    if (e.button === 1 || spaceDown.current || st.tool === 'hand') {
      interaction.current = {
        kind: 'pan',
        pointerId: e.pointerId,
        cssX: css.x,
        cssY: css.y,
        panX: st.viewport.panX,
        panY: st.viewport.panY,
      }
      return
    }

    switch (st.tool) {
      case 'brush':
        beginPaint(st, p.x, p.y, false, e.pointerId)
        return

      case 'eraser': {
        const isObjectMode = e.shiftKey ? st.eraserMode === 'pixel' : st.eraserMode === 'object'
        if (!isObjectMode) {
          beginPaint(st, p.x, p.y, true, e.pointerId)
        } else {
          const hit = hitTestWithSlop(st.scene, p.x, p.y, 1)
          let pushed = false
          if (hit) {
            st.pushHistory()
            st.removeElements([hit.id])
            pushed = true
          }
          strokeGroup.current = null
          interaction.current = {
            kind: 'eraseObjects',
            pointerId: e.pointerId,
            startTime: Date.now(),
            moveCount: 0,
            pushedHistory: pushed,
          }
        }
        return
      }

      case 'bucket':
        doBucket(st, p.x, p.y)
        return

      case 'eyedropper':
        doEyedropper(st, p.x, p.y)
        return

      case 'text': {
        const hit = hitTestWithSlop(st.scene, p.x, p.y, 2)
        if (hit && hit.type === 'text') {
          st.setSelection([hit.id])
          st.setEditingText(hit.id)
          return
        }
        st.pushHistory()
        const el = createText(p.x, p.y, st.options)
        st.addElement(el, true)
        st.growToFit(elementBounds(el))
        st.setEditingText(el.id)
        strokeGroup.current = null
        return
      }

      case 'select': {
        const t = getTransform()
        const b = selectionBounds(st)
        if (b) {
          const pos = handlePositions(t, b)
          // En táctil aumentamos la tolerancia para facilitar tocar los handles con el dedo.
          const handleMultiplier = e.pointerType === 'touch' ? 2.8 : 1.8
          const r = handleRadius(t) * handleMultiplier
          const dx = css.x * t.dpr
          const dy = css.y * t.dpr
          for (const id of HANDLE_IDS) {
            if (Math.abs(pos[id].x - dx) <= r && Math.abs(pos[id].y - dy) <= r) {
              st.pushHistory()
              const orig = st.scene.elements
                .filter((el) => st.selection.includes(el.id))
                .map((el) => (el.type === 'freedraw' ? { ...el, buf: cloneBuffer(el.buf) } : { ...el }))
              interaction.current = {
                kind: 'resize',
                pointerId: e.pointerId,
                handle: id,
                from: b,
                orig,
                startTime: Date.now(),
                pushedHistory: true,
              }
              return
            }
          }
        }
        const hitSlop = e.pointerType === 'touch' ? 3 : 1
        const hit = hitTestWithSlop(st.scene, p.x, p.y, hitSlop)
        if (hit) {
          let sel = st.selection
          if (e.shiftKey) {
            st.toggleSelection(hit.id)
            sel = useEditor.getState().selection
          } else if (!sel.includes(hit.id)) {
            st.setSelection([hit.id])
            sel = [hit.id]
          } else if (sel.length > 1) {
            st.setKeyObjectId(hit.id)
          }
          st.pushHistory()
          const orig = st.scene.elements
            .filter((el) => sel.includes(el.id))
            .map((el) => ({ id: el.id, x: el.x, y: el.y }))
          interaction.current = {
            kind: 'move',
            pointerId: e.pointerId,
            orig,
            sx: p.x,
            sy: p.y,
            startTime: Date.now(),
            pushedHistory: true,
          }
          return
        }
        if (!e.shiftKey) st.setSelection([])
        marquee.current = { x: p.x, y: p.y, w: 0, h: 0 }
        interaction.current = { kind: 'marquee', pointerId: e.pointerId, sx: p.x, sy: p.y }
        return
      }

      default:
        if (SHAPE_TOOLS.has(st.tool) || LINE_TOOLS.has(st.tool)) {
          // Se empuja acá (y no al soltar) para que un crecimiento del lienzo
          // disparado durante el arrastre se deshaga junto con la figura.
          st.pushHistory()
          const g = st.growToFit(normalizeRect(p.x, p.y, p.x, p.y))
          p.x += g.dx
          p.y += g.dy
          const box = normalizeRect(p.x, p.y, p.x, p.y)
          const draft =
            LINE_TOOLS.has(st.tool)
              ? createLine(p.x, p.y, 0, 0, { ...st.options, arrow: st.tool === 'arrow' })
              : makeShape(st, box)
          if (draft) st.setDraft(draft)
          interaction.current = {
            kind: 'shape',
            pointerId: e.pointerId,
            sx: p.x,
            sy: p.y,
            startTime: Date.now(),
            pushedHistory: true,
          }
          strokeGroup.current = null
        }
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const st = useEditor.getState()
    const css = localCss(e)

    if (e.pointerType === 'touch' && activePointers.current.has(e.pointerId)) {
      activePointers.current.set(e.pointerId, css)
    }

    if (isMultiTouchGesture.current) {
      if (activePointers.current.size >= 2 && pinchState.current) {
        const pointers = Array.from(activePointers.current.values())
        const p1 = pointers[0]
        const p2 = pointers[1]
        const curDist = Math.hypot(p2.x - p1.x, p2.y - p1.y)
        const curCenter = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }

        const scale = pinchState.current.dist > 0 ? curDist / pinchState.current.dist : 1
        const rawZoom = pinchState.current.zoom * scale
        const targetZoom = Math.max(0.1, Math.min(64, rawZoom))

        const initPanX = pinchState.current.panX
        const initPanY = pinchState.current.panY
        const initZoom = pinchState.current.zoom
        const centerInit = pinchState.current.centerCss

        const canvasX = (centerInit.x - initPanX) / initZoom
        const canvasY = (centerInit.y - initPanY) / initZoom

        st.setViewport({
          zoom: targetZoom,
          panX: curCenter.x - canvasX * targetZoom,
          panY: curCenter.y - canvasY * targetZoom,
        })
        requestDraw.current()
      }
      return
    }

    if (pinchState.current) return

    const it = interaction.current
    if (it.kind !== 'none' && 'pointerId' in it && it.pointerId !== e.pointerId) {
      return
    }

    const p = toPixel(e)
    const prev = cursorPx.current
    cursorPx.current = p
    if (!prev || prev.x !== p.x || prev.y !== p.y) requestOverlayRedraw.current()

    if (it.kind !== 'move' && it.kind !== 'pan') {
      const cw = st.scene.canvas.w
      const ch = st.scene.canvas.h
      if (p.x >= 0 && p.x < cw && p.y >= 0 && p.y < ch) {
        setTooltip({
          x: css.x,
          y: css.y,
          text: `X: ${p.x}, Y: ${p.y}`,
        })
      } else {
        setTooltip(null)
      }
    }

    switch (it.kind) {
      case 'pan': {
        st.setViewport({
          panX: it.panX + (css.x - it.cssX),
          panY: it.panY + (css.y - it.cssY),
        })
        return
      }

      case 'paint': {
        it.moveCount++
        const el = st.scene.elements.find((x) => x.id === it.id)
        if (!el || el.type !== 'freedraw') return

        if (e.shiftKey) {
          if (!it.shiftActive) {
            it.shiftActive = true
            it.sx = it.lastX
            it.sy = it.lastY
            it.baseBuf = cloneBuffer(el.buf)
            it.baseX = el.x
            it.baseY = el.y
          }

          let px = p.x
          let py = p.y
          const dx = px - it.sx
          const dy = py - it.sy
          if (dx !== 0 || dy !== 0) {
            const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4)
            const len = Math.hypot(dx, dy)
            px = it.sx + Math.round(Math.cos(ang) * len)
            py = it.sy + Math.round(Math.sin(ang) * len)
          }

          const off = stampOffset(st.options.brushSize)
          const n = Math.max(1, Math.floor(st.options.brushSize))

          if (!it.erase) {
            const segment = {
              x: Math.min(it.sx, px) - off,
              y: Math.min(it.sy, py) - off,
              w: Math.abs(px - it.sx) + n,
              h: Math.abs(py - it.sy) + n,
            }
            const g = st.growToFit(segment)
            const pt = { x: px, y: py }
            shiftDrag(g.dx, g.dy, pt)
            px = pt.x
            py = pt.y
          }

          // Caja delimitadora que contiene al búfer base y a la nueva línea recta
          const minX = Math.min(it.baseX, Math.min(it.sx, px) - off)
          const maxX = Math.max(it.baseX + it.baseBuf.w - 1, Math.max(it.sx, px) + off)
          const minY = Math.min(it.baseY, Math.min(it.sy, py) - off)
          const maxY = Math.max(it.baseY + it.baseBuf.h - 1, Math.max(it.sy, py) + off)

          const newW = Math.max(1, maxX - minX + 1)
          const newH = Math.max(1, maxY - minY + 1)

          // Reconstruir búfer limpio y copiar it.baseBuf en su posición original
          el.x = minX
          el.y = minY
          el.buf = createBuffer(newW, newH)
          copyBufferInto(el.buf, it.baseBuf, it.baseX - el.x, it.baseY - el.y)

          // Trazar únicamente la línea recta actual
          const color = it.erase ? ([0, 0, 0, 0] as const) : parseColor(st.options.stroke)
          strokeLine(
            el.buf,
            it.sx - el.x,
            it.sy - el.y,
            px - el.x,
            py - el.y,
            color as [number, number, number, number],
            st.options.brushSize,
            st.options.brushShape,
            it.erase,
          )
          it.lastX = px
          it.lastY = py
          st.touch(el.id)
          return
        }

        // Si soltó Shift, fijar el trazo hasta la posición actual como nuevo estado base
        if (it.shiftActive) {
          it.shiftActive = false
          it.baseBuf = cloneBuffer(el.buf)
          it.baseX = el.x
          it.baseY = el.y
          it.sx = it.lastX
          it.sy = it.lastY
        }

        let px = p.x
        let py = p.y
        if (!it.erase) {
          const off = stampOffset(st.options.brushSize)
          const n = Math.max(1, Math.floor(st.options.brushSize))

          const cw = st.scene.canvas.w
          const ch = st.scene.canvas.h
          const isOutside = px < 0 || py < 0 || px >= cw || py >= ch

          if (isOutside) {
            const segment = {
              x: Math.min(it.lastX, px) - off,
              y: Math.min(it.lastY, py) - off,
              w: Math.abs(px - it.lastX) + n,
              h: Math.abs(py - it.lastY) + n,
            }
            const g = st.growToFit(segment)
            const pt = { x: px, y: py }
            shiftDrag(g.dx, g.dy, pt)
            px = pt.x
            py = pt.y
          }

          ensureFreedrawCovers(el, {
            x: Math.min(it.lastX, px) - el.x - off,
            y: Math.min(it.lastY, py) - el.y - off,
            w: Math.abs(px - it.lastX) + n,
            h: Math.abs(py - it.lastY) + n,
          })
        }
        const color = it.erase ? ([0, 0, 0, 0] as const) : parseColor(st.options.stroke)
        strokeLine(
          el.buf,
          it.lastX - el.x,
          it.lastY - el.y,
          px - el.x,
          py - el.y,
          color as [number, number, number, number],
          st.options.brushSize,
          st.options.brushShape,
          it.erase,
        )
        it.lastX = px
        it.lastY = py

        if (it.erase) {
          const bounds = bufferBounds(el.buf)
          if (!bounds) {
            st.removeElements([el.id])
            interaction.current = { kind: 'none' }
            setTooltip(null)
            return
          }
        }

        st.touch(el.id)
        return
      }

      case 'eraseObjects': {
        it.moveCount++
        const hit = hitTestWithSlop(st.scene, p.x, p.y, 1)
        if (hit) st.removeElements([hit.id])
        return
      }

      case 'shape': {
        const cur = st.draft
        if (!cur) return
        if (cur.type === 'line') {
          let dx = p.x - it.sx
          let dy = p.y - it.sy
          if (e.shiftKey) {
            // Encaje a múltiplos de 45°, que es lo que se espera de una línea recta.
            const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4)
            const len = Math.hypot(dx, dy)
            dx = Math.round(Math.cos(ang) * len)
            dy = Math.round(Math.sin(ang) * len)
          }
          // El margen cubre el grosor del trazo y, si hay flecha, su punta.
          const pad = stampOffset(cur.strokeWidth) + Math.max(1, Math.ceil(cur.strokeWidth)) +
            (cur.arrow ? Math.max(4, cur.strokeWidth * 3 + 3) : 0)
          const g = st.growToFit({
            x: Math.min(it.sx, it.sx + dx) - pad,
            y: Math.min(it.sy, it.sy + dy) - pad,
            w: Math.abs(dx) + pad * 2,
            h: Math.abs(dy) + pad * 2,
          })
          // dx/dy son un delta relativo al inicio del trazo: como growToFit
          // corre it.sx y p por igual, el delta no cambia y no hace falta
          // recalcularlo.
          shiftDrag(g.dx, g.dy, p)
          cur.dx = dx
          cur.dy = dy
          st.touch(cur.id)
        } else {
          const box = dragBox(it.sx, it.sy, p.x, p.y, e.shiftKey, e.altKey)
          const g = st.growToFit(box)
          shiftDrag(g.dx, g.dy, p)
          const finalBox = g.dx || g.dy ? dragBox(it.sx, it.sy, p.x, p.y, e.shiftKey, e.altKey) : box
          Object.assign(cur, finalBox)
          st.touch(cur.id)
        }
        return
      }

      case 'move': {
        let dx = p.x - it.sx
        let dy = p.y - it.sy
        if (e.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0
          else dx = 0
        }
        for (const o of it.orig) st.updateElement(o.id, { x: o.x + dx, y: o.y + dy })
        const bounds = unionBounds(it.orig.map((o) => elementBounds(st.getElement(o.id)!)))
        if (bounds) {
          const g = st.growToFit(bounds)
          shiftDrag(g.dx, g.dy, p)
          const css = localCss(e)
          setTooltip({
            x: css.x,
            y: css.y,
            text: `X: ${bounds.x}, Y: ${bounds.y}`,
          })
        }
        return
      }

      case 'resize': {
        const to = resizeBox(it.from, it.handle, p.x, p.y, e.shiftKey)
        // Siempre se parte de los originales clonados: recalcular sobre el
        // resultado anterior acumularía error y degradaría los búferes ráster.
        for (const orig of it.orig) st.updateElement(orig.id, scaleWithin(orig, it.from, to))
        const bounds = unionBounds(it.orig.map((o) => elementBounds(st.getElement(o.id)!)))
        if (bounds) {
          const g = st.growToFit(bounds)
          shiftDrag(g.dx, g.dy, p)
        }
        return
      }

      case 'marquee': {
        marquee.current = normalizeRect(it.sx, it.sy, p.x, p.y)
        requestOverlayRedraw.current()
        return
      }

      default:
        return
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') {
      activePointers.current.delete(e.pointerId)
      if (activePointers.current.size < 2) {
        pinchState.current = null
      }
      if (activePointers.current.size > 0) {
        return
      }
      isMultiTouchGesture.current = false
    }

    const st = useEditor.getState()
    const it = interaction.current

    if (it.kind !== 'none' && 'pointerId' in it && it.pointerId !== e.pointerId && e.pointerType === 'touch') {
      return
    }

    if (it.kind === 'paint') {
      const el = st.scene.elements.find((x) => x.id === it.id)
      if (el && el.type === 'freedraw') {
        const bounds = bufferBounds(el.buf)
        if (!bounds) {
          st.removeElements([el.id])
        } else {
          const cropped = cropBuffer(el.buf, bounds)
          st.updateElement(el.id, {
            buf: cropped,
            x: el.x + bounds.x,
            y: el.y + bounds.y,
          })
        }
      }
    }

    if (it.kind === 'move' || it.kind === 'resize' || it.kind === 'paint') {
      st.shrinkToFit()
    }

    if (it.kind === 'shape' && st.draft) {
      const draft = st.draft
      // El historial ya se empujó al bajar el puntero (ver onPointerDown), así
      // el crecimiento del lienzo durante el arrastre queda en el mismo paso.
      st.setDraft(null)
      // Un click sin arrastre no debe dejar una figura de 1 píxel invisible.
      const meaningful = draft.type === 'line' ? draft.dx !== 0 || draft.dy !== 0 : true
      if (meaningful) {
        st.addElement(draft)
        st.pushRecentColor(st.options.stroke)
      }
    }
    if (it.kind === 'marquee' && marquee.current) {
      const picked = elementsInRect(st.scene, marquee.current).map((el) => el.id)
      st.setSelection(e.shiftKey ? Array.from(new Set([...st.selection, ...picked])) : picked)
      marquee.current = null
    }
    setTooltip(null)
    interaction.current = { kind: 'none' }
    requestDraw.current()
  }

  const onPointerLeave = () => {
    cursorPx.current = null
    setTooltip(null)
    requestOverlayRedraw.current()
  }

  // --- Manejo del trackpad y rueda de mouse (Zoom y Paneo de 2 dedos) ---------
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault() // Detiene el zoom/scroll nativo de la página en Mac
      const st = useEditor.getState()
      const r = wrap.getBoundingClientRect()
      const cssX = e.clientX - r.left
      const cssY = e.clientY - r.top

      if (e.ctrlKey) {
        // Gesto de pellizcar (pinch-to-zoom) con 2 dedos, o Ctrl + Rueda del mouse.
        // e.deltaY es negativo al acercar, positivo al alejar.
        const factor = Math.exp(-e.deltaY * 0.008)
        const targetZoom = Math.max(0.1, Math.min(64, st.viewport.zoom * factor))
        st.setViewport(zoomAt(st.viewport, targetZoom, cssX, cssY))
      } else {
        // Desplazamiento con 2 dedos (panning) o desplazamiento tradicional con rueda.
        st.setViewport({
          panX: st.viewport.panX - e.deltaX,
          panY: st.viewport.panY - e.deltaY,
        })
      }
    }

    wrap.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      wrap.removeEventListener('wheel', handleWheel)
    }
  }, [])

  // --- Espacio para hacer pan -------------------------------------------------
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTypingTarget(e.target)) {
        spaceDown.current = true
        setCursorLabel('grab')
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceDown.current = false
        setCursorLabel('default')
      }
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  // --- Importación de imágenes: soltar y pegar --------------------------------
  const importBlob = useCallback(async (blob: Blob) => {
    setLoadingImage(true)
    try {
      const src = await decodeImageBlob(blob)
      const st = useEditor.getState()
      const cw = st.scene.canvas.w
      const ch = st.scene.canvas.h
      // Entra al lienzo sin recortarse, conservando la proporción original.
      const k = Math.min(1, cw / src.w, ch / src.h)
      const w = Math.max(1, Math.round(src.w * k))
      const h = Math.max(1, Math.round(src.h * k))
      const srcId = newSourceId()
      putImageSource(srcId, src)
      const fileName = (blob as any).name || undefined
      const el: ImageElement = {
        id: newId('img'),
        rev: 0,
        x: Math.floor((cw - w) / 2),
        y: Math.floor((ch - h) / 2),
        type: 'image',
        name: fileName,
        w,
        h,
        srcId,
        alphaThreshold: 0,
        scaleMode: suggestScaleMode(src.w, src.h, w, h),
        quantize: null,
      }
      st.pushHistory()
      st.addElement(el, true)
      st.setTool('select')
      strokeGroup.current = null
    } finally {
      setLoadingImage(false)
    }
  }, [])

  const importUrl = useCallback(async (url: string) => {
    setLoadingImage(true)
    try {
      let blob: Blob
      if (url.startsWith('data:')) {
        const response = await fetch(url)
        blob = await response.blob()
      } else {
        try {
          // Intentamos cargar la imagen directamente primero
          const response = await fetch(url)
          blob = await response.blob()
        } catch (err) {
          // Si falla (por ejemplo por CORS), intentamos con un proxy de CORS público
          console.warn('Fallo al descargar directamente por CORS, intentando proxy...', err)
          const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`
          const response = await fetch(proxyUrl)
          blob = await response.blob()
        }
      }

      if (!blob.type.startsWith('image/')) {
        throw new Error('El archivo descargado no es una imagen válida.')
      }

      await importBlob(blob)
    } catch (error) {
      console.error('Error al importar la imagen externa:', error)
      alert('No se pudo cargar la imagen externa debido a restricciones de seguridad (CORS) del sitio de origen o un enlace inválido.')
    } finally {
      setLoadingImage(false)
    }
  }, [importBlob])

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'))
      if (!item) return
      const blob = item.getAsFile()
      if (!blob) return
      e.preventDefault()
      void importBlob(blob)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [importBlob])

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDropping(false)

    // 1. Intentar obtener archivos locales primero
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/'))
    if (file) {
      void importBlob(file)
      return
    }

    // 2. Si no hay archivos, buscar si arrastró un URL de imagen externa
    let imageUrl = e.dataTransfer.getData('text/uri-list')
    if (imageUrl) {
      const urls = imageUrl.split('\n').map((u) => u.trim()).filter((u) => u && !u.startsWith('#'))
      if (urls.length > 0) {
        imageUrl = urls[0]
      } else {
        imageUrl = ''
      }
    }

    if (!imageUrl) {
      const html = e.dataTransfer.getData('text/html')
      if (html) {
        const match = html.match(/<img[^>]+src=["']([^"']+)["']/i)
        if (match) {
          imageUrl = match[1]
        }
      }
    }

    if (!imageUrl) {
      imageUrl = e.dataTransfer.getData('URL')
    }

    if (!imageUrl) {
      imageUrl = e.dataTransfer.getData('text/plain')
    }

    if (imageUrl && (imageUrl.startsWith('http://') || imageUrl.startsWith('https://') || imageUrl.startsWith('data:'))) {
      void importUrl(imageUrl)
    }
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    const st = useEditor.getState()
    if (st.tool !== 'select') return
    if (st.isProcessing) return

    const p = toPixel(e)
    const hitSlop = 1
    const hit = hitTestWithSlop(st.scene, p.x, p.y, hitSlop)

    if (hit) {
      if (!st.selection.includes(hit.id)) {
        st.setSelection([hit.id])
      }
    } else {
      st.setSelection([])
    }

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      visible: true,
    })
  }

  const handleConfirmMove = useCallback((dx: number, dy: number) => {
    const st = useEditor.getState()
    if (st.selection.length === 0) return
    st.pushHistory()
    for (const id of st.selection) {
      const el = st.scene.elements.find((e) => e.id === id)
      if (el) {
        st.updateElement(id, { x: el.x + dx, y: el.y + dy })
      }
    }
  }, [])

  const handleConfirmScale = useCallback((factor: number) => {
    const st = useEditor.getState()
    if (st.selection.length === 0) return
    st.pushHistory()
    const selectedElements = st.scene.elements.filter((e) => st.selection.includes(e.id))
    const patches = scaleSelectionUniformly(selectedElements, factor)
    for (const { id, patch } of patches) {
      st.updateElement(id, patch)
    }
  }, [])

  const tool = useEditor((s) => s.tool)

  useEffect(() => {
    setContextMenu((prev) => (prev.visible ? { ...prev, visible: false } : prev))
  }, [tool])

  const isProcessing = useEditor((s) => s.isProcessing)
  const cssCursor =
    cursorLabel === 'grab'
      ? 'grab'
      : tool === 'hand'
        ? 'grab'
        : tool === 'select'
          ? 'default'
          : tool === 'text'
            ? 'text'
            : 'crosshair'

  return (
    <div
      ref={wrapRef}
      className={`stage${dropping ? ' stage--dropping' : ''}`}
      style={{ cursor: cssCursor }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={onPointerLeave}
      onContextMenu={handleContextMenu}
      onDragOver={(e) => {
        e.preventDefault()
        setDropping(true)
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={onDrop}
    >
      <canvas ref={baseRef} className="stage__canvas" />
      <canvas ref={overlayRef} className="stage__canvas stage__canvas--overlay" />
      <TextOverlay getTransform={getTransform} />
      {dropping && <div className="stage__drophint">Soltá la imagen para estamparla</div>}
      {loadingImage && (
        <div className="stage__loading">
          <div className="stage__loading-spinner" />
          <span>Cargando imagen...</span>
        </div>
      )}
      {isProcessing && (
        <div className="stage__loading">
          <div className="stage__loading-spinner" />
          <span>Rellenando...</span>
        </div>
      )}
      {tooltip && (
        <div className="stage__tooltip">
          {tooltip.text}
        </div>
      )}
      <ContextMenu
        x={contextMenu.x}
        y={contextMenu.y}
        visible={contextMenu.visible}
        onClose={() => setContextMenu((prev) => ({ ...prev, visible: false }))}
        onOpenMoveModal={() => setIsMoveOpen(true)}
        onOpenScaleModal={() => setIsScaleOpen(true)}
      />
      <MoveModal
        isOpen={isMoveOpen}
        onClose={() => setIsMoveOpen(false)}
        onConfirm={handleConfirmMove}
      />
      <ScaleModal
        isOpen={isScaleOpen}
        onClose={() => setIsScaleOpen(false)}
        onConfirm={handleConfirmScale}
      />
    </div>
  )
}

/** Nueva caja al arrastrar un handle. Shift conserva la proporción original. */
function resizeBox(from: Rect, handle: HandleId, px: number, py: number, keepRatio: boolean): Rect {
  let x0 = from.x
  let y0 = from.y
  let x1 = from.x + from.w
  let y1 = from.y + from.h

  if (handle.includes('w')) x0 = px
  if (handle.includes('e')) x1 = px + 1
  if (handle.includes('n')) y0 = py
  if (handle.includes('s')) y1 = py + 1

  let w = Math.max(1, x1 - x0)
  let h = Math.max(1, y1 - y0)

  if (keepRatio && from.w > 0 && from.h > 0) {
    const ratio = from.w / from.h
    if (w / h > ratio) w = Math.max(1, Math.round(h * ratio))
    else h = Math.max(1, Math.round(w / ratio))
    if (handle.includes('w')) x0 = x1 - w
    if (handle.includes('n')) y0 = y1 - h
  }
  return { x: Math.round(x0), y: Math.round(y0), w: Math.round(w), h: Math.round(h) }
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable
}
