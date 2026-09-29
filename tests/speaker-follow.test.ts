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

import { DT_MAX, GF, circleRect, createGame, dist, inRect, type BreakfastState, type DebugGame, type Vec2 } from '../src/sim';
import { bot, driveTo, walkTo } from './pilot';

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

/**
 * Seconds of sim the speaker gets, once Voxxy is on the mark, after she has taken
 * them past a table only she fits under. The slowest hiding place needs about a
 * third of it (the table sweep below prints them all).
 */
const TABLE_BUDGET = 60;
/** The "never stuck" window: three seconds of frames. */
const WINDOW = Math.ceil(3 / DT_MAX);

interface TableRun {
  booth: string;
  table: string;
  /** Did Voxxy's own centre actually go under the cloth — is this testing anything. */
  under: boolean;
  ok: boolean;
  /** Seconds from Voxxy standing on the mark to the speaker with Stephan. */
  secs: number;
  /** Every wall the speaker's body was ever inside, by more than half a pixel. */
  inside: string[];
  /** Every three seconds in which Voxxy walked on and the speaker did not. */
  stuck: string[];
  /** What the speaker said while being led, other than hello and goodbye. */
  lines: string[];
}

/**
 * THE REPORT, PLAYED: Voxxy leads, goes under a table, and walks on to Stephan.
 *
 * Michele, 29 Sep 2026, chapter 3, with a screenshot of the masked speaker pressed
 * against a white block and Voxxy beyond it: *"the keynote speaker is blocked on
 * this block. I went under the table I think."* A crumb is only dropped where the
 * speaker fits, so none go under the cloth, and the first crumb after a table is
 * across it from the last crumb before it: the speaker walked the line between
 * the two into the tablecloth and never moved again.
 *
 * So: E at the speaker, then Voxxy walks to the sponsor table nearest their hiding
 * place and drives straight through the middle of it, west to east — the way to
 * Stephan, and clear of the flight case every table has on its north side — and
 * then walks to the mark with the shared pilot and lets go. Every frame is
 * watched for the speaker's body inside any wall, low ones included, and for a
 * three-second stretch in which Voxxy got on and the speaker did not.
 */
