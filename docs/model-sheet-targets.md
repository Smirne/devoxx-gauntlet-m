# Reference-sheet measurements — authoritative table (v2)

Measured **from the model sheets only**:
`robots/voxxy-robot.png` (2752x1536), `robots/droid-robot.png` (1376x768),
`robots/biggy-robot.png` (2752x1536). No game code, no renders, no earlier
round's numbers were read while producing this.

Everything below is a **ratio**, with the value at the midpoint of a parameter
sweep and the full range across that sweep. A ratio whose range is wide is
marked UNUSABLE rather than quoted as a number.

---

## 1. How to re-run this

The scripts live in `tools/sheet-measure/`, alongside the annotated crops
(`annot-*.png`) that show what each ratio actually measured. Run them from the
repository root — `python3 tools/sheet-measure/<script>` — with PIL + numpy
only (no scipy). Intermediate masks and fields are written next to the script
and are not checked in; re-running regenerates them.

Every number below was produced by these scripts from `robots/*.png` and
nothing else. If a future round wants to tune against a sheet ratio, it takes
it from here or re-derives it with these scripts. It does **not** take it from
a previous round's report — that is precisely the failure this table exists to
end.

| file | what it does |
|---|---|
| `seglib.py` | shared library: sheet loading, `figure_mask` (silhouette), 4-connected `components`, `blob_mask`, row-span helpers |
| `voxlib.py` | Voxxy-specific: `fill_holes`, `erode`, `visor()` (dark blob in the head), `eyes()` (glow blobs on the orangeness field) |
| `01_panels.py` | finds the panel-separator gaps in each sheet (confirms the grids: Voxxy 5x2, Droid 5x2, Biggy 3x3) |
| `02_crops.py` | writes every panel as `panel-<robot>-r<row>c<col>.png` |
| `03_find_panels.py` | connected-component pass at 1/4 scale -> bbox of each figure on each sheet (`panels.json`) |
| `04_voxxy_figure.py` | Voxxy silhouette + head/body split, silhouette-threshold sweep |
| `05_voxxy_head.py` | Voxxy visor blob; first (rejected) attempt at eyes on luminance — kept because it documents why luminance fails |
| `06_voxxy_eyes.py` | **Voxxy eyes**, on orangeness inside the hole-filled, eroded visor blob; level sweep f=0.10..0.90 |
| `07_voxxy_glow.py` | fine low-level sweep f=0.01..0.95 — the glow-falloff characterisation and the "can 43% be reached?" test |
| `08_voxxy_panels.py` | the same eye/visor ratio in every Voxxy panel that shows a lit visor |
| `09_voxxy_parts.py` | Voxxy ear domes, head oval, torso vs arm span |
| `10_voxxy_visor.py` | Voxxy visor size vs head, visor-threshold sweep |
| `11_biggy_figure.py` | Biggy front silhouette, threshold sweep |
| `12_biggy_parts.py` | Biggy dome/belly colour split, lit-eye search |
| `13_biggy_metrics.py` | Biggy full ratio table, dual sweep (silhouette D x orangeness ob), all belly denominators |
| `14_biggy_stance_eyes.py` | Biggy foot stance; the two dark dome bezels |
| `15_droid.py` | Droid proportions (head/torso/legs), shoulder span, eyes |
| `16_droid_disc.py` | Droid shoulder disc, measured in the profile panel and scaled to the front panel |
| `17_annotate.py` | writes `annot-*.png` — the annotated crops showing the two quantities behind each ratio |
| `18_biggy_panels.py` | the belly/dome/total ratios in every Biggy panel (the cross-panel test) |

Artefacts a human can inspect: `crop-*.png` (the exact ROI measured),
`mask-*.png` (the segmentation at named thresholds), `field-voxxy-eye-orangeness.png`
(the scalar field the eyes were measured on), `annot-*.png` (labelled bars),
`*.json` (raw per-threshold records).

### Segmentation method (all robots)

