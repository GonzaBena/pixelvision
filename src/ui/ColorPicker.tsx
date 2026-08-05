import { useEffect, useRef, useState } from 'react'
import { DEFAULT_SWATCHES } from '../core/palettes'
import { useEditor } from '../state/store'

interface Props {
  label: string
  value: string | null
  onChange: (v: string | null) => void
  /** Permite el valor "sin color" (relleno vacío). */
  allowNone?: boolean
}

export function ColorPicker({ label, value, onChange, allowNone = false }: Props) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value ?? '#000000')
  const recent = useEditor((s) => s.recentColors)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => setDraft(value ?? '#000000'), [value])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
    }
  }, [open])

  const commitHex = (raw: string) => {
    const v = raw.startsWith('#') ? raw : `#${raw}`
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) onChange(v)
  }

  return (
    <div className="field" ref={ref}>
      <span className="field__label">{label}</span>
      <div className="swatches">
        {DEFAULT_SWATCHES.slice(0, 5).map((c) => (
          <button
            key={c}
            type="button"
            className={`swatch${value === c ? ' swatch--active' : ''}`}
            style={{ background: c }}
            onClick={() => onChange(c)}
            title={c}
            aria-label={`Color ${c}`}
          />
        ))}
        <span className="swatches__sep" />
        <button
          type="button"
          className={`swatch swatch--current${value === null ? ' swatch--none' : ''}`}
          style={value ? { background: value } : undefined}
          onClick={() => setOpen((v) => !v)}
          title="Elegir color"
          aria-label="Elegir color"
        />
      </div>

      {open && (
        <div className="popover">
          <div className="popover__grid">
            {DEFAULT_SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                className={`swatch${value === c ? ' swatch--active' : ''}`}
                style={{ background: c }}
                onClick={() => onChange(c)}
                title={c}
              />
            ))}
          </div>

          {recent.length > 0 && (
            <>
              <div className="popover__title">Recientes</div>
              <div className="popover__grid">
                {recent.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="swatch"
                    style={{ background: c }}
                    onClick={() => onChange(c)}
                    title={c}
                  />
                ))}
              </div>
            </>
          )}

          <div className="popover__row">
            <input
              type="color"
              className="colorinput"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value)
                onChange(e.target.value)
              }}
              aria-label="Selector de color"
            />
            <input
              type="text"
              className="input input--hex"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value)
                commitHex(e.target.value)
              }}
              spellCheck={false}
              aria-label="Color en hexadecimal"
            />
          </div>

          {allowNone && (
            <button type="button" className="btn btn--ghost btn--wide" onClick={() => onChange(null)}>
              Sin relleno
            </button>
          )}
        </div>
      )}
    </div>
  )
}
