# After Dark — Devoxx Robot Games entry (project notes for the coding agent)

- Deadline 30 Sep 2026 23:59 CEST. Public repo, MIT, README runs from a clone. Scoring: 40
  originality, 20 physics realism, 15 playability, 10 all three robots, 10 sense of place, 5
  GenAI notes.
- Build methodology: `GAUNTLET.md` at the repo root. The gauntlet loop is how this game gets
  BUILT, stage by stage, not a polish pass bolted on afterward — read it before writing anything.
- The prototype `reference/poc/10-after-dark-kinepolis.html` and `docs/after-dark-full-design.md`
  are a **proof of concept, not law** — where the gameplay ideas came from, nothing more. Improve
  anything that can be improved, and new enigmas, mechanics and Devoxx beats are welcome. Two
  things are *not* free to drift: the physics constants below, which the tests assert and the
  realism score rests on, and the venue, which must follow `plans/` rather than the prototype's
  simplifications of them. When the prototype and the plans disagree, the plans win.
- Architecture: `src/sim` (2D, headless, tested) is the only source of truth; `src/render`
  (Three.js, fixed isometric/orthographic camera per room) only reads it. No game logic in render
  code, ever.
- Physics constants are frozen — see GAUNTLET.md's "Frozen physics constants" — and asserted by
  tests.
- Robots: Voxxy small/fast (orange beam), Droid tall/deliberate (green pool, climbs Biggy), Biggy
  heavy/inertial (blue flood). Every gate says *why* a robot is blocked, in that robot's voice.
  Appearance must match `robots/*.png` model sheets — non-negotiable, see GAUNTLET.md Stage 1.
- **Recognisable beats precise.** Michele's standing call when the two pull apart: *"I vote funny,
  robots must be recognizable."* A feature that makes a robot instantly *him* outranks a ratio
  measured to three decimals, and a caricatured read of the sheet is welcome where a faithful one
  would be bland. This does not license drifting off the sheet — the sheet still decides what the
  robot *is*, and `docs/model-sheet-targets.md` still decides any number we do check. It settles
  which way to lean inside that, and it is why Droid keeps the hoop shoulders (Michele likes them)
  while his face must go back to the sheet's rounded skull, because the face is what makes him
  recognisable and the shoulders are what make him fun.
- Venue: the real Devoxx plans in `plans/` (first floor rooms 3–10 + closed cinema section;
  ground-floor exhibition hall). Secondary staircases between rooms 3|4 and 10|9; main staircase
  between 6 and 7. Keep these positions exactly — non-negotiable, see GAUNTLET.md Stage 1.
- Devoxx flavour: Stephan (first name, caricature), keynote speaker "TBA" until announced, tomato
  soup, queues, "OutOfMemoryError" beer joke. Nothing that needs permission.
- Tooling: pnpm, Vite, TypeScript strict, vitest, three. No physics engine, no external 3D/audio
  asset files. Small PRs, one step each.
- After every session append to `docs/genai-notes.md` (what the agent did, what a human decided,
  what was rejected and why) — it is the 5-point GenAI section of the submission.
- Tests are the acceptance criteria: port `reference/tests/*.js` choreographies rather than
  inventing new expectations.
- `docs/DESIGN.md` ("Room Service") and `KICKOFF-PROMPT-M1.md` from the old planning folder were
  deliberately NOT brought into this repo — superseded by GAUNTLET.md. Do not go looking for them
  as a second source of truth.
