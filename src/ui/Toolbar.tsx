import { useEditor, type ToolId } from '../state/store'
import { fitToView } from '../canvas/viewport'
import {
  IconArrow,
  IconBrush,
  IconBucket,
  IconDiamond,
  IconDropper,
  IconEllipse,
  IconEraser,
  IconFit,
  IconHand,
  IconHexagon,
  IconImage,
  IconLine,
  IconMeasure,
  IconRect,
  IconRedo,
  IconSelect,
  IconStar,
  IconText,
  IconTriangle,
  IconUndo,
} from './Icons'

interface ToolDef {
  id: ToolId
  label: string
  key: string
  icon: React.ReactNode
}

/** El orden y los atajos siguen la convención de Excalidraw allí donde coinciden. */
export const TOOLS: ToolDef[][] = [
  [
    { id: 'select', label: 'Seleccionar', key: 'V', icon: <IconSelect /> },
    { id: 'hand', label: 'Mano', key: 'H', icon: <IconHand /> },
    { id: 'measure', label: 'Medir', key: 'M', icon: <IconMeasure /> },
  ],
  [
    { id: 'brush', label: 'Pincel', key: 'B', icon: <IconBrush /> },
    { id: 'eraser', label: 'Borrador', key: 'E', icon: <IconEraser /> },
    { id: 'bucket', label: 'Balde', key: 'G', icon: <IconBucket /> },
    { id: 'eyedropper', label: 'Cuentagotas', key: 'I', icon: <IconDropper /> },
  ],
  [
    { id: 'rect', label: 'Rectángulo', key: 'R', icon: <IconRect /> },
    { id: 'ellipse', label: 'Elipse', key: 'O', icon: <IconEllipse /> },
    { id: 'triangle', label: 'Triángulo', key: 'Y', icon: <IconTriangle /> },
    { id: 'diamond', label: 'Rombo', key: 'D', icon: <IconDiamond /> },
    { id: 'star', label: 'Estrella', key: 'S', icon: <IconStar /> },
    { id: 'hexagon', label: 'Hexágono', key: 'X', icon: <IconHexagon /> },
  ],
  [
    { id: 'line', label: 'Línea', key: 'L', icon: <IconLine /> },
    { id: 'arrow', label: 'Flecha', key: 'A', icon: <IconArrow /> },
    { id: 'text', label: 'Texto', key: 'T', icon: <IconText /> },
  ],
]

export const TOOL_KEYS: Record<string, ToolId> = Object.fromEntries(
  TOOLS.flat().map((t) => [t.key.toLowerCase(), t.id]),
)

interface Props {
  onPickImage: () => void
}

export function Toolbar({ onPickImage }: Props) {
  const tool = useEditor((s) => s.tool)
  const setTool = useEditor((s) => s.setTool)
  const canUndo = useEditor((s) => s.past.length > 0)
  const canRedo = useEditor((s) => s.future.length > 0)
  const undo = useEditor((s) => s.undo)
  const redo = useEditor((s) => s.redo)
  const setViewport = useEditor((s) => s.setViewport)

  const handleFit = () => {
    const stage = document.querySelector('.stage')
    const rect = stage?.getBoundingClientRect()
    if (!rect) return
    const st = useEditor.getState()
    setViewport(fitToView(st.scene.canvas.w, st.scene.canvas.h, rect.width, rect.height))
  }

  return (
    <div className="island toolbar" role="toolbar" aria-label="Herramientas">
      <div className="toolbar__group">
        <button
          type="button"
          className="tool"
          disabled={!canUndo}
          onClick={undo}
          data-tooltip="Deshacer — Ctrl+Z"
          aria-label="Deshacer"
        >
          <IconUndo />
        </button>
        <button
          type="button"
          className="tool"
          disabled={!canRedo}
          onClick={redo}
          data-tooltip="Rehacer — Ctrl+Shift+Z"
          aria-label="Rehacer"
        >
          <IconRedo />
        </button>
      </div>

      {TOOLS.map((group, gi) => (
        <div className="toolbar__group" key={gi}>
          {group.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`tool${tool === t.id ? ' tool--active' : ''}`}
              onClick={() => setTool(t.id)}
              data-tooltip={`${t.label} — ${t.key}`}
              aria-label={t.label}
              aria-pressed={tool === t.id}
            >
              {t.icon}
              <span className="tool__key">{t.key}</span>
            </button>
          ))}
        </div>
      ))}
      <div className="toolbar__group">
        <button
          type="button"
          className="tool"
          onClick={onPickImage}
          data-tooltip="Insertar imagen — también podés arrastrarla o pegarla"
          aria-label="Insertar imagen"
        >
          <IconImage />
        </button>
        <button
          type="button"
          className="tool"
          onClick={handleFit}
          data-tooltip="Ajustar lienzo a la pantalla"
          aria-label="Ajustar a la vista"
        >
          <IconFit />
        </button>
      </div>
    </div>
  )
}
