import { useState } from 'react'
import { useEditor } from '../state/store'
import { IconEye, IconEyeOff, IconLock, IconTrash, IconUnlock } from './Icons'
import type { PVElement } from '../core/types'

function defaultLabel(el: PVElement): string {
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

export function LayersPanel({ open = false, onClose }: { open?: boolean; onClose: () => void }) {
  const version = useEditor((s) => s.version)
  const selection = useEditor((s) => s.selection)
  void version
  const st = useEditor.getState()
  const elements = [...st.scene.elements].reverse()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')

  const startRename = (el: PVElement) => {
    setEditingId(el.id)
    setEditingValue(el.name || '')
  }

  const finishRename = (id: string) => {
    const trimmed = editingValue.trim()
    st.updateElement(id, { name: trimmed || undefined })
    setEditingId(null)
  }

  const cancelRename = () => {
    setEditingId(null)
  }

  return (
    <aside className={`island layers${open ? ' layers--open' : ''}`} aria-label="Capas">
      <header className="layers__head">
        <h2>Capas</h2>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
          Cerrar
        </button>
      </header>

      {elements.length === 0 && <p className="hint hint--empty">Todavía no dibujaste nada.</p>}

      <ul className="layers__list">
        {elements.map((el) => {
          const active = selection.includes(el.id)
          const isEditing = editingId === el.id
          const label = defaultLabel(el)

          return (
            <li key={el.id} className={`layer${active ? ' layer--active' : ''}`}>
              {isEditing ? (
                <input
                  type="text"
                  className="layer__input"
                  value={editingValue}
                  onChange={(e) => setEditingValue(e.target.value)}
                  onBlur={() => finishRename(el.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') finishRename(el.id)
                    if (e.key === 'Escape') cancelRename()
                  }}
                  autoFocus
                  placeholder={label}
                />
              ) : (
                <button
                  type="button"
                  className="layer__name"
                  onClick={() => {
                    st.setSelection([el.id])
                    st.setTool('select')
                  }}
                  onDoubleClick={() => startRename(el)}
                  title="Doble clic para renombrar"
                >
                  {el.name ? (
                    el.name
                  ) : (
                    <span className="layer__placeholder">{label}</span>
                  )}
                </button>
              )}
              <button
                type="button"
                className="layer__btn"
                data-tooltip={el.hidden ? 'Mostrar' : 'Ocultar'}
                data-tooltip-dir="up"
                onClick={() => st.updateElement(el.id, { hidden: !el.hidden })}
              >
                {el.hidden ? <IconEyeOff /> : <IconEye />}
              </button>
              <button
                type="button"
                className="layer__btn"
                data-tooltip={el.locked ? 'Desbloquear' : 'Bloquear'}
                data-tooltip-dir="up"
                onClick={() => st.updateElement(el.id, { locked: !el.locked })}
              >
                {el.locked ? <IconLock /> : <IconUnlock />}
              </button>
              <button
                type="button"
                className="layer__btn layer__btn--danger"
                data-tooltip="Eliminar"
                data-tooltip-dir="up"
                onClick={() => {
                  st.pushHistory()
                  st.removeElements([el.id])
                }}
              >
                <IconTrash size={15} />
              </button>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
