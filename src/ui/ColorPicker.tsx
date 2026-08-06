import { useEffect, useRef, useState } from 'react'
import { DEFAULT_SWATCHES, getPalette } from '../core/palettes'
import { useEditor, snapColor } from '../state/store'

interface Props {
  label: string
  value: string | null
  onChange: (v: string | null) => void
  /** Permite el valor "sin color" (relleno vacío). */
  allowNone?: boolean
  restrictPalette?: string | null
}

export function ColorPicker({ label, value, onChange, allowNone = false, restrictPalette = null }: Props) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value ?? '#000000')
  const recent = useEditor((s) => s.recentColors)
  const ref = useRef<HTMLDivElement>(null)

  const palette = restrictPalette ? getPalette(restrictPalette) : null
  const swatches = palette ? palette.colors : DEFAULT_SWATCHES
  const snappedValue = value && restrictPalette ? snapColor(value, restrictPalette) : value

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
        {swatches.slice(0, 5).map((c) => (
          <button
            key={c}
            type="button"
            className={`swatch${snappedValue === c ? ' swatch--active' : ''}`}
            style={{ background: c }}
            onClick={() => onChange(c)}
            title={c}
            aria-label={`Color ${c}`}
          />
        ))}
        <span className="swatches__sep" />
        <button
          type="button"
          className={`swatch swatch--current${snappedValue === null ? ' swatch--none' : ''}`}
          style={snappedValue ? { background: snappedValue } : undefined}
          onClick={() => setOpen((v) => !v)}
          title="Elegir color"
          aria-label="Elegir color"
        />
      </div>

      {open && (
        <div className="popover">
          <div className="popover__grid">
            {swatches.map((c) => (
              <button
                key={c}
                type="button"
                className={`swatch${snappedValue === c ? ' swatch--active' : ''}`}
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
