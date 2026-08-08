import { useState, useEffect } from 'react'

interface MoveModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (dx: number, dy: number) => void
}

export function MoveModal({ isOpen, onClose, onConfirm }: MoveModalProps) {
  const [dx, setDx] = useState(10)
  const [dy, setDy] = useState(10)

  useEffect(() => {
    if (isOpen) {
      setDx(10)
      setDy(10)
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onConfirm(dx, dy)
    onClose()
  }

  return (
    <div
      className="modal"
      role="dialog"
      aria-modal="true"
      aria-label="Mover selección"
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className="modal__backdrop"
        onClick={onClose}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      />
      <div className="island modal__body" style={{ maxWidth: '320px' }}>
        <header className="modal__head">
          <h2>Mover selección</h2>
        </header>
        <form onSubmit={handleSubmit}>
          <div className="modal-form-col">
            <div className="modal-form-field">
              <label htmlFor="move-x">Desplazamiento X (píxeles)</label>
              <input
                id="move-x"
                type="number"
                className="input"
                value={dx}
                onChange={(e) => setDx(parseInt(e.target.value, 10) || 0)}
                autoFocus
              />
            </div>
            <div className="modal-form-field">
              <label htmlFor="move-y">Desplazamiento Y (píxeles)</label>
              <input
                id="move-y"
                type="number"
                className="input"
                value={dy}
                onChange={(e) => setDy(parseInt(e.target.value, 10) || 0)}
              />
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn">
              Mover
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface ScaleModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (factor: number) => void
}

export function ScaleModal({ isOpen, onClose, onConfirm }: ScaleModalProps) {
  const [factor, setFactor] = useState(1.5)

  useEffect(() => {
    if (isOpen) {
      setFactor(1.5)
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (factor > 0) {
      onConfirm(factor)
      onClose()
    }
  }

  return (
    <div
      className="modal"
      role="dialog"
      aria-modal="true"
      aria-label="Escalar selección"
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className="modal__backdrop"
        onClick={onClose}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      />
      <div className="island modal__body" style={{ maxWidth: '320px' }}>
        <header className="modal__head">
          <h2>Escalar selección</h2>
        </header>
        <form onSubmit={handleSubmit}>
          <div className="modal-form-col">
            <div className="modal-form-field">
              <label htmlFor="scale-factor">Factor de escala</label>
              <input
                id="scale-factor"
                type="number"
                step="any"
                min="0.01"
                className="input"
                value={factor}
                onChange={(e) => setFactor(parseFloat(e.target.value) || 0)}
                autoFocus
              />
              <span className="hint">Ej: 2 para 200%, 0.5 para 50%</span>
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn" disabled={factor <= 0}>
              Escalar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
