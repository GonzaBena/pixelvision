export interface Palette {
  id: string
  name: string
  colors: string[]
}

/** Paletas clásicas de pixel art. Sirven de swatches y de destino de cuantización. */
export const PALETTES: Palette[] = [
  {
    id: 'pico8',
    name: 'PICO-8',
    colors: [
      '#000000', '#1d2b53', '#7e2553', '#008751',
      '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8',
      '#ff004d', '#ffa300', '#ffec27', '#00e436',
      '#29adff', '#83769c', '#ff77a8', '#ffccaa',
    ],
  },
  {
    id: 'sweetie16',
    name: 'Sweetie 16',
    colors: [
      '#1a1c2c', '#5d275d', '#b13e53', '#ef7d57',
      '#ffcd75', '#a7f070', '#38b764', '#257179',
      '#29366f', '#3b5dc9', '#41a6f6', '#73eff7',
      '#f4f4f4', '#94b0c2', '#566c86', '#333c57',
    ],
  },
  {
    id: 'gameboy',
    name: 'Game Boy',
    colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
  },
  {
    id: 'db32',
    name: 'DawnBringer 32',
    colors: [
      '#000000', '#222034', '#45283c', '#663931',
      '#8f563b', '#df7126', '#d9a066', '#eec39a',
      '#fbf236', '#99e550', '#6abe30', '#37946e',
      '#4b692f', '#524b24', '#323c39', '#3f3f74',
      '#306082', '#5b6ee1', '#639bff', '#5fcde4',
      '#cbdbfc', '#ffffff', '#9badb7', '#847e87',
      '#696a6a', '#595652', '#76428a', '#ac3232',
      '#d95763', '#d77bba', '#8f974a', '#8a6f30',
    ],
  },
  {
    id: 'endesga16',
    name: 'Endesga 16',
    colors: [
      '#e4a672', '#b86f50', '#743f39', '#3f2832',
      '#9e2835', '#e53b44', '#fb922b', '#ffe762',
      '#63c64d', '#327345', '#193d3f', '#4f6781',
      '#afbfd2', '#ffffff', '#2ce8f4', '#0484d1',
    ],
  },
  {
    id: 'grayscale',
    name: 'Escala de grises',
    colors: [
      '#000000', '#1c1c1c', '#383838', '#545454',
      '#707070', '#8c8c8c', '#a8a8a8', '#c4c4c4',
      '#e0e0e0', '#ffffff',
    ],
  },
]

/** Swatches por defecto de la barra de color, en la línea de Excalidraw. */
export const DEFAULT_SWATCHES = [
  '#1e1e1e', '#ffffff', '#e03131', '#2f9e44',
  '#1971c2', '#f08c00', '#9c36b5', '#0c8599',
  '#e8590c', '#66a80f', '#c2255c', '#495057',
]

export function getPalette(id: string): Palette | undefined {
  return PALETTES.find((p) => p.id === id)
}
