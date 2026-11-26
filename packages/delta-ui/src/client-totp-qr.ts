// Self-contained ISO/IEC 18004 QR Code encoder (ECC Level M, Byte mode, Versions 1..10) + SVG builder.
// Zero external dependencies and zero network calls for full privacy compliance.
interface QrVersionSpec {
  size: number
  align: readonly number[]
  ecPerBlock: number
  groups: readonly (readonly [number, number])[]
}

const QR_LEVEL_M_VERSIONS: readonly QrVersionSpec[] = [
  { size: 21, align: [], ecPerBlock: 10, groups: [[1, 16]] },
  { size: 25, align: [6, 18], ecPerBlock: 16, groups: [[1, 28]] },
  { size: 29, align: [6, 22], ecPerBlock: 26, groups: [[1, 44]] },
  { size: 33, align: [6, 26], ecPerBlock: 18, groups: [[2, 32]] },
  { size: 37, align: [6, 30], ecPerBlock: 24, groups: [[2, 43]] },
  { size: 41, align: [6, 34], ecPerBlock: 16, groups: [[4, 27]] },
  { size: 45, align: [6, 22, 38], ecPerBlock: 18, groups: [[4, 31]] },
  { size: 49, align: [6, 24, 42], ecPerBlock: 22, groups: [[2, 38], [2, 39]] },
  { size: 53, align: [6, 26, 46], ecPerBlock: 22, groups: [[3, 36], [2, 37]] },
  { size: 57, align: [6, 28, 50], ecPerBlock: 26, groups: [[4, 43], [1, 44]] },
]

const QR_GF_EXP = new Uint8Array(512)
const QR_GF_LOG = new Uint8Array(256)
{
  let x = 1
  for (let i = 0; i < 255; i++) {
    QR_GF_EXP[i] = x
    QR_GF_EXP[i + 255] = x
    QR_GF_LOG[x] = i
    x = x & 0x80 ? (x << 1) ^ 0x11d : x << 1
  }
}

function qrGfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0
  return QR_GF_EXP[QR_GF_LOG[a] + QR_GF_LOG[b]]
}

function qrRsComputeRemainder(data: Uint8Array, ecCount: number): Uint8Array {
  let gen: number[] = [1]
  for (let i = 0; i < ecCount; i++) {
    const next = new Array<number>(gen.length + 1).fill(0)
    const root = QR_GF_EXP[i]
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gen[j]
      next[j + 1] ^= qrGfMul(gen[j], root)
    }
    gen = next
  }
  const work = new Uint8Array(data.length + ecCount)
  work.set(data, 0)
  for (let i = 0; i < data.length; i++) {
    const coef = work[i]
    if (coef === 0) continue
    for (let j = 0; j < gen.length; j++) {
      work[i + j] ^= qrGfMul(gen[j], coef)
    }
  }
  return work.slice(data.length)
}

function encodeQrBytes(text: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text)
  const utf8 = unescape(encodeURIComponent(text))
  const out = new Uint8Array(utf8.length)
  for (let i = 0; i < utf8.length; i++) out[i] = utf8.charCodeAt(i)
  return out
}

