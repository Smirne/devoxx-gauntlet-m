/**
 * tools/promo/capture.mjs — shoots the promo's footage, frame by frame, from the
 * real 3D build at 1920×1080, `q=high`.
 *
 *   splash   the press-any-key gate (DEVOXX over Antwerp), in real time
 *   opening  the crates and the three introductions, stepped at 30 fps, HUD on
 *   run      windows of the full scripted run (see SHOTS), stepped at the sim's
 *            own DT_MAX, one rendered frame per sim step
 *   staged   the beats the scripted run skips (see STAGED), or one by name
 *
 * Every run window and staged shot also gets `sfx.wav`: the game's own cue
 * player (footsteps, the clue's chime, the lever, the printer) played back over
 * the snapshots of exactly those frames — `renderSnapshots` in
 * `tools/render-audio/harness.ts` — so the edit can lay them under the picture.
 *
 * Nothing is posed: every gameplay frame is the tests' choreography (the same
 * one `tools/playthrough/run.mjs` films), and the step numbers in SHOTS come
 * from `scout.mjs`'s contact sheet for the same seed.
 *
 *   pnpm dev --port 5287 --host 127.0.0.1     # in another shell
 *   node tools/promo/capture.mjs <outDir> [splash|opening|run|staged|light|lever|printer|keynote|cameo ...]
 */
import { mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { launch, SHIM, SEED } from './common.mjs';

const OUT = process.argv[2] ?? 'promo-frames';
const which = process.argv.slice(3);
const want = (k) => which.length === 0 || which.includes(k);
const BASE = process.env.BASE ?? 'http://127.0.0.1:5287';
const VIEW = { width: 1920, height: 1080 };

/**
 * Windows of the full run at SEED: clip, first and last sim step. Steps are the
 * run's own (`g.update` calls from the start of chapter 1); the beats they catch
 * are listed by step in the comments.
 *
 * `cam` holds a view the follow camera would not take on its own — `yaw`
 * radians round from where it sits when the window opens, `zoom` its distance
 * factor — kept for the whole window the way a player holding the mouse keeps it.
 *
 * `pose` fixes the camera instead: `[x, y, h, lookX, lookY, lookH]`, sim px for
 * the ground and metres for the heights, eased to `to` over the window when it
 * is given. The follow camera swings behind whichever robot the pilot has just
 * selected, which in a trailer reads as the footage running at double speed; a
 * fixed camera lets the robots be the thing that moves.
 */
export const SHOTS = [
  // Voxxy tows Biggy up to speed and lets go (1319 the shutter): side-on.
  { clip: 'roller', s0: 1230, s1: 1400, cam: { yaw: Math.PI / 2, zoom: 1.7 } },
  // 1721 the bolts · 1759 Stephan on the forecourt · 1923 the pat on the head.
  { clip: 'stephan', s0: 1712, s1: 1990, pose: [1392, 474, 1.9, 1490, 440, 1.1] },
  { clip: 'lobby', s0: 2000, s1: 2110 },
  // 2973 the speaker arrives · 2974 the gate opens.
  { clip: 'gate', s0: 2980, s1: 3150 },
  { clip: 'cake', s0: 3620, s1: 3740 },
  { clip: 'push', s0: 5290, s1: 5410 },
];

/** The page's own chrome that a trailer does not need: key help, skip button. */
const TIDY = '.ad3d-help, .ad-skip { display: none !important; }';

/** The run's lead: frames rendered, uncaptured, before a window opens (see the run). */
const RUN_LEAD = 45;

/**
 * The game's cue player over these snapshots, one per 1/30 s (the rate the frames
 * are played at), to `<dir>/sfx.wav`, the first `lead` frames cut off so the
 * file starts on frame 0. Runs in the render-audio harness page, a page of its
 * own: an offline context there cannot pick up the game page's sound.
 */
async function sfx(dir, snaps, lead = 0) {
  if (!snaps.length) return;
  const { browser, page } = await launch({ width: 320, height: 180 });
  await page.goto(`${BASE}/tools/render-audio/index.html`);
  await page.waitForFunction(() => 'renderSnapshots' in window, null, { timeout: 120000 });
  const res = await page.evaluate((s) => window.renderSnapshots(s, { fps: 30 }), snaps);
  await browser.close();
  const raw = `${dir}/sfx-raw.wav`;
  writeFileSync(raw, Buffer.from(res.wav, 'base64'));
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', (lead / 30).toFixed(4), '-i', raw, `${dir}/sfx.wav`]);
  console.log(`${dir}/sfx.wav: peak ${res.peak.toFixed(3)}`);
}

const save = (dir, i, dataUrl) => writeFileSync(`${dir}/${String(i).padStart(5, '0')}.jpg`, Buffer.from(dataUrl.split(',')[1], 'base64'));

/** Real time: shoot as fast as the page allows, keep the frame nearest each 1/30 s. */
async function realTime(page, dir, seconds) {
  mkdirSync(dir, { recursive: true });
  const shots = [];
  const t0 = Date.now();
  while (Date.now() - t0 < seconds * 1000 + 200) shots.push({ t: Date.now() - t0, buf: await page.screenshot({ type: 'jpeg', quality: 92 }) });
  let k = 0;
  for (let i = 0; i < seconds * 30; i++) {
    const t = (i * 1000) / 30;
    while (k + 1 < shots.length && Math.abs(shots[k + 1].t - t) <= Math.abs(shots[k].t - t)) k++;
    writeFileSync(`${dir}/${String(i).padStart(5, '0')}.jpg`, shots[k].buf);
  }
  return shots.length;
}

if (want('splash')) {
  const { browser, page } = await launch(VIEW);
  await page.goto(`${BASE}/3d.html?q=high&seed=${SEED}`);
  await page.waitForFunction(() => window.__ad3d && window.__ad3d.ready, null, { timeout: 300000 });
  await page.addStyleTag({ content: TIDY });
  await page.waitForTimeout(2500);
  console.log('splash', await realTime(page, `${OUT}/splash`, 4), 'screenshots');
  // The end card: the same sky and wordmark, without the gate's prompt.
  await page.addStyleTag({ content: '.ad3d-press, .ad3d-sub { visibility: hidden !important; }' });
  console.log('end', await realTime(page, `${OUT}/end`, 4), 'screenshots');
  await browser.close();
}

if (want('opening')) {
  const dir = `${OUT}/opening`;
  mkdirSync(dir, { recursive: true });
  const { browser, page } = await launch(VIEW);
  await page.goto(`${BASE}/3d.html?shot=1&cards=1&hud=1&q=high&seed=${SEED}`);
  await page.waitForFunction(() => window.__ad3d && window.__ad3d.ready, null, { timeout: 300000 });
  await page.addStyleTag({ content: TIDY });
  let i = 0;
  for (; i < 30 * 40; i++) {
    const going = await page.evaluate(() => {
      window.__ad3d.step(1, 1 / 30);
      return !!window.__ad3d.game.snapshot().opening;
    });
    await page.screenshot({ path: `${dir}/${String(i).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 92 });
    if (!going) break;
  }
  console.log('opening', i, 'frames');
  await browser.close();
}

if (want('run')) {
  const { browser, page } = await launch(VIEW);
  for (const { clip } of SHOTS) mkdirSync(`${OUT}/${clip}`, { recursive: true });
  let written = 0;
  await page.exposeBinding('__promoSave', (_src, clip, i, url) => {
    save(`${OUT}/${clip}`, i, url);
    written++;
  });
  await page.route(/vitest/, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: SHIM }));
  await page.goto(`${BASE}/3d.html?shot=1&q=high&seed=${SEED}&chapter=1`);
  await page.waitForFunction(() => window.__ad3d && window.__ad3d.ready, null, { timeout: 300000 });
  const res = await page.evaluate(async ({ shots, lead }) => {
    const a = window.__ad3d;
    const g = a.game;
    const fr = await import('/tests/full-run.test.ts');
    const pilot = await import('/tests/pilot.ts');
    const { DT_MAX } = await import('/src/sim/constants.ts');
    /** Frames rendered, uncaptured, before a window opens: the follow camera eases in. */
    const LEAD = lead;
    const M = 12.5;
    window.__snaps = {};
    let n = 0;
    const update = g.update.bind(g);
    g.update = (dt) => {
      update(dt);
      n++;
      for (const { clip, s0, s1, cam, pose, to } of shots) {
        const c = a.world.cam;
        if (n === s0 - LEAD || (s0 < LEAD && n === 1)) {
          c.cut();
          c.zoom = 1;
        }
        // Half the lead to settle behind the robot, then turn to the held view.
        if (cam && n === s0 - Math.floor(LEAD / 2)) {
          c.yaw += cam.yaw;
          c.zoom = cam.zoom ?? c.zoom;
        }
        if (cam && n > s0 - Math.floor(LEAD / 2) && n <= s1) c.lastUser = c.time;
        if (pose && n >= s0 - LEAD && n <= s1) {
          const k = to ? Math.max(0, Math.min(1, (n - s0) / (s1 - s0))) : 0;
          const e = k * k * (3 - 2 * k);
          const p = pose.map((v, i) => v + ((to ? to[i] : v) - v) * e);
          a.pose(p[0] / M, p[2], p[1] / M, p[3] / M, p[5], p[4] / M);
        }
        if (pose && n === s1 + 1) c.pose = null;
        if (n >= s0 - LEAD && n <= s1) {
          const snap = g.snapshot();
          a.world.render(snap, DT_MAX);
          (window.__snaps[clip] ??= []).push(JSON.parse(JSON.stringify(snap)));
          if (n >= s0) window.__promoSave(clip, n - s0, a.world.renderer.domElement.toDataURL('image/jpeg', 0.92));
        }
      }
    };
    const last = Math.max(...shots.map((s) => s.s1));
    try {
      fr.playChapter1(g);
      if (n < last) fr.playChapter2(g);
      if (n < last) {
        pilot.playToStairGate(g);
        fr.until(g, 'the walk back up to Room 8', () => g.snapshot().chapter === 4);
      }
      if (n < last) fr.playChapter4(g);
      if (n < last) fr.until(g, 'the last shot', () => n >= last || g.snapshot().reel === null, 3000);
    } catch (e) {
      return { ok: false, error: String(e && e.message), n };
    }
    return { ok: true, n };
  }, { shots: SHOTS, lead: RUN_LEAD });
  // Let the last bindings land.
  await page.waitForTimeout(2000);
  console.log('run', JSON.stringify(res), written, 'frames');
  for (const { clip } of SHOTS) {
    const snaps = await page.evaluate((c) => window.__snaps[c] ?? [], clip);
    await sfx(`${OUT}/${clip}`, snaps, RUN_LEAD);
  }
  await browser.close();
}

/*
 * STAGED — the chapter-1 beats the scripted run skips: it types the code at the
 * keypad and never lights a clue or climbs Biggy. These are played here with the
 * player's own controls (select, stick, E) from where the chapter tests put the
 * robots, HUD on, so Droid's voice line is on screen. One frame per 1/30 s step.
 */
const STAGED = {
  /**
   * Clue 1, the foyer, a floor ring by the west wall. Voxxy's orange beam is
   * on it: nothing to read. Droid walks down from the far end of the foyer
   * towards the camera and brings his green pool over it: orange + green, and
   * the digit rises out of the ring. The camera stands south of the ring, across
   * the beam rather than down it — down it, the floor threw the beam's glare
   * straight back into the lens — and square to the digit, so the 9 reads.
   */
  light: `(function* () {
    const a = window.__ad3d;
    const g = a.game;
    const c = g.debug.chapter().clues[0];
    const M = 12.5;
    g.debug.place('voxxy', c.x - 29, c.y, 0);
    g.debug.place('droid', c.x - 2, c.y - 120, Math.PI / 2);
    g.debug.select('droid');
    a.pose(c.x / M + 1.6, 1.9, c.y / M + 1.6, c.x / M - 0.5, 0.85, c.y / M - 1.4);
    for (let i = 0; i < 90; i++) yield;
    yield* walk('droid', { x: c.x - 2, y: c.y - 26 }, 3);
    for (let i = 0; i < 100; i++) yield;
  })()`,
  /**
   * The projector panel, the release for the middle cinema's magnetic lock.
   * First Droid tries on his own: E out of the panel's reach is his stretch —
   * the game's own party trick, arms up at the ceiling — and E under it is
   * "too high". Then he climbs Biggy, Biggy parks under the panel, and E is the
   * reach and the pull (`reach3d.ts`), with the camera turned to the door it
   * opens. `window.__marks` records when each beat starts, for the edit.
   */
  lever: `(function* () {
    const EYE_H = 1.7;
    const a = window.__ad3d;
    const g = a.game;
    const M = 12.5;
    const panel = g.snapshot().props.find((p) => p.kind === 'projector-panel');
    const at = { x: panel.x + panel.w / 2, y: panel.y + panel.h / 2 };
    window.__marks = [];
    let f = 0;
    const hold = function* (n) { for (let i = 0; i < n; i++, f++) yield; };
    const go = function* (kind, p, tol) { for (const _ of walk(kind, p, tol)) { f++; yield; } };
    const press = (what) => { g.key('KeyE'); window.__marks.push([what, f]); };
    // In frame, flood to the wall: Biggy's lamp down the lens washed the shot out.
    // 45 px keeps him out of Droid's climb range (so E is the stretch), not the frame.
    g.debug.place('biggy', at.x - 45, at.y + 58, -Math.PI / 2);
    // Right under it, against the wall: the stretch here is the trailer's
    // (see \`STAGED_PATCH\`) — in the game E here is "too high".
    g.debug.place('droid', at.x, at.y + 12, -Math.PI / 2);
    g.debug.select('droid');
    a.pose((at.x + 12) / M, EYE_H, (at.y + 62) / M, at.x / M, 2.5, at.y / M);
    yield* hold(20);
    press('stretch');
    yield* hold(80);
    // Unshown in the edit: Droid climbs on (the cut fades to him already up).
    const bg = () => g.snapshot().bots.find((b) => b.kind === 'biggy');
    yield* go('droid', { x: bg().x + 17, y: bg().y - 2 }, 3);
    yield* hold(6);
    press('mount');
    yield* hold(40);
    a.pose(at.x / M - 1.6, 2.3, at.y / M + 6.4, at.x / M - 2.2, 1.6, at.y / M - 0.6);
    window.__marks.push(['door camera', f]);
    // Biggy is inertial: driven flat out he overshot the panel and slid along
    // the wall. So he creeps — the stick only while he is slower than a walk —
    // and stops dead, so nothing moves under Droid while he pulls. Twice: in
    // line under the panel first (unshown), then straight at it, so the two of
    // them end facing it, not the way the diagonal left them.
    g.debug.select('biggy');
    const creep = function* (p, cap = 10) {
      for (let i = 0; i < 400; i++, f++) {
        const b = bg();
        const dx = p.x - b.x, dy = p.y - b.y, l = Math.hypot(dx, dy);
        if (l <= 1.5) break;
        window.__stick = Math.hypot(b.vx, b.vy) < Math.min(cap, 1.5 * l) ? [dx / l, dy / l] : null;
        yield;
      }
      window.__stick = null;
      for (let i = 0; i < 120 && Math.hypot(bg().vx, bg().vy) > 0.3; i++, f++) yield;
    };
    yield* creep({ x: at.x, y: at.y + 40 });
    window.__marks.push(['north', f, Math.round(bg().face * 100) / 100]);
    yield* creep({ x: at.x, y: at.y + 17 }, 16);
    window.__marks.push(['parked', f, Math.round(bg().x - at.x), Math.round(bg().y - at.y), Math.round(bg().face * 100) / 100]);
    yield* hold(2);
    press('lever');
    yield* hold(130);
  })()`,
  /**
   * Chapter 2, reception: Voxxy pulls the cable the last few metres to the
   * counter and plugs the badge printer in — the hop up the counter's face and
   * the plug over its lip (`plugReach` in robots3d.ts) — and the printer drops
   * its first badge. The scripted run gets her here (`PRELUDE`) but moves her
   * on the instant the plug is in, so the beat itself is played here, by hand.
   */
  printer: `(function* () {
    const a = window.__ad3d;
    const g = a.game;
    const M = 12.5;
    const dz = g.snapshot().props.find((p) => p.kind === 'dropzone');
    const at = { x: dz.x + dz.w / 2, y: dz.y + dz.h / 2 };
    a.pose(at.x / M - 2.6, 1.5, at.y / M + 3.2, at.x / M - 0.2, 0.9, at.y / M - 0.6);
    yield* walk('voxxy', at, 3);
    for (let i = 0; i < 4; i++) yield;
    g.key('KeyE');
    for (let i = 0; i < 150; i++) yield;
  })()`,
  /**
   * Chapter 4, the last letter: the run (\`PRELUDE\`) has Droid lift the orange X
   * and turn onto the lane in front of Stephan and the speaker. From there he
   * carries it in one straight line west — the pilot's own route zigzags, and
   * each zig turned the letter in his hands — turns once, and drops it into its
   * gap: #DEVOXX. Then the camera goes up to the house screen, as the game's
   * own film shot does (\`screenView\` in keynote3d.ts), and holds on it.
   */
  keynote: `(function* () {
    const a = window.__ad3d;
    const g = a.game;
    const M = 12.5;
    window.__marks = [];
    let f = 0;
    const d = () => g.snapshot().bots.find((b) => b.kind === 'droid');
    const v = g.debug.chapter().carrying;
    const gap = g.snapshot().props.find((p) => p.kind === 'letter-slot' && p.v === v);
    const gx = gap.x + (gap.w ?? 0) / 2;
    const cam0 = [gx + 28, 112, 2.0, gx + 10, 38, 1.2];
    const pose = (p) => a.pose(p[0] / M, p[2], p[1] / M, p[3] / M, p[5], p[4] / M);
    pose(cam0);
    for (let i = 0; i < 8; i++, f++) yield;
    const lane = d().y;
    for (const _ of walk('droid', { x: gx, y: lane }, 3)) { f++; yield; }
    window.__marks.push(['turn', f]);
    for (const _ of walk('droid', { x: gx, y: gap.y + (gap.h ?? 0) + d().r + 3 }, 3)) { f++; yield; }
    for (let i = 0; i < 4; i++, f++) yield;
    g.key('KeyE');
    window.__marks.push(['drop', f, g.debug.chapter().sign]);
    for (let i = 0; i < 40; i++, f++) yield;
    // The house screen, found in the scene: the one 6.5 m plane.
    let scr = null;
    a.world.scene.traverse((o) => { const q = o.geometry && o.geometry.parameters; if (q && Math.abs(q.width - 6.5) < 0.01 && !scr) scr = o; });
    const c = a.world.cam.camera;
    const sp = scr.getWorldPosition(scr.position.clone());
    const half = (c.fov * Math.PI) / 360;
    const dist = Math.max((6.8 * 1.06) / 2 / (Math.tan(half) * c.aspect), ((6.5 * 9) / 16 + 0.3) * 1.06 / 2 / Math.tan(half));
    const p0 = c.position.clone();
    const l0 = c.position.clone().add(c.getWorldDirection(sp.clone()).multiplyScalar(4));
    window.__marks.push(['rise', f]);
    const T = 90;
    for (let i = 1; i <= T + 150; i++, f++) {
      const k = Math.min(1, i / T);
      const e = k * k * (3 - 2 * k);
      const L = (u, w) => u + (w - u) * e;
      a.pose(L(p0.x, sp.x), L(p0.y, sp.y), L(p0.z, sp.z + dist), L(l0.x, sp.x), L(l0.y, sp.y), L(l0.z, sp.z));
      yield;
    }
  })()`,
  /**
   * Chapter 3, the last high table by the drinks fridge: Michele and Claude,
   * pair-programming over breakfast (`src/sim/cameos.ts`). The camera holds on
   * Michele's back first — the WellD backpack, pushing in — then swings round
   * the open north-west side (the accent panel closes the south) to a two-shot
   * of both of them across the table, while Voxxy wanders up the visitor lane.
   */
  cameo: `(function* () {
    const a = window.__ad3d;
    const g = a.game;
    const ppl = g.snapshot().people;
    const me = ppl.find((p) => p.name === 'Michele');
    const cl = ppl.find((p) => p.name === 'Claude');
    const M = 12.5;
    const mid = { x: (me.x + cl.x) / 2, y: (me.y + cl.y) / 2 };
    g.debug.place('voxxy', me.x - 70, me.y - 60, 0);
    g.debug.select('voxxy');
    const H = 35, T = 70;
    const ease = (k) => k * k * (3 - 2 * k);
    const lerp = (u, v, k) => u + (v - u) * k;
    let f = 0;
    const cam = () => {
      let th = (3 * Math.PI) / 4, r, h = 1.5, t = me;
      if (f < H) r = lerp(2.3, 1.7, ease(f / H));
      else {
        const e = ease(Math.min(1, (f - H) / T));
        th += (3 * Math.PI / 4) * e;
        r = lerp(1.7, 3.0, e);
        h = lerp(1.5, 1.8, e);
        t = { x: lerp(me.x, mid.x, e), y: lerp(me.y, mid.y, e) };
      }
      a.pose(t.x / M + r * Math.cos(th), h, t.y / M + r * Math.sin(th), t.x / M, 1.1, t.y / M);
      f++;
    };
    for (let i = 0; i < H; i++) { cam(); yield; }
    const it = walk('voxxy', { x: me.x - 20, y: me.y - 24 }, 3);
    for (let r = it.next(); !r.done; r = it.next()) { cam(); yield; }
    while (f < H + T + 170) { cam(); yield; }
  })()`,
};
/**
 * Rewrites of the game's own modules for one staged shot, applied to what the
 * dev server sends that page and nowhere else: the repo's code is untouched.
 * The lever's: Droid's E under the panel is his stretch, not "too high". In the
 * game he stretches only out of the panel's reach, 4 m from it, and saying he
 * can't reach it from there read as absurd (Michele, 30 Sep: "can you bypass that
 * rule? change the code temporarily?").
 */
const STAGED_PATCH = {
  lever: [[/\/src\/sim\/chapters\/ch1-night\.ts/, `b.kind === "droid" && dist(b, panelAt) < PANEL_REACH`, `b.kind === "droid" && false`]],
};
/** The chapter each staged shot is played in, and anything it hides. */
const STAGED_CHAPTER = { light: 1, lever: 1, printer: 1, cameo: 3, keynote: 1 };
/**
 * Played before a staged shot, unfilmed: the tests' own run up to a step, the
 * pilot stopped there by an exception out of `g.update`, the state left as it was.
 */
const prelude = (stop) => `(async () => {
  const g = window.__ad3d.game;
  const fr = await import('/tests/full-run.test.ts');
  const pilot = await import('/tests/pilot.ts');
  const update = g.update.bind(g);
  let n = 0;
  const done = ${stop};
  g.update = (dt) => {
    update(dt);
    if (done(++n, g)) throw new Error('promo: prelude over');
  };
  try {
    fr.playChapter1(g);
    fr.playChapter2(g);
    pilot.playToStairGate(g);
    fr.until(g, 'the walk back up to Room 8', () => g.snapshot().chapter === 4);
    fr.playChapter4(g);
  } catch (e) {
    if (!String(e && e.message).includes('prelude over')) throw e;
  }
  g.update = update;
  return n;
})()`;
const PRELUDE = {
  // Step 1037 of the run: Voxxy at reception with the cable (see SHOTS).
  printer: prelude('(n) => n >= 1037'),
  // Past 5044, the orange X lifted: stop once Droid, carrying it, is heading
  // due west along the lane for a few steps running.
  keynote: prelude(`(() => {
    let run = 0, px = 0, py = 0;
    return (n, g) => {
      const d = g.snapshot().bots.find((b) => b.kind === 'droid');
      const west = d.x - px < -0.1 && Math.abs(d.y - py) < 0.05;
      px = d.x; py = d.y;
      run = n > 5044 && g.debug.chapter().carrying >= 0 && west ? run + 1 : 0;
      return run >= 3;
    };
  })()`),
};
// The toasts are small print at 1080p; the captions say it. The cameo is about the two of them: no bubbles either.
const STAGED_HIDE = { cameo: '.ad-bubbles { display: none !important; }', keynote: '.ad-bubbles { display: none !important; }' };

/**
 * The page-side stick: pilot.driveTo's eight-way steering, one frame per yield.
 * The page's own input handler writes the keyboard's stick every frame (zero,
 * headless), so the held stick sits in `__stick` and wins over it — the way a
 * key held down would.
 */
const WALK = `{
  const g = window.__ad3d.game;
  const set = g.setStick;
  window.__stick = null;
  g.setStick = (x, y, f) => (window.__stick ? set(window.__stick[0], window.__stick[1]) : set(x, y, f));
  window.walk = function* (kind, p, tol) {
    g.debug.select(kind);
    for (let i = 0; i < 400; i++) {
      const b = g.snapshot().bots.find((x) => x.kind === kind);
      const dx = p.x - b.x, dy = p.y - b.y;
      if (Math.hypot(dx, dy) <= tol) break;
      window.__stick = [Math.abs(dx) > 3 ? Math.sign(dx) : 0, Math.abs(dy) > 3 ? Math.sign(dy) : 0];
      yield;
    }
    window.__stick = null;
  };
}`;

// `staged` shoots them all; naming one (`cameo`) shoots just that one.
const stagedWanted = (clip) => want('staged') || which.includes(clip);
if (Object.keys(STAGED).some(stagedWanted)) {
  for (const [clip, script] of Object.entries(STAGED)) {
    if (!stagedWanted(clip)) continue;
    const dir = `${OUT}/${clip}`;
    mkdirSync(dir, { recursive: true });
    const { browser, page } = await launch(VIEW);
    await page.route(/vitest/, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: SHIM }));
    for (const [url, from, to] of STAGED_PATCH[clip] ?? []) {
      await page.route(url, async (r) => {
        const res = await r.fetch();
        const body = await res.text();
        if (!body.includes(from)) throw new Error(`promo: ${clip}'s patch no longer matches ${url}`);
        await r.fulfill({ response: res, body: body.replace(from, to) });
      });
    }
    await page.goto(`${BASE}/3d.html?shot=1&hud=1&q=high&seed=${SEED}&chapter=${STAGED_CHAPTER[clip]}`);
    await page.waitForFunction(() => window.__ad3d && window.__ad3d.ready, null, { timeout: 300000 });
    if (PRELUDE[clip]) console.log(clip, 'prelude to step', await page.evaluate(PRELUDE[clip]));
    // The run sheet, the panels and the toasts stay out of the trailer; the
    // robots' own lines, in bubbles over their heads, stay.
    await page.addStyleTag({ content: `${TIDY} .ad-sheet, .ad-chrome { display: none !important; } .ad-toasts { display: none !important; } ${STAGED_HIDE[clip] ?? ''}` });
    await page.evaluate(`${WALK}; window.__stage = ${script}; true`);
    let i = 0;
    for (; i < 30 * 30; i++) {
      const done = await page.evaluate(() => {
        const r = window.__stage.next();
        window.__ad3d.step(1, 1 / 30);
        (window.__snaps ??= []).push(JSON.parse(JSON.stringify(window.__ad3d.game.snapshot())));
        return r.done;
      });
      await page.screenshot({ path: `${dir}/${String(i).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 92 });
      if (done) break;
    }
    const s = await page.evaluate(() => {
      const n = window.__ad3d.game.debug.chapter();
      return { found: n.clues?.map((c) => c.found), panelOn: n.panelOn, lockSwing: n.lockSwing, sign: n.sign, marks: window.__marks, errors: window.__ad3d.errors };
    });
    console.log(clip, i, 'frames', JSON.stringify(s));
    await sfx(dir, await page.evaluate(() => window.__snaps));
    await browser.close();
  }
}
