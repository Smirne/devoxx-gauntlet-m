/**
 * The tow bar.
 *
 * Michele, playing chapter 2: *"the big thing: pushing biggy is really really
 * hard, It tends to go sideways, and hitting a good speed is a very hard task."*
 * `src/sim/tow.ts` is the answer, ported from the 2D experiment he pointed at.
 *
 * The acceptance criterion is not "the code runs". It is the complaint, measured:
 * a run-up that starts slightly misaligned must stay in its lane, and the free
 * push must be shown to wander so the fix is anchored to a number rather than to
 * a feeling. That comparison is the first test in this file, and it is the one
 * that would fail if anybody retuned the bar back into a shove.
 *
 * Everything runs at a fixed `DT_MAX` step against the seeded game, same as the
 * chapter choreographies.
 */

import { describe, expect, it } from 'vitest';

import {
  DT_MAX,
  MOUNT_REACH,
  ROLLER_DOOR_SPEED,
  TOW_DIRS,
  TOW_RELEASE_HOLD,
  canGrab,
  towAxis,
  towCap,
  createGame,
  mkBot,
  type Bot,
  type DebugGame,
  type ExpoState,
  type RobotKind,
} from '../src/sim';

const SEED = 20260930;

const mk = (chapter: number): DebugGame => createGame({ seed: SEED, chapter, cards: false });

const bot = (g: DebugGame, kind: RobotKind): Bot => {
  const b = g.snapshot().bots.find((o) => o.kind === kind);
  if (!b) throw new Error(`no ${kind}`);
  return b;
};

function steps(g: DebugGame, n: number): void {
  for (let i = 0; i < n; i++) g.update(DT_MAX);
}

/**
 * The expo hall's roller-door lane, which is where the complaint was filed. Biggy
 * runs east along y = 160 and the door checks `vx` alone, so any sideways travel
 * is both a miss and a measurable number.
 */
const LANE_Y = 160;

/**
 * Set the pair up on the lane with the pusher `off` pixels off the centre line.
 *
 * Voxxy stands against Biggy's flank rather than the 28 px back the free-push
 * choreography uses: `MOUNT_REACH` is a reach, not a run-up, and a player who has
 * to shove Biggy across the hall before they can take hold of him still has the
 * problem the bar exists to remove.
 */
function onTheLane(g: DebugGame, off: number): void {
  g.debug.select('voxxy');
  g.debug.place('biggy', 400, LANE_Y);
  g.debug.place('voxxy', 400 - 14, LANE_Y + off);
}