function encodeQrMatrix(text: string): boolean[][] {
  const bytes = encodeQrBytes(text)
  let version = -1
  let totalDataCap = 0
  for (let v = 1; v <= QR_LEVEL_M_VERSIONS.length; v++) {
    const spec = QR_LEVEL_M_VERSIONS[v - 1]
    const cap = spec.groups.reduce((acc, [cnt, len]) => acc + cnt * len, 0)
    const headerBytes = v >= 10 ? 3 : 2
    if (bytes.length + headerBytes <= cap) {
      version = v
      totalDataCap = cap
      break
    }
  }
  if (version < 1) throw new Error('QR payload exceeds supported Version 10-M capacity')

  const spec = QR_LEVEL_M_VERSIONS[version - 1]
  const n = spec.size

  // Build Byte-mode bit stream
  const bits: number[] = []
  const pushBits = (val: number, count: number) => {
    for (let i = count - 1; i >= 0; i--) bits.push((val >>> i) & 1)
  }
  pushBits(0b0100, 4)
  pushBits(bytes.length, version >= 10 ? 16 : 8)
  for (let i = 0; i < bytes.length; i++) pushBits(bytes[i], 8)
  const capBits = totalDataCap * 8
  pushBits(0, Math.min(4, capBits - bits.length))
  while (bits.length % 8 !== 0) bits.push(0)
  let padIdx = 0
  while (bits.length < capBits) {
    pushBits(padIdx % 2 === 0 ? 0xec : 0x11, 8)
    padIdx++
  }

  const dataCw = new Uint8Array(totalDataCap)
  for (let i = 0; i < totalDataCap; i++) {
    let cw = 0
    for (let b = 0; b < 8; b++) cw = (cw << 1) | bits[i * 8 + b]
    dataCw[i] = cw
  }

  // Split blocks, compute RS ECC, and interleave
  const dataBlocks: Uint8Array[] = []
  const eccBlocks: Uint8Array[] = []
  let offset = 0
  for (const [cnt, len] of spec.groups) {
    for (let i = 0; i < cnt; i++) {
      const blk = dataCw.slice(offset, offset + len)
      offset += len
      dataBlocks.push(blk)
      eccBlocks.push(qrRsComputeRemainder(blk, spec.ecPerBlock))
    }
  }
  const codewords: number[] = []
  const maxDataLen = dataBlocks.reduce((m, b) => Math.max(m, b.length), 0)
  for (let i = 0; i < maxDataLen; i++) {
    for (const blk of dataBlocks) if (i < blk.length) codewords.push(blk[i])
  }
  for (let i = 0; i < spec.ecPerBlock; i++) {
    for (const ecc of eccBlocks) codewords.push(ecc[i])
  }
  const cwBits: number[] = []
  for (const cw of codewords) {
    for (let b = 7; b >= 0; b--) cwBits.push((cw >>> b) & 1)
  }

  // Setup function patterns
  const modules: boolean[][] = Array.from({ length: n }, () => new Array<boolean>(n).fill(false))
  const isFunc: boolean[][] = Array.from({ length: n }, () => new Array<boolean>(n).fill(false))
  const setFunc = (r: number, c: number, isDarkCell: boolean) => {
    modules[r][c] = isDarkCell
    isFunc[r][c] = true
  }

  const drawFinder = (r0: number, c0: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = r0 + dr
        const c = c0 + dc
        if (r < 0 || r >= n || c < 0 || c >= n) continue
        const inBox = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6
        const border = inBox && (dr === 0 || dr === 6 || dc === 0 || dc === 6)
        const center = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4
        setFunc(r, c, border || center)
      }
    }
  }
  drawFinder(0, 0)
  drawFinder(0, n - 7)
  drawFinder(n - 7, 0)

  for (let i = 8; i < n - 8; i++) {
    setFunc(6, i, i % 2 === 0)
    setFunc(i, 6, i % 2 === 0)
  }

  // Reserve format info strips & set fixed dark module
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) {
      isFunc[8][i] = true
      isFunc[i][8] = true
    }
  }
  for (let i = 0; i < 8; i++) isFunc[8][n - 8 + i] = true
  for (let i = 0; i < 7; i++) isFunc[n - 7 + i][8] = true
  setFunc(n - 8, 8, true)

  // Alignment patterns
  for (const cy of spec.align) {
    for (const cx of spec.align) {
      if ((cy <= 8 && cx <= 8) || (cy <= 8 && cx >= n - 8) || (cy >= n - 8 && cx <= 8)) continue
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const dist = Math.max(Math.abs(dy), Math.abs(dx))
          setFunc(cy + dy, cx + dx, dist === 2 || dist === 0)
        }
      }
    }
  }

  // Version info for Version >= 7
  if (version >= 7) {
    let rem = version
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25)
    const vBits = (version << 12) | rem
    for (let i = 0; i < 18; i++) {
      const bit = ((vBits >>> i) & 1) === 1
      const r = Math.floor(i / 3)
      const c = n - 11 + (i % 3)
      setFunc(r, c, bit)
      setFunc(c, r, bit)
    }
  }

  // Zigzag placement
  let bitIdx = 0
  let isUpward = true
  for (let col = n - 1; col >= 1; col -= 2) {
    if (col === 6) col--
    for (let step = 0; step < n; step++) {
      const r = isUpward ? n - 1 - step : step
      for (let dc = 0; dc < 2; dc++) {
        const c = col - dc
        if (isFunc[r][c]) continue
        modules[r][c] = bitIdx < cwBits.length ? cwBits[bitIdx] === 1 : false
        bitIdx++
      }
    }
    isUpward = !isUpward
  }

  const writeFormatBits = (isDarkMatrix: boolean[][], mask: number) => {
    const data = (0b00 << 3) | mask // ECC Level M = 00
    let rem = data
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
    const fBits = ((data << 10) | rem) ^ 0x5412
    for (let i = 0; i <= 5; i++) isDarkMatrix[8][i] = ((fBits >>> (14 - i)) & 1) === 1
    isDarkMatrix[8][7] = ((fBits >>> 8) & 1) === 1
    isDarkMatrix[8][8] = ((fBits >>> 7) & 1) === 1
    isDarkMatrix[7][8] = ((fBits >>> 6) & 1) === 1
    for (let i = 0; i <= 5; i++) isDarkMatrix[i][8] = ((fBits >>> i) & 1) === 1
    for (let i = 0; i < 7; i++) isDarkMatrix[n - 1 - i][8] = ((fBits >>> (14 - i)) & 1) === 1
    for (let i = 0; i < 8; i++) isDarkMatrix[8][n - 8 + i] = ((fBits >>> (7 - i)) & 1) === 1
  }

  const maskBit = (mask: number, r: number, c: number): boolean => {
    switch (mask) {
      case 0: return (r + c) % 2 === 0
      case 1: return r % 2 === 0
      case 2: return c % 3 === 0
      case 3: return (r + c) % 3 === 0
      case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0
      case 5: return ((r * c) % 2) + ((r * c) % 3) === 0
      case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0
      default: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
    }
  }

  const penaltyScore = (isDarkMatrix: boolean[][]): number => {
    let score = 0
    for (let r = 0; r < n; r++) {
      let runLen = 1
      for (let c = 1; c < n; c++) {
        if (isDarkMatrix[r][c] === isDarkMatrix[r][c - 1]) runLen++
        else { if (runLen >= 5) score += 3 + (runLen - 5); runLen = 1 }
      }
      if (runLen >= 5) score += 3 + (runLen - 5)
    }
    for (let c = 0; c < n; c++) {
      let runLen = 1
      for (let r = 1; r < n; r++) {
        if (isDarkMatrix[r][c] === isDarkMatrix[r - 1][c]) runLen++
        else { if (runLen >= 5) score += 3 + (runLen - 5); runLen = 1 }
      }
      if (runLen >= 5) score += 3 + (runLen - 5)
    }
    for (let r = 0; r < n - 1; r++) {
      for (let c = 0; c < n - 1; c++) {
        const v = isDarkMatrix[r][c]
        if (isDarkMatrix[r][c + 1] === v && isDarkMatrix[r + 1][c] === v && isDarkMatrix[r + 1][c + 1] === v) score += 3
      }
    }
    let darkCount = 0
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (isDarkMatrix[r][c]) darkCount++
      }
    }
    score += Math.floor(Math.abs(darkCount * 100 / (n * n) - 50) / 5) * 10
    return score
  }

  let bestGrid = modules
  let bestScore = Number.POSITIVE_INFINITY
  for (let mask = 0; mask < 8; mask++) {
    const cand = modules.map((row, r) => row.map((v, c) => (isFunc[r][c] ? v : v !== maskBit(mask, r, c))))
    writeFormatBits(cand, mask)
    const sc = penaltyScore(cand)
    if (sc < bestScore) {
      bestScore = sc
      bestGrid = cand
    }
  }
  return bestGrid
}
