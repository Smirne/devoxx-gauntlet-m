#!/usr/bin/env node
/**
 * Regenerates `public/progress.html` from `tools/progress/pieces.json`.
 *
 * GAUNTLET.md §5: after every critic round this page shows every piece, its round
 * count, the latest verdict with before/after screenshots, pass/fail on the two
 * first-class factual checks, and the days left to 30 Sep 2026 23:59 CEST. Michele
 * watches the game evolve here, often from a phone — hence one self-contained file,
 * no CDN, no build step, plain Node ESM with zero dependencies.
 *
 *   node tools/progress/build-progress.mjs [--out <file>] [--quiet]
 *
 * The script only ever READS pieces.json: a round is recorded by editing that file
 * (bump `rounds`, replace `verdict`, set the checks, drop the screenshots into
 * tools/progress/shots/ and name them). Re-running with unchanged inputs produces
 * the same page apart from the generated-at line and the countdown, so it is safe
 * to run in a loop, and safe to run before any screenshot exists.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const PIECES_FILE = join(HERE, 'pieces.json');
const TEMPLATE_FILE = join(HERE, 'template.html');
const SHOTS_DIR = join(HERE, 'shots');
const DEFAULT_OUT = join(REPO_ROOT, 'public', 'progress.html');

const MS_PER_DAY = 86_400_000;
const MS_PER_HOUR = 3_600_000;

/** Statuses a piece may carry, in the order they are counted in the summary. */
const STATUS_LABEL = {
  todo: 'not started',
  building: 'building',
  gauntlet: 'in gauntlet',
  capped: 'capped',
  done: 'done',
};

/** The two first-class factual checks, in the order the chips are rendered. */
const CHECK_KEYS = ['floorPlan', 'robotSheet'];
const CHECK_STATES = ['pass', 'fail', 'pending', 'n/a'];

const STAGE_TITLE = {
  0: 'Stage 0 — scaffold',
  1: 'Stage 1 — the two first-class pieces',
  2: 'Stage 2 — the rubric pieces',
  3: 'Stage 3 — integration',
  4: 'Stage 4 — submission',
};

// ---------------------------------------------------------------- small helpers

const esc = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** A path as an href: POSIX separators even on Windows, and percent-escaped. */
const href = (fsPath) => encodeURI(fsPath.split(sep).join('/'));

/** Brussels is CEST (UTC+2) until late October, which covers the whole build. */
const CEST = 'Europe/Brussels';
const fmtDateTime = (date) =>
  new Intl.DateTimeFormat('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: CEST,
  }).format(date);
const fmtDate = (date) =>
  new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', timeZone: CEST }).format(date);

/**
 * Time left to the deadline, as a number plus the unit to print beside it.
 * Under a day the countdown switches to hours — on 30 Sep "0 days" would read as
 * "no time at all" when there are still eleven usable hours.
 */
function countdown(deadline, now) {
  const left = deadline.getTime() - now.getTime();
  if (left <= 0) {
    return { num: 'PAST', kind: 'past', unit: `the deadline was ${fmtDateTime(deadline)} CEST`, late: true };
  }
  if (left < MS_PER_DAY) {
    const hours = Math.floor(left / MS_PER_HOUR);
    return { num: String(hours), kind: 'hours', unit: `hours left — deadline ${fmtDateTime(deadline)} CEST`, late: true };
  }
  const days = Math.floor(left / MS_PER_DAY);
  return {
    num: String(days),
    kind: 'days',
    unit: `days to the deadline, ${fmtDateTime(deadline)} CEST`,
    late: days <= 2,
  };
}

// ---------------------------------------------------------------- input loading

