import { create } from 'zustand'
import type { PVElement, Rect, Scene } from '../core/types'
import { parseColor, rgbaToHex } from '../core/pixels'
import { freezeBuffer } from '../core/cow'
import { DEFAULT_TOOL_OPTIONS, type ToolOptions } from '../core/elements'
import { invalidateRaster } from '../core/render/rasterize'
import { getPalette } from '../core/palettes'
import { nearestColor } from '../core/image/quantize'
import { elementBounds, unionBounds } from '../core/render/hitTest'

export type ToolId =
  | 'select'
  | 'hand'
  | 'brush'
  | 'eraser'
  | 'bucket'
  | 'eyedropper'
  | 'line'
  | 'arrow'
  | 'rect'
  | 'ellipse'
  | 'triangle'
  | 'diamond'
  | 'star'
  | 'hexagon'
  | 'text'
  | 'measure'

export type EraserMode = 'object' | 'pixel'

export interface Viewport {
  zoom: number
  panX: number
  panY: number
}

const HISTORY_LIMIT = 80

/**
 * Techo de seguridad para el auto-crecimiento del lienzo. Con zoom bajo un
 * click accidental lejos del contenido puede pedir un lienzo de miles de
 * píxeles de lado; sin este límite eso intentaría reservar gigabytes.
 */
const MAX_CANVAS_DIM = 4096

const isDarkMode = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches

function getElementDefaultTypeName(el: PVElement): string {
  switch (el.type) {
    case 'freedraw':
      return 'Trazo'
    case 'rect':
      return 'Rectángulo'
    case 'ellipse':
      return 'Elipse'
    case 'line':
      return el.arrow ? 'Flecha' : 'Línea'
    case 'poly':
      return {
        triangle: 'Triángulo',
        diamond: 'Rombo',
        star: 'Estrella',
        hexagon: 'Hexágono',
      }[el.variant]
    case 'text':
      return el.text.split('\n')[0].slice(0, 18) || 'Texto'
    case 'image':
      return 'Imagen'
  }
}

function initialScene(): Scene {
  return {
    canvas: { w: 64, h: 64, background: isDarkMode ? '#1e1e1e' : null },
    elements: [],
  }
}

export interface EditorState {
  scene: Scene
  /** Figura en curso mientras se arrastra; se dibuja arriba sin entrar a la escena. */
  draft: PVElement | null
  selection: string[]
  keyObjectId: string | null
  tool: ToolId
  options: ToolOptions
  eraserMode: EraserMode
  viewport: Viewport
  showGrid: boolean
  showTileGrid: number
  /** Id de paleta a la que se ajusta todo color elegido, o null para color libre. */
  restrictPalette: string | null
  recentColors: string[]
  /** Se incrementa en cada cambio; es lo que dispara el redibujado del canvas. */
  version: number
  past: Scene[]
  future: Scene[]
  editingTextId: string | null
  isProcessing: boolean
  canvasBaseWidth: number
  canvasBaseHeight: number

  // Acciones -----------------------------------------------------------------
  shrinkToFit: () => void
  pushHistory: () => void
  undo: () => void
  redo: () => void
  touch: (id?: string) => void
  setTool: (t: ToolId) => void
  setOptions: (patch: Partial<ToolOptions>) => void
  setEraserMode: (m: EraserMode) => void
  setViewport: (patch: Partial<Viewport>) => void
  setKeyObjectId: (id: string | null) => void
  setShowGrid: (v: boolean) => void
  setTileGrid: (n: number) => void
  setRestrictPalette: (id: string | null) => void
  setDraft: (el: PVElement | null) => void
  addElement: (el: PVElement, select?: boolean) => void
  updateElement: (id: string, patch: Partial<PVElement>) => void
  removeElements: (ids: string[]) => void
  replaceElement: (id: string, el: PVElement) => void
  reorder: (id: string, delta: number | 'front' | 'back') => void
  setSelection: (ids: string[]) => void
  toggleSelection: (id: string) => void
  selectAll: () => void
  clearCanvas: () => void
  setCanvasSize: (w: number, h: number) => void
  /**
   * Agranda el lienzo lo justo para que `rect` (coordenadas de píxel actuales)
   * entre entero, corriendo todos los elementos si el crecimiento es hacia
   * arriba/izquierda. Devuelve el corrimiento aplicado (0,0 si no hizo falta),
   * para que quien llama pueda re-anclar las coordenadas de un arrastre en curso.
   */
  growToFit: (rect: Rect) => { dx: number; dy: number }
  setBackground: (color: string | null) => void
  loadScene: (scene: Scene) => void
  setEditingText: (id: string | null) => void
  getElement: (id: string) => PVElement | undefined
  pushRecentColor: (color: string) => void
  setIsProcessing: (v: boolean) => void
}

