import { elementLabel } from '../core/elements'
import { useEditor } from '../state/store'
import { IconEye, IconEyeOff, IconLock, IconTrash, IconUnlock } from './Icons'

export function LayersPanel({ onClose }: { onClose: () => void }) {
  const version = useEditor((s) => s.version)
  const selection = useEditor((s) => s.selection)
  void version
  const st = useEditor.getState()
  // Se muestran de arriba hacia abajo, como el z-order que ve el usuario.
  const elements = [...st.scene.elements].reverse()

  return (
    <aside className="island layers" aria-label="Capas">
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
          return (
            <li key={el.id} className={`layer${active ? ' layer--active' : ''}`}>
              <button
                type="button"
                className="layer__name"
                onClick={() => {
                  st.setSelection([el.id])
                  st.setTool('select')
                }}
                title={elementLabel(el)}
              >
                {elementLabel(el)}
              </button>
              <button
                type="button"
                className="layer__btn"
                title={el.hidden ? 'Mostrar' : 'Ocultar'}
                onClick={() => st.updateElement(el.id, { hidden: !el.hidden })}
              >
                {el.hidden ? <IconEyeOff /> : <IconEye />}
              </button>
              <button
                type="button"
                className="layer__btn"
                title={el.locked ? 'Desbloquear' : 'Bloquear'}
                onClick={() => st.updateElement(el.id, { locked: !el.locked })}
              >
                {el.locked ? <IconLock /> : <IconUnlock />}
              </button>
              <button
                type="button"
                className="layer__btn layer__btn--danger"
                title="Eliminar"
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
