# Stage demo mode

For a 4-minute talk: **PageDown** (what a presenter's clicker sends) ends the running chapter and starts the next
one already mid-action, with the earlier chapters' jobs done. It is on by default in this build; `?nodemo=1` turns
it off. PageDown works whatever is on screen (briefing card, run sheet), and a staged chapter does not open its
briefing sheet over the scene.

| Press in | You see | You land in |
|---|---|---|
| Chapter 1 | the chapter's own stair-exit walk | Chapter 2 — everything done but the roller door: Biggy on the run-up, Voxxy right behind him (E, then push) |
| Chapter 2 | the chapter's own let-in walk | Chapter 3 — ladle in, Voxxy and Droid at the soup queue, Biggy at the east end of the hall |
| Chapter 3 | Stephan opens the gate, the main staircase | Chapter 4 — all done but the last banner letter: Droid holds the orange X, a short step from its gap (E), Voxxy and Biggy already on the stage |
| Chapter 4 | nothing: it plays out | the opening video, the curtain call |

The opening and chapter 1 play as usual (any key, PageDown included, skips the opening).

How it works: `GameOptions.demo` (set in `src/main3d.ts`) lets the game's key handler take PageDown and call
`demoNext()` in `src/sim/game.ts`. A chapter opts in with two optional hooks on `ChapterRuntime`: `demoExit()`
leaves through the chapter's own exit cutscene (as if every job were done, whatever state it is in), and
`demoStage()` puts the next chapter in its mid-action state once its setup has run. Without `demo: true` the sim is
unchanged. Tests: `tests/demo-ch1.test.ts` … `demo-ch4.test.ts`.
