# Gameplay additions — decided 2026-09-22

Three calls made after gauntlet round 2, once the prototype stopped being law
(see `CLAUDE.md`). Each one says what it is, which robot physics it leans on, and what
still needs a human yes.

---

## 1. Speed scale — decided, mine to call — **DONE 23 Sep 2026**

Michele left this one to me, then his chapter-1 playtest made it urgent and he called it himself.
Shipped as its own round: `SPEED_SCALE = 0.25` on every px/s quantity, radii measured off the rigs,
`HUD_PX_PER_MPS` deleted. See `docs/scale-and-units.md` for the decision, the measurements and what
it cost in traversal time. The reasoning below is what it was before the work, kept as written.

The problem is not hypothetical. The sim runs at prototype pixels and the renderer converts at
`PX_PER_M = 12.5`, so Voxxy's 290 px/s is **23 m/s** and Biggy's 235 is **19 m/s** in the world
the judge actually watches. A 1.15 m robot crossing a 30 m auditorium in 1.3 s is the first
thing a realism judge notices, and realism is 20 of the 100 points. The HUD already quietly
admits it — `HUD_PX_PER_MPS` exists only to print a plausible "4.0 m/s" next to a robot moving
at five times that.

What makes this safe: every frozen constant is either a rate in s⁻¹ (`accel`, `drag`,
`BOOST_DECAY`) or a comparison against a robot's own cap (the jammed door at 70, the roller at
270, the push boost at ×1.05). Rates are unchanged by a rescale and threshold *ratios* are
preserved, so the mechanics and their tests survive. Only the absolute speeds and the cable
length move, and the tests that assert them get rewritten to assert the same ratios — never
loosened (`GAUNTLET.md` §4).

Target: Voxxy 4 m/s, Droid 1.6, Biggy 3.5, keeping `accel`/`drag`/`mass` exactly as they are —
which is what `docs/scale-and-units.md` recommended before any of this was built.

The real cost is pacing: distances stay (the venue is plan-accurate and must remain so), so
everything takes ~6× longer to walk. Counter-measures, in the order to reach for them:
the chapter-sized cameras that already exist, a Shift-to-run key, and moving clue rooms closer
together. Shrinking the venue is not on the list — it would undo first-class check #1.

**Not started until round 3's gates are green.** It destabilises pacing across all four
chapters, and a broken gate is worth more points than a plausible speedometer.

---

## 2. The WiFi password — **the wheel was cut, 23 Sep 2026; the password shipped**

Michele, 22 Sep: yes to `DevoxxForever` appearing, but **not** as "find 13 letters scattered around
the venue", and **not** as a second helping of the light-mixing puzzle. Both notes are still right,
and both still bind: letter-collection is busywork, and the light mix is already chapter 1's whole
identity.

What this section used to propose was a heavy cam-lock wheel on the router cabinet — Biggy the only
mass that could break it free, Droid braced as the only brake, Voxxy's narrow cone the only beam
that could read the index mark. It was built, and Michele killed it on 23 Sep in one line:

> **"Remove the wheel, too complicated."**

So the wheel is gone — state, constants, props and renderer — and the password itself is the beat.
The cabinet is still Biggy's, but as a heavy door rather than a puzzle lock.

### "The network closet" — chapter 2, the technical room

The badge printer needs POWER + CABLE + ROUTER. The router is in the cabinet, the cabinet is a
steel door with seized hinges that only Biggy can swing, and the terminal inside it wants the
password. Three ways to answer it, and a player needs one:

1. **Typed from memory.** It is on the chapter card, in the crew's run sheet, and it is the sort of
   password you remember. Thirteen letters, case-insensitive, Backspace fixes a slip, and a wrong
   key does not go in and does not throw away what is already typed. About four seconds.
2. **Read off the sponsor poster by Voxxy.** Her cone is 0.38 rad against Biggy's 1.0 — the only
   beam narrow enough to resolve the small print, and she has to be close enough to read it rather
   than merely to light it. Same trait the wheel leaned on for the index mark, and it is a real one.
