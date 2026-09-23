# Scale and units — **decided, 23 Sep 2026** (open question raised 16 Sep)

One scale, `PX_PER_M = 12.5`, for the geometry *and* for the speeds. Room 8 is 383 sim px = 30.6 m,
which is a real Kinepolis auditorium; Voxxy's cap is 72.5 px/s = 5.8 m/s, which is a knee-high robot
sprinting. Nothing in the project converts pixels to metres by any other number any more.

## What the question was

The prototype simulates in *map pixels* on a 1900×700 canvas. The plan is drawn at roughly 10 px/m
and the prototype scales the corridor axis ×1.25 and compresses room depth, so ≈ 12.5 px/m along the
corridor. At that scale the prototype's speeds were arcade speeds — Voxxy 290 px/s ≈ **23 m/s**,
Biggy 235 ≈ 19 m/s — and a robot with r = 17 px was 2.7 m across. Fine top-down, wrong in 3D next to
a 25 m auditorium; the organisers' own demo runs at 1.35 / 2.6 m/s.

Milestone 1 deliberately kept the prototype's numbers unchanged, because parity was the acceptance
test, and `src/sim/units.ts` grew a second scale — `HUD_PX_PER_MPS = 72.5` — whose only job was to
divide by a different number so the HUD could print "4.0 m/s" next to a robot moving at 23.

## What was decided, and why then

Michele playtested chapter 1 and filed three complaints that were all this one question coming back
as a gameplay problem (`docs/playtest-notes.md`): Voxxy too fast to control, her beam hard to aim
because she would not stop, and "droid is pushing Biggy just by coming close, with no contacts".
Asked to choose, he picked a **full rescale: speeds and radii**, and authorised unfreezing the
constants once to do it.

### Speeds — one factor

`SPEED_SCALE = 0.25`, applied to every px/s quantity in `src/sim` and nowhere else. Rates in s⁻¹
(`accel`, `drag`, `BOOST_DECAY`, the cam wheel's bearing drag) and pure ratios (masses, restitution,
`BOOST_CAP_FACTOR`) are dimensionless across a rescale and did not move, so every curve keeps its
shape and only the unit on the velocity axis changed.

| | prototype | now | m/s |
|---|---|---|---|
| Voxxy `max` | 290 | 72.5 | **5.8** |
| Droid `max` | 115 | 28.75 | **2.3** |
| Biggy `max` | 235 | 58.75 | **4.7** |
| `JAMMED_DOOR_SPEED` | 70 | 17.5 | 1.4 |
| `ROLLER_DOOR_SPEED` | 270 | 67.5 | 5.4 |

The honest factor that makes the geometry scale and the old HUD scale agree exactly is
12.5 / 72.5 = 0.1724, i.e. Voxxy at 4 m/s. It was measured against the chapters and rejected: it
costs another 45 % of traversal time (the chapter-2 cable errand 23.5 s against 16.2 s, the
four spotlights 18.2 s against 12.7 s, the roller-door shove 10.5 s against 7.4 s) for 1.8 m/s
nobody can see. 0.25 is the fast end of the 4–6 m/s window, and it is an exact quarter, so every
rescaled constant stays a clean decimal.

Lengths did **not** move, so a clock a robot has to *travel* against is a speed wearing a clock's
clothes and scales the other way, by `TRAVEL_TIME_SCALE = 4`: the soup's cooling timer, the keynote
crowd's arrival, the Regex Racing lap, the window a catering queue stands aside for.

### Radii — measured, not guessed

`DEFS.*.r` is the widest point of the rest pose about the robot's own vertical axis, measured off the
rig `src/render/robots` actually builds (`createRobot(kind)` + `measureBounds`) and rounded to the
nearest half pixel.

| | prototype | measured on the rig | now |
|---|---|---|---|
| Voxxy | 9 px = 0.72 m | 0.377 m | 4.75 px = **0.38 m** |
| Droid | 13 px = 1.04 m | 0.503 m | 6.25 px = **0.50 m** |
| Biggy | 17 px = 1.36 m | 0.722 m | 9 px = **0.72 m** |

`PUSH_REACH` is 1 px = 8 cm — a hand on him — instead of 12 px = 0.96 m. `MOUNT_REACH` is 4 px =
0.32 m, deliberately longer: climbing is a reach, shoving is not, and Droid should not have to walk
into Biggy and push him out from under himself before he can get on top of him.

Arms swing wider than the body: Biggy's outermost point over a full gait cycle is 0.768 m, Droid's
0.689, Voxxy's 0.595. Those are not the collision radius — an arm is not a body you bump into — but
Biggy's 0.72 m is set by the outer corner of his arm at rest, which is the same corner
`tests/robots.smoke.test.ts` needs past 0.674 m for his silhouette to stay 0.93 of his height. The
two agree; neither had to give.

## What it cost, and what to do if it is too slow

Traversal, measured on the real routes, before → after:

| | before | after |
|---|---|---|
| ch1 Voxxy, spawn to the cinema E alcove (243 px) | 1.1 s | 3.3 s |
| ch2 Voxxy, the cable errand rack → printer (1175 px) | 4.6 s | 16.2 s |
| ch2 Voxxy shoves Biggy into the roller door | 2.0 s | 7.4 s |
| ch3 Biggy, the pot across the exhibition hall (1200 px) | 21.9 s | 38–40 s |
| ch4 Voxxy, all four spotlights (973 px) | 3.9 s | 12.7 s |
| the whole venue end to end, 1900 px = 152 m | 6.6 s | 26.3 s |

Biggy barely changed, because he was always acceleration-limited rather than speed-limited — which
is the point of him. If playtesting says a chapter drags, the counter-measures in order are: a run
key (Shift, like the organisers' demo), chapter-sized camera and shorter walks, moving clue rooms
closer together, and only then shrinking the venue. Do **not** reach for `SPEED_SCALE` first: it is
the one number that keeps the HUD honest.