const SETTINGS_KEY = 'pixelvision_tool_settings_v1'

interface SavedSettings {
  options?: Partial<ToolOptions>
  recentColors?: string[]
  restrictPalette?: string | null
}

function loadSavedSettings(): SavedSettings | null {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(SETTINGS_KEY) : null
    if (!raw) return null
    return JSON.parse(raw) as SavedSettings
  } catch {
    return null
  }
}

function persistSettings(patch: SavedSettings) {
  try {
    if (typeof localStorage === 'undefined') return
    const current = loadSavedSettings() || {}
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...current, ...patch }))
  } catch {
    // Ignorar errores de cuota de disco
  }
}

/** Ajusta un color a la entrada más cercana de la paleta activa, si hay una. */
export function snapColor(color: string, paletteId: string | null): string {
  if (!paletteId) return color
  const pal = getPalette(paletteId)
  if (!pal || pal.colors.length === 0) return color
  const target = parseColor(color)
  if (target[3] === 0) return color
  const mapped = nearestColor(target, pal.colors.map((c) => parseColor(c)))
  return rgbaToHex(mapped)
}

function shrinkToFitHelper(s: {
  scene: Scene
  canvasBaseWidth: number
  canvasBaseHeight: number
  draft: PVElement | null
  version: number
  viewport: Viewport
}): Partial<EditorState> {
  const { w: cw, h: ch } = s.scene.canvas
  const baseW = s.canvasBaseWidth
  const baseH = s.canvasBaseHeight

  let minX = 0
  let minY = 0
  let maxX = baseW
  let maxY = baseH

  if (s.scene.elements.length > 0) {
    const bounds = unionBounds(s.scene.elements.map(elementBounds))
    if (bounds) {
      minX = Math.min(0, bounds.x)
      minY = Math.min(0, bounds.y)
      maxX = Math.max(baseW, bounds.x + bounds.w)
      maxY = Math.max(baseH, bounds.y + bounds.h)
    }
  }

  const nw = Math.max(1, Math.round(maxX - minX))
  const nh = Math.max(1, Math.round(maxY - minY))
  const dx = Math.round(-minX)
  const dy = Math.round(-minY)

  if (dx === 0 && dy === 0 && nw === cw && nh === ch) return {}

  const elements = s.scene.elements.map((el) => {
    const next = { ...el, x: el.x + dx }
    next.rev += 1
    return next as PVElement
  })

  const draft = s.draft
    ? ({ ...s.draft, x: s.draft.x + dx, rev: s.draft.rev + 1 } as PVElement)
    : null

  return {
    scene: {
      ...s.scene,
      canvas: { ...s.scene.canvas, w: nw, h: nh },
      elements,
    },
    draft,
    version: s.version + 1,
    viewport: {
      ...s.viewport,
      panX: s.viewport.panX - dx * s.viewport.zoom,
      panY: s.viewport.panY - dy * s.viewport.zoom,
    },
  }
}

const savedSettings = loadSavedSettings()