3. **Read off the router's own label by Droid, standing on Biggy.** The tape is inside the lid, up
   at the top, which is where every conference's WiFi password really lives. `toggleMount` exists,
   is tested, and outside chapter 1's projector panel almost nothing uses it.

**What it costs.** The wheel was the one object in chapter 2 where all three robots were needed at
the same time; three alternative routes cannot be that. Biggy is on every route and route 3 needs
Droid as well, but the 10-point "all three robots" criterion is now carried by the chapter — Droid's
breakers, Voxxy's cable, Biggy's roller door — rather than by this single object. That is the known
price of "too complicated".

**Payoff.** Power + cable + router is what makes the badge printer print, and the joke lands as a
card rather than an inventory item: *DevoxxForever — and no, you cannot change it.*

Needs no new physics, no frozen constant, and no fourth chapter.

## 3. OutOfMemoryError — approved, **BUILT 23 Sep 2026**

Michele wants to play it before approving. Fair: it is a joke, and jokes either land or they do
not. Built next, after round 3, so there is something to judge.

### "Belgian beers may cause hangovers and OutOfMemoryErrors" — chapter 3

The tradition is real (Wednesday beers and fries in the exhibition hall until 20:00) and the
line is on Devoxx's own signage.

- Biggy can pick up beer crates and stack them. Each crate adds to his **mass** and eats into
  his **accel** — both already in the physics, so this costs no new model.
- Heavier Biggy is measurably harder to shift, which the push mechanic and `botsCollide` already
  express. The trade is real, not cosmetic: more crates per trip, worse handling.
- Past the stack limit he throws an **`OutOfMemoryError`** — a real-looking stack trace in the
  HUD, in his own voice — drops the lot, and the crates scatter as physical bodies he then has
  to shove out of his own way. He restarts the run.
- The optimal line is one crate under the limit. Greed is punished by physics rather than by a
  rule, which is the same trick the rest of the game runs on.

**What would make me pull it:** if the restart reads as punishment rather than comedy, it is a
bad beat regardless of how good the joke is. The test is whether a player laughs the first time
and then plays around it. That is Michele's call to make with it running in front of him.

### Built — what changed on the way in

Michele approved it in one word — *"OutOfMemory, yes build it"* — and it shipped as
`src/sim/crates.ts` plus the beer sections of `ch3-breakfast.ts`.

- **The framing moved with the story.** The paragraph above says lunch and Wednesday-evening
  beers; chapter 3 is breakfast now. The crates are a **delivery**: they arrive at eight in the
  morning, for tonight, which is when a brewery actually turns up and is funnier at breakfast than
  at lunch — nobody is drinking, the pallet is simply standing in the way of three thousand
  arriving people, and the shrink-wrap still carries Devoxx's own line about hangovers and
  OutOfMemoryErrors. It is the same joke with a better reason to be there, and it fits beside the
  tomato soup Michele already ruled stays.
- **It is Stephan's third condition**, not a side quest. Soup, speaker, and that pallet out of his
  aisle. A beat nobody finds cannot be judged, and the objective and progress lines carry it.
- **Six crates, four fit, the fifth throws.** `CRATE_STACK_LIMIT = 5` and `CRATE_DELIVERY = 6`, so
  four-then-two is the honest line and five-then-one is the one that does not exist.
- **The numbers:** each crate is +1.5 mass and x0.82 acceleration, compounding. Four crates take
  Biggy from 7 to 13 and from 0.6 s^-1 to 0.271, which is a quarter longer over a 16 m haul from a
  standing start (measured: 5.0 s empty, 6.4 s loaded). Top speed, drag and radius are untouched.
- **`DEFS` never moves.** The load is a modifier on the mutable `Bot` copy, recomputed from the
  frozen table every time, and `game.ts` restores every robot's frozen identity at the head of
  `startChapter`, so no load can leak into the next chapter or survive `R`.
