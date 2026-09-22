# Gameplay additions — decided 2026-09-22

Three calls made after gauntlet round 2, once the prototype stopped being law
(see `CLAUDE.md`). Each one says what it is, which robot physics it leans on, and what
still needs a human yes.

---

## 1. Speed scale — decided, mine to call

Michele left this one to me. **We rescale the absolute speeds to real metres per second,
after round 3 clears the two first-class gates, as its own round.**

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

## 2. The WiFi password — approved, needs designing away from two traps

Michele: yes to `DevoxxForever` appearing, but **not** as "find 13 letters scattered around the
venue", and **not** as a second helping of the light-mixing puzzle unless the dynamics are
genuinely different. Both notes are right: letter-collection is busywork, and the light mix is
already chapter 1's whole identity — repeating it makes chapter 2 read as filler.

So the beat leans on the one robot trait the game currently under-uses: **Biggy's inertia, and
bracing as a brake.**

### "The network closet" — chapter 2, the technical room

The room already exists and already holds the breakers and the network rack. Add a cabinet
sealed by a heavy industrial cam-lock wheel.

- **Mass gate.** Only Biggy can turn the wheel at all. Voxxy (mass 1) and Droid (mass 3)
  rebound off it, each saying why in their own voice.
- **The actual puzzle is stopping, not starting.** The wheel carries Biggy's momentum and his
  drag is 0.35 s⁻¹ — he coasts almost forever, which is exactly what makes him miss the index
  mark every time on his own. This is the inverse of chapter 1's puzzle: chapter 1 asks for
  three things to be true *simultaneously*, this asks for one thing to be true *at the right
  moment*.
- **Droid is the brake.** A braced robot has effectively infinite mass (`BRACED_MASS`), a
  mechanic that exists, is tested, and is currently used for almost nothing. Droid braces
  against the wheel to kill the coast. Timing that release is the skill.
- **Voxxy reads the mark.** Its cone is 0.38 rad against Biggy's 1.0 — the only beam narrow
  enough to resolve the fine index marks, so all three robots are load-bearing.

**Payoff, and why it is not a dead-end collectible.** Chapter 2 currently ends when the cable
reaches the printer. With this, power + cable + router is what makes the badge printer actually
print — the cabinet holds the router, and the password is on a label taped inside it, which is
where every conference's WiFi password really lives. The joke lands as a card rather than as an
inventory item: *DevoxxForever — and no, you cannot change it.*

Needs no new physics, no new constants, and no fourth chapter.

---

## 3. OutOfMemoryError — liked, approval held until it can be seen

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
