import { create } from 'zustand'
import type { PVElement, Rect, Scene } from '../core/types'
import { cloneBuffer, parseColor, rgbaToHex } from '../core/pixels'
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

function cloneElement(el: PVElement): PVElement {
  if (el.type === 'freedraw') return { ...el, buf: cloneBuffer(el.buf) }
  return { ...el }
}

function cloneScene(s: Scene): Scene {
  return { canvas: { ...s.canvas }, elements: s.elements.map(cloneElement) }
}

const isDarkMode = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches

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
  /** Id del texto que se está editando en el overlay, si hay alguno. */
  editingTextId: string | null

  // Acciones -----------------------------------------------------------------
  pushHistory: () => void
  undo: () => void
  redo: () => void
  touch: (id?: string) => void
  setTool: (t: ToolId) => void
  setOptions: (patch: Partial<ToolOptions>) => void
  setEraserMode: (m: EraserMode) => void
  setViewport: (patch: Partial<Viewport>) => void
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
function snapColor(color: string, paletteId: string | null): string {
  if (!paletteId) return color
  const pal = getPalette(paletteId)
  if (!pal || pal.colors.length === 0) return color
  const target = parseColor(color)
  if (target[3] === 0) return color
  const mapped = nearestColor(target, pal.colors.map((c) => parseColor(c)))
  return rgbaToHex(mapped)
}

const savedSettings = loadSavedSettings()

