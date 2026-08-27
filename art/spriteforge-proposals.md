# Proposed changes to the spriteforge skill

Written from building an animated character with it. Ordered by how much pain
each one removes. Everything here is currently worked around in `tools/`, which
is the argument for moving it upstream: none of it is project-specific.

## 1. Grid cutting, not just column cutting

**Today:** `cutout.py` splits a sheet into columns. A sheet holding several
animation cycles as rows cannot be cut at all.

**Proposal:** `--rows walk:4,trot:4,gallop:6`, plus auto-detection of horizontal
bands when counts are not given. Find the bands, then apply the existing column
splitter within each.

Implemented here as `tools/gridcut.py`; ~90 lines, reusing `strip_background`,
`column_occupancy` and `split_into` unchanged.

**Why it matters:** one generation can then carry a whole gait set. That is a
large cost saving and it keeps every cycle in one style pass.

## 2. Animation kinds that describe the motion, not the frames

**Today:** a kind has `frames` and a `poses` map, and the prompt builder emits a
paragraph per frame. For animation this is actively harmful.

Measured, same subject and model, only the prompt differing:

| prompt style | scale spread across frames |
| --- | --- |
| a paragraph per frame (what `poses` produces) | **32%** |
| one holistic description + invariants | **3.2%** |

A tenfold difference. Per-frame descriptions invite the model to re-imagine the
animal each time, and they encourage writing dramatic per-frame language, which
is what actually moves the size and footing around.

**Proposal:** a `cycle` kind shaped like

```json
"run": {
  "cycle": "a dog running at a steady lope directly away from the viewer;
            the frames pass through one complete stride and loop seamlessly",
  "count": 4,
  "invariants": ["overall size and distance from the viewer",
                 "height of the back above the ground",
                 "shape and position of the tail",
                 "ear shape and position", "coat colour and markings"],
  "varies": "only her legs; everything above the hips is drawn identically"
}
```

The `varies` line does a surprising amount of work. It also makes the cycle
*stiffer* than life — which is fine, because body bob and tail swing are exactly
what a rig adds well on top.

## 3. Normalisation as a first-class step

**Today:** every frame is cropped to its own bounding box, which discards the
one thing a game needs — how big the subject is. A rear view crops tight, a side
view is twice as wide for the same animal, an airborne frame is shorter.

**Proposal:** `--normalize` emitting uniform canvases plus a manifest with each
frame's scale factor and ground line.

Two things learned the hard way, both in `tools/normalize.py`:

- **Measure the torso, not the silhouette.** The widest rows of a running animal
  are wherever the legs are splayed, so a frame at full extension measures far
  "wider" than the same animal gathered — and normalising on that makes it
  swell and shrink through the cycle.
- **Register on the spine, not the feet.** The top of the body is stable while
  legs and tail move. Registering on the ground line makes an airborne frame
  yank the whole figure downward.

## 4. Consistency metrics in `check`

**Today:** `check` reports rim contamination and dead margin — both per-sprite.
Neither says anything about whether a set of frames is a usable animation.

**Proposal:** given a frame set, report scale spread and footing spread, and
flag above a threshold. Under ~6% on both is usable.

**A sheet can look fine and still swell and shrink once it plays.** The numbers
catch that; eyes do not. The complementary check is an **overlay** of all frames
— a usable cycle shows a sharp body with only the limbs blurred.

Caveat worth encoding: footing spread is *expected* to be large for a gait with
a suspension phase. The check should know whether a cycle is grounded.

## 5. Warn that resolution per frame drives consistency

Frames on a three-row sheet come out at roughly half the linear resolution of a
single-row sheet (torso ~85px versus ~190px), and consistency degrades with it —
in our test the six-frame gallop row was the one that fell apart.

Worth a line in the docs: **explore several cycles on one sheet, then regenerate
the one you are shipping on its own.**

## 6. Smaller things

- `art.py cut` derives its output stem from the common prefix of the frame
  names, so frames called `side` and `sit` silently produce `molly-body-si-*`.
  Use the full name, or warn.
- `strip_background`, `decontaminate` and `despeckle` mutate in place and return
  *counts*; `despeckle` alone returns a buffer in some paths. Easy to misuse —
  worth making uniform.
- White-on-white hides enclosed background pockets. A `--check-bg` that
  composites onto a saturated colour would catch them immediately.
