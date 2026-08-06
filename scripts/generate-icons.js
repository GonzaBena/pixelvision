import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
  }
  return (c ^ 0xffffffff) >>> 0
}

function createChunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  const crcVal = crc32(Buffer.concat([typeBuf, data]))
  crcBuf.writeUInt32BE(crcVal, 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function generatePng(width, height, getPixel) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const ihdrChunk = createChunk('IHDR', ihdr)

  const scanlines = []
  for (let y = 0; y < height; y++) {
    const line = Buffer.alloc(1 + width * 4)
    line[0] = 0
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixel(x, y, width, height)
      const offset = 1 + x * 4
      line[offset] = r
      line[offset + 1] = g
      line[offset + 2] = b
      line[offset + 3] = a
    }
    scanlines.push(line)
  }

  const rawData = Buffer.concat(scanlines)
  const compressed = zlib.deflateSync(rawData)
  const idatChunk = createChunk('IDAT', compressed)
  const iendChunk = createChunk('IEND', Buffer.alloc(0))

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk])
}

function drawPixelArtIcon(x, y, w, h, maskable = false) {
  if (!maskable) {
    const r = w * 0.22
    const cx = w / 2
    const cy = h / 2
    const dx = Math.max(0, Math.abs(x - cx) - (w / 2 - r))
    const dy = Math.max(0, Math.abs(y - cy) - (h / 2 - r))
    if (dx * dx + dy * dy > r * r) {
      return [0, 0, 0, 0] // esquinas transparentes para icono normal
    }
  }

  // Color de fondo morado solido (#6965DB)
  const bgR = 105
  const bgG = 101
  const bgB = 219

  // Safe zone pad: 20% en normal, 25% en maskable para que encaje perfecto en circulos de Android
  const padRatio = maskable ? 0.25 : 0.18
  const padX = w * padRatio
  const padY = h * padRatio

  if (x >= padX && x <= w - padX && y >= padY && y <= h - padY) {
    const gridX = Math.floor(((x - padX) / (w - padX * 2)) * 8)
    const gridY = Math.floor(((y - padY) / (h - padY * 2)) * 8)

    // Dibujo del logo 'PV' pixel art
    const pixelArt = [
      [0, 1, 1, 1, 1, 0, 0, 0],
      [0, 1, 0, 0, 1, 1, 0, 0],
      [0, 1, 0, 0, 0, 1, 0, 0],
      [0, 1, 1, 1, 1, 0, 0, 0],
      [0, 1, 0, 0, 0, 0, 0, 0],
      [0, 1, 0, 0, 1, 1, 0, 0],
      [0, 1, 0, 1, 0, 0, 1, 0],
      [0, 1, 0, 0, 1, 1, 0, 0],
    ]

    if (pixelArt[gridY] && pixelArt[gridY][gridX] === 1) {
      if (gridY < 4) return [255, 220, 100, 255] // amarillo
      return [100, 230, 255, 255] // cian
    }

    // Cuadrícula damero de fondo del lienzo
    if ((gridX + gridY) % 2 === 0) {
      return [255, 255, 255, 255]
    } else {
      return [230, 230, 245, 255]
    }
  }

  return [bgR, bgG, bgB, 255]
}

const outDir = path.resolve('public')
fs.mkdirSync(outDir, { recursive: true })

fs.writeFileSync(path.join(outDir, 'icon-192.png'), generatePng(192, 192, (x, y, w, h) => drawPixelArtIcon(x, y, w, h, false)))
fs.writeFileSync(path.join(outDir, 'icon-512.png'), generatePng(512, 512, (x, y, w, h) => drawPixelArtIcon(x, y, w, h, false)))
fs.writeFileSync(path.join(outDir, 'icon-512-maskable.png'), generatePng(512, 512, (x, y, w, h) => drawPixelArtIcon(x, y, w, h, true)))
fs.writeFileSync(path.join(outDir, 'apple-touch-icon.png'), generatePng(180, 180, (x, y, w, h) => drawPixelArtIcon(x, y, w, h, true)))

console.log('Iconos PWA generados correctamente en public/')
