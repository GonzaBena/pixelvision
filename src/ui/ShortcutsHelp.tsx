import { IconClose } from './Icons'

const GROUPS: Array<{ title: string; items: Array<[string, string]> }> = [
  {
    title: 'Herramientas',
    items: [
      ['V', 'Seleccionar'],
      ['H', 'Mano (mover la vista)'],
      ['M', 'Medir'],
      ['B', 'Pincel'],
      ['E', 'Borrador'],
      ['G', 'Balde'],
      ['I', 'Cuentagotas'],
      ['R / O', 'Rectángulo / Elipse'],
      ['Y / D / S / X', 'Triángulo / Rombo / Estrella / Hexágono'],
      ['L / A', 'Línea / Flecha'],
      ['T', 'Texto'],
    ],
  },
  {
    title: 'Dibujo',
    items: [
      ['Shift al arrastrar', 'Cuadrado o círculo perfecto; línea a 45°'],
      ['Alt al arrastrar', 'Dibujar desde el centro'],
      ['[ / ]', 'Achicar / agrandar el pincel'],
      ['Supr', 'Eliminar la selección'],
      ['Flechas', 'Mover 1 px (con Shift, 10 px)'],
    ],
  },
  {
    title: 'Vista',
    items: [
      ['Rueda', 'Acercar / alejar hacia el cursor'],
      ['Espacio + arrastrar', 'Mover la vista'],
      ['Botón central', 'Mover la vista'],
      ['Shift + 1', 'Ajustar a la vista'],
    ],
  },
  {
    title: 'Edición',
    items: [
      ['Ctrl + Z', 'Deshacer'],
      ['Ctrl + Shift + Z', 'Rehacer'],
      ['Ctrl + A', 'Seleccionar todo'],
      ['Ctrl + D', 'Duplicar'],
      ['Ctrl + V', 'Pegar una imagen del portapapeles'],
    ],
  },
]

export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Atajos de teclado">
      <div className="modal__backdrop" onClick={onClose} />
      <div className="island modal__body">
        <header className="modal__head">
          <h2>Atajos de teclado</h2>
          <button type="button" className="btn btn--icon" onClick={onClose} aria-label="Cerrar">
            <IconClose />
          </button>
        </header>
        <div className="modal__grid">
          {GROUPS.map((g) => (
            <section key={g.title}>
              <h3>{g.title}</h3>
              <dl>
                {g.items.map(([k, v]) => (
                  <div key={k} className="kbdrow">
                    <dt>
                      <kbd>{k}</kbd>
                    </dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
