# PixelVision

Pizarra de pixel art con la UX de Excalidraw: lienzo con pan/zoom infinito, toolbar flotante,
y **todo lo que dibujás sigue siendo un objeto editable** — lo movés, redimensionás y recoloreás
cuando quieras.

La diferencia con Excalidraw es lo que pasa por debajo: el único renderer es un **rasterizador de
enteros**. Nada usa el path API del canvas con antialiasing, así que el resultado es pixel art real
—sin bordes grises, con píxeles enteros— y el PNG exportado coincide con lo que ves en pantalla.

```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm test       # tests de los rasterizadores
pnpm build
```

## Qué hace

- **Pincel** píxel a píxel, con punta cuadrada o redonda de 1 a 32 px. Los trazos seguidos con las
  mismas opciones se acumulan en un mismo objeto, así dibujar a mano no genera cientos de capas.
- **Figuras**: rectángulo (con esquinas redondeadas), elipse, triángulo, rombo, estrella, hexágono,
  línea y flecha. `Shift` fuerza cuadrado/círculo perfecto y ángulos de 45°; `Alt` dibuja desde el centro.
- **Texto** con dos fuentes bitmap dibujadas a mano (5×7 y 3×5) que incluyen acentos y signos del
  español, más un modo "fuente del sistema" que umbraliza el alpha a 1 bit para que cualquier
  tipografía salga nítida.
- **Imágenes**: arrastrá, pegá o insertá un archivo. Se le quita la transparencia y se estampa.
- **Balde** con tolerancia, cuentagotas, borrador por objeto o por píxel.
- Paletas clásicas (PICO-8, Sweetie 16, DB32, Game Boy…) y modo *restringir a paleta*.
- Fondo del lienzo transparente o de cualquier color, export PNG de 1× a 16×, guardado de proyecto
  en JSON y autoguardado en IndexedDB.

## Cómo se quita la transparencia al importar

Es la regla del proyecto, y está expuesta como parámetro vivo del elemento:

| alpha del píxel original | resultado |
|---|---|
| totalmente transparente (`0`) | **no se pinta** — se conserva la silueta del sprite |
| cualquier valor mayor | se conserva el RGB y el alpha se fuerza a `255` |

No sobrevive ningún píxel semitransparente, que es justamente lo que arruina el aspecto de pixel art.
El umbral es ajustable desde el panel por si querés recortar también los bordes tenues.

Como se guardan los píxeles **originales** de cada imagen, mover ese umbral —o cambiar el modo de
escalado o la cuantización— reprocesa desde la fuente en vez de degradar un resultado ya degradado.

## Decisiones que sostienen la calidad visual

Estas son las que separan un editor de pixel art de un editor de dibujo cualquiera:

- **Contorno por erosión, no por estampado.** El borde de una figura se calcula como
  `máscara − erosión(máscara, grosor)`. Estampar un pincel a lo largo del perímetro engorda las
  diagonales y deja el borde irregular. (`src/core/raster/mask.ts`)
- **Elipse por el trazador de caja de Zingl.** El Bresenham clásico asume un píxel central y sale
  asimétrico con dimensiones pares; éste hace que un círculo de 16×16 se vea igual de los cuatro lados.
- **Escala de dispositivo entera.** Con un dpr fraccionario (1.25, 1.5) o un zoom no entero, un píxel
  de cada N sale un device-pixel más ancho y la grilla se ve despareja. El zoom se redondea a un
  entero de píxeles de dispositivo y el origen del pan también. (`src/canvas/viewport.ts`)
- **Promedio en alpha premultiplicado** al reducir imágenes: sin premultiplicar, el RGB de los
  píxeles transparentes se filtra al promedio y deja un halo oscuro alrededor de la silueta.
- **Sin rotación libre.** Rotar un ángulo arbitrario destruye el pixel art; en su lugar hay rotación
  de 90° y espejado.

## Estructura

```
src/
  core/          lógica pura, sin DOM y con tests
    raster/      mask · line · brush · floodfill    ← rasterizadores de enteros
    text/        fonts · renderText                 ← fuentes bitmap embebidas
    image/       processImage · quantize · imageStore
    render/      renderScene · rasterize · hitTest
  canvas/        CanvasStage · viewport · overlays  ← puntero, pan/zoom, grilla
  state/         store (zustand + historial)
  ui/            toolbar, paneles y diálogos
```

`core/` no toca el DOM salvo en el modo "fuente del sistema" y al decodificar imágenes, así que el
grueso de la lógica se prueba con `pnpm test` en Node.
