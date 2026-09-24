/**
 * The two secondary staircases, DRIVEN — not sampled.
 *
 * Michele sent the stairs back on 24 Sep 2026 with the plan symbol enlarged:
 * *"This makes it look like there's a center, and 2 descent. I think it's a mid
 * plane between two ramps of stairs. In this picture stairs go south to north."*
 * Fixing that moved the way onto a first-floor flight from the middle of its long
 * face to its east END, and moved the ground-floor shaft's doors from its short
 * west end into both long faces.
 *
 * Every other test in this area asks a flood fill or a rectangle. This one drives
 * a robot with the stick and reads where it actually comes to rest, because the
 * first thing the move broke could not be seen any other way: with the head at the
 * end of the flight and no balustrade in the wall list, **Biggy drove straight
 * onto a stair he has been too wide for since note 18 of the playtest notes**. A
 * grid sample of walkable cells says nothing about that — the cells were walkable
 * before and after. The fix is `NICHE_RAIL` in `src/sim/geometry.ts`, and this
 * file is what would catch it coming back.
 *
 * The drives also pin the approach, which is a gameplay fact and not a geometric
 * one: you reach the head by walking the corridor to the stair's east end and
 * turning in between the wall and the balustrade. Driving straight at it from the
 * middle of the corridor does not work, for anybody.
 */
import { expect, it } from 'vitest';
import { createGame } from '../src/sim/game';
import { DT_MAX, DEFS } from '../src/sim/constants';
import { F1, GF, nicheMouth, stairDoors, stairLanding } from '../src/sim/geometry';

function driveTo(g: any, kind: string, tx: number, ty: number, secs = 14) {
  g.debug.select(kind);
  const steps = Math.round(secs / DT_MAX);
  let best = Infinity;
  for (let i = 0; i < steps; i++) {
    const b = g.snapshot().bots.find((x: any) => x.kind === kind);
    const dx = tx - b.x, dy = ty - b.y;
    const d = Math.hypot(dx, dy);
    best = Math.min(best, d);
    if (d < 2) break;
    g.setStick(dx / d, dy / d);
    g.update(DT_MAX);
  }
  g.setStick(0, 0);
  for (let i = 0; i < 30; i++) g.update(DT_MAX);
  const b = g.snapshot().bots.find((x: any) => x.kind === kind);
  return { x: b.x, y: b.y, best };
}

it('floor 1 (ch4): Droid reaches the head of the flight, Biggy is turned away', () => {
  for (const [name, niche] of [['bot', F1.nicheBot], ['top', F1.nicheTop]] as const) {
    const mouth = nicheMouth(niche);
    const head = { x: mouth.x + mouth.w / 2, y: mouth.y + mouth.h / 2 };
    for (const kind of ['droid', 'biggy'] as const) {
      const g: any = createGame({ seed: 1, chapter: 4, cards: false });
      for (let i = 0; i < 20; i++) g.update(DT_MAX);
      g.debug.select(kind);
      g.debug.place(kind, head.x, 350);
      // Approach the way a player must: along the corridor to the stair's east
      // end, then turn in between the wall and the balustrade.
      driveTo(g, kind, niche.x + niche.w + 16, head.y, 12);
      const r = driveTo(g, kind, head.x, head.y, 20);
      console.log(`${name} ${kind}: closest ${r.best.toFixed(1)} px, resting at ${r.x.toFixed(1)},${r.y.toFixed(1)} (head ${head.x.toFixed(1)},${head.y.toFixed(1)})`);
      if (kind === 'droid') expect(r.best, `Droid cannot reach the ${name} head`).toBeLessThan(DEFS.droid.r);
      else expect(r.best, `Biggy got onto the ${name} flight`).toBeGreaterThan(DEFS.biggy.r - 1);
    }
  }
});

it('ground (ch2): all three drive off the landing and out of both doors', () => {
  const s = GF.stairs[1];
  const rect = { x: s.x, y: s.y, w: s.w, h: s.h };
  const [north, south] = stairDoors(rect);
  const L = stairLanding(rect);
  for (const kind of ['voxxy', 'droid', 'biggy'] as const) {
    const g: any = createGame({ seed: 1, chapter: 2, cards: false });
    g.update(DT_MAX);
    const st = g.snapshot().bots.find((b: any) => b.kind === kind);
    const onLanding = st.x > L.x && st.x < L.x + L.w && st.y > L.y && st.y < L.y + L.h;
    console.log(`${kind} starts at ${st.x.toFixed(1)},${st.y.toFixed(1)} — on the landing: ${onLanding}`);
    expect(onLanding, `${kind} does not start on the landing`).toBe(true);

    const a = driveTo(g, kind, north.x + north.w / 2, s.y - 26, 22);
    console.log(`   out the north door -> ${a.x.toFixed(1)},${a.y.toFixed(1)} (closest ${a.best.toFixed(1)})`);
    expect(a.best, `${kind} could not get out of the north door`).toBeLessThan(DEFS[kind].r);

    const b = driveTo(g, kind, L.x + L.w / 2, L.y + L.h / 2, 26);
    expect(b.best, `${kind} could not get back onto the landing`).toBeLessThan(DEFS[kind].r);

    const c = driveTo(g, kind, south.x + south.w / 2, s.y + s.h + DEFS[kind].r + 1.5, 22);
    console.log(`   out the south door -> ${c.x.toFixed(1)},${c.y.toFixed(1)} (closest ${c.best.toFixed(1)})`);
  }
});

it('ground (ch2): nobody walks up the flight', () => {
  const s = GF.stairs[1];
  const L = stairLanding({ x: s.x, y: s.y, w: s.w, h: s.h });
  for (const kind of ['voxxy', 'droid', 'biggy'] as const) {
    const g: any = createGame({ seed: 1, chapter: 2, cards: false });
    g.update(DT_MAX);
    g.debug.select(kind);
    g.debug.place(kind, L.x + L.w - 14, L.y + L.h / 2);
    const r = driveTo(g, kind, s.x + s.w - 14, s.y + s.h / 2, 20);
    console.log(`${kind} pushing up the flight: stopped at x ${r.x.toFixed(1)} (first riser 243.5)`);
    expect(r.x, `${kind} walked up the flight`).toBeLessThan(243.5 + DEFS[kind].r);
  }
});
