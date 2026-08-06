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

// Decode PNG from favicon.ico
function decodePngFromFavicon(icoBuf) {
  const dataOffset = icoBuf.readUInt32LE(18)
  const pngBuf = icoBuf.subarray(dataOffset)

  let pos = 8
  const chunks = []
  let width = 0
  let height = 0

  while (pos < pngBuf.length) {
    const len = pngBuf.readUInt32BE(pos)
    const type = pngBuf.toString('ascii', pos + 4, pos + 8)
    const data = pngBuf.subarray(pos + 8, pos + 8 + len)

    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
    } else if (type === 'IDAT') {
      chunks.push(data)
    } else if (type === 'IEND') {
      break
    }
    pos += 12 + len
  }

  const compressed = Buffer.concat(chunks)
  const decompressed = zlib.inflateSync(compressed)

  // Unfilter PNG scanlines (RGBA 8-bit)
  const bpp = 4
  const stride = 1 + width * bpp
  const rawPixels = Buffer.alloc(width * height * bpp)

  for (let y = 0; y < height; y++) {
    const lineStart = y * stride
    const filter = decompressed[lineStart]
    const prevLineStart = (y - 1) * stride

    for (let x = 0; x < width * bpp; x++) {
      const rawIdx = lineStart + 1 + x
      let val = decompressed[rawIdx]
      const left = x >= bpp ? rawPixels[y * width * bpp + x - bpp] : 0
      const up = y > 0 ? rawPixels[(y - 1) * width * bpp + x] : 0
      const upLeft = y > 0 && x >= bpp ? rawPixels[(y - 1) * width * bpp + x - bpp] : 0

      if (filter === 1) {
        val = (val + left) & 0xff
      } else if (filter === 2) {
        val = (val + up) & 0xff
      } else if (filter === 3) {
        val = (val + Math.floor((left + up) / 2)) & 0xff
      } else if (filter === 4) {
        const p = left + up - upLeft
        const pa = Math.abs(p - left)
        const pb = Math.abs(p - up)
        const pc = Math.abs(p - upLeft)
        let pr = left
        if (pb < pa && pb <= pc) pr = up
        else if (pc < pa) pr = upLeft
        val = (val + pr) & 0xff
      }

      rawPixels[y * width * bpp + x] = val
    }
  }

  return { width, height, pixels: rawPixels }
}

const icoPath = path.resolve('public/favicon.ico')
const icoBuf = fs.readFileSync(icoPath)
const srcImage = decodePngFromFavicon(icoBuf)

console.log(`Favicon PNG extraído: ${srcImage.width}x${srcImage.height}`)

function getFaviconPixel(x, y, dstW, dstH, maskable = false) {
  // If maskable, scale with padding so icon sits in the safe area
  let srcX = x
  let srcY = y
  let effectiveW = dstW
  let effectiveH = dstH

  if (maskable) {
    const pad = dstW * 0.15
    const innerW = dstW - pad * 2
    const innerH = dstH - pad * 2

    if (x < pad || x >= dstW - pad || y < pad || y >= dstH - pad) {
      // Find average edge background color from favicon
      return [27, 27, 31, 255] // dark theme background
    }

    srcX = (x - pad) / innerW * dstW
    srcY = (y - pad) / innerH * dstH
  }

  const sx = Math.floor((srcX / dstW) * srcImage.width)
  const sy = Math.floor((srcY / dstH) * srcImage.height)
  const clampedX = Math.max(0, Math.min(srcImage.width - 1, sx))
  const clampedY = Math.max(0, Math.min(srcImage.height - 1, sy))

  const idx = (clampedY * srcImage.width + clampedX) * 4
  const r = srcImage.pixels[idx]
  const g = srcImage.pixels[idx + 1]
  const b = srcImage.pixels[idx + 2]
  const a = srcImage.pixels[idx + 3]

  if (maskable && a < 255) {
    // Fill transparent pixels with background color for maskable icons
    const alpha = a / 255
    const bgR = 27
    const bgG = 27
    const bgB = 31
    return [
      Math.round(r * alpha + bgR * (1 - alpha)),
      Math.round(g * alpha + bgG * (1 - alpha)),
      Math.round(b * alpha + bgB * (1 - alpha)),
      255
    ]
  }

  return [r, g, b, a]
}

const outDir = path.resolve('public')
fs.writeFileSync(path.join(outDir, 'icon-192.png'), generatePng(192, 192, (x, y, w, h) => getFaviconPixel(x, y, w, h, false)))
fs.writeFileSync(path.join(outDir, 'icon-512.png'), generatePng(512, 512, (x, y, w, h) => getFaviconPixel(x, y, w, h, false)))
fs.writeFileSync(path.join(outDir, 'icon-512-maskable.png'), generatePng(512, 512, (x, y, w, h) => getFaviconPixel(x, y, w, h, true)))
fs.writeFileSync(path.join(outDir, 'apple-touch-icon.png'), generatePng(180, 180, (x, y, w, h) => getFaviconPixel(x, y, w, h, false)))

console.log('¡Íconos generados a partir de favicon.ico correctamente en public/!')
