import { describe, expect, it } from 'vitest';

import { PLAY_URL } from '../src/sim';
import { qrMatrix } from '../src/render3d/qr';

describe('qr', () => {
  it('sizes by version and carries the finder patterns', () => {
    const m = qrMatrix(PLAY_URL);
    expect(m.length).toBe(29); // version 3
    for (const [x, y] of [[0, 0], [m.length - 7, 0], [0, m.length - 7]]) {
      expect(m[y][x]).toBe(true);
      expect(m[y + 3][x + 3]).toBe(true);
      expect(m[y + 1][x + 1]).toBe(false);
    }
    expect(m[m.length - 8][8]).toBe(true); // the dark module
  });

  it('is deterministic and refuses what it cannot hold', () => {
    expect(qrMatrix('hello')).toEqual(qrMatrix('hello'));
    expect(() => qrMatrix('x'.repeat(100))).toThrow();
  });
});
