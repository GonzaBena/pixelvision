import type { ImageElement, PVElement } from '../core/types'
import { flattenElement } from '../core/elements'
import { flipElement, rotateElement } from '../core/transforms'
import { PALETTES } from '../core/palettes'
import { useEditor } from '../state/store'
import { CanvasBackground } from './CanvasBackground'
import { ColorPicker } from './ColorPicker'
import {
  IconFlatten,
  IconFlipH,
  IconFlipV,
  IconLayers,
  IconRotate,
  IconTrash,
} from './Icons'

const SHAPE_TOOLS = new Set(['rect', 'ellipse', 'triangle', 'diamond', 'star', 'hexagon'])
const STROKE_TOOLS = new Set([...SHAPE_TOOLS, 'line', 'arrow'])

interface PropertiesPanelProps {
  open?: boolean
  onClose?: () => void
}

export function PropertiesPanel({ open = false, onClose }: PropertiesPanelProps) {
  const tool = useEditor((s) => s.tool)
  const options = useEditor((s) => s.options)
  const setOptions = useEditor((s) => s.setOptions)
  const eraserMode = useEditor((s) => s.eraserMode)
  const setEraserMode = useEditor((s) => s.setEraserMode)
  const restrictPalette = useEditor((s) => s.restrictPalette)
  const setRestrictPalette = useEditor((s) => s.setRestrictPalette)
  const selection = useEditor((s) => s.selection)
  const version = useEditor((s) => s.version)
  void version

  const st = useEditor.getState()
  const selected = st.scene.elements.filter((e) => selection.includes(e.id))
  const showShape = SHAPE_TOOLS.has(tool) || selected.some((e) => ['rect', 'ellipse', 'poly'].includes(e.type))
  const showStroke = STROKE_TOOLS.has(tool) || selected.some((e) => e.type === 'line')
  const showBrush = tool === 'brush' || (tool === 'eraser' && eraserMode === 'pixel')
  const showText = tool === 'text' || selected.some((e) => e.type === 'text')
  const imageEl = selected.find((e): e is ImageElement => e.type === 'image')

  // El fondo del lienzo se muestra siempre: pertenece al lienzo, no a la
  // herramienta, y es lo primero que alguien busca al abrir la app.
  const showDrawingOptions = !(tool === 'hand' || (tool === 'select' && selected.length === 0))

  /** Aplica un cambio de color tanto a la herramienta como a lo seleccionado. */
  const applyColor = (key: 'stroke' | 'fill', v: string | null) => {
    setOptions({ [key]: v } as never)
    if (selected.length === 0) return
    st.pushHistory()
    for (const el of selected) {
      if (el.type === 'text' && key === 'stroke') st.updateElement(el.id, { color: v ?? '#000000' })
      else if ('stroke' in el || 'fill' in el) st.updateElement(el.id, { [key]: v } as Partial<PVElement>)
    }
  }

  const applyNumber = (key: string, v: number) => {
    setOptions({ [key]: v } as never)
    if (selected.length === 0) return
    st.pushHistory()
    for (const el of selected) {
      if (key === 'strokeWidth' && 'strokeWidth' in el) st.updateElement(el.id, { strokeWidth: v })
      if (key === 'radius' && el.type === 'rect') st.updateElement(el.id, { radius: v })
      if (key === 'fontScale' && el.type === 'text') st.updateElement(el.id, { scale: v })
      if (key === 'opacity') st.updateElement(el.id, { opacity: v })
    }
  }

  return (
    <aside className={`island panel${open ? ' panel--open' : ''}`} aria-label="Propiedades">
      <div className="panel__head-mobile">
        <span className="panel__title-mobile">Propiedades</span>
        {onClose && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
            Cerrar
          </button>
        )}
      </div>

      <CanvasBackground />

      {showDrawingOptions && <div className="panel__sep" />}

      {showDrawingOptions && (showStroke || showBrush || showText) && (
        <ColorPicker
          label={showText ? 'Color del texto' : 'Trazo'}
          value={options.stroke}
          onChange={(v) => v && applyColor('stroke', v)}
        />
      )}

      {showShape && (
        <ColorPicker label="Relleno" value={options.fill} onChange={(v) => applyColor('fill', v)} allowNone />
      )}

      {showBrush && (
        <>
          <div className="field">
            <span className="field__label">Tamaño del pincel</span>
            <div className="row">
              <input
                type="range"
                min={1}
                max={32}
                value={options.brushSize}
                onChange={(e) => setOptions({ brushSize: Number(e.target.value) })}
                aria-label="Tamaño del pincel"
              />
              <span className="num">{options.brushSize}</span>
            </div>
          </div>
          <div className="field">
            <span className="field__label">Punta</span>
            <div className="segmented">
              <button
                type="button"
                className={options.brushShape === 'square' ? 'is-active' : ''}
                onClick={() => setOptions({ brushShape: 'square' })}
              >
                Cuadrada
              </button>
              <button
                type="button"
                className={options.brushShape === 'circle' ? 'is-active' : ''}
                onClick={() => setOptions({ brushShape: 'circle' })}
              >
                Redonda
              </button>
            </div>
          </div>
        </>
      )}

      {tool === 'eraser' && (
        <div className="field">
          <span className="field__label">Modo del borrador</span>
          <div className="segmented">
            <button
              type="button"
              className={eraserMode === 'object' ? 'is-active' : ''}
              onClick={() => setEraserMode('object')}
              title="Borra el objeto entero, como en Excalidraw"
            >
              Objeto
            </button>
            <button
              type="button"
              className={eraserMode === 'pixel' ? 'is-active' : ''}
              onClick={() => setEraserMode('pixel')}
              title="Borra píxeles sueltos; aplana la figura si hace falta"
            >
              Píxel
            </button>
          </div>
        </div>
      )}

      {showStroke && (
        <div className="field">
          <span className="field__label">Grosor del contorno</span>
          <div className="row">
            <input
              type="range"
              min={0}
              max={12}
              value={options.strokeWidth}
              onChange={(e) => applyNumber('strokeWidth', Number(e.target.value))}
              aria-label="Grosor del contorno"
            />
            <span className="num">{options.strokeWidth}</span>
          </div>
        </div>
      )}

      {(tool === 'rect' || selected.some((e) => e.type === 'rect')) && (
        <div className="field">
          <span className="field__label">Esquinas</span>
          <div className="row">
            <input
              type="range"
              min={0}
              max={24}
              value={options.radius}
              onChange={(e) => applyNumber('radius', Number(e.target.value))}
              aria-label="Radio de las esquinas"
            />
            <span className="num">{options.radius}</span>
          </div>
        </div>
      )}

      {tool === 'bucket' && (
        <div className="field">
          <span className="field__label">Tolerancia</span>
          <div className="row">
            <input
              type="range"
              min={0}
              max={128}
              value={options.tolerance}
              onChange={(e) => setOptions({ tolerance: Number(e.target.value) })}
              aria-label="Tolerancia del balde"
            />
            <span className="num">{options.tolerance}</span>
          </div>
        </div>
      )}

      {showText && <TextOptions />}

      {imageEl && <ImageOptions el={imageEl} />}

      {showDrawingOptions && (
        <>
          <div className="field">
            <span className="field__label">Opacidad</span>
            <div className="row">
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={options.opacity}
                onChange={(e) => applyNumber('opacity', Number(e.target.value))}
                aria-label="Opacidad"
              />
              <span className="num">{Math.round(options.opacity * 100)}</span>
            </div>
          </div>

          <div className="field">
            <span className="field__label">Restringir a paleta</span>
            <select
              className="input"
              value={restrictPalette ?? ''}
              onChange={(e) => setRestrictPalette(e.target.value || null)}
              aria-label="Restringir a paleta"
            >
              <option value="">Color libre</option>
              {PALETTES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      {selected.length > 0 && <SelectionActions />}
    </aside>
  )
}

function TextOptions() {
  const options = useEditor((s) => s.options)
  const setOptions = useEditor((s) => s.setOptions)
  const selection = useEditor((s) => s.selection)
  const st = useEditor.getState()
  const texts = st.scene.elements.filter((e) => e.type === 'text' && selection.includes(e.id))

  const apply = (patch: Record<string, unknown>) => {
    setOptions(patch as never)
    if (texts.length === 0) return
    st.pushHistory()
    for (const el of texts) st.updateElement(el.id, patch as Partial<PVElement>)
  }

  return (
    <>
      <div className="field">
        <span className="field__label">Fuente</span>
        <select
          className="input"
          value={options.fontId}
          onChange={(e) => apply({ fontId: e.target.value })}
          aria-label="Fuente"
        >
          <option value="pv5x7">PV 5×7 (bitmap)</option>
          <option value="pv3x5">PV 3×5 (diminuta)</option>
          <option value="system">Fuente del sistema</option>
        </select>
      </div>

      {options.fontId === 'system' ? (
        <>
          <div className="field">
            <span className="field__label">Tipografía</span>
            <input
              className="input"
              value={options.systemFamily}
              onChange={(e) => apply({ systemFamily: e.target.value })}
              spellCheck={false}
              aria-label="Familia tipográfica"
            />
          </div>
          <div className="field">
            <span className="field__label">Tamaño</span>
            <div className="row">
              <input
                type="range"
                min={5}
                max={64}
                value={options.systemSize}
                onChange={(e) => apply({ systemSize: Number(e.target.value) })}
                aria-label="Tamaño de fuente"
              />
              <span className="num">{options.systemSize}</span>
            </div>
          </div>
          <div className="field">
            <span className="field__label" title="Alpha por encima del cual el píxel se enciende">
              Umbral de nitidez
            </span>
            <div className="row">
              <input
                type="range"
                min={1}
                max={254}
                value={options.systemThreshold}
                onChange={(e) => apply({ systemThreshold: Number(e.target.value) })}
                aria-label="Umbral de nitidez"
              />
              <span className="num">{options.systemThreshold}</span>
            </div>
          </div>
        </>
      ) : (
        <div className="field">
          <span className="field__label">Escala</span>
          <div className="row">
            <input
              type="range"
              min={1}
              max={8}
              value={options.fontScale}
              onChange={(e) => apply({ scale: Number(e.target.value), fontScale: Number(e.target.value) })}
              aria-label="Escala del texto"
            />
            <span className="num">{options.fontScale}×</span>
          </div>
        </div>
      )}

      <div className="field">
        <span className="field__label">Alineación</span>
        <div className="segmented">
          {(['left', 'center', 'right'] as const).map((a) => (
            <button
              key={a}
              type="button"
              className={options.align === a ? 'is-active' : ''}
              onClick={() => apply({ align: a })}
            >
              {a === 'left' ? 'Izq.' : a === 'center' ? 'Centro' : 'Der.'}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

/**
 * Los parámetros de importación siguen vivos: cambiarlos reprocesa desde la
 * imagen original guardada, no desde el resultado ya degradado.
 */
function ImageOptions({ el }: { el: ImageElement }) {
  const st = useEditor.getState()
  const update = (patch: Partial<ImageElement>) => {
    st.pushHistory()
    st.updateElement(el.id, patch)
  }

  return (
    <>
      <div className="field field--group">
        <span className="field__label">Imagen</span>
        <p className="hint">
          Los píxeles totalmente transparentes no se pintan; el resto queda 100 % opaco.
        </p>
      </div>

      <div className="field">
        <span className="field__label" title="Alpha por debajo o igual a este valor se descarta">
          Umbral de transparencia
        </span>
        <div className="row">
          <input
            type="range"
            min={0}
            max={254}
            value={el.alphaThreshold}
            onChange={(e) => update({ alphaThreshold: Number(e.target.value) })}
            aria-label="Umbral de transparencia"
          />
          <span className="num">{el.alphaThreshold}</span>
        </div>
      </div>

      <div className="field">
        <span className="field__label">Escalado</span>
        <div className="segmented">
          <button
            type="button"
            className={el.scaleMode === 'nearest' ? 'is-active' : ''}
            onClick={() => update({ scaleMode: 'nearest' })}
            title="Fiel al pixel art original"
          >
            Nearest
          </button>
          <button
            type="button"
            className={el.scaleMode === 'box' ? 'is-active' : ''}
            onClick={() => update({ scaleMode: 'box' })}
            title="Promedia; mejor para fotos que se reducen mucho"
          >
            Promedio
          </button>
        </div>
      </div>

      <div className="field">
        <span className="field__label">Reducir colores</span>
        <div className="row">
          <input
            type="range"
            min={0}
            max={64}
            value={el.quantize ?? 0}
            onChange={(e) => update({ quantize: Number(e.target.value) || null })}
            aria-label="Cantidad de colores"
          />
          <span className="num">{el.quantize ?? '—'}</span>
        </div>
      </div>
    </>
  )
}

function SelectionActions() {
  const selection = useEditor((s) => s.selection)
  const st = useEditor.getState()
  const selected = st.scene.elements.filter((e) => selection.includes(e.id))

  const each = (fn: (el: PVElement) => void) => {
    st.pushHistory()
    for (const el of selected) fn(el)
  }

  return (
    <div className="field field--actions">
      <span className="field__label">Acciones</span>
      <div className="btnrow">
        <button
          type="button"
          className="btn btn--icon"
          title="Voltear horizontal"
          onClick={() => each((el) => st.updateElement(el.id, flipElement(el, 'x')))}
        >
          <IconFlipH />
        </button>
        <button
          type="button"
          className="btn btn--icon"
          title="Voltear vertical"
          onClick={() => each((el) => st.updateElement(el.id, flipElement(el, 'y')))}
        >
          <IconFlipV />
        </button>
        <button
          type="button"
          className="btn btn--icon"
          title="Rotar 90°"
          onClick={() => each((el) => st.updateElement(el.id, rotateElement(el, 1)))}
        >
          <IconRotate />
        </button>
        <button
          type="button"
          className="btn btn--icon"
          title="Traer al frente"
          onClick={() => each((el) => st.reorder(el.id, 'front'))}
        >
          <IconLayers />
        </button>
        <button
          type="button"
          className="btn btn--icon"
          title="Aplanar a píxeles: convierte la figura en píxeles editables a mano"
          onClick={() =>
            each((el) => {
              const flat = flattenElement(el)
              if (flat && flat.id !== el.id) st.replaceElement(el.id, flat)
            })
          }
        >
          <IconFlatten />
        </button>
        <button
          type="button"
          className="btn btn--icon btn--danger"
          title="Eliminar — Supr"
          onClick={() => {
            st.pushHistory()
            st.removeElements(selection)
          }}
        >
          <IconTrash />
        </button>
      </div>
    </div>
  )
}
