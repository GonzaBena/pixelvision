import { useEditor } from '../state/store'
import { fitToView, nextZoom } from '../canvas/viewport'
import { IconFit, IconMinus, IconPlus } from './Icons'

export function ZoomControls() {
  const zoom = useEditor((s) => s.viewport.zoom)
  const setViewport = useEditor((s) => s.setViewport)

  const step = (dir: 1 | -1) => {
    const stage = document.querySelector('.stage')
    const rect = stage?.getBoundingClientRect()
    const st = useEditor.getState()
    const cx = (rect?.width ?? 0) / 2
    const cy = (rect?.height ?? 0) / 2
    const z = nextZoom(st.viewport.zoom, dir)
    // Se hace zoom hacia el centro del stage, no hacia el origen.
    const canvasX = (cx - st.viewport.panX) / st.viewport.zoom
    const canvasY = (cy - st.viewport.panY) / st.viewport.zoom
    setViewport({ zoom: z, panX: cx - canvasX * z, panY: cy - canvasY * z })
  }

  const fit = () => {
    const stage = document.querySelector('.stage')
    const rect = stage?.getBoundingClientRect()
    if (!rect) return
    const st = useEditor.getState()
    setViewport(fitToView(st.scene.canvas.w, st.scene.canvas.h, rect.width, rect.height))
  }

  return (
    <div className="island zoom">
      <button
        type="button"
        className="btn btn--icon"
        onClick={() => step(-1)}
        data-tooltip="Alejar"
        data-tooltip-dir="up"
        aria-label="Alejar"
      >
        <IconMinus />
      </button>
      <button
        type="button"
        className="zoom__value"
        onClick={fit}
        data-tooltip="Ajustar a la vista — Shift+1"
        data-tooltip-dir="up"
      >
        {zoom >= 1 ? `${Math.round(zoom)}×` : `${Math.round(zoom * 100)}%`}
      </button>
      <button
        type="button"
        className="btn btn--icon"
        onClick={() => step(1)}
        data-tooltip="Acercar"
        data-tooltip-dir="up"
        aria-label="Acercar"
      >
        <IconPlus />
      </button>
      <button
        type="button"
        className="btn btn--icon"
        onClick={fit}
        data-tooltip="Ajustar a la vista"
        data-tooltip-dir="up"
        aria-label="Ajustar a la vista"
      >
        <IconFit />
      </button>
    </div>
  )
}