**Silhouette.** For a panel ROI, the row-local background is the 90th percentile
luminance of that row inside the ROI (this cancels the sheets' panel vignette:
background is ~235-247 on the Voxxy sheet, ~244-251 on Droid, ~254-255 on
Biggy, so no single absolute threshold works across sheets). A pixel is figure
when `rowbg - lum > D` **or** `max(RGB)-min(RGB) > 18` (the chroma term catches
Voxxy's orange body and Biggy's orange belly, which are lighter than a pure
luminance cut would allow). Rows whose flagged x-span covers >92% of the ROI
width are dropped — those are the sheets' horizontal floor bands, never the
robot. The largest 4-connected component is the figure. **D is the swept
parameter.**

The silhouette edges on all three sheets are hard (255 -> ~70 in 2 px), so the
figure bboxes are nearly threshold-free; the *only* thing D changes materially
is how much soft contact shadow gets swallowed, which is why the plausible D
range differs per sheet (Voxxy/Droid 14-46, Biggy 38-90 — Biggy's drop shadow
is a large soft ellipse and needs the higher floor).

**Voxxy eyes.** Measured on **orangeness** `G = R - B`, not luminance: the
visor carries a broad neutral-grey specular band that is as bright as the eyes
and swamps any luminance threshold. The search is confined to the visor blob
(largest `lum < Tv` component in the head), hole-filled (the eye cores are
bright and would otherwise be holes) and eroded 8 px (to strip the visor's
orange rim). Level `T = f * percentile(G, 99.9)`; **f is the swept parameter.**

**Biggy dome vs belly.** Colour split on the same `R-B`: belly warm, armour
cool blue-grey. `ob` (the orangeness cut) is the second swept parameter; the
Biggy table sweeps D x ob jointly (15 combinations).

---

## 2. Panel bboxes used

| robot | panel | bbox in source PNG | figure bbox in source PNG | figure w x h (px) |
|---|---|---|---|---|
| Voxxy | r0c0, front elevation | `(0, 0, 550, 768)` | `(102, 113, 521, 757)` @D=24 | 419 x 644 |
| Biggy | r1c0, labelled **FRONT VIEW** | `(0, 512, 917, 1024)`; ROI tightened to `(150, 558, 780, 1012)` | `(229, 585, 606, 995)` @D=60, body only (antenna excluded) | 377 x 410 |
| Droid | r1c1, front elevation | `(275, 384, 550, 768)`; ROI `(300, 400, 530, 768)` | `(328, 416, 505, 755)` @D=24 | 177 x 339 |
| Droid | r1c0, left profile (shoulder disc only) | `(0, 384, 275, 768)`; ROI `(40, 410, 250, 768)` | `(103, 418, 188, 754)` | 85 x 336 |

Notes on panel choice:
* Voxxy r0c0 is the only straight-on front; r0c1/r1c3 are 3/4, r1c4 is a tilted
  hero close-up. Droid r0c0 is also a front view but its feet are clipped by
  the panel edge, so r1c1 (feet complete, symmetric stance) is used.
* The Biggy sheet has **two** panels labelled FRONT VIEW (r1c0 and r2c1). r1c0
  is the squarer, more orthographic one and is the reference here; r2c1 is
  measured in `18_biggy_panels.py` as a cross-check (it agrees to 1.3%).

---

## 3. Voxxy

Denominators: `total_h` = 644, `total_w` = 419 (arm span; on this figure the
arms are the widest thing, not the head), `head_w` = 395 (includes the white
side pods), `head_h` = 267 (ear tips to neck), `oval_h` = 245 (top of the head
shell to neck, ears excluded), `visor` = 318 x 177.
Sweeps: silhouette D = 14,18,24,30,38,46; visor Tv = 65..115; eye level
f = 0.20..0.60 (core range) — the wider f = 0.10..0.90 range is quoted where it
changes the verdict.

### 3a. Silhouette and head — annot-voxxy-figure.png

| quantity | midpoint | range across sweep | usable? | notes |
|---|---|---|---|---|
| head_w / total_w | **0.934** | 0.892 – 0.945 | yes | total_w is the arm span; see 3e for why that matters |
| head_h (incl. ears) / total_h | **0.415** | 0.412 – 0.417 | yes | rock solid |
| oval_h (ears excluded) / total_h | **0.380** | 0.378 – 0.382 | yes | |
| head_w / head_h | **1.48** | 1.40 – 1.48 | yes | the head is a wide oval |
| body_h (neck to sole) / total_h | **0.585** | 0.584 – 0.588 | yes | |
| total_w / total_h | **0.652** | 0.650 – 0.668 | yes | |

