import { useCallback, useEffect, useRef, useState } from 'react'
import { CanvasStage } from './canvas/CanvasStage'
import { Toolbar, TOOL_KEYS } from './ui/Toolbar'
import { PropertiesPanel } from './ui/PropertiesPanel'
import { LayersPanel } from './ui/LayersPanel'
import { TopBar } from './ui/TopBar'
import { ZoomControls } from './ui/ZoomControls'
import { ShortcutsHelp } from './ui/ShortcutsHelp'
import { useEditor } from './state/store'
import { cloneBuffer } from './core/pixels'
import { newId } from './core/elements'
import { loadAutosave, saveAutosave, serializeSelection, deserializeSelection } from './core/persist'
import { decodeImageBlob, newSourceId, putImageSource } from './core/image/imageStore'
import { suggestScaleMode } from './core/image/processImage'
import { fitToView } from './canvas/viewport'
import type { ImageElement } from './core/types'

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
}

const TOOL_INFO: Record<string, { title: string; desc: string }> = {
  select: { title: 'Seleccionar', desc: 'Arrastra y escala figuras. Doble clic para editar texto.' },
  hand: { title: 'Mano', desc: 'Arrastra el lienzo para moverte.' },
  brush: { title: 'Pincel', desc: 'Dibuja trazos libres. Clic derecho borra.' },
  eraser: { title: 'Borrador', desc: 'Borra trazos o figuras (Shift alterna el modo de borrado).' },
  bucket: { title: 'Balde', desc: 'Rellena con color continuo áreas conectadas.' },
  eyedropper: { title: 'Cuentagotas', desc: 'Toca el lienzo para absorber un color.' },
  rect: { title: 'Rectángulo', desc: 'Dibuja rectángulos (Shift para cuadrado, Alt desde el centro).' },
  ellipse: { title: 'Elipse', desc: 'Dibuja elipses (Shift para círculo, Alt desde el centro).' },
  triangle: { title: 'Triángulo', desc: 'Dibuja triángulos (Shift para equilátero).' },
  diamond: { title: 'Rombo', desc: 'Dibuja rombos simétricos.' },
  star: { title: 'Estrella', desc: 'Dibuja estrellas de 5 puntas.' },
  hexagon: { title: 'Hexágono', desc: 'Dibuja hexágonos regulares.' },
  line: { title: 'Línea', desc: 'Dibuja líneas rectas (Shift para ángulos de 45°).' },
  arrow: { title: 'Flecha', desc: 'Dibuja flechas indicadoras (Shift para ángulos de 45°).' },
  text: { title: 'Texto', desc: 'Toca el lienzo para escribir texto retro.' },
}

