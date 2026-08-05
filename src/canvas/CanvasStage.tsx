import { useCallback, useEffect, useRef, useState } from 'react'
import type { FreedrawElement, ImageElement, PVElement, Rect } from '../core/types'
import { cloneBuffer, expandBuffer, parseColor, rgbaToHex } from '../core/pixels'
import { renderScene } from '../core/render/renderScene'
import { hitTestWithSlop } from '../core/render/hitTest'
import { elementBounds, elementsInRect, unionBounds } from '../core/render/hitTest'
import { floodFillMask } from '../core/raster/floodfill'
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
import { scaleWithin } from '../core/transforms'
import { decodeImageBlob, newSourceId, putImageSource } from '../core/image/imageStore'
import { suggestScaleMode } from '../core/image/processImage'
import { selectionBounds, useEditor, type EditorState } from '../state/store'
import {
  computeTransform,
  fitToView,
  nextZoom,
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
  | { kind: 'pan'; cssX: number; cssY: number; panX: number; panY: number }
  | { kind: 'paint'; id: string; lastX: number; lastY: number; erase: boolean }
  | { kind: 'eraseObjects' }
  | { kind: 'shape'; sx: number; sy: number }
  | { kind: 'move'; orig: Array<{ id: string; x: number; y: number }>; sx: number; sy: number }
  | { kind: 'resize'; handle: HandleId; from: Rect; orig: PVElement[] }
  | { kind: 'marquee'; sx: number; sy: number }

const SHAPE_TOOLS = new Set(['rect', 'ellipse', 'triangle', 'diamond', 'star', 'hexagon'])
const LINE_TOOLS = new Set(['line', 'arrow'])

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

  const [size, setSize] = useState({ w: 0, h: 0 })
  const [cursorLabel, setCursorLabel] = useState('default')
  const [dropping, setDropping] = useState(false)

  const requestDraw = useRef<() => void>(() => {})

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

  // --- Bucle de dibujo --------------------------------------------------------
  const draw = useCallback(() => {
    const base = baseRef.current
    const overlay = overlayRef.current
    const wrap = wrapRef.current
    if (!base || !overlay || !wrap) return

    const dpr = window.devicePixelRatio || 1
    dprRef.current = dpr
    const pxW = Math.max(1, Math.round(size.w * dpr))
    const pxH = Math.max(1, Math.round(size.h * dpr))
    for (const c of [base, overlay]) {
      if (c.width !== pxW || c.height !== pxH) {
        c.width = pxW
        c.height = pxH
      }
    }

    const st = useEditor.getState()
    const t = computeTransform(st.viewport, dpr)
    const cw = st.scene.canvas.w
    const ch = st.scene.canvas.h

    // Capa base: damero + escena escalada sin suavizado.
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
      const buf = renderScene(st.scene, st.draft)
      octx.putImageData(new ImageData(buf.data, cw, ch), 0, 0)
      bctx.drawImage(off, 0, 0, cw, ch, t.ox, t.oy, cw * t.scale, ch * t.scale)
    }
    drawCanvasBorder(bctx, t, cw, ch)

    // Capa de overlay: nada de esto toca los píxeles del lienzo.
    const octx2 = overlay.getContext('2d')
    if (!octx2) return
    octx2.setTransform(1, 0, 0, 1, 0, 0)
    octx2.clearRect(0, 0, pxW, pxH)
    if (st.showGrid) drawGrid(octx2, t, cw, ch, st.showTileGrid)

    const bounds = selectionBounds(st)
    if (bounds && st.tool === 'select') drawSelection(octx2, t, bounds, true)
    if (marquee.current) drawMarquee(octx2, t, marquee.current)

    const c = cursorPx.current
    const showCursor =
      c && c.x >= 0 && c.y >= 0 && c.x < cw && c.y < ch && interaction.current.kind !== 'pan'
    if (showCursor && (st.tool === 'brush' || (st.tool === 'eraser' && st.eraserMode === 'pixel'))) {
      // El borrador no tiene color que previsualizar, y durante el trazo los
      // píxeles reales ya están pintados: en ambos casos va sólo el contorno.
      const preview =
        st.tool === 'brush' && interaction.current.kind !== 'paint' ? st.options.stroke : null
      drawBrushCursor(octx2, t, c.x, c.y, st.options.brushSize, st.options.brushShape, preview)
    }
  }, [size])

  useEffect(() => {
    let raf = 0
    const schedule = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        draw()
      })
    }
    requestDraw.current = schedule
    const unsub = useEditor.subscribe(schedule)
    schedule()
    const onDpr = () => schedule()
    window.addEventListener('resize', onDpr)
    return () => {
      unsub()
      window.removeEventListener('resize', onDpr)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [draw])

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
        it.lastX += dx
        it.lastY += dy
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
    return fd
  }

  /** Agranda el búfer de un trazo libre para que `localRect` (relativo a su
   * propio origen) entre entero, reanclando el elemento si creció hacia
   * arriba/izquierda. */
  const ensureFreedrawCovers = (fd: FreedrawElement, localRect: Rect) => {
    const grown = expandBuffer(fd.buf, localRect)
    if (grown.buf === fd.buf) return
    fd.buf = grown.buf
    fd.x -= grown.dx
    fd.y -= grown.dy
  }

  const beginPaint = (st: EditorState, px: number, py: number, erase: boolean) => {
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
      stampAt(fd.buf, px - fd.x, py - fd.y, st.options.brushSize, st.options.brushShape, [0, 0, 0, 0], true)
      st.touch(fd.id)
      interaction.current = { kind: 'paint', id: fd.id, lastX: px, lastY: py, erase: true }
      return
    }

    st.pushHistory()
    const fd = strokeTarget(st)
    const off = stampOffset(st.options.brushSize)
    const n = Math.max(1, Math.floor(st.options.brushSize))
    const g = st.growToFit({ x: px - off, y: py - off, w: n, h: n })
    px += g.dx
    py += g.dy
    ensureFreedrawCovers(fd, { x: px - fd.x - off, y: py - fd.y - off, w: n, h: n })
    const color = parseColor(st.options.stroke)
    stampAt(fd.buf, px - fd.x, py - fd.y, st.options.brushSize, st.options.brushShape, color)
    st.touch(fd.id)
    st.pushRecentColor(st.options.stroke)
    interaction.current = { kind: 'paint', id: fd.id, lastX: px, lastY: py, erase: false }
  }

  const doBucket = (st: EditorState, px: number, py: number) => {
    const composed = renderScene(st.scene)
    const mask = floodFillMask(composed, px, py, st.options.tolerance)
    const el = freedrawFromMask(mask, st.options.stroke, 0, 0)
    if (!el) return
    el.opacity = st.options.opacity
    st.pushHistory()
    st.addElement(el)
    st.pushRecentColor(st.options.stroke)
    // El balde produce un objeto nuevo, así que corta el grupo de trazos activo.
    strokeGroup.current = null
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
    if (e.button === 2) return
    const st = useEditor.getState()
    const css = localCss(e)
    const p = toPixel(e)
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
        cssX: css.x,
        cssY: css.y,
        panX: st.viewport.panX,
        panY: st.viewport.panY,
      }
      return
    }

    switch (st.tool) {
      case 'brush':
        beginPaint(st, p.x, p.y, false)
        return

      case 'eraser':
        if (st.eraserMode === 'pixel') {
          beginPaint(st, p.x, p.y, true)
        } else {
          const hit = hitTestWithSlop(st.scene, p.x, p.y, 1)
          if (hit) {
            st.pushHistory()
            st.removeElements([hit.id])
          }
          strokeGroup.current = null
          interaction.current = { kind: 'eraseObjects' }
        }
        return

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
          const r = handleRadius(t) * 1.8
          const dx = css.x * t.dpr
          const dy = css.y * t.dpr
          for (const id of HANDLE_IDS) {
            if (Math.abs(pos[id].x - dx) <= r && Math.abs(pos[id].y - dy) <= r) {
              const orig = st.scene.elements
                .filter((el) => st.selection.includes(el.id))
                .map((el) => (el.type === 'freedraw' ? { ...el, buf: cloneBuffer(el.buf) } : { ...el }))
              interaction.current = { kind: 'resize', handle: id, from: b, orig }
              return
            }
          }
        }
        const hit = hitTestWithSlop(st.scene, p.x, p.y, 1)
        if (hit) {
          let sel = st.selection
          if (e.shiftKey) {
            st.toggleSelection(hit.id)
            sel = useEditor.getState().selection
          } else if (!sel.includes(hit.id)) {
            st.setSelection([hit.id])
            sel = [hit.id]
          }
          st.pushHistory()
          const orig = st.scene.elements
            .filter((el) => sel.includes(el.id))
            .map((el) => ({ id: el.id, x: el.x, y: el.y }))
          interaction.current = { kind: 'move', orig, sx: p.x, sy: p.y }
          return
        }
        if (!e.shiftKey) st.setSelection([])
        marquee.current = { x: p.x, y: p.y, w: 0, h: 0 }
        interaction.current = { kind: 'marquee', sx: p.x, sy: p.y }
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
          interaction.current = { kind: 'shape', sx: p.x, sy: p.y }
          strokeGroup.current = null
        }
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const st = useEditor.getState()
    const p = toPixel(e)
    const prev = cursorPx.current
    cursorPx.current = p
    if (!prev || prev.x !== p.x || prev.y !== p.y) requestDraw.current()

    const it = interaction.current
    switch (it.kind) {
      case 'pan': {
        const css = localCss(e)
        st.setViewport({
          panX: it.panX + (css.x - it.cssX),
          panY: it.panY + (css.y - it.cssY),
        })
        return
      }

      case 'paint': {
        const el = st.scene.elements.find((x) => x.id === it.id)
        if (!el || el.type !== 'freedraw') return
        if (!it.erase) {
          // No tiene sentido agrandar nada para borrar: fuera del búfer no hay
          // nada que borrar.
          const off = stampOffset(st.options.brushSize)
          const n = Math.max(1, Math.floor(st.options.brushSize))
          const segment = {
            x: Math.min(it.lastX, p.x) - off,
            y: Math.min(it.lastY, p.y) - off,
            w: Math.abs(p.x - it.lastX) + n,
            h: Math.abs(p.y - it.lastY) + n,
          }
          const g = st.growToFit(segment)
          shiftDrag(g.dx, g.dy, p)
          ensureFreedrawCovers(el, {
            x: Math.min(it.lastX, p.x) - el.x - off,
            y: Math.min(it.lastY, p.y) - el.y - off,
            w: Math.abs(p.x - it.lastX) + n,
            h: Math.abs(p.y - it.lastY) + n,
          })
        }
        const color = it.erase ? ([0, 0, 0, 0] as const) : parseColor(st.options.stroke)
        strokeLine(
          el.buf,
          it.lastX - el.x,
          it.lastY - el.y,
          p.x - el.x,
          p.y - el.y,
          color as [number, number, number, number],
          st.options.brushSize,
          st.options.brushShape,
          it.erase,
        )
        it.lastX = p.x
        it.lastY = p.y
        st.touch(el.id)
        return
      }

      case 'eraseObjects': {
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
        requestDraw.current()
        return
      }

      default:
        return
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const st = useEditor.getState()
    const it = interaction.current
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
    interaction.current = { kind: 'none' }
    requestDraw.current()
  }

  const onPointerLeave = () => {
    cursorPx.current = null
    requestDraw.current()
  }

  const onWheel = (e: React.WheelEvent) => {
    const st = useEditor.getState()
    const css = localCss(e)
    const dir = e.deltaY < 0 ? 1 : -1
    st.setViewport(zoomAt(st.viewport, nextZoom(st.viewport.zoom, dir), css.x, css.y))
  }

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
    const el: ImageElement = {
      id: newId('img'),
      rev: 0,
      x: Math.floor((cw - w) / 2),
      y: Math.floor((ch - h) / 2),
      type: 'image',
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
  }, [])

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
    const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/'))
    if (file) void importBlob(file)
  }

  const tool = useEditor((s) => s.tool)
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
      onWheel={onWheel}
      onContextMenu={(e) => e.preventDefault()}
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
