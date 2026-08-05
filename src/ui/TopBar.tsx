import { useEffect, useRef, useState } from 'react'
import { downloadBlob, exportPNG } from '../core/export'
import { clearAutosave, deserializeProject, serializeProject } from '../core/persist'
import { useEditor } from '../state/store'
import {
  IconDownload,
  IconGrid,
  IconHelp,
  IconLayers,
  IconMenu,
  IconRedo,
  IconTrash,
  IconUndo,
  IconUpload,
} from './Icons'

const PRESETS = [16, 32, 48, 64, 96, 128, 256]

interface Props {
  onToggleLayers: () => void
  onToggleHelp: () => void
  layersOpen: boolean
}

export function TopBar({ onToggleLayers, onToggleHelp, layersOpen }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmingClear, setConfirmingClear] = useState(false)
  const [openError, setOpenError] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const canUndo = useEditor((s) => s.past.length > 0)
  const canRedo = useEditor((s) => s.future.length > 0)
  const showGrid = useEditor((s) => s.showGrid)
  const tileGrid = useEditor((s) => s.showTileGrid)
  const version = useEditor((s) => s.version)
  void version

  useEffect(() => {
    if (!menuOpen) {
      setConfirmingClear(false)
      setOpenError(null)
      return
    }
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  const st = useEditor.getState()
  const canvas = st.scene.canvas

  const doExport = async (scale: number) => {
    const blob = await exportPNG(useEditor.getState().scene, scale)
    downloadBlob(blob, `pixelvision-${canvas.w}x${canvas.h}@${scale}x.png`)
    setMenuOpen(false)
  }

  const doSave = () => {
    const json = serializeProject(useEditor.getState().scene)
    downloadBlob(new Blob([json], { type: 'application/json' }), 'proyecto.pixelvision.json')
    setMenuOpen(false)
  }

  const doOpen = async (file: File) => {
    try {
      const scene = deserializeProject(await file.text())
      useEditor.getState().loadScene(scene)
      setMenuOpen(false)
    } catch (err) {
      // El error se muestra dentro del menú: un alert() nativo desentona y
      // además bloquea la página hasta que alguien lo cierre a mano.
      setOpenError((err as Error).message)
    }
  }

  return (
    <div className="topbar">
      <div className="island topbar__group" ref={menuRef}>
        <button
          type="button"
          className="btn btn--icon"
          onClick={() => setMenuOpen((v) => !v)}
          title="Menú"
          aria-label="Menú"
          aria-expanded={menuOpen}
        >
          <IconMenu />
        </button>
        <span className="brand">PixelVision</span>

        {menuOpen && (
          <div className="menu">
            <div className="menu__title">Lienzo</div>
            <div className="menu__row">
              <input
                className="input input--num"
                type="number"
                min={1}
                max={1024}
                value={canvas.w}
                onChange={(e) => st.setCanvasSize(Number(e.target.value) || 1, canvas.h)}
                aria-label="Ancho del lienzo"
              />
              <span className="menu__x">×</span>
              <input
                className="input input--num"
                type="number"
                min={1}
                max={1024}
                value={canvas.h}
                onChange={(e) => st.setCanvasSize(canvas.w, Number(e.target.value) || 1)}
                aria-label="Alto del lienzo"
              />
            </div>
            <div className="menu__chips">
              {PRESETS.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`chip${canvas.w === n && canvas.h === n ? ' chip--active' : ''}`}
                  onClick={() => st.setCanvasSize(n, n)}
                >
                  {n}²
                </button>
              ))}
            </div>

            <div className="menu__sep" />
            <div className="menu__title">Exportar PNG</div>
            <div className="menu__chips">
              {[1, 2, 4, 8, 16].map((k) => (
                <button key={k} type="button" className="chip" onClick={() => void doExport(k)}>
                  {k}×
                </button>
              ))}
            </div>

            <div className="menu__sep" />
            <button type="button" className="menu__item" onClick={doSave}>
              <IconDownload size={16} /> Guardar proyecto (.json)
            </button>
            <button type="button" className="menu__item" onClick={() => fileRef.current?.click()}>
              <IconUpload size={16} /> Abrir proyecto…
            </button>
            {openError && <p className="hint hint--error">No se pudo abrir: {openError}</p>}

            {confirmingClear ? (
              <div className="menu__confirm">
                <span>¿Vaciar el lienzo?</span>
                <div className="row">
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => setConfirmingClear(false)}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm btn--danger"
                    onClick={() => {
                      st.clearCanvas()
                      void clearAutosave()
                      setConfirmingClear(false)
                      setMenuOpen(false)
                    }}
                  >
                    Vaciar
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="menu__item menu__item--danger"
                onClick={() => setConfirmingClear(true)}
              >
                <IconTrash size={16} /> Vaciar lienzo
              </button>
            )}
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void doOpen(f)
            e.target.value = ''
          }}
        />
      </div>

      <div className="island topbar__group">
        <button
          type="button"
          className="btn btn--icon"
          disabled={!canUndo}
          onClick={() => st.undo()}
          title="Deshacer — Ctrl+Z"
          aria-label="Deshacer"
        >
          <IconUndo />
        </button>
        <button
          type="button"
          className="btn btn--icon"
          disabled={!canRedo}
          onClick={() => st.redo()}
          title="Rehacer — Ctrl+Shift+Z"
          aria-label="Rehacer"
        >
          <IconRedo />
        </button>
      </div>

      <div className="island topbar__group">
        <button
          type="button"
          className={`btn btn--icon${showGrid ? ' btn--on' : ''}`}
          onClick={() => st.setShowGrid(!showGrid)}
          title="Grilla de píxeles"
          aria-label="Grilla de píxeles"
          aria-pressed={showGrid}
        >
          <IconGrid />
        </button>
        <select
          className="input input--tiny"
          value={tileGrid}
          onChange={(e) => st.setTileGrid(Number(e.target.value))}
          title="Grilla de tiles"
          aria-label="Grilla de tiles"
        >
          <option value={0}>sin tiles</option>
          <option value={8}>8 px</option>
          <option value={16}>16 px</option>
          <option value={32}>32 px</option>
        </select>
        <button
          type="button"
          className={`btn btn--icon${layersOpen ? ' btn--on' : ''}`}
          onClick={onToggleLayers}
          title="Capas"
          aria-label="Capas"
          aria-pressed={layersOpen}
        >
          <IconLayers />
        </button>
        <button
          type="button"
          className="btn btn--icon"
          onClick={onToggleHelp}
          title="Atajos de teclado"
          aria-label="Atajos de teclado"
        >
          <IconHelp />
        </button>
      </div>
    </div>
  )
}