### 3b. Visor — annot-voxxy-visor-eyes.png

| quantity | midpoint | range across sweep | usable? | notes |
|---|---|---|---|---|
| visor_w / head_w | **0.803** | 0.734 – 0.808 | yes | 0.734 only at Tv=65, where the shaded visor edges are lost; plateau 0.78-0.81 |
| visor_h / head_h | **0.655** | 0.655 – 0.663 | yes | above Tv=105 the blob leaks into the neck; that region excluded |
| visor_h / oval_h | **0.714** | 0.714 – 0.722 | yes | |
| visor_w / visor_h | **1.80** | 1.77 – 1.82 | yes | |

### 3c. Eyes — annot-voxxy-visor-eyes.png, field-voxxy-eye-orangeness.png

**The eyes are a soft glow, not a shape.** There is no hard edge anywhere:

* half-peak (f=0.50) extent **44 x 32 px**
* 10%-of-peak extent 77 x 54 px; 90%-of-peak extent 28 x 17 px
* the 10%->90% transition takes **24.5 px per side horizontally = 0.56 x FWHM**
  (vertically 18.5 px = 0.58 x FWHM)

For comparison, the figure's own silhouette edge transitions in 2 px. So the
falloff skirt is roughly **half the core width again on each side**, and a
hard-edged rectangle of the same measured extent will not read the same. The
core is a rounded horizontal lozenge sitting on a visible dotted LED matrix.

| quantity | midpoint (f=0.40) | range over f 0.20–0.60 | range over f 0.10–0.90 | usable? |
|---|---|---|---|---|
| eye_w / visor_w | **0.159** | 0.123 – 0.223 | 0.057 – 0.270 | with care — quote the level |
| eye_h / visor_h | **0.201** | 0.158 – 0.243 | 0.090 – 0.305 | with care — quote the level |
| eye aspect (w/h) | **1.44** | 1.38 – 1.65 | 1.13 – 1.65 | yes |
| eye area / visor area | 0.038 | 0.022 – 0.057 | 0.004 – 0.081 | **UNUSABLE** |
| eye-to-eye **centre distance** / visor_w | **0.417** | 0.406 – 0.426 | 0.398 – 0.426 | **yes — use this** |
| \|eye centre dx\| from visor centre / visor_w | **0.207** | 0.191 – 0.225 | 0.186 – 0.226 | yes |
| eye centre dy from visor top / visor_h | **0.498** | 0.491 – 0.503 | 0.488 – 0.504 | yes — eyes are vertically centred |
| bbox **gap** between eyes / visor_w | 0.236 | 0.179 – 0.299 | 0.123 – 0.346 | **UNUSABLE** |
| gap / one eye's width | 1.39 | 0.84 – 2.41 | 0.48 – 4.78 | **UNUSABLE** |

### 3d. Ear domes — annot-voxxy-ears.png

