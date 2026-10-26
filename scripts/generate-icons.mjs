// Generates the PWA PNG icons (a die face) without external dependencies.
// Usage: node scripts/generate-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const BG = [15, 118, 110] // brand-700
const DIE = [255, 255, 255]
const PIP = [17, 94, 89] // brand-800

function crc32(buf) {
  let c
  const table = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x + 0.5, y + 0.5)
      const o = y * (size * 4 + 1) + 1 + x * 4
      raw[o] = r
      raw[o + 1] = g
      raw[o + 2] = b
      raw[o + 3] = a
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** Inside a rounded rectangle centered at c with half-size h and radius r. */
function inRoundRect(x, y, c, h, r) {
  const dx = Math.max(Math.abs(x - c) - (h - r), 0)
  const dy = Math.max(Math.abs(y - c) - (h - r), 0)
  return dx * dx + dy * dy <= r * r
}

/** Die showing five pips; `inset` shrinks the die (maskable icons need a safe zone). */
function icon(size, { rounded, inset }) {
  const c = size / 2
  const bgR = rounded ? size * 0.22 : 0
  const dieH = size * (0.5 - inset)
  const pipR = dieH * 0.17
  const off = dieH * 0.5
  const pips = [
    [c, c],
    [c - off, c - off],
    [c + off, c - off],
    [c - off, c + off],
    [c + off, c + off],
  ]
  return png(size, (x, y) => {
    if (!inRoundRect(x, y, c, size / 2, Math.max(bgR, 0.001))) return [0, 0, 0, 0]
    if (inRoundRect(x, y, c, dieH, dieH * 0.22)) {
      const onPip = pips.some(([px, py]) => (x - px) ** 2 + (y - py) ** 2 <= pipR * pipR)
      return [...(onPip ? PIP : DIE), 255]
    }
    return [...BG, 255]
  })
}

mkdirSync('public/icons', { recursive: true })
writeFileSync('public/icons/icon-192.png', icon(192, { rounded: true, inset: 0.2 }))
writeFileSync('public/icons/icon-512.png', icon(512, { rounded: true, inset: 0.2 }))
writeFileSync('public/icons/icon-maskable-512.png', icon(512, { rounded: false, inset: 0.27 }))
writeFileSync('public/icons/apple-touch-icon.png', icon(180, { rounded: false, inset: 0.2 }))
console.log('Icons written to public/icons/')