export const useEditor = create<EditorState>((set, get) => ({
  scene: initialScene(),
  draft: null,
  selection: [],
  tool: 'brush',
  options: {
    ...DEFAULT_TOOL_OPTIONS,
    stroke: isDarkMode ? '#ffffff' : '#1e1e1e',
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

  pushHistory: () =>
    set((s) => {
      const past = [...s.past, cloneScene(s.scene)]
      if (past.length > HISTORY_LIMIT) past.shift()
      return { past, future: [] }
    }),

  undo: () =>
    set((s) => {
      if (s.past.length === 0) return {}
      const prev = s.past[s.past.length - 1]
      // El caché de rasterizado se indexa por (id, rev); tras saltar en el
      // historial esa clave puede apuntar a contenido de otra rama, así que se
      // descarta entero. Es barato: el lienzo se re-rasteriza en un frame.
      invalidateRaster()
      return {
        past: s.past.slice(0, -1),
        future: [cloneScene(s.scene), ...s.future].slice(0, HISTORY_LIMIT),
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
      invalidateRaster()
      return {
        past: [...s.past, cloneScene(s.scene)].slice(-HISTORY_LIMIT),
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
        const el = s.scene.elements.find((e) => e.id === id) ?? (s.draft?.id === id ? s.draft : null)
        if (el) el.rev += 1
      }
      return { version: s.version + 1 }
    }),

  setTool: (tool) =>
    set((s) => ({
      tool,
      // Salir de selección con algo seleccionado y volver a dibujar no debería
      // arrastrar los handles de la selección anterior.
      selection: tool === 'select' ? s.selection : [],
      editingTextId: null,
      draft: null,
    })),

  setOptions: (patch) =>
    set((s) => {
      const next = { ...s.options, ...patch }
      if (patch.stroke) next.stroke = snapColor(patch.stroke, s.restrictPalette)
      if (patch.fill) next.fill = snapColor(patch.fill, s.restrictPalette)
      persistSettings({ options: next })
      return { options: next }
    }),

  setEraserMode: (eraserMode) => set({ eraserMode }),

  setViewport: (patch) => set((s) => ({ viewport: { ...s.viewport, ...patch } })),
  setShowGrid: (showGrid) => set({ showGrid }),
  setTileGrid: (showTileGrid) => set({ showTileGrid }),

  setRestrictPalette: (restrictPalette) =>
    set((s) => {
      const options = { ...s.options }
      if (restrictPalette) {
        options.stroke = snapColor(options.stroke, restrictPalette)
        if (options.fill) options.fill = snapColor(options.fill, restrictPalette)
      }
      persistSettings({ restrictPalette, options })
      return { restrictPalette, options }
    }),

  setDraft: (draft) => set((s) => ({ draft, version: s.version + 1 })),

  addElement: (el, select = false) =>
    set((s) => {
      s.scene.elements.push(el)
      return {
        version: s.version + 1,
        selection: select ? [el.id] : s.selection,
      }
    }),

  updateElement: (id, patch) =>
    set((s) => {
      const el = s.scene.elements.find((e) => e.id === id)
      if (!el) return {}
      Object.assign(el, patch)
      el.rev += 1
      return { version: s.version + 1 }
    }),

  replaceElement: (id, next) =>
    set((s) => {
      const i = s.scene.elements.findIndex((e) => e.id === id)
      if (i < 0) return {}
      s.scene.elements[i] = next
      invalidateRaster(id)
      return {
        version: s.version + 1,
        selection: s.selection.map((sid) => (sid === id ? next.id : sid)),
      }
    }),

  removeElements: (ids) =>
    set((s) => {
      const kill = new Set(ids)
      s.scene.elements = s.scene.elements.filter((e) => !kill.has(e.id))
      for (const id of ids) invalidateRaster(id)
      // Las fuentes de imagen NO se descartan acá: el historial todavía guarda
      // elementos que las referencian, y deshacer un borrado tiene que devolver
      // la imagen con sus píxeles, no un hueco vacío.
      return {
        version: s.version + 1,
        selection: s.selection.filter((id) => !kill.has(id)),
      }
    }),

  reorder: (id, delta) =>
    set((s) => {
      const els = s.scene.elements
      const i = els.findIndex((e) => e.id === id)
      if (i < 0) return {}
      const [el] = els.splice(i, 1)
      let j: number
      if (delta === 'front') j = els.length
      else if (delta === 'back') j = 0
      else j = Math.max(0, Math.min(els.length, i + delta))
      els.splice(j, 0, el)
      return { version: s.version + 1 }
    }),

  setSelection: (selection) => set({ selection }),

  toggleSelection: (id) =>
    set((s) => ({
      selection: s.selection.includes(id)
        ? s.selection.filter((x) => x !== id)
        : [...s.selection, id],
    })),

  selectAll: () =>
    set((s) => ({
      selection: s.scene.elements.filter((e) => !e.locked && !e.hidden).map((e) => e.id),
      tool: 'select',
    })),

  clearCanvas: () => {
    get().pushHistory()
    set((s) => {
      s.scene.elements = []
      invalidateRaster()
      return { version: s.version + 1, selection: [], draft: null }
    })
  },

  setCanvasSize: (w, h) => {
    get().pushHistory()
    set((s) => {
      s.scene.canvas = { ...s.scene.canvas, w: Math.max(1, w), h: Math.max(1, h) }
      return { version: s.version + 1 }
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
      if (dx !== 0 || dy !== 0) {
        // Correr todo lo existente mantiene su posición visual: el origen del
        // lienzo es siempre (0,0), así que si crece hacia arriba/izquierda es
        // el contenido el que tiene que correrse hacia abajo/derecha.
        for (const el of s.scene.elements) {
          el.x += dx
          el.y += dy
          el.rev += 1
        }
        if (s.draft) {
          s.draft.x += dx
          s.draft.y += dy
          s.draft.rev += 1
        }
      }
      s.scene.canvas = { ...s.scene.canvas, w: nw, h: nh }
      return {
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

  // No empuja historial por su cuenta: el selector de color dispara un cambio
  // por cada movimiento del cursor y llenaría la pila de entradas basura. Quien
  // llama empuja una sola vez, al empezar la interacción.
  setBackground: (background) =>
    set((s) => {
      s.scene.canvas = { ...s.scene.canvas, background }
      return { version: s.version + 1 }
    }),

  loadScene: (scene) =>
    set((s) => {
      invalidateRaster()
      return {
        scene,
        selection: [],
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
}))

/** Caja de selección combinada, en coordenadas de píxel del lienzo. */
export function selectionBounds(state: EditorState): Rect | null {
  const sel = new Set(state.selection)
  if (sel.size === 0) return null
  const els = state.scene.elements.filter((e) => sel.has(e.id))
  if (els.length === 0) return null
  return unionBounds(els.map(elementBounds))
}