Measured on the rows above the point where each ear run merges into the head
oval (ear diameter = the run's width at the merge row).

| quantity | midpoint | range | usable? | notes |
|---|---|---|---|---|
| ear diameter / head_w | **0.185** | 0.184 – 0.194 | yes | 72-74 px vs head 395 |
| ear centre spacing / head_w | **0.593** | 0.591 – 0.626 | yes | 234 px |
| ear spacing / ear diameter | **3.21** | 3.18 – 3.22 | yes | |
| ear height visible above the oval / head_h | **0.131** | 0.131 (flat) | yes | the ears are 35 px of the head's 267 |

### 3e. Body

The brief asks for "max body width as a fraction of head width". On this sheet
that is ambiguous in exactly the way Biggy's belly is, so both are given:

| quantity | midpoint | range | usable? | notes |
|---|---|---|---|---|
| **torso** width / head_w | **0.537** | 0.537 – 0.568 | yes | central run only, arms excluded (212 px) |
| **arm span** / head_w | **1.058** | 1.058 – 1.121 | yes | outer edge of one arm to the other (418 px) |
| torso width / total_w | **0.507** | 0.490 – 0.507 | yes | |

If a check says "body width" without saying which, it is ambiguous by a factor
of **1.97**. State the denominator.

---

## 4. Biggy — annot-biggy-figure.png

Denominators: `total_w` = 377 (widest row, y=880 in source — the forearms, not
the belly), `total_h` = 410 (body only; the antenna adds ~20 px and is a 2-px
wire, excluded), `dome_w` = 249, `dome_h` = 85, `belly_w` = 298.
Sweeps: D = 38,46,60,75,90 x ob = 15,25,35,45,55 (15 combinations).

| quantity | midpoint | range across sweep | usable? | notes |
|---|---|---|---|---|
| **belly_w / total_w** | **0.788** | 0.778 – 0.795 | **yes** | |
| **belly_w / dome_w** | **1.193** | 1.181 – 1.201 | **yes** | |
| belly_w / the row span at the belly's own widest row | 0.884 | 0.872 – 0.895 | context only | *not* the same as total_w — 12% apart |
| belly_h / total_h | 0.461 | 0.421 – 0.510 | **UNUSABLE** | the belly's shaded underside crosses the orangeness cut |
| dome_w / total_w | **0.660** | 0.659 – 0.662 | yes | |
| dome_h / total_h | **0.206** | 0.203 – 0.208 | yes | dome = armour above the first orange row |
| dome_w / dome_h | **2.93** | 2.93 – 2.96 | yes | a shallow wide helmet, not a hemisphere |
| total_w / total_h | **0.920** | 0.915 – 0.922 | yes | near-square |
| foot stance (outer sole to outer sole) / total_w | **0.503** | 0.500 – 0.521 | yes | 187-196 px |
| stance / belly_w | **0.638** | 0.621 – 0.669 | yes | |

### 4a. There are no lit eyes on Biggy's front elevation

A search for bright + saturated pixels anywhere inside the figure
(`12_biggy_parts.py`, `mask-biggy-brightsat.png`) returns only belly highlights
and the white "ii" decal. **Biggy has no glowing eyes and no lit visor slot on
the front view.** The two features that read as eyes are **dark metal lens
bezels** on the upper dome.

| quantity | midpoint | range | usable? | notes |
|---|---|---|---|---|
| bezel diameter (width) / dome_w | **0.106** | 0.104 – 0.108 | yes | over T = 85..115; 26-27 px |
| bezel centre spacing / dome_w | **0.373** | 0.350 – 0.377 | yes | over T = 85..115; breaks above T=115 when the bezel merges into the helmet brim |
| bezel height (px) | 18 – 25 | — | no | the bezel is a ring seen at an angle, lower half in shadow |
| "visor slot" height / dome_h | 0.12 | 0.035 – 0.235 | **UNUSABLE** | 6.7x swing |
| "visor slot" width / dome_w | 0.93 | 0.888 – 0.988 | weak | |

What exists at the "slot" position is a dark horizontal seam/shadow gap between
the helmet dome and the belly (ROI rows 86-114). At a strict threshold it is a
3-px line; at a loose one it is a 20-px band. It is shading, not a lit slot, and
should not be given a numeric target.

---

## 5. Droid — annot-droid-figure.png, annot-droid-eyes.png, annot-droid-shoulderdisc.png

Denominators: `total_h` = 339, `total_w` = 177, `head_w` = 50, `shoulder_span`
= 164. Sweep: D = 10,14,18,24,30,38,46.
Boundaries: neck = the minimum-pixel-count row between the head lobe and the
shoulders (ROI y=71); crotch = the first row where the central run splits into
two leg runs **and stays split for 6 rows** (ROI y=204 — the persistence rule
matters, a one-off torso panel line at y=168 otherwise fakes a crotch 36 px
too high).

| quantity | midpoint | range across sweep | usable? | notes |
|---|---|---|---|---|
| head_h / total_h | **0.162** | 0.157 – 0.162 | yes | crown to neck, 55 px |
| torso_h / total_h | **0.392** | 0.391 – 0.396 | yes | neck to crotch, 133 px |
| leg_h / total_h | **0.445** | 0.445 – 0.447 | yes | crotch to sole, 151 px |
| head_w / total_w | **0.283** | 0.281 – 0.284 | yes | |
| head_w / head_h | **0.909** | 0.909 – 0.943 | yes | |
| shoulder span / total_w | **0.926** | 0.921 – 0.932 | yes | total_w is set by the hanging hands, not the shoulders |
| shoulder span / total_h | **0.484** | 0.482 – 0.485 | yes | |
| head_w / shoulder span | **0.305** | 0.305 – 0.307 | yes | |
| total_w / total_h | **0.522** | 0.521 – 0.525 | yes | |
| eye spacing (centre to centre) / head_w | **0.400** | 0.395 – 0.416 | yes | 20 px |
| eye diameter / head_w | **0.12** | 0.08 – 0.16 | with care | the eye is 4-8 px across on this sheet; pixel quantisation, not glow, drives the range |
| **shoulder disc** diameter / shoulder span | **0.31** | 0.28 – 0.33 | medium confidence | **cross-panel** — see below |

### 5a. Shoulder disc caveat

The shoulder disc is **edge-on in the front elevation and cannot be measured
there**. It is face-on in the left-profile panel r1c0, where its lit width is
50-53 px over T = 95..140. The two figures' total heights are 336 (profile) and
339 (front), so the scale factor is 1.009 and the disc converts to 50-53 px at
front-panel scale, i.e. 0.28-0.33 of the 164-px shoulder span. The disc's
*height* in that panel runs 21-47 px depending on threshold because its lower
half is in shadow — use the **width** as the diameter, never the bbox mean.

---

## 6. Explicit UNUSABLE list

1. **Voxxy: eye area / visor area.** 0.004 – 0.081 across the level sweep
   (0.022 – 0.057 even in the core range) — a 2.6x swing with no plateau.
   A soft glow has no area.
2. **Voxxy: bbox gap between the two eyes / visor width.** 0.123 – 0.346. The
   gap is the complement of two glow skirts, so it moves twice as fast as the
   eye width does. Use **centre-to-centre distance / visor width = 0.417
   (0.398 – 0.426)** instead; it is threshold-free because the glow is
   symmetric about its centre.
3. **Voxxy: gap / one eye's width.** 0.48 – 4.78 — a tenfold swing. This is the
   worst ratio on any of the three sheets. Never target it.
4. **Voxxy: eye width and height as fractions of visor width/height** are
   usable *only if the measurement level is stated with them*. Quoted bare they
   span 0.06-0.27 and 0.09-0.31. This is the exact shape of the round-3/round-4
   disagreement (see §7).
5. **Biggy: visor-slot height / dome height.** 0.035 – 0.235. There is no slot;
   there is a shading seam whose apparent thickness is entirely a threshold
   artefact.
6. **Biggy: belly height / total height.** 0.421 – 0.510.
7. **Biggy: the two "lit eye shapes" in the slot.** They do not exist. Do not
   set a target for them; if the game gives Biggy lit eyes that is a deliberate
   departure from the sheet, not a match to it, and should be recorded as such.
8. **Biggy bezel height** (18-25 px, no plateau).
9. **Any "body width" / "belly width" ratio quoted without its denominator.**
   For Voxxy the torso and the arm span differ by 1.97x; for Biggy the figure's
   max width and the row span at the belly's own widest row differ by 1.12x.

---

## 7. Where the old numbers could have come from

### 7a. Voxxy "the sheet's eye height is ~43% of visor height"

**On the front-elevation panel (r0c0) this is not reachable.** Sweeping the
glow level from f=0.95 down to f=0.01 (`07_voxxy_glow.py`):

| f | 0.90 | 0.60 | 0.40 | 0.20 | 0.10 | 0.05 | 0.03 | 0.02 |
|---|---|---|---|---|---|---|---|---|
| eye_h / visor_h | 0.093 | 0.158 | 0.201 | 0.243 | 0.302 | 0.356 | **0.401** | blobs merge |

The maximum is **0.401**, at a level only 3% above the dark LED field — i.e. in
the noise, where the two glow halos are one row away from merging into a single
blob. Below that the measurement collapses entirely. The reproducible band, at
any level where the eye reads as a discrete shape, is **0.15 – 0.30**, which is
exactly what round 4 reported (19-31%). **Round 4 was right; round 3's 43% is
not a property of the front panel.**

**One choice of panel does reproduce it.** The bottom-right panel r1c4
(`(2202,768,2752,1536)`) is a hero close-up with the head tilted forward, so
the visor is foreshortened to 114 px tall instead of 177 while the eyes are
barely foreshortened at all (`08_voxxy_panels.py`):

| panel | visor | eye_h/visor_h @f=0.10 | @f=0.05 | @f=0.03 | @f=0.02 |
|---|---|---|---|---|---|
| r0c0 front | 318 x 177 | 0.302 | 0.356 | 0.401 | (merged) |
| **r1c4 tilted close-up** | 296 x **114** | 0.338 | 0.390 | **0.425** | **0.452** |

So "~43%" is reproducible as **eye height measured on the tilted close-up panel
r1c4 at a near-noise glow threshold**. Mixing panels does it too: the front
panel's eye height at f=0.15 (48 px) over the close-up panel's visor height
(114 px) is 0.42.

**Verdict: not fabricated — a panel mix-up compounded by a threshold chosen at
the noise floor of a soft glow.** The close-up panel is the most eye-catching
one on the sheet and the easiest to reach for. It is also the *worst* one to
measure vertical ratios on, because the head is pitched forward.

### 7b. Biggy "belly ~8% too wide"

`18_biggy_panels.py` measures the same two ratios in every Biggy panel:

| panel | belly_w / total_w | belly_w / dome_w |
|---|---|---|
| r0c0 (top-left, 3/4, unlabelled) | 0.815 | **1.104** |
| **r1c0 FRONT VIEW** (the reference) | 0.788 | **1.193** |
| r1c1 BACK VIEW | 0.792 | 1.187 |
| r2c1 FRONT VIEW (second front) | 0.798 | 1.200 |
| r0c1 / r2c0 LEFT PROFILE | 0.409 / 0.367 | 0.535 / 0.540 |

**1.193 / 1.104 = 1.081 — exactly 8.1%.** Taking the belly-to-dome ratio from
the sheet's *first, unlabelled, 3/4* panel (r0c0) instead of the panel labelled
FRONT VIEW gives a target 8% apart, because in the 3/4 view the helmet is
turned and reads 279 px wide instead of 249 while the belly barely changes.

Other candidates for an 8% error do **not** fit as cleanly:
* using the row span at the belly's own widest row as the denominator instead
  of the figure's max width gives +12.2%, not +8%;
* letting the drop shadow into the silhouette gives -21%;
* the two FRONT VIEW panels differ from each other by only 1.3%.

**Verdict: the belly complaint is a denominator/panel mix-up, and a specific,
identifiable one — belly/dome measured on panel r0c0 rather than r1c0.** The
belly itself is one of the most stable numbers on any of the three sheets
(0.778-0.795 of total width across a 15-combination sweep).

---

## 8. Recommended tolerance bands

Rule used: tolerance = max(+/-0.02 absolute, ~1.5x the half-range of the sweep).
The 1.5x factor means a check cannot fail on a reasonable difference of
segmentation opinion; the 0.02 floor means a check cannot pass on a ratio that
is visibly wrong at a glance.

| target | value | tolerance | why that width |
|---|---|---|---|
| Voxxy head_h / total_h | 0.415 | +/-0.02 | sweep half-range is 0.003; the floor dominates, and 0.02 is below the point where the head silhouette reads as wrong |
| Voxxy oval_h / total_h | 0.380 | +/-0.02 | same; ear inclusion is the only real judgement call and it is already separated out |
| Voxxy head_w / total_w | 0.934 | +/-0.04 | half-range 0.027 (the white side pods fade out at high D); 1.5x that |
| Voxxy head_w / head_h | 1.48 | +/-0.08 | half-range 0.04, same pod effect |
| Voxxy visor_w / head_w | 0.80 | +/-0.04 | half-range 0.037 including the Tv=65 outlier |
| Voxxy visor_h / head_h | 0.66 | +/-0.02 | half-range 0.004; floor dominates |
| Voxxy visor_w / visor_h | 1.80 | +/-0.05 | half-range 0.025 |
| Voxxy eye centre distance / visor_w | 0.417 | +/-0.02 | half-range 0.014; this is the one eye number that deserves a tight band |
| Voxxy eye centre dy / visor_h | 0.498 | +/-0.02 | half-range 0.008 — eyes centred on the visor's vertical midline |
| Voxxy eye_h / visor_h **at half-peak** | 0.181 | +/-0.06 | half-range over the whole core band is 0.043; the band must be wide because the quantity is level-dependent by nature. **State the level with the number or do not use it.** |
| Voxxy eye_w / visor_w **at half-peak** | 0.138 | +/-0.05 | as above |
| Voxxy eye aspect w/h | 1.44 | +/-0.20 | half-range 0.14; the glow is rounder at high levels, wider at low ones |
| Voxxy ear diameter / head_w | 0.185 | +/-0.02 | half-range 0.005; floor dominates |
| Voxxy ear spacing / head_w | 0.593 | +/-0.03 | half-range 0.018 |
| Voxxy torso_w / head_w | 0.537 | +/-0.03 | half-range 0.016 |
| Voxxy arm span / head_w | 1.06 | +/-0.05 | half-range 0.032 |
| Voxxy body_h / total_h | 0.585 | +/-0.02 | half-range 0.002 |
| Biggy belly_w / total_w | 0.788 | +/-0.02 | half-range 0.009 across a 15-combination sweep; this number is solid enough to fail a build on |
| Biggy belly_w / dome_w | 1.193 | +/-0.03 | half-range 0.010, widened because this is the ratio that previously went wrong by panel choice |
| Biggy dome_w / total_w | 0.660 | +/-0.02 | half-range 0.002 |
| Biggy dome_h / total_h | 0.206 | +/-0.02 | half-range 0.002; the floor keeps a 2-px dome-edge disagreement from failing |
| Biggy dome_w / dome_h | 2.93 | +/-0.15 | half-range 0.015, widened to 5% because dome_h is only 85 px and a 2-px boundary shift is 2.4% |
| Biggy total_w / total_h | 0.920 | +/-0.02 | half-range 0.004 |
| Biggy stance / total_w | 0.503 | +/-0.03 | half-range 0.011, widened because the sole meets the contact shadow |
| Biggy bezel diameter / dome_w | 0.106 | +/-0.02 | half-range 0.002; the floor dominates at this small size |
| Biggy bezel spacing / dome_w | 0.373 | +/-0.03 | half-range 0.014 |
| Droid head_h / total_h | 0.162 | +/-0.02 | half-range 0.003 |
| Droid torso_h / total_h | 0.392 | +/-0.02 | half-range 0.003 |
| Droid leg_h / total_h | 0.445 | +/-0.02 | half-range 0.001; the crotch definition is the only judgement call and it is documented |
| Droid head_w / total_w | 0.283 | +/-0.02 | half-range 0.002 |
| Droid shoulder span / total_w | 0.926 | +/-0.02 | half-range 0.006 |
| Droid head_w / shoulder span | 0.305 | +/-0.02 | half-range 0.001 |
| Droid eye spacing / head_w | 0.400 | +/-0.03 | half-range 0.010, widened because the eyes are 6 px wide on this sheet |
| Droid eye diameter / head_w | 0.12 | +/-0.04 | half-range 0.04 — at 4-8 px, one pixel is 2% of head width |
| Droid shoulder disc / shoulder span | 0.31 | +/-0.05 | half-range 0.025, and it is a cross-panel figure; do not tighten it without re-measuring |

### Not a ratio, but the most important Voxxy finding

The eyes must be authored as a **soft radial glow**, not a lit rectangle:
half-peak extent 44 x 32 px on a 318 x 177 visor, falling to 10% of peak at
77 x 54 and to 90% at 28 x 17. Any check that compares a hard-edged game shape
against a thresholded sheet glow will keep producing a different answer every
time the threshold moves, which is what has been happening.
