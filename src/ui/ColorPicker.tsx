import { useEffect, useRef, useState } from 'react'
import { DEFAULT_SWATCHES, getPalette } from '../core/palettes'
import { useEditor, snapColor } from '../state/store'
import { hexToHsl, hslToHex, hslToRgb } from '../core/pixels'

interface Props {
  label: string
  value: string | null
  onChange: (v: string | null) => void
  /** Permite el valor "sin color" (relleno vacío). */
  allowNone?: boolean
  restrictPalette?: string | null
}

interface SLPickerProps {
  h: number
  s: number
  l: number
  onChange: (s: number, l: number) => void
}

function SaturationLightnessPicker({ h, s, l, onChange }: SLPickerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const w = canvas.width
    const height = canvas.height
    const imgData = ctx.createImageData(w, height)

    for (let y = 0; y < height; y++) {
      const lVal = 100 - (y / (height - 1)) * 100 // 100% arriba, 0% abajo
      for (let x = 0; x < w; x++) {
        const sVal = (x / (w - 1)) * 100 // 0% izquierda, 100% derecha
        const [r, g, b] = hslToRgb(h, sVal, lVal)
        const idx = (y * w + x) * 4
        imgData.data[idx] = r
        imgData.data[idx + 1] = g
        imgData.data[idx + 2] = b
        imgData.data[idx + 3] = 255
      }
    }
    ctx.putImageData(imgData, 0, 0)
  }, [h])

  const handlePointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
    onChange(Math.round(x * 100), Math.round((1 - y) * 100))
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    handlePointer(e)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      handlePointer(e)
    }
  }

  return (
    <div
      ref={containerRef}
      className="sl-picker"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
    >
      <canvas ref={canvasRef} width={200} height={120} className="sl-picker__canvas" />
      <div
        className="sl-picker__handle"
        style={{
          left: `${s}%`,
          top: `${100 - l}%`,
        }}
      />
    </div>
  )
}

export function ColorPicker({ label, value, onChange, allowNone = false, restrictPalette = null }: Props) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value ?? '#000000')
  const recent = useEditor((s) => s.recentColors)
  const ref = useRef<HTMLDivElement>(null)

  const palette = restrictPalette ? getPalette(restrictPalette) : null
  const swatches = palette ? palette.colors : DEFAULT_SWATCHES
  const snappedValue = value && restrictPalette ? snapColor(value, restrictPalette) : value

  const [hsl, setHsl] = useState(() => hexToHsl(value ?? '#000000'))

  useEffect(() => {
    const nextVal = value ?? '#000000'
    setDraft(nextVal)
    
    // Evitamos pisar el matiz (H) actual si el cambio de color externo
    // produce el mismo HEX que el actual HSL (ej. en grises).
    const currentHex = hslToHex(hsl.h, hsl.s, hsl.l)
    if (currentHex !== nextVal) {
      setHsl(hexToHsl(nextVal))
    }
  }, [value])

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
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) {
      onChange(v)
      setHsl(hexToHsl(v))
    }
  }

  const updateHsl = (newH: number, newS: number, newL: number) => {
    const newHex = hslToHex(newH, newS, newL)
    setHsl({ h: newH, s: newS, l: newL })
    setDraft(newHex)
    onChange(newHex)
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
          <div className="popover__hsl">
            <SaturationLightnessPicker
              h={hsl.h}
              s={hsl.s}
              l={hsl.l}
              onChange={(newS, newL) => updateHsl(hsl.h, newS, newL)}
            />
            <input
              type="range"
              min="0"
              max="360"
              value={hsl.h}
              onChange={(e) => updateHsl(parseInt(e.target.value), hsl.s, hsl.l)}
              className="hue-slider"
              aria-label="Matiz (Hue)"
            />
          </div>

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
            <div
              className="color-preview"
              style={{ background: draft }}
              aria-label="Color actual"
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