describe('the tow bar', () => {
  /*
   * THE COMPLAINT, AS A NUMBER.
   *
   * Four pixels of misalignment is less than a third of Voxxy's radius — a player
   * lining up by eye is off by at least this much — and it is enough to send the
   * free push off the lane. The bar quantises the direction, so the same four
   * pixels cost nothing at all.
   */
  it('holds the lane that a free push wanders off', () => {
    const OFF = 4;

    const shoved = mk(2);
    onTheLane(shoved, OFF);
    shoved.setStick(1, 0);
    let shovedDrift = 0;
    for (let i = 0; i < 260; i++) {
      shoved.update(DT_MAX);
      shovedDrift = Math.max(shovedDrift, Math.abs(bot(shoved, 'biggy').y - LANE_Y));
    }

    const towed = mk(2);
    onTheLane(towed, OFF);
    towed.key('Space');
    expect(towed.snapshot().tow?.holder).toBe('voxxy');
    towed.setStick(1, 0);
    let towedDrift = 0;
    for (let i = 0; i < 260; i++) {
      towed.update(DT_MAX);
      towedDrift = Math.max(towedDrift, Math.abs(bot(towed, 'biggy').y - LANE_Y));
    }

    // The bar is aimed east and held there, so Biggy stays on the line he started
    // on: sub-pixel, not "less bad".
    expect(towedDrift).toBeLessThan(1);
    // And the shove really does wander — if this ever stops being true the
    // comparison above has stopped meaning anything and should be re-derived.
    expect(shovedDrift).toBeGreaterThan(towedDrift * 4);
  });

  it('takes Biggy through the roller door, which he cannot manage alone', () => {
    const g = mk(2);
    onTheLane(g, 0);
    g.key('Space');
    g.setStick(1, 0);
    let top = 0;
    for (let i = 0; i < 400; i++) {
      top = Math.max(top, bot(g, 'biggy').vx);
      if ((g.debug.chapter() as ExpoState).rollerBroken) break;
      g.update(DT_MAX);
    }
    g.setStick(0, 0);
    expect((g.debug.chapter() as ExpoState).rollerBroken).toBe(true);
    expect(top).toBeGreaterThan(ROLLER_DOOR_SPEED);
    expect(top).toBeGreaterThan(bot(g, 'biggy').max);
    // The cap is the holder's legs, not Biggy's: a tow is help, not a different
    // robot. `boostCap` is granted at 1.05x so the door check cannot be undercut
    // by the next frame's clamp, which is the same headroom `pushBiggy` takes.
    expect(top).toBeLessThanOrEqual(towCap('voxxy') * 1.05 + 1e-6);
  });

  it('re-aims the bar when the stick goes across it, and bleeds the old momentum', () => {
    const g = mk(2);
    onTheLane(g, 0);
    g.key('Space');
    const east = g.snapshot().tow?.dir;
    expect(east).toBe(0);

    // Build a run east first, so there is momentum for the swing to lose.
    g.setStick(1, 0);
    steps(g, 60);
    const running = Math.abs(bot(g, 'biggy').vx);
    expect(running).toBeGreaterThan(0);

    // Now push the stick across the bar: the holder walks round Biggy.
    g.setStick(0, 1);
    steps(g, 20);
    const dir = g.snapshot().tow?.dir;
    expect(dir).not.toBe(east);
    expect(dir).toBeGreaterThanOrEqual(0);
    expect(dir).toBeLessThan(TOW_DIRS);
    /*
     * WHAT THE LANE PROMISES.
     *
     * Not that Biggy slows down — he is a coasting mass and the bar is not a
     * brake. Two things: the swing is continuous while the holder is walking
     * round, and the moment the player stops swinging the bar DROPS INTO one of
     * the eight lanes and takes Biggy's momentum with it. That second half is
     * what makes the quantisation real rather than decorative; without it the
     * drive reads a continuous `aim` and the drift the bar exists to remove is
     * quietly back after the first re-aim.
     */
    g.setStick(0, 0);
    steps(g, 1);
    const aim = g.snapshot().tow?.aim ?? NaN;
    const eighth = (aim / (Math.PI / 4)) % 1;
    expect(Math.min(eighth, 1 - eighth)).toBeLessThan(1e-9);

    const b = bot(g, 'biggy');
    const ax = towAxis(aim);
    const lateral = Math.abs(b.vx * -ax.y + b.vy * ax.x);
    expect(lateral).toBeLessThan(1e-9);
  });

  it('lets go when the stick pulls straight back, and says so', () => {
    const g = mk(2);
    onTheLane(g, 0);
    g.key('Space');
    expect(g.snapshot().tow).not.toBeNull();

    // West is straight back along an east-pointing bar.
    g.setStick(-1, 0);
    steps(g, Math.ceil(TOW_RELEASE_HOLD / DT_MAX) + 2);
    expect(g.snapshot().tow).toBeNull();
    expect(g.snapshot().toast?.t ?? '').toContain('Voxxy');
  });

  it('is the same key both ways, and switching robots drops the bar', () => {
    const g = mk(2);
    onTheLane(g, 0);
    g.key('Space');
    expect(g.snapshot().tow).not.toBeNull();
    g.key('Space');
    expect(g.snapshot().tow).toBeNull();

    g.key('Space');
    expect(g.snapshot().tow).not.toBeNull();
    // Taking Droid leaves nobody steering the holder, so the grab ends with it.
    g.key('Digit2');
    expect(g.snapshot().tow).toBeNull();
  });

  it('refuses the grab out of reach, and refuses it to Biggy, in each robot voice', () => {
    const g = mk(2);
    g.debug.select('voxxy');
    g.debug.place('biggy', 400, LANE_Y);
    g.debug.place('voxxy', 300, LANE_Y);
    g.key('Space');
    expect(g.snapshot().tow).toBeNull();
    expect(g.snapshot().toast?.t ?? '').toContain('Voxxy');

    g.debug.select('biggy');
    g.key('Space');
    expect(g.snapshot().tow).toBeNull();
    expect(g.snapshot().toast?.t ?? '').toContain('Biggy');
  });

  it('will not let Biggy tow himself, or a mounted robot tow anything', () => {
    const bg = mkBot('biggy', 100, 100);
    const vx = mkBot('voxxy', 90, 100);
    const dr = mkBot('droid', 90, 100);

    expect(canGrab(bg, bg, MOUNT_REACH)).toBe(false);
    expect(canGrab(vx, bg, MOUNT_REACH)).toBe(true);
    expect(canGrab(dr, bg, MOUNT_REACH)).toBe(true);

    dr.mounted = true;
    expect(canGrab(dr, bg, MOUNT_REACH)).toBe(false);
    dr.mounted = false;
    dr.braced = true;
    expect(canGrab(dr, bg, MOUNT_REACH)).toBe(false);
  });

  it('keeps the holder on the bar rather than leaving it behind', () => {
    const g = mk(2);
    onTheLane(g, 0);
    g.key('Space');
    g.setStick(1, 0);
    let worst = 0;
    for (let i = 0; i < 200; i++) {
      g.update(DT_MAX);
      if (!g.snapshot().tow) break;
      const b = bot(g, 'biggy');
      const v = bot(g, 'voxxy');
      const gap = Math.hypot(b.x - v.x, b.y - v.y) - (b.r + v.r);
      worst = Math.max(worst, Math.abs(gap));
    }
    // Placed after Biggy's own step, so the arm never stretches or overlaps by
    // more than the wall push-out the venue forces on it.
    expect(worst).toBeLessThan(v0Tolerance);
  });
});

/**
 * How far off the bar the holder may sit. It is not zero because `settleTow`
 * pushes the holder out of any wall it was placed inside rather than dropping the
 * grab — see the note there.
 */
const v0Tolerance = 2;
