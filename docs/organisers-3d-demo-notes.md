# The organisers' interactive 3D robots (game.devoxx.be/references/?robot=voxxy|droid|biggy) — what they are and what to take from them

Checked 16 Sep 2026 in the browser (page title "Meet Biggy — The Robot Games at Devoxx Belgium").

## What it is
- A Three.js demo (bundle `assets/index-*.js`, ~660 KB): one robot on a 28.8 m "motion field", WASD/arrows to walk, Shift to run, Space to wave, HUD with velocity in m/s and X/Z position, follow camera, sound.
- **No downloadable model files.** There are no .glb/.gltf/.fbx anywhere: the three robots are built *procedurally in code* from Three.js primitives (Box, Cylinder, Sphere, Lathe, Extrude, Torus) with SkinnedMesh + Bones, MeshStandard/Physical materials, and procedurally animated (legs and arms driven by damped rotations, foot planting with step durations, bob, lean, head look-at). Post-processing: GTAO, bloom, FXAA/SMAA, auto-degrade on slow machines.
- Their own words on the page: "A demo build — one possible look and feel for Biggy, here as a reference only." and "The robot behind this panel is one possible look and feel … a reference to work from, not a kit to ship. Build your own from the model sheets." → **do not copy their code**; use the demo as a look-and-feel reference, and build our robots from the model sheets. The organisers themselves went procedural, which validates a primitives-based robot pipeline (no GLB toolchain needed) for a two-week build.

## Their motion model (reference numbers for the realism score)
One shared controller for all three robots (the personality is in the meshes and the gait, not in the physics — that is exactly the gap our game fills):
- walk speed 1.35 m/s, run speed 2.6 m/s (HUD bar full at 2.6)
- velocity lerps toward the desired velocity with `1 − exp(−k·dt)`, k = 8 s⁻¹ when accelerating, 11 s⁻¹ when stopping; dt clamped to 1/30 s — the same exponential-approach model as our prototype (ours: accel 12 / drag 9 for Voxxy, 4 / 7 Droid, 0.6 / 0.35 Biggy).
- heading turns toward the velocity direction at 11 s⁻¹; gait frequency 2 + 0.55·speed steps/s; step duration 0.16 s walking, 0.11 s running; foot offset ±0.16 m; bob ≈ 1.6 cm; lean 0.027 rad per m/s.
- HUD states: IDLE (< 0.05 m/s), WALKING, RUNNING (> 2 m/s), SAYING HELLO.

## What to take into the build
1. Robots: procedural primitives from the model sheets, skinned or hierarchically transformed, procedural gait (foot planting is what sells the "planted feet" the brief asks for). Voxxy quick steps, Droid long slow strides, Biggy short stomps with a body lean into acceleration and a skid when stopping.
2. Units: the demo lives in metres. Our prototype lives in map pixels (roughly 12.5 px/m from the plan: room 8 ≈ 300 plan px ≈ 30 m). See `scale-and-units.md` before the 3D port — this is the one design decision still open.
3. Feel references for the realism judge: their 1.35 / 2.6 m/s and 8 / 11 s⁻¹ are what "normal" looks like to the organisers; our three robots should sit around it (Droid below, Voxxy above, Biggy with the same top speed but a fraction of the acceleration).
