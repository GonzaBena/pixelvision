import { useEffect, useRef, useState } from 'react'
import { useEditor } from '../state/store'

/** Presets rápidos. `null` = transparente (se ve el damero y el PNG sale con alpha). */
const PRESETS: Array<{ value: string | null; label: string }> = [
  { value: null, label: 'Transparente' },
  { value: '#ffffff', label: 'Blanco' },
  { value: '#1e1e1e', label: 'Negro' },
  { value: '#f1f3f5', label: 'Gris claro' },
  { value: '#1d2b53', label: 'Azul noche' },
]

export function CanvasBackground() {
  const version = useEditor((s) => s.version)
  void version
  const background = useEditor.getState().scene.canvas.background
  const [draft, setDraft] = useState(background ?? '#ffffff')
  /** Evita apilar una entrada de historial por cada paso del selector de color. */
  const dragging = useRef(false)

  useEffect(() => {
    if (background) setDraft(background)
  }, [background])

  const set = (value: string | null) => {
    const st = useEditor.getState()
    st.pushHistory()
    st.setBackground(value)
  }

  return (
    <div className="field">
      <span className="field__label">Fondo del lienzo</span>
      <div className="swatches">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            className={[
              'swatch',
              p.value === null ? 'swatch--none' : '',
              background === p.value ? 'swatch--active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={p.value ? { background: p.value } : undefined}
            onClick={() => set(p.value)}
            title={p.label}
            aria-label={`Fondo ${p.label}`}
          />
        ))}
        <span className="swatches__sep" />
        <input
          type="color"
          className="colorinput colorinput--sm"
          value={draft}
          onPointerDown={() => {
            if (dragging.current) return
            dragging.current = true
            useEditor.getState().pushHistory()
          }}
          onChange={(e) => {
            setDraft(e.target.value)
            useEditor.getState().setBackground(e.target.value)
          }}
          onBlur={() => {
            dragging.current = false
          }}
          title="Color de fondo personalizado"
          aria-label="Color de fondo personalizado"
        />
      </div>
    </div>
  )
}
