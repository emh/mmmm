# spriteforge: findings from building Mighty Miss Molly Mae

Written while building an animated character game with the skill. Everything
here was hit in practice, and everything proposed is currently worked around by
a tool in `tools/` — which is the argument for moving it upstream, since none of
it is specific to this project.

Ordered by how much pain each one removes.

---

## 1. The biggest lever is prompt shape, not prompt detail

**The `poses` mechanism is actively harmful for animation.** A kind declares
`frames` plus a `poses` map, and the prompt builder emits a paragraph per frame.
For a set of unrelated poses that is correct. For an animation cycle it is the
single worst thing you can do.

Measured on the same subject, same model, same sheet size, changing only the
prompt:

| prompt style | scale spread across frames | footing spread |
| --- | --- | --- |
| a paragraph per frame (what `poses` produces) | **32%** | **25%** |
| one holistic description + invariants | **3.2%** | **4.8%** |

A tenfold improvement from rewriting the prompt. For reference, a sheet from a
different tool that we were given as a benchmark scored 9% / 5% — the holistic
prompt beat it.

Two reasons per-frame descriptions fail:

- They invite the model to re-imagine the animal for each frame. There is no
  persistent subject between paragraphs.
- They encourage dramatic per-frame language — "body stretched long and low",
  "back arched upward" — which is effectively an instruction to change the
  subject's size and footing. We wrote exactly that, then blamed the medium.

### The shape that works

`art/prompts/run-cycle-away.txt` is the template. Its structure:

1. **What the sheet is** — "a four-frame sprite sheet of ONE continuous run
   cycle, read left to right".
2. **The movement, once** — one sentence, plus that the frames loop.
3. **The subject** — from a single canonical description file.
4. **The view**, held constant.
5. **An explicit list of what must NOT vary** — size, distance from viewer,
   height of the back, tail shape and position, ear shape, coat.
6. **What may change** — "ONLY HER LEGS CHANGE. Everything above the hips is
   drawn identically four times."
7. Layout, style, negatives.

Point 6 does a surprising amount of work. It also makes the cycle *stiffer* than
life, which is a good trade: body bob, roll and tail swing are exactly what a
rig layers on well afterwards.

### Proposed: a `cycle` kind

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

### Transitions need a different shape again

A *cycle* loops; a *transition* plays once from a known pose to another and
holds. Say explicitly that it is **not** a loop, name frame 1 and the final
frame, and state that the frames between are one movement evenly spaced in
time. See `art/prompts/transitions/`.

Reversing a transition gives the return trip free — sitting→standing is the sit
clip backwards. Only generate the outbound half.

---

## 2. Cutting: three gaps

### 2a. Column-only splitting

`cutout.py` splits a sheet into columns. A sheet holding several animation
cycles as rows **cannot be cut at all**.

`tools/gridcut.py` — ~90 lines reusing `strip_background`, `column_occupancy`
and `split_into` unchanged. Finds horizontal bands first, then applies the
existing column splitter within each, so rows can have different frame counts:

```bash
tools/gridcut.py sheet.png outdir walk:4 trot:4 gallop:6
```

**Proposed:** `--rows walk:4,trot:4,gallop:6`, with auto-detection of bands when
counts are not given.

### 2b. Neighbouring frames bleed into each other

A column split cuts at the thinnest gap, which is the best a column-wise
splitter can do — but when a tail or paw reaches across the gap, part of the
neighbour lands inside the frame. In play it appears as a fragment materialising
from nowhere, which reads as a *rendering* bug and gets chased in the wrong
place. It cost us a round trip.

Real damage measured on one set of transitions:

| frame | stray pixels | share of the figure |
| --- | --- | --- |
| `turn90-3` | 22,334 | **28%** |
| `turn90-2` | 4,619 | 6% |
| `turn180-3` | 2,821 | 4% |

`tools/isolate.py` keeps the largest connected component and drops any other
blob **touching the left or right edge** — that edge contact is the signature of
a slice off a neighbour, while interior detail that happens to be detached (a
raised paw) is kept. Then it re-tightens the bounding box, since removing a
stray leaves dead margin.

**Proposed:** run this automatically at the end of every cut.

### 2c. Plates must not be cropped

`cut` finds the figure and crops to its bounding box. That is right for a
sprite and fatal for a background plate, which has to keep its full canvas or it
no longer registers against the other plates of the same scene.

`tools/plate.py` strips the background and keeps every pixel of the frame.

---

## 3. Normalisation should be first-class