function underATable(g: DebugGame): TableRun {
  const st = (): BreakfastState => g.debug.chapter() as BreakfastState;
  const speaker = (): { x: number; y: number; r: number } => {
    const p = g.snapshot().people.find((o) => o.role === 'speaker');
    if (!p) throw new Error('chapter 3 publishes no keynote speaker');
    return { x: p.x, y: p.y, r: p.r };
  };
  const hiding = speaker();
  const booth = st().speaker.booth;
  const centre = (b: { x: number; y: number; w: number; h: number }): Vec2 => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
  const table = GF.booths.filter((b) => b.table).sort((a, b) => dist(centre(a), hiding) - dist(centre(b), hiding))[0];
  const cy = table.y + table.h / 2;

  const trace: Array<{ s: Vec2; v: Vec2 }> = [];
  const inside = new Set<string>();
  const lines: string[] = [];
  let under = false;
  let toastUntil = -1;
  const real = g.update.bind(g);
  (g as unknown as { update: (dt: number) => void }).update = (dt: number): void => {
    real(dt);
    const v = bot(g, 'voxxy');
    if (inRect(v, table)) under = true;
    const toast = g.snapshot().toast;
    if (toast && toast.until !== toastUntil) {
      toastUntil = toast.until;
      if (/^Keynote speaker:/.test(toast.t) && !/Lead the way|Stephan!/.test(toast.t)) lines.push(toast.t);
    }
    if (st().speaker.withStephan) return;
    const s = speaker();
    trace.push({ s: { x: s.x, y: s.y }, v: { x: v.x, y: v.y } });
    // Their body against every wall, the way the sim resolves it — half a pixel of
    // give, so a speaker resting against a table is not reported as inside it.
    for (const w of g.debug.walls()) {
      if (circleRect({ x: s.x, y: s.y, r: s.r - 0.5 }, w)) inside.add(`${w.booth?.name ?? w.kind ?? 'a wall'} at ${w.x},${w.y}`);
    }
  };

  g.debug.select('voxxy');
  g.debug.place('voxxy', hiding.x, hiding.y + 24);
  g.update(DT_MAX);
  g.key('KeyE');
  expect(st().speaker.following, `the speaker at ${booth} would not come out`).toBe(true);
  expect(walkTo(g, 'voxxy', { x: table.x - 15, y: cy }), `Voxxy could not walk to ${table.name}`).toBe(true);
  expect(driveTo(g, 'voxxy', [{ x: table.x + table.w + 15, y: cy }]), `Voxxy could not get under ${table.name}`).toBe(true);
  const mark = g.snapshot().props.find((o) => o.kind === 'dropzone' && (o.label ?? '').includes('speaker'));
  expect(mark, 'chapter 3 publishes no mark for the speaker').toBeDefined();
  expect(
    walkTo(g, 'voxxy', { x: mark!.x + (mark!.w ?? 0) / 2, y: mark!.y + (mark!.h ?? 0) / 2 }),
    `Voxxy could not walk on to the mark from ${table.name}`,
  ).toBe(true);
  let i = 0;
  const frames = Math.ceil(TABLE_BUDGET / DT_MAX);
  for (; i < frames && !st().speaker.withStephan; i++) g.update(DT_MAX);

  /*
   * Three seconds in which Voxxy got three metres further on and the speaker never
   * got half a metre from where they stood when it started: pinned, whatever the
   * reason. Measured as the furthest they got, not where they ended up — a speaker
   * who follows her to the table face she dove under and then walks back and
   * round it can end three seconds where they began, and that is a person
   * following somebody, not a person stuck.
   */
  const stuck: string[] = [];
  for (let k = WINDOW; k < trace.length; k++) {
    const a = trace[k - WINDOW];
    if (dist(a.v, trace[k].v) <= 37.5) continue;
    let far = 0;
    for (let j = k - WINDOW; j <= k; j++) far = Math.max(far, dist(a.s, trace[j].s));
    if (far < 6.25) {
      stuck.push(`${(k * DT_MAX).toFixed(1)}s in, at ${a.s.x.toFixed(0)},${a.s.y.toFixed(0)}`);
      k += WINDOW;
    }
  }
  return {
    booth,
    table: table.name,
    under,
    ok: st().speaker.withStephan,
    secs: i * DT_MAX,
    inside: [...inside],
    stuck,
    lines,
  };
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

  /**
   * ...even when Voxxy goes where only she fits — `underATable`, on every booth
   * the chapter can hide the speaker behind, one seed each.
   */
  it('goes round a table Voxxy went under, and still reaches Stephan', { timeout: 60000 }, () => {
    const runs: TableRun[] = [];
    const seen = new Set<string>();
    for (let seed = 1; seed <= 14; seed++) {
      const g = createGame({ seed, chapter: 3, cards: false }) as DebugGame;
      const booth = (g.debug.chapter() as BreakfastState).speaker.booth;
      if (seen.has(booth)) continue;
      seen.add(booth);
      runs.push(underATable(g));
    }
    // eslint-disable-next-line no-console
    console.log(
      '\nthe speaker, led under the nearest table from every hiding place:\n' +
        runs
          .map((r) => `  ${r.ok ? r.secs.toFixed(1).padStart(5) + 's' : ' never'}  ${r.booth}, under ${r.table}${r.lines.length ? ` — ${r.lines.join(' / ')}` : ''}`)
          .join('\n') +
        '\n',
    );
    expect(seen.size, 'the sweep only ever saw one hiding place').toBeGreaterThan(2);
    // Voxxy really did go under the cloth, or none of the rest means anything.
    expect(runs.filter((r) => !r.under).map((r) => r.table), 'Voxxy never got under these tables').toEqual([]);
    expect(
      runs.filter((r) => !r.ok).map((r) => `${r.booth}, under ${r.table}`),
      'the speaker never reached Stephan after Voxxy went under a table',
    ).toEqual([]);
    expect(
      runs.flatMap((r) => r.stuck.map((s) => `${r.booth}: ${s}`)),
      'Voxxy walked on and the speaker stood still',
    ).toEqual([]);
    // Never through a wall to do it — the tablecloth least of all.
    expect(runs.flatMap((r) => r.inside.map((w) => `${r.booth}: ${w}`)), 'the speaker walked into').toEqual([]);
    /*
     * ...and a gate says why, in the voice of whoever it stopped: the speaker
     * explains they are going round (or waiting), in their own words, and says it
     * once a time round — a line every frame would be a few hundred of them.
     */
    for (const r of runs) {
      expect(r.lines.length, `the speaker never said why they left ${r.booth}'s route at ${r.table}`).toBeGreaterThan(0);
      expect(r.lines.length, `the speaker kept on about it: ${r.lines.join(' / ')}`).toBeLessThanOrEqual(3);
    }
  });
});