export default function App() {
  const [layersOpen, setLayersOpen] = useState(false)
  const [propsOpen, setPropsOpen] = useState(window.innerWidth > 768)
  const [helpOpen, setHelpOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const activeTool = useEditor((s) => s.tool)
  const info = TOOL_INFO[activeTool]

  // --- Restauración del autoguardado -----------------------------------------
  const restored = useRef(false)
  useEffect(() => {
    if (restored.current) return
    restored.current = true
    void loadAutosave().then((scene) => {
      if (scene && scene.elements.length > 0) useEditor.getState().loadScene(scene)
    })
  }, [])

  // --- Autoguardado con rebote ------------------------------------------------
  useEffect(() => {
    let timer: number | undefined
    const unsub = useEditor.subscribe(() => {
      if (timer) window.clearTimeout(timer)
      // El rebote evita escribir en IndexedDB en cada píxel de un trazo.
      timer = window.setTimeout(() => {
        void saveAutosave(useEditor.getState().scene).catch(() => {})
      }, 800)
    })
    return () => {
      if (timer) window.clearTimeout(timer)
      unsub()
    }
  }, [])

  // --- Atajos de teclado ------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return
      const st = useEditor.getState()
      const mod = e.ctrlKey || e.metaKey

      if (mod && e.shiftKey && e.key.toLowerCase() === 'c') {
        e.preventDefault()
        const rect = document.querySelector('.stage')?.getBoundingClientRect()
        if (rect) {
          st.setViewport(fitToView(st.scene.canvas.w, st.scene.canvas.h, rect.width, rect.height))
        }
        return
      }

      if (mod && !e.shiftKey && e.key.toLowerCase() === 'c') {
        if (st.selection.length === 0) return
        e.preventDefault()
        const selectedElements = st.scene.elements.filter((el) => st.selection.includes(el.id))
        const json = serializeSelection(selectedElements)
        void navigator.clipboard.writeText(json).catch(() => {})
        ;(window as any)._pvClipboard = json
        return
      }

      if (mod && e.key.toLowerCase() === 'v') {
        e.preventDefault()
        const pasteElements = (json: string) => {
          try {
            const { elements } = deserializeSelection(json)
            if (elements.length === 0) return
            st.pushHistory()
            const copies = elements.map((el) =>
              el.type === 'freedraw'
                ? { ...el, id: newId(), buf: cloneBuffer(el.buf), x: el.x + 10, y: el.y + 10 }
                : { ...el, id: newId(), x: el.x + 10, y: el.y + 10 },
            )
            for (const c of copies) st.addElement(c)
            st.setSelection(copies.map((c) => c.id))
          } catch (err) {
            console.error('Error al pegar elementos:', err)
          }
        }

        navigator.clipboard.readText()
          .then((text) => {
            if (text && text.includes('pixelvision-elements')) {
              pasteElements(text)
            } else if ((window as any)._pvClipboard) {
              pasteElements((window as any)._pvClipboard)
            }
          })
          .catch(() => {
            if ((window as any)._pvClipboard) {
              pasteElements((window as any)._pvClipboard)
            }
          })
        return
      }

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) st.redo()
        else st.undo()
        return
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        st.redo()
        return
      }
      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        st.selectAll()
        return
      }
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        if (st.selection.length === 0) return
        st.pushHistory()
        const copies = st.scene.elements
          .filter((el) => st.selection.includes(el.id))
          .map((el) =>
            el.type === 'freedraw'
              ? { ...el, id: newId(), buf: cloneBuffer(el.buf), x: el.x + 1, y: el.y + 1 }
              : { ...el, id: newId(), x: el.x + 1, y: el.y + 1 },
          )
        for (const c of copies) st.addElement(c)
        st.setSelection(copies.map((c) => c.id))
        return
      }
      if (mod) return

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (st.selection.length === 0) return
        e.preventDefault()
        st.pushHistory()
        st.removeElements(st.selection)
        return
      }

      if (e.key === 'Escape') {
        st.setSelection([])
        st.setEditingText(null)
        setHelpOpen(false)
        return
      }

      if (e.key.startsWith('Arrow') && st.selection.length > 0) {
        e.preventDefault()
        const d = e.shiftKey ? 10 : 1
        const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0
        const dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0
        st.pushHistory()
        for (const id of st.selection) {
          const el = st.scene.elements.find((x) => x.id === id)
          if (el) st.updateElement(id, { x: el.x + dx, y: el.y + dy })
        }
        return
      }

      if (e.key === '[') {
        st.setOptions({ brushSize: Math.max(1, st.options.brushSize - 1) })
        return
      }
      if (e.key === ']') {
        st.setOptions({ brushSize: Math.min(32, st.options.brushSize + 1) })
        return
      }

      if (e.shiftKey && e.key === '!') {
        const rect = document.querySelector('.stage')?.getBoundingClientRect()
        if (rect) {
          st.setViewport(fitToView(st.scene.canvas.w, st.scene.canvas.h, rect.width, rect.height))
        }
        return
      }

      const tool = TOOL_KEYS[e.key.toLowerCase()]
      if (tool) st.setTool(tool)
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // --- Insertar imagen desde el selector de archivos --------------------------
  const importFile = useCallback(async (file: File) => {
    const src = await decodeImageBlob(file)
    const st = useEditor.getState()
    const cw = st.scene.canvas.w
    const ch = st.scene.canvas.h
    const k = Math.min(1, cw / src.w, ch / src.h)
    const w = Math.max(1, Math.round(src.w * k))
    const h = Math.max(1, Math.round(src.h * k))
    const srcId = newSourceId()
    putImageSource(srcId, src)
    const el: ImageElement = {
      id: newId('img'),
      rev: 0,
      type: 'image',
      x: Math.floor((cw - w) / 2),
      y: Math.floor((ch - h) / 2),
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
  }, [])

  return (
    <div className="app">
      <CanvasStage />

      <TopBar
        layersOpen={layersOpen}
        propsOpen={propsOpen}
        onToggleLayers={() => setLayersOpen((v) => !v)}
        onToggleProps={() => setPropsOpen((v) => !v)}
        onToggleHelp={() => setHelpOpen((v) => !v)}
      />
      <Toolbar onPickImage={() => fileRef.current?.click()} />
      {(propsOpen || layersOpen) && (
        <div
          className="mobile-backdrop"
          onClick={() => {
            setPropsOpen(false)
            setLayersOpen(false)
          }}
        />
      )}
      {info && (
        <div className="island tool-help-pill">
          <strong>{info.title}:</strong> <span>{info.desc}</span>
        </div>
      )}
      <PropertiesPanel open={propsOpen} onClose={() => setPropsOpen(false)} />
      <LayersPanel open={layersOpen} onClose={() => setLayersOpen(false)} />
      <ZoomControls />
      {helpOpen && <ShortcutsHelp onClose={() => setHelpOpen(false)} />}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void importFile(f)
          e.target.value = ''
        }}
      />
    </div>
  )
}
