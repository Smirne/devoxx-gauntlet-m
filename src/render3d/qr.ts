/**
 * qr.ts — a QR code for the stage deck's last slide.
 *
 * Byte mode, error-correction level L, versions 1 to 4 (up to 78 bytes): one block
 * each, which is all a URL on a slide needs and keeps this to a page instead of a
 * dependency. Returns the module matrix; the slide paints it.
 */

/** [data codewords, error-correction codewords] for versions 1..4 at level L. */
const SIZES: readonly (readonly [number, number])[] = [
  [19, 7],
  [34, 10],
  [55, 15],
  [80, 20],
];

function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function rsRemainder(data: readonly number[], degree: number): number[] {
  const div: number[] = new Array<number>(degree).fill(0);
  div[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      div[j] = gfMul(div[j], root);
      if (j + 1 < degree) div[j] ^= div[j + 1];
    }
    root = gfMul(root, 2);
  }
  const out: number[] = new Array<number>(degree).fill(0);
  for (const b of data) {
    const factor = b ^ (out.shift() as number);
    out.push(0);
    for (let i = 0; i < degree; i++) out[i] ^= gfMul(div[i], factor);
  }
  return out;
}

const MASKS: readonly ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/** The module matrix of `text`, `true` = dark, indexed `[row][column]`, with no quiet zone. */
export function qrMatrix(text: string): boolean[][] {
  const bytes = [...new TextEncoder().encode(text)];
  const ver = SIZES.findIndex(([data]) => bytes.length <= data - 2);
  if (ver < 0) throw new Error(`qr: ${bytes.length} bytes is more than version 4 holds`);
  const [dataWords, ecWords] = SIZES[ver];
  const size = 17 + 4 * (ver + 1);

  // Bit stream: mode 0100, 8-bit count, the bytes, terminator, pad bytes.
  const bits: number[] = [];
  const put = (v: number, n: number): void => {
    for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1);
  };
  put(0b0100, 4);
  put(bytes.length, 8);
  for (const b of bytes) put(b, 8);
  put(0, Math.min(4, dataWords * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  for (let pad = 0xec; bits.length < dataWords * 8; pad ^= 0xec ^ 0x11) put(pad, 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  const words = [...data, ...rsRemainder(data, ecWords)];

  const mod: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const fn: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const setFn = (x: number, y: number, dark: boolean): void => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    mod[y][x] = dark;
    fn[y][x] = true;
  };

  for (let i = 0; i < size; i++) {
    setFn(6, i, i % 2 === 0);
    setFn(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        setFn(cx + dx, cy + dy, d !== 2 && d !== 4);
      }
    }
  }
  if (ver >= 1) {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setFn(size - 7 + dx, size - 7 + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }

  const drawFormat = (mask: number): void => {
    const d = (0b01 << 3) | mask; // level L
    let rem = d;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const f = ((d << 10) | rem) ^ 0x5412;
    const bit = (i: number): boolean => ((f >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) setFn(8, i, bit(i));
    setFn(8, 7, bit(6));
    setFn(8, 8, bit(7));
    setFn(7, 8, bit(8));
    for (let i = 9; i < 15; i++) setFn(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) setFn(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) setFn(8, size - 15 + i, bit(i));
    setFn(8, size - 8, true);
  };
  drawFormat(0);

  // The codewords, zig-zagging up and down column pairs from the bottom right.
  let n = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const y = ((right + 1) & 2) === 0 ? size - 1 - vert : vert;
        if (!fn[y][x] && n < words.length * 8) {
          mod[y][x] = ((words[n >>> 3] >>> (7 - (n & 7))) & 1) !== 0;
          n++;
        }
      }
    }
  }

  const applied = (mask: number): boolean[][] => {
    const m = mod.map((row) => row.slice());
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[mask](x, y)) m[y][x] = !m[y][x];
    return m;
  };

  // Pick the mask with the fewest of the four standard penalties.
  const penalty = (m: boolean[][]): number => {
    let p = 0;
    const lines = [...m, ...m[0].map((_, x) => m.map((row) => row[x]))];
    for (const line of lines) {
      let run = 1;
      for (let i = 1; i <= size; i++) {
        if (i < size && line[i] === line[i - 1]) run++;
        else {
          if (run >= 5) p += 3 + run - 5;
          run = 1;
        }
      }
      const s = line.map((v) => (v ? '1' : '0')).join('');
      for (const pat of ['10111010000', '00001011101']) for (let at = s.indexOf(pat); at >= 0; at = s.indexOf(pat, at + 1)) p += 40;
    }
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) if (m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3;
    const dark = m.reduce((a, row) => a + row.filter(Boolean).length, 0);
    return p + Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
  };
  let best = 0;
  let bestP = Infinity;
  for (let k = 0; k < 8; k++) {
    const p = penalty(applied(k));
    if (p < bestP) {
      bestP = p;
      best = k;
    }
  }
  drawFormat(best);
  const out = applied(best);
  // `applied` copied `mod` before the final format bits went in: put them in.
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (fn[y][x]) out[y][x] = mod[y][x];
  return out;
}