Cropping every frame to its own bounding box throws away the one thing a game
needs: **how big the subject is**. A rear view crops tight, a side view is twice
as wide for the same animal, an airborne frame is shorter than a standing one.
Scaling each by its own pixel dimensions makes the subject change size pose to
pose.

`tools/normalize.py` puts every pose on an identical canvas at one body scale
and records where the feet sit. Three things it had to learn the hard way:

**Measure the torso, not the silhouette.** The widest rows of a running animal
are wherever the legs are splayed, so a frame at full extension measures far
"wider" than the same animal gathered — normalising on that makes it shrink and
swell through the cycle. The upper half of the body is rump and ribcage and
barely changes.

**Register on the spine for cycles, the feet for transitions.** In a cycle the
feet move and the body is steady, so the spine is the anchor. In a sit or a lie
it is the reverse — the feet stay planted while the spine legitimately drops —
and pinning the spine slides the subject into the ground as it sits.

**One scale per sheet for anything that turns** (`--uniform`). Per-frame scaling
is right for a cycle, where every frame is the same orientation and the torso
measurement means the same thing throughout. It is badly wrong for a turn: as
the subject rotates, the widest part of it stops being its girth and becomes its
length, the measurement nearly doubles, and "correcting" it makes it pulse.
Measure once where the metric is trustworthy — the standing frame — and apply
that to the whole sheet.

---

## 4. Verification: judge the numbers, not the sheet

`check` reports rim contamination and dead margin, both per-sprite. Neither says
anything about whether a set of frames is a usable animation.

**A sheet can look completely fine and still swell and shrink once it plays.**

Two checks that catch it:

- **Consistency metrics.** Scale spread and footing spread across the frame set.
  Under ~6% on both is usable. `tools/gen-cycle.sh` prints these after every
  generation.
- **The overlay.** Stack every frame at low opacity. A usable cycle shows a
  sharp body with only the limbs blurred; a bad one is a blur. This is the
  fastest possible read and needs no threshold.

One caveat worth encoding: **footing spread is expected to be large for a gait
with a suspension phase.** Our gallop scored 27% and was correct — the feet
really are higher in the airborne frames. Trust the number for grounded gaits,
trust the overlay for anything with suspension.

**Check cutouts on a saturated background.** White-on-white hides enclosed
background pockets and stray fragments completely. We learned this on leg gaps,
wrote it down, then failed to apply it to the transitions and shipped 22k px of
a neighbouring dog. A `--check-bg` flag that composites onto magenta would have
caught it in one look.

---

## 5. Resolution per frame drives consistency

Frames on a three-row sheet come out at roughly **half the linear resolution**
of a single-row sheet — torso ~85px versus ~190px — and consistency degrades
with it.

| sheet | scale spread | overlay |
| --- | --- | --- |
| one cycle, 4 frames, own sheet | 3.2% | tight |
| gaits sheet — walk row | 9.8% | tight |
| gaits sheet — trot row | 14.4% | tight |
| gaits sheet — gallop row | 10.8% | **blurred body** |

The gallop — most frames, most dramatic motion — is the row that fell apart.

**Worth a line in the docs:** explore several cycles cheaply on one multi-row
sheet, then regenerate the one you are shipping on its own.

---

## 6. Generation is for key poses; rigging is for motion between them

`tools/rig.py` slices a single painting into registered parts with pivots at the
joints, so every inbetween is a transform. It is exact by construction: the body
cannot drift because there is only ever one body, and the number of inbetweens
is free.

This is not a replacement for generation — the corrected prompt shape (§1)
produces perfectly usable cycles. It is the right tool when you need arbitrary
smoothness, or motion between poses you did not generate.

Four things that bit us:

**Seam direction.** A cut line is infinite and directional: a pixel belongs to
the part when it is on the left-hand side of every line, walking a→b. Reverse a
line to take the other side. We asked for the tail and got everything except the
tail, twice.

**Bounding lines are mandatory.** "Everything left of the neck" silently includes
the front legs. Every part needs a horizontal bound as well as its anatomical
seam.

**Inpaint behind the joints.** Lifting a part off leaves a literal hole, and any
rotation past a couple of degrees lets you see through the subject. Diffuse the
surrounding texture inward in a band ~46px deep — deep enough to cover what a
joint can expose, shallow enough not to restore the whole silhouette and leave a
ghost trailing the real part.

