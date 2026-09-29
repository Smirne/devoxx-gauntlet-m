/**
 * THE KEYNOTE SPEAKER HAS TO ARRIVE — from every booth they can hide behind.
 *
 * Found by the ship-gate run on 28 Sep 2026 and not by a chapter test, because
 * every chapter test starts chapter 3 on its own seed and that seed happened to
 * hide the speaker at Regex Racing, which has clear line of sight to Stephan.
 * Chained behind chapters 1 and 2 the RNG has been used, the speaker hides
 * somewhere else, and the errand could not be finished: the follower walked at
 * wherever Voxxy was STANDING, so the moment she reached the mark ahead of them —
 * she is nearly twice their pace — they set off straight across the hall and
 * jammed against the first booth on the line.
 *
 * Twelve of fourteen seeds stranded them. So this walks the errand on every booth
 * the chapter can pick, with the shared pilot doing Voxxy's half exactly as
 * `playToStairGate` does: press E at the speaker, walk to the mark, stop driving.
 * What it is really asserting is that being led works when the leader is faster
 * than the led, which is every time.
 */

import { describe, expect, it } from 'vitest';

import { DT_MAX, GF, createGame, type BreakfastState, type DebugGame, type Vec2 } from '../src/sim';
import { walkTo } from './pilot';

/** Seconds of sim the speaker gets to cross the hall once Voxxy is on the mark. */
const BUDGET = 90;

/**
 * Voxxy finds the speaker, leads them to the mark, and lets go.
 *
 * It also watches every frame of the errand for the speaker inside a sponsor
 * half table. Michele, 28 Sep 2026: *"remember that voxxy can go under the
 * tables!"* — the half tables are `low: true` with `skipFor: voxxy`, so Voxxy's
 * route is not a route anybody else can walk, and both halves of this got it
 * wrong at first: the breadcrumbs dropped crumbs under the cloth, and the
 * follower's own push-out waved `low` walls through and simply glided across.
 */
function leadTheSpeaker(g: DebugGame): { booth: string; secs: number; ok: boolean; through: string[] } {
  const st = (): BreakfastState => g.debug.chapter() as BreakfastState;
  const tables = GF.booths.filter((b) => b.table);
  const through: string[] = [];
  const real = g.update.bind(g);
  (g as unknown as { update: (dt: number) => void }).update = (dt: number): void => {
    real(dt);
    const p = g.snapshot().people.find((o) => o.role === 'speaker');
    if (!p) return;
    // The body against the cloth, circle to rect — the same test the sim resolves
    // the contact with, so a corner the speaker clears is not reported as a table
    // they walked through.
    for (const b of tables) {
      const nx = Math.max(b.x, Math.min(p.x, b.x + b.w));
      const ny = Math.max(b.y, Math.min(p.y, b.y + b.h));
      if (Math.hypot(p.x - nx, p.y - ny) < p.r - 0.5 && !through.includes(b.name)) through.push(b.name);
    }
  };
  const booth = GF.booths.find((b) => b.name === st().speaker.booth);
  expect(booth, `the chapter hid the speaker at a booth the venue does not have`).toBeDefined();
  const hiding = g.snapshot().people.find((p) => p.role === 'speaker');
  const at: Vec2 = {
    x: hiding ? hiding.x : booth!.x + booth!.w / 2,
    y: (hiding ? hiding.y : booth!.y + booth!.h + 14) + 24,
  };

  g.debug.select('voxxy');
  g.debug.place('voxxy', at.x, at.y);
  g.update(DT_MAX);
  g.key('KeyE');
  expect(st().speaker.following, `the speaker at ${booth!.name} would not come out`).toBe(true);

  const mark = g.snapshot().props.find((o) => o.kind === 'dropzone' && (o.label ?? '').includes('speaker'));
  expect(mark, 'chapter 3 publishes no mark for the speaker').toBeDefined();
  expect(
    walkTo(g, 'voxxy', { x: mark!.x + (mark!.w ?? 0) / 2, y: mark!.y + (mark!.h ?? 0) / 2 }),
    `Voxxy could not walk to the speaker's mark from ${booth!.name}`,
  ).toBe(true);

  let i = 0;
  const frames = Math.ceil(BUDGET / DT_MAX);
  for (; i < frames && !st().speaker.withStephan; i++) g.update(DT_MAX);
  return { booth: booth!.name, secs: i * DT_MAX, ok: st().speaker.withStephan, through };
}

describe('the keynote speaker', () => {
  it('walks to Stephan from wherever the chapter hides them', { timeout: 60000 }, () => {
    const seen = new Map<string, number>();
    const failed: string[] = [];
    const through: string[] = [];
    for (let seed = 1; seed <= 14; seed++) {
      const g = createGame({ seed, chapter: 3, cards: false }) as DebugGame;
      const r = leadTheSpeaker(g);
      seen.set(r.booth, Math.max(seen.get(r.booth) ?? 0, r.secs));
      if (!r.ok) failed.push(`${r.booth} (seed ${seed})`);
      for (const t of r.through) through.push(`${t} (seed ${seed})`);
    }
    // eslint-disable-next-line no-console
    console.log(
      '\nthe speaker, led from every booth the chapter picks:\n' +
        [...seen].map(([b, s]) => `  ${s.toFixed(1).padStart(5)}s  ${b}`).join('\n') +
        '\n',
    );
    expect(seen.size, 'the sweep only ever saw one hiding place').toBeGreaterThan(2);
    expect(failed, 'the speaker never reached Stephan from these booths').toEqual([]);
    /*
     * ...and never under a tablecloth on the way. Swept over every seed rather
     * than one, because the fault only shows on the routes that pass a half
     * table: with the old code it was seeds 3 and 12 — the Regex Racing hiding
     * place — walking through The Coffee Sponsor, and a single-seed test picked
     * a booth that happened not to.
     */
    expect(through, 'the speaker walked through these sponsor tables').toEqual([]);
  });

  /**
   * ...and the route they walk is Voxxy's, which is what makes the above true.
   * Asserted on the shape of the walk rather than on the trail itself: the
   * speaker's path is never a straight line to the mark when Voxxy's was not.
   */
  it('takes them round the booths rather than through one', () => {
    const g = createGame({ seed: 1, chapter: 3, cards: false }) as DebugGame;
    const st = (): BreakfastState => g.debug.chapter() as BreakfastState;
    const spk = (): Vec2 => {
      const p = g.snapshot().people.find((o) => o.role === 'speaker');
      return { x: p!.x, y: p!.y };
    };
    const from = spk();
    leadTheSpeaker(g);
    expect(st().speaker.withStephan).toBe(true);
    const to = spk();
    // Nobody ever stood inside a booth on the way, which is the failure the
    // beeline produced: it ended with the speaker pressed into one.
    for (const b of GF.booths) {
      if (b.table) continue;
      const inside = to.x > b.x && to.x < b.x + b.w && to.y > b.y && to.y < b.y + b.h;
      expect(inside, `the speaker finished inside ${b.name}`).toBe(false);
    }
    expect(Math.hypot(to.x - from.x, to.y - from.y), 'the speaker never moved').toBeGreaterThan(100);
  });
});