function loadJson(file) {
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (err) {
    throw new Error(`cannot read ${relative(REPO_ROOT, file)}: ${err.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`${relative(REPO_ROOT, file)} is not valid JSON: ${err.message}`);
  }
}

/**
 * Normalises one ledger entry so the renderer never has to defend itself against a
 * half-filled round. A hand-edited pieces.json is the expected input, so unknown
 * values are reported (to stderr) and coerced rather than thrown at the wall.
 */
function normalisePiece(piece, index, warn) {
  const where = piece && piece.id ? `piece "${piece.id}"` : `piece #${index + 1}`;
  if (!piece || typeof piece !== 'object') throw new Error(`${where} is not an object`);
  if (!piece.id || !piece.title) throw new Error(`${where} needs both "id" and "title"`);

  const status = Object.hasOwn(STATUS_LABEL, piece.status) ? piece.status : 'todo';
  if (piece.status && status !== piece.status) {
    warn(`${where}: unknown status "${piece.status}", treated as "todo"`);
  }

  const checks = {};
  for (const key of CHECK_KEYS) {
    const raw = piece.checks?.[key] ?? 'n/a';
    if (!CHECK_STATES.includes(raw)) {
      warn(`${where}: unknown ${key} check "${raw}", treated as "n/a"`);
      checks[key] = 'n/a';
    } else {
      checks[key] = raw;
    }
  }

  const rounds = Number.isFinite(piece.rounds) ? Math.max(0, Math.trunc(piece.rounds)) : 0;

  return {
    id: String(piece.id),
    title: String(piece.title),
    stage: Number.isFinite(piece.stage) ? piece.stage : 2,
    firstClass: piece.firstClass === true,
    criterion: piece.criterion ? String(piece.criterion) : 'unassigned',
    points: Number.isFinite(piece.points) ? piece.points : 0,
    status,
    rounds,
    // First-class pieces escalate to a human instead of capping, so they carry no cap.
    roundCap: Number.isFinite(piece.roundCap) ? piece.roundCap : null,
    verdict: piece.verdict ? String(piece.verdict) : 'not yet run',
    verdictAt: piece.verdictAt ? String(piece.verdictAt) : null,
    checks,
    shots: {
      before: piece.shots?.before ? String(piece.shots.before) : null,
      after: piece.shots?.after ? String(piece.shots.after) : null,
    },
    note: piece.note ? String(piece.note) : '',
  };
}

// ---------------------------------------------------------------- screenshots

/**
 * Resolves a screenshot named in the ledger. Names are relative to
 * tools/progress/shots/; anything that would escape that directory is dropped, so a
 * stray "../../.ssh/id_rsa" in the ledger cannot end up linked from the page.
 * Returns null when the file is simply not there yet — the common case early on.
 */
function resolveShot(name, outDir, warn) {
  if (!name) return null;
  const abs = resolve(SHOTS_DIR, name);
  if (abs !== SHOTS_DIR && !abs.startsWith(SHOTS_DIR + sep)) {
    warn(`screenshot "${name}" is outside tools/progress/shots/ — ignored`);
    return null;
  }
  if (!existsSync(abs) || !statSync(abs).isFile()) {
    warn(`screenshot "${name}" is listed but missing from tools/progress/shots/`);
    return null;
  }
  // Linked relative to the generated page so the file works from a clone, from a
  // static host and from file:// alike.
  return { href: href(relative(outDir, abs)), name };
}

function renderShot(shot, caption, alt) {
  if (!shot) {
    return `<span class="shot empty"><span class="ph">no ${esc(caption)} shot yet</span>` +
      `<span class="cap">${esc(caption)}</span></span>`;
  }
  return `<a class="shot" href="${shot.href}" target="_blank" rel="noopener">` +
    `<img src="${shot.href}" alt="${esc(alt)}" loading="lazy">` +
    `<span class="cap">${esc(caption)}</span></a>`;
}

// ---------------------------------------------------------------- rendering

const chip = (cls, text) => `<span class="chip ${cls}"><span class="dot"></span>${esc(text)}</span>`;

function checkChip(label, state) {
  const cls = state === 'n/a' ? 'na' : state;
  const text = state === 'n/a' ? `${label}: n/a` : `${label}: ${state}`;
  return chip(cls, text);
}

function roundsChip(piece) {
  if (piece.roundCap === null) {
    // GAUNTLET.md §3: the first-class pieces escalate rather than ship failing.
    return `<span class="chip rounds">round ${piece.rounds} · escalates, no cap</span>`;
  }
  return `<span class="chip rounds">round ${piece.rounds} / ${piece.roundCap}</span>`;
}

function renderPiece(piece, outDir, checkLabels, warn) {
  const before = resolveShot(piece.shots.before, outDir, warn);
  const after = resolveShot(piece.shots.after, outDir, warn);
  const noVerdict = !piece.verdict || piece.verdict === 'not yet run';
  const verdictTime = piece.verdictAt ? `<time>${esc(piece.verdictAt)}</time>` : '';

  return `
    <article class="piece${piece.firstClass ? ' first-class' : ''}" id="${esc(piece.id)}">
      <h3>${esc(piece.title)}${piece.firstClass ? ' <span class="rubric">· first-class</span>' : ''}</h3>
      <div class="rubric">${esc(piece.criterion)}${piece.points ? ` · <span class="pts">${piece.points} pts</span>` : ''}</div>
      <div class="row">
        ${chip('status-' + piece.status, STATUS_LABEL[piece.status])}
        ${roundsChip(piece)}
      </div>
      <div class="verdict${noVerdict ? ' none' : ''}">${esc(piece.verdict)}${verdictTime}</div>
      <div class="row">
        ${CHECK_KEYS.map((k) => checkChip(checkLabels[k], piece.checks[k])).join('\n        ')}
      </div>
      ${piece.note ? `<p class="note">${esc(piece.note)}</p>` : ''}
      <div class="shots">
        ${renderShot(before, 'before', `${piece.title} — before`)}
        ${renderShot(after, 'after', `${piece.title} — after`)}
      </div>
    </article>`;
}

function renderSections(pieces, outDir, checkLabels, warn) {
  const stages = [...new Set(pieces.map((p) => p.stage))].sort((a, b) => a - b);
  return stages
    .map((stage) => {
      const inStage = pieces.filter((p) => p.stage === stage);
      const title = STAGE_TITLE[stage] ?? `Stage ${stage}`;
      const cards = inStage.map((p) => renderPiece(p, outDir, checkLabels, warn)).join('\n');
      return `  <h2>${esc(title)}</h2>\n  <div class="grid">${cards}\n  </div>`;
    })
    .join('\n\n');
}

function renderSummary(pieces, roundFreeze, now) {
  const counts = Object.fromEntries(Object.keys(STATUS_LABEL).map((k) => [k, 0]));
  for (const p of pieces) counts[p.status] += 1;

  const rounds = pieces.reduce((sum, p) => sum + p.rounds, 0);
  const firstClass = pieces.filter((p) => p.firstClass);
  const firstClassPassing = firstClass.filter((p) =>
    CHECK_KEYS.some((k) => p.checks[k] === 'pass') && !CHECK_KEYS.some((k) => p.checks[k] === 'fail'),
  ).length;

  // Rubric points are per criterion, not per piece: three pieces share the same 40
  // originality points, so summing piece.points would invent a 180-point rubric.
  // Pieces therefore spell their criterion with the exact same string when they
  // feed the same rubric row, and each row is counted once.
  const criteria = new Map();
  for (const p of pieces) {
    if (p.points > 0) criteria.set(p.criterion, Math.max(criteria.get(p.criterion) ?? 0, p.points));
  }
  const coveredPoints = [...criteria.values()].reduce((a, b) => a + b, 0);

  const stats = [
    `<span class="stat"><b>${pieces.length}</b> pieces</span>`,
    `<span class="stat"><b>${counts.done}</b> done</span>`,
    `<span class="stat"><b>${counts.building + counts.gauntlet}</b> in flight</span>`,
    `<span class="stat"><b>${counts.todo}</b> not started</span>`,
    counts.capped ? `<span class="stat"><b>${counts.capped}</b> capped</span>` : '',
    `<span class="stat"><b>${rounds}</b> critic rounds run</span>`,
    `<span class="stat">first-class checks <b>${firstClassPassing}/${firstClass.length}</b> passing</span>`,
    `<span class="stat">rubric points in play <b>${coveredPoints}</b>/100</span>`,
  ];
  if (roundFreeze) {
    const frozen = roundFreeze.getTime() <= now.getTime();
    stats.push(
      `<span class="stat">round freeze <b>${esc(fmtDate(roundFreeze))}</b>${frozen ? ' — passed' : ''}</span>`,
    );
  }
  return stats.filter(Boolean).join('\n    ');
}

/** Substitutes {{TOKEN}} in the template; an unknown token is a bug, not a blank. */
function fill(template, vars) {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (match, token) => {
    if (!Object.hasOwn(vars, token)) throw new Error(`template uses unknown token ${match}`);
    return vars[token];
  });
}

// ---------------------------------------------------------------- main

function parseArgs(argv) {
  const opts = { out: DEFAULT_OUT, quiet: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--quiet' || arg === '-q') opts.quiet = true;
    else if (arg === '--out' || arg === '-o') {
      const value = argv[i + 1];
      if (!value) throw new Error('--out needs a file path');
      opts.out = resolve(REPO_ROOT, value);
      i += 1;
    } else if (arg === '--help' || arg === '-h') opts.help = true;
    else throw new Error(`unknown argument "${arg}"`);
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(
      'usage: node tools/progress/build-progress.mjs [--out <file>] [--quiet]\n' +
      '  Renders tools/progress/pieces.json into a self-contained progress page\n' +
      `  (default: ${relative(REPO_ROOT, DEFAULT_OUT)}).\n`,
    );
    return;
  }

  const warnings = [];
  const warn = (message) => warnings.push(message);

  const ledger = loadJson(PIECES_FILE);
  if (!Array.isArray(ledger.pieces)) throw new Error('pieces.json needs a "pieces" array');
  const pieces = ledger.pieces.map((p, i) => normalisePiece(p, i, warn));

  const checkLabels = {
    floorPlan: ledger.checkLabels?.floorPlan ?? 'Floor-plan overlay',
    robotSheet: ledger.checkLabels?.robotSheet ?? 'Model-sheet match',
  };

  const deadline = new Date(ledger.deadline ?? '2026-09-30T23:59:00+02:00');
  if (Number.isNaN(deadline.getTime())) throw new Error(`pieces.json has an unreadable deadline: ${ledger.deadline}`);
  const roundFreeze = ledger.roundFreeze ? new Date(ledger.roundFreeze) : null;
  const now = new Date();
  const clock = countdown(deadline, now);

  const outDir = dirname(opts.out);
  mkdirSync(outDir, { recursive: true });

  const template = readFileSync(TEMPLATE_FILE, 'utf8');
  const page = fill(template, {
    PROJECT_SUB: esc(
      `${ledger.project ?? 'After Dark'} — every piece built, then torn apart by a critic on fresh context (GAUNTLET.md).`,
    ),
    CLOCK_CLASS: clock.late ? 'late' : '',
    DAYS_NUM: esc(clock.num),
    DAYS_UNIT: esc(clock.unit),
    SUMMARY: renderSummary(pieces, roundFreeze, now),
    SECTIONS: renderSections(pieces, outDir, checkLabels, warn),
    FOOTER: `Generated ${esc(fmtDateTime(now))} CEST by <code>tools/progress/build-progress.mjs</code> ` +
      `from <code>tools/progress/pieces.json</code>. Screenshots live in <code>tools/progress/shots/</code>; ` +
      `the page links them relatively, so keep it inside the repository.`,
  });

  writeFileSync(opts.out, page);

  if (!opts.quiet) {
    for (const message of warnings) process.stderr.write(`progress: ${message}\n`);
    process.stdout.write(
      `progress: wrote ${relative(REPO_ROOT, opts.out)} — ${pieces.length} pieces, ` +
      `${clock.kind === 'past' ? 'past the deadline' : `${clock.num} ${clock.kind} to the deadline`}\n`,
    );
  }
}

try {
  main();
} catch (err) {
  process.stderr.write(`progress: ${err.message}\n`);
  process.exitCode = 1;
}
