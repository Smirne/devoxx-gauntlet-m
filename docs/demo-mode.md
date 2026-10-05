# Stage demo mode

For a 4-minute talk: **PageDown** (what a presenter's clicker sends) ends the running chapter and starts the next
one already mid-action, with the earlier chapters' jobs done. It is on by default in this build; `?nodemo=1` turns
it off. PageDown works whatever is on screen (briefing card, run sheet), and a staged chapter does not open its
briefing sheet over the scene.

| Press in | You see | You land in |
|---|---|---|
| Chapter 1 | a fade, then chapter 2's own let-in: the robots open the front doors and Stephan comes in (the roller push is skipped) | Chapter 3 — ladle in; Biggy (the robot you drive) waits outside the soup doorway behind the queue, Voxxy beside it to ask the queue to make way (E), Droid away across the hall |
| Chapter 3 | a fade, no cutscene | Chapter 4, straight in — all done but the last banner letter: Droid stands at the orange X in the wing (E lifts it, E at its gap sets it), Voxxy and Biggy on the stage, the room nearly full |
| Chapter 4 | nothing: it plays out | the opening video, the curtain call |

The opening and chapter 1 play as usual (any key, PageDown included, skips the opening). In chapter 1, E beside the projector panel makes Droid stretch and fail ("too high, even for me") — the same in the real game; he still needs Biggy to open it.

How it works: `GameOptions.demo` (set in `src/main3d.ts`) lets the game's key handler take PageDown and call
`demoNext()` in `src/sim/game.ts`. A chapter opts in with two optional hooks on `ChapterRuntime`: `demoExit()`
leaves through the chapter's own exit cutscene (as if every job were done, whatever state it is in), and
`demoStage()` puts the next chapter in its mid-action state once its setup has run. Without `demo: true` the sim is
unchanged. Tests: `tests/demo-ch1.test.ts` … `demo-ch4.test.ts`.