export const useEditor = create<EditorState>((set, get) => ({
  scene: initialScene(),
  draft: null,
  selection: [],
  keyObjectId: null,
  tool: 'brush',
  options: {
    ...DEFAULT_TOOL_OPTIONS,
    stroke: isDarkMode ? '#ffffff' : '#1e1e1e',
    restrictPalette: savedSettings?.restrictPalette ?? null,
    ...(savedSettings?.options ?? {}),
  },
  eraserMode: 'pixel',
  viewport: { zoom: 8, panX: 0, panY: 0 },
  showGrid: true,
  showTileGrid: 0,
  restrictPalette: savedSettings?.restrictPalette ?? null,
  recentColors: savedSettings?.recentColors ?? [],
  version: 0,
  past: [],
  future: [],
  editingTextId: null,
  isProcessing: false,
  canvasBaseWidth: 64,
  canvasBaseHeight: 64,

  shrinkToFit: () =>
    set((s) => {
      const patch = shrinkToFitHelper(s)
      return patch
    }),

  pushHistory: () =>
    set((s) => {
      // Congelar los buffers de los elementos freedraw actuales para Copy-On-Write
      for (const el of s.scene.elements) {
        if (el.type === 'freedraw') freezeBuffer(el.buf)
      }
      const past = [...s.past, s.scene]
      if (past.length > HISTORY_LIMIT) past.shift()
      return { past, future: [] }
    }),

  undo: () =>
    set((s) => {
      if (s.past.length === 0) return {}
      const prev = s.past[s.past.length - 1]
      
      // Invalidación selectiva: diff entre escenas
      const mapCurr = new Map(s.scene.elements.map((e) => [e.id, e.rev]))
      const mapPrev = new Map(prev.elements.map((e) => [e.id, e.rev]))
      for (const [id, revCurr] of mapCurr.entries()) {
        const revPrev = mapPrev.get(id)
        if (revPrev === undefined || revPrev !== revCurr) invalidateRaster(id)
      }
      for (const id of mapPrev.keys()) {
        if (!mapCurr.has(id)) invalidateRaster(id)
      }

      return {
        past: s.past.slice(0, -1),
        future: [s.scene, ...s.future].slice(0, HISTORY_LIMIT),
        scene: prev,
        selection: [],
        draft: null,
        editingTextId: null,
        version: s.version + 1,
      }
    }),

  redo: () =>
    set((s) => {
      if (s.future.length === 0) return {}
      const next = s.future[0]
      
      // Invalidación selectiva: diff entre escenas
      const mapCurr = new Map(s.scene.elements.map((e) => [e.id, e.rev]))
      const mapNext = new Map(next.elements.map((e) => [e.id, e.rev]))
      for (const [id, revCurr] of mapCurr.entries()) {
        const revNext = mapNext.get(id)
        if (revNext === undefined || revNext !== revCurr) invalidateRaster(id)
      }
      for (const id of mapNext.keys()) {
        if (!mapCurr.has(id)) invalidateRaster(id)
      }

      return {
        past: [...s.past, s.scene].slice(-HISTORY_LIMIT),
        future: s.future.slice(1),
        scene: next,
        selection: [],
        draft: null,
        editingTextId: null,
        version: s.version + 1,
      }
    }),

  touch: (id) =>
    set((s) => {
      if (id) {
        const elements = s.scene.elements.map((el) => {
          if (el.id === id) {
            return { ...el, rev: el.rev + 1 } as PVElement
          }
          return el
        })
        const draft = s.draft?.id === id ? ({ ...s.draft, rev: s.draft.rev + 1 } as PVElement) : s.draft
        return {
          scene: { ...s.scene, elements },
          draft,
          version: s.version + 1,
        }
      }
      return { version: s.version + 1 }
    }),

  setTool: (tool) =>
    set((s) => ({
      tool,
      selection: tool === 'select' ? s.selection : [],
      editingTextId: null,
      draft: null,
    })),

  setOptions: (patch) =>
    set((s) => {
      const next = { ...s.options, ...patch }
      persistSettings({ options: next })
      return { options: next }
    }),

  setEraserMode: (eraserMode) => set({ eraserMode }),

  setViewport: (patch) => set((s) => ({ viewport: { ...s.viewport, ...patch } })),
  setShowGrid: (showGrid) => set({ showGrid }),
  setTileGrid: (showTileGrid) => set({ showTileGrid }),

  setRestrictPalette: (restrictPalette) =>
    set((s) => {
      const options = { ...s.options, restrictPalette }
      persistSettings({ restrictPalette, options })
      let elements = s.scene.elements
      if (s.selection.length > 0) {
        const sel = new Set(s.selection)
        elements = s.scene.elements.map((el) => {
          if (sel.has(el.id)) {
            invalidateRaster(el.id)
            return { ...el, restrictPalette, rev: el.rev + 1 } as PVElement
          }
          return el
        })
      }
      return {
        restrictPalette,
        options,
        scene: { ...s.scene, elements },
        version: s.version + 1,
      }
    }),

  setDraft: (draft) => set((s) => ({ draft, version: s.version + 1 })),

  addElement: (el, select = false) =>
    set((s) => {
      let namedEl = el
      if (!el.name) {
        const count = s.scene.elements.filter((e) => e.type === el.type).length + 1
        const typeName = getElementDefaultTypeName(el)
        namedEl = { ...el, name: `${typeName} ${count}` }
      }
      const elements = [...s.scene.elements, namedEl]
      return {
        scene: { ...s.scene, elements },
        version: s.version + 1,
        selection: select ? [namedEl.id] : s.selection,
      }
    }),

  updateElement: (id, patch) =>
    set((s) => {
      const elements = s.scene.elements.map((e) => {
        if (e.id === id) {
          const next = { ...e, ...patch }
          next.rev += 1
          invalidateRaster(id)
          return next as PVElement
        }
        return e
      })
      return {
        scene: { ...s.scene, elements },
        version: s.version + 1,
      }
    }),

  replaceElement: (id, next) =>
    set((s) => {
      const elements = s.scene.elements.map((e) => (e.id === id ? next : e))
      invalidateRaster(id)
      return {
        scene: { ...s.scene, elements },
        version: s.version + 1,
        selection: s.selection.map((sid) => (sid === id ? next.id : sid)),
      }
    }),

  removeElements: (ids) =>
    set((s) => {
      const kill = new Set(ids)
      const elements = s.scene.elements.filter((e) => !kill.has(e.id))
      for (const id of ids) invalidateRaster(id)
      const nextSelection = s.selection.filter((id) => !kill.has(id))
      const keyObjectId = nextSelection.length > 1 && s.keyObjectId && nextSelection.includes(s.keyObjectId)
        ? s.keyObjectId
        : null
      const nextState = {
        ...s,
        scene: { ...s.scene, elements },
        version: s.version + 1,
        selection: nextSelection,
        keyObjectId,
      }
      const shrinkPatch = shrinkToFitHelper(nextState)
      return {
        ...nextState,
        ...shrinkPatch,
      }
    }),

  reorder: (id, delta) =>
    set((s) => {
      const els: PVElement[] = [...s.scene.elements]
      const i = els.findIndex((e) => e.id === id)
      if (i < 0) return {}
      const [el] = els.splice(i, 1)
      let j: number
      if (delta === 'front') j = els.length
      else if (delta === 'back') j = 0
      else j = Math.max(0, Math.min(els.length, i + delta))
      els.splice(j, 0, el)
      return {
        scene: { ...s.scene, elements: els },
        version: s.version + 1,
      }
    }),

  setSelection: (selection) =>
    set((s) => {
      const keyObjectId = selection.length > 1 && s.keyObjectId && selection.includes(s.keyObjectId)
        ? s.keyObjectId
        : null
      return { selection, keyObjectId }
    }),

  toggleSelection: (id) =>
    set((s) => {
      const nextSelection = s.selection.includes(id)
        ? s.selection.filter((x) => x !== id)
        : [...s.selection, id]
      const keyObjectId = nextSelection.length > 1 && s.keyObjectId && nextSelection.includes(s.keyObjectId)
        ? s.keyObjectId
        : null
      return {
        selection: nextSelection,
        keyObjectId,
      }
    }),

  selectAll: () =>
    set((s) => ({
      selection: s.scene.elements.filter((e) => !e.locked && !e.hidden).map((e) => e.id),
      keyObjectId: null,
      tool: 'select',
    })),

  setKeyObjectId: (keyObjectId) => set({ keyObjectId }),

  clearCanvas: () => {
    get().pushHistory()
    set((s) => {
      invalidateRaster()
      return {
        scene: {
          ...s.scene,
          canvas: { ...s.scene.canvas, w: s.canvasBaseWidth, h: s.canvasBaseHeight },
          elements: [],
        },
        version: s.version + 1,
        selection: [],
        draft: null,
      }
    })
  },

  setCanvasSize: (w, h) => {
    get().pushHistory()
    set((s) => {
      const nw = Math.max(1, w)
      const nh = Math.max(1, h)
      return {
        canvasBaseWidth: nw,
        canvasBaseHeight: nh,
        scene: {
          ...s.scene,
          canvas: { ...s.scene.canvas, w: nw, h: nh },
        },
        version: s.version + 1,
      }
    })
  },

  growToFit: (rect) => {
    let shift = { dx: 0, dy: 0 }
    set((s) => {
      const { w: cw, h: ch } = s.scene.canvas
      const minX = Math.min(0, rect.x)
      const minY = Math.min(0, rect.y)
      let maxX = Math.max(cw, rect.x + rect.w)
      let maxY = Math.max(ch, rect.y + rect.h)
      maxX = Math.min(maxX, minX + MAX_CANVAS_DIM)
      maxY = Math.min(maxY, minY + MAX_CANVAS_DIM)
      const nw = Math.max(1, Math.round(maxX - minX))
      const nh = Math.max(1, Math.round(maxY - minY))
      const dx = Math.round(-minX)
      const dy = Math.round(-minY)
      if (dx === 0 && dy === 0 && nw === cw && nh === ch) return {}

      shift = { dx, dy }
      let elements = s.scene.elements
      let draft = s.draft
      if (dx !== 0 || dy !== 0) {
        elements = s.scene.elements.map((el) => {
          const next = { ...el, x: el.x + dx }
          next.rev += 1
          return next as PVElement
        })
        if (draft) {
          draft = { ...draft, x: draft.x + dx } as PVElement
          draft.rev += 1
        }
      }
      return {
        scene: {
          canvas: { ...s.scene.canvas, w: nw, h: nh },
          elements,
        },
        draft,
        version: s.version + 1,
        viewport: {
          ...s.viewport,
          panX: s.viewport.panX - dx * s.viewport.zoom,
          panY: s.viewport.panY - dy * s.viewport.zoom,
        },
      }
    })
    return shift
  },

  setBackground: (background) =>
    set((s) => {
      return {
        scene: {
          ...s.scene,
          canvas: { ...s.scene.canvas, background },
        },
        version: s.version + 1,
      }
    }),

  loadScene: (scene) =>
    set((s) => {
      invalidateRaster()
      const elements = scene.elements.map((el, i) => {
        if (el.name) return el
        const count = scene.elements.slice(0, i).filter((e) => e.type === el.type).length + 1
        const typeName = getElementDefaultTypeName(el)
        return { ...el, name: `${typeName} ${count}` }
      })
      return {
        scene: { ...scene, elements },
        canvasBaseWidth: scene.canvas.w,
        canvasBaseHeight: scene.canvas.h,
        selection: [],
        keyObjectId: null,
        draft: null,
        past: [],
        future: [],
        editingTextId: null,
        version: s.version + 1,
      }
    }),

  setEditingText: (editingTextId) => set({ editingTextId }),

  getElement: (id) => get().scene.elements.find((e) => e.id === id),

  pushRecentColor: (color) =>
    set((s) => {
      const recentColors = [color, ...s.recentColors.filter((c) => c !== color)].slice(0, 12)
      persistSettings({ recentColors })
      return { recentColors }
    }),

  setIsProcessing: (isProcessing) => set({ isProcessing }),
}))

/** Caja de selección combinada, en coordenadas de píxel del lienzo. */
export function selectionBounds(state: EditorState): Rect | null {
  const sel = new Set(state.selection)
  if (sel.size === 0) return null
  const els = state.scene.elements.filter((e) => sel.has(e.id))
  if (els.length === 0) return null
  return unionBounds(els.map(elementBounds))
}