**Joint limits are measured, not chosen.** We built a bench (`rig-test.html`)
and dragged each joint until the seams tore: head ±11°, head lift ±20px, tail
±26°. Past those you can see through the animal. A pose needing more range needs
drawn art, not a bigger number.

Also, when animating a mirrored pair: give them **either** a half-cycle phase
offset **or** a mirrored sign, never both. Applied together they cancel exactly
and the legs move in lockstep, which reads as hopping.

---

## 7. Prompt-craft findings about subject drift

These are subject-specific but the failure modes generalise.

- **State the coat type in the negative.** "Straight-haired, NOT curly" — models
  default to a stereotype (a curly apricot doodle) and quietly override a
  positive description.
- **Ears drift upright.** Any pose language that lets an ear "lift" produces
  pricked ears and a different animal. Say they hang down in every frame,
  *including when alert*.
- **Models add accessories unprompted.** A collar and tag appeared on their own.
  Forbid them explicitly.
- **Distinct expressions collapse without posture.** `alert` and `neutral` are
  both closed-mouth and forward-facing; asking for them by expression alone
  produced two identical faces. Distinguish them by posture — a craned neck and
  an off-frame stare — not by expression words.
- **Rear views work far better than expected.** "Seen from DIRECTLY BEHIND … no
  part of her face is visible" was honoured first time and consistently.
- **Ask for blank signage.** Text in generated images is unreliable, and a
  signpost with blank boards is usually what a game wants anyway.
- **`--ref` with `--no-ref-note` carries identity, not just style.** This is the
  right mode for generating variations of an established character, and it is
  not obvious from the flag names.

---

## 8. Delivery: generated art is 10–20× too heavy

Not strictly a spriteforge concern, but the skill produces the input and nothing
warns about it.

Generated art arrives at 1024–1536px regardless of how it will be drawn, and
`quantize.py` is the only size-related step. Our runtime payload before any
attention: **53 MB on disk, ~14 MB on first load.**

`tools/optimize.py`, two rules:

- **Opaque plates become JPEG.** Backdrops and ground textures are photographic
  with no alpha; PNG cost roughly 10×. 4.1 MB → 0.35 MB per backdrop.
- **Everything is resized to about twice its on-screen size.** A 1536px backdrop
  drawn 500px wide is not sharper, only slower. One signpost was 918px wide for
  something drawn at 130px: 1.05 MB → 0.11 MB.

Result: 53 MB → ~8 MB on disk, first load 14 MB → 3.2 MB.

**Proposed:** a `--for-web` step, or at minimum a `check` warning when a sprite's
stored dimensions vastly exceed anything plausible.

Related non-obvious bug, worth a docs line: sprites created without an explicit
size paint at their natural dimensions until the first layout pass. A 918×1483
signpost doing that looks exactly like a slow download and is not one.

---

## 9. Bugs in the skill's own scripts

- **`art.py cut` derives its output stem from the common prefix of the frame
  names.** Frames called `side` and `sit` silently produced `molly-body-si-*`,
  and the subsequent quantize step then failed on a missing file. Use the full
  name, or warn on a shared prefix.
- **Inconsistent mutation contracts.** `strip_background`, `decontaminate` and
  `despeckle` all mutate `rgba` in place and return *counts*, but they read like
  transformers. We wrote `rgba = decontaminate(...)` three times before noticing.
  Make them uniform, or rename to `..._inplace`.
- **`--expect N` fails the whole cut rather than falling back.** A sheet that
  finds 2 figures when 1 was expected produces no output at all, which is a
  harsh failure for something usually fixable with `--split-into`.

---

## Tool inventory

Everything below is in `tools/` and stdlib-only, reusing `cutout.py`'s PNG codec.

| tool | what it does |
| --- | --- |
| `gridcut.py` | cut multi-row sheets into rows of frames |
| `isolate.py` | remove pieces of neighbouring frames from a cut sprite |
| `plate.py` | strip a background plate without cropping its canvas |
| `normalize.py` | put every pose on one canvas at one body scale |
| `rig.py` | slice a painting into an animatable cutout rig |
| `seamless.py` | make a texture tile vertically, by mirroring |
| `make-prompts.py` | build cycle and transition prompts from one place |
| `gen-cycle.sh` | generate → cut → normalise → print consistency metrics |
| `optimize.py` | resize and re-encode assets for the web |

Benches, which mattered more than expected: `rig-test.html` (joint limits and
seam checks), `anim-test.html` (registration grid, overlays, playback),
`camera-test.html` (staging).

Building a bench before tuning anything was consistently the right call. Every
number in this document came from one.
