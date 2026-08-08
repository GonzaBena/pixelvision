import { useEditor } from '../state/store'
import { newId } from '../core/elements'
import { cloneBuffer } from '../core/pixels'
import { serializeSelection, deserializeSelection } from '../core/persist'
import { flipElement, boundsOf } from '../core/transforms'
import { elementBounds } from '../core/render/hitTest'

interface ContextMenuProps {
  x: number
  y: number
  visible: boolean
  onClose: () => void
  onOpenMoveModal: () => void
  onOpenScaleModal: () => void
}

export function ContextMenu({
  x,
  y,
  visible,
  onClose,
  onOpenMoveModal,
  onOpenScaleModal,
}: ContextMenuProps) {
  if (!visible) return null

  const st = useEditor.getState()
  const selection = useEditor((s) => s.selection)
  const elements = useEditor((s) => s.scene.elements)
  const canvas = useEditor((s) => s.scene.canvas)

  const hasSelection = selection.length > 0

  // 1. Cut
  const handleCut = () => {
    if (!hasSelection) return
    const selectedElements = elements.filter((el) => selection.includes(el.id))
    const json = serializeSelection(selectedElements)
    void navigator.clipboard.writeText(json).catch(() => {})
    ;(window as any)._pvClipboard = json

    st.pushHistory()
    st.removeElements(selection)
    st.setSelection([])
    onClose()
  }

  // 2. Copy
  const handleCopy = () => {
    if (!hasSelection) return
    const selectedElements = elements.filter((el) => selection.includes(el.id))
    const json = serializeSelection(selectedElements)
    void navigator.clipboard.writeText(json).catch(() => {})
    ;(window as any)._pvClipboard = json
    onClose()
  }

  // 3. Paste
  const handlePaste = () => {
    const pasteElements = (json: string) => {
      try {
        const { elements: parsedElements } = deserializeSelection(json)
        if (parsedElements.length === 0) return
        st.pushHistory()
        const copies = parsedElements.map((el) =>
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
      .finally(() => {
        onClose()
      })
  }

  // 4. Duplicate
  const handleDuplicate = () => {
    if (!hasSelection) return
    st.pushHistory()
    const copies = elements
      .filter((el) => selection.includes(el.id))
      .map((el) =>
        el.type === 'freedraw'
          ? { ...el, id: newId(), buf: cloneBuffer(el.buf), x: el.x + 10, y: el.y + 10 }
          : { ...el, id: newId(), x: el.x + 10, y: el.y + 10 },
      )
    for (const c of copies) st.addElement(c)
    st.setSelection(copies.map((c) => c.id))
    onClose()
  }

  // 5. Delete
  const handleDelete = () => {
    if (!hasSelection) return
    st.pushHistory()
    st.removeElements(selection)
    st.setSelection([])
    onClose()
  }

  // 6. Align
  const handleAlign = (type: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
    if (!hasSelection) return
    const selectedElements = elements.filter((el) => selection.includes(el.id))

    // Check if there is a key object selected for reference
    const keyEl = selection.length > 1 && st.keyObjectId
      ? elements.find((e) => e.id === st.keyObjectId)
      : null

    const referenceBounds = keyEl
      ? elementBounds(keyEl)
      : (selection.length > 1
          ? boundsOf(selectedElements)
          : { x: 0, y: 0, w: canvas.w, h: canvas.h })

    if (!referenceBounds) return

    st.pushHistory()
    for (const el of selectedElements) {
      // Don't move the key object itself!
      if (keyEl && el.id === keyEl.id) continue

      const b = elementBounds(el)
      let dx = 0
      let dy = 0
      if (type === 'left') dx = referenceBounds.x - b.x
      if (type === 'center') dx = referenceBounds.x + (referenceBounds.w - b.w) / 2 - b.x
      if (type === 'right') dx = referenceBounds.x + referenceBounds.w - b.w - b.x
      if (type === 'top') dy = referenceBounds.y - b.y
      if (type === 'middle') dy = referenceBounds.y + (referenceBounds.h - b.h) / 2 - b.y
      if (type === 'bottom') dy = referenceBounds.y + referenceBounds.h - b.h - b.y

      st.updateElement(el.id, {
        x: el.x + Math.round(dx),
        y: el.y + Math.round(dy),
      })
    }
    onClose()
  }

  // 7. Depth ordering
  const handleReorder = (delta: number | 'front' | 'back') => {
    if (!hasSelection) return
    st.pushHistory()

    const sortedSelection = [...selection].sort((a, b) => {
      const idxA = elements.findIndex((e) => e.id === a)
      const idxB = elements.findIndex((e) => e.id === b)
      return idxA - idxB
    })

    if (delta === 'front') {
      for (const id of sortedSelection) {
        st.reorder(id, 'front')
      }
    } else if (delta === 'back') {
      for (const id of [...sortedSelection].reverse()) {
        st.reorder(id, 'back')
      }
    } else {
      const order = delta === 1 ? [...sortedSelection].reverse() : sortedSelection
      for (const id of order) {
        st.reorder(id, delta)
      }
    }
    onClose()
  }

  // 8. Transformations
  const handleScale = () => {
    if (!hasSelection) return
    onOpenScaleModal()
    onClose()
  }

  const handleMove = () => {
    if (!hasSelection) return
    onOpenMoveModal()
    onClose()
  }

  const handleFlip = (axis: 'x' | 'y') => {
    if (!hasSelection) return
    st.pushHistory()
    for (const id of selection) {
      const el = elements.find((e) => e.id === id)
      if (el) {
        st.updateElement(id, flipElement(el, axis))
      }
    }
    onClose()
  }

  const isCloseToRight = window.innerWidth - x < 250
  const isCloseToBottom = window.innerHeight - y < 350

  return (
    <>
      <div
        className="context-menu-backdrop"
        onClick={onClose}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      />
      <div
        className={`context-menu ${isCloseToRight ? 'context-menu--right-aligned' : ''} ${
          isCloseToBottom ? 'context-menu--bottom-aligned' : ''
        }`}
        style={{ top: y, left: x }}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button type="button" className="context-menu__btn" onClick={handleCut} disabled={!hasSelection}>
          <span>Cortar</span>
          <span className="context-menu__shortcut">Ctrl+X</span>
        </button>
        <button type="button" className="context-menu__btn" onClick={handleCopy} disabled={!hasSelection}>
          <span>Copiar</span>
          <span className="context-menu__shortcut">Ctrl+C</span>
        </button>
        <button type="button" className="context-menu__btn" onClick={handlePaste}>
          <span>Pegar</span>
          <span className="context-menu__shortcut">Ctrl+V</span>
        </button>
        <button type="button" className="context-menu__btn" onClick={handleDuplicate} disabled={!hasSelection}>
          <span>Duplicar</span>
          <span className="context-menu__shortcut">Ctrl+D</span>
        </button>
        <button type="button" className="context-menu__btn context-menu__btn--danger" onClick={handleDelete} disabled={!hasSelection}>
          <span>Eliminar</span>
          <span className="context-menu__shortcut">Supr</span>
        </button>

        <div className="context-menu__divider" />

        <div className={`context-menu__item-nested ${!hasSelection ? 'context-menu__item-nested--disabled' : ''}`}>
          <div className="context-menu__btn">
            <span>Alinear</span>
            <span className="context-menu__arrow">▶</span>
          </div>
          <div className="context-menu__submenu">
            <button type="button" className="context-menu__btn" onClick={() => handleAlign('left')}>
              Alinear a la izquierda
            </button>
            <button type="button" className="context-menu__btn" onClick={() => handleAlign('center')}>
              Centrar horizontalmente
            </button>
            <button type="button" className="context-menu__btn" onClick={() => handleAlign('right')}>
              Alinear a la derecha
            </button>
            <div className="context-menu__divider" />
            <button type="button" className="context-menu__btn" onClick={() => handleAlign('top')}>
              Alinear arriba
            </button>
            <button type="button" className="context-menu__btn" onClick={() => handleAlign('middle')}>
              Centrar verticalmente
            </button>
            <button type="button" className="context-menu__btn" onClick={() => handleAlign('bottom')}>
              Alinear abajo
            </button>
          </div>
        </div>

        <div className={`context-menu__item-nested ${!hasSelection ? 'context-menu__item-nested--disabled' : ''}`}>
          <div className="context-menu__btn">
            <span>Colocar</span>
            <span className="context-menu__arrow">▶</span>
          </div>
          <div className="context-menu__submenu">
            <button type="button" className="context-menu__btn" onClick={() => handleReorder('front')}>
              Traer al frente
            </button>
            <button type="button" className="context-menu__btn" onClick={() => handleReorder(1)}>
              Traer adelante
            </button>
            <button type="button" className="context-menu__btn" onClick={() => handleReorder(-1)}>
              Enviar atrás
            </button>
            <button type="button" className="context-menu__btn" onClick={() => handleReorder('back')}>
              Enviar al fondo
            </button>
          </div>
        </div>

        <div className={`context-menu__item-nested ${!hasSelection ? 'context-menu__item-nested--disabled' : ''}`}>
          <div className="context-menu__btn">
            <span>Transformar</span>
            <span className="context-menu__arrow">▶</span>
          </div>
          <div className="context-menu__submenu">
            <button type="button" className="context-menu__btn" onClick={handleScale}>
              Escalar...
            </button>
            <button type="button" className="context-menu__btn" onClick={handleMove}>
              Mover en X / Y...
            </button>
            <div className="context-menu__divider" />
            <button type="button" className="context-menu__btn" onClick={() => handleFlip('x')}>
              Voltear horizontalmente
            </button>
            <button type="button" className="context-menu__btn" onClick={() => handleFlip('y')}>
              Voltear verticalmente
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
