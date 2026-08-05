import { useEffect, useRef } from 'react'
import { useEditor } from '../state/store'
import { elementBounds } from '../core/render/hitTest'
import { canvasToScreen, type ViewTransform } from './viewport'

interface Props {
  getTransform: () => ViewTransform
}

/**
 * Editor de texto flotante.
 *
 * Deliberadamente no intenta superponer un caret sobre el texto dibujado: las
 * métricas de una fuente bitmap no coinciden con las de ninguna fuente del
 * navegador, así que el caret quedaría desfasado. En cambio se escribe en un
 * campo anclado al elemento y el lienzo muestra el resultado real en vivo.
 */
export function TextOverlay({ getTransform }: Props) {
  const editingId = useEditor((s) => s.editingTextId)
  const version = useEditor((s) => s.version)
  const taRef = useRef<HTMLTextAreaElement>(null)
  /**
   * El campo se abre desde un pointerdown sobre el lienzo, y el navegador sigue
   * procesando ese mismo clic después. Sin esta bandera, el blur que llega antes
   * del foco confirmaría un texto vacío y borraría el elemento recién creado.
   */
  const focused = useRef(false)

  useEffect(() => {
    focused.current = false
    if (!editingId) return
    // Se pide el foco en el frame siguiente, para ganarle al clic en curso.
    const raf = requestAnimationFrame(() => taRef.current?.focus())
    return () => cancelAnimationFrame(raf)
  }, [editingId])

  if (!editingId) return null
  const st = useEditor.getState()
  const el = st.scene.elements.find((e) => e.id === editingId)
  if (!el || el.type !== 'text') return null

  const t = getTransform()
  const b = elementBounds(el)
  const top = canvasToScreen(t, b.x, b.y + Math.max(b.h, 1))
  void version // recalcula la posición mientras se escribe

  const commit = () => {
    const cur = useEditor.getState()
    const target = cur.scene.elements.find((e) => e.id === editingId)
    if (target && target.type === 'text' && target.text.trim() === '') {
      cur.removeElements([editingId])
    }
    cur.setEditingText(null)
  }

  /** Un blur previo al primer foco es el eco del clic que abrió el campo: se ignora. */
  const onBlur = () => {
    if (focused.current) commit()
  }

  return (
    <div className="textedit" style={{ left: top.x, top: top.y + 8 }}>
      <textarea
        ref={taRef}
        className="textedit__input"
        value={el.text}
        rows={Math.min(6, el.text.split('\n').length + 1)}
        placeholder="Escribí el texto…"
        onChange={(e) => {
          const cur = useEditor.getState()
          cur.updateElement(editingId, { text: e.target.value })
          const updated = cur.scene.elements.find((x) => x.id === editingId)
          if (updated) cur.growToFit(elementBounds(updated))
        }}
        onFocus={() => {
          focused.current = true
        }}
        onBlur={onBlur}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Escape') {
            e.preventDefault()
            commit()
          }
          // Enter inserta salto de línea; Ctrl/Cmd+Enter confirma.
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            commit()
          }
        }}
      />
      <div className="textedit__hint">Esc o Ctrl+Enter para confirmar</div>
    </div>
  )
}
