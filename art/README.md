# Asset pipeline

Style decided 2026-08-26: **naturalist field guide** (PRD §16). All new Molly Mae art goes
through `art/naturalist/`.

```bash
SF=~/.claude/skills/spriteforge/scripts
cd art/naturalist
python3 $SF/art.py make portrait molly \
  --desc "$(cat ../MOLLY-DESC.txt)" \
  --subject "Molly Mae, a straight-haired copper labradoodle" \
  --quality high
```

- `MOLLY-DESC.txt` — the single source of truth for how Molly looks. Edit here, not in the
  configs. Passed as `--desc` on every call.
- `naturalist/art.json` — live config. Outputs to `assets/molly/`.
- `painted/art.json` — retained as the record of the rejected candidate. Not used.
- `sheets/` — raw model output, gitignored, regenerable.

## Rules learned the hard way

Every one of these came from a real failure during the bake-off. They are already encoded in
`art.json`, but re-state them in any hand-written prompt:

1. **Straight coat, never curly.** Say *straight-haired, not curly* explicitly. Models
   default to a curly apricot doodle, which is off-model.
2. **Ears hang down in every frame** — including `alert`. Any hint that an ear may "lift"
   produces pricked terrier ears and a different dog.
3. **No accessories.** No collar, harness, leash or tags. The model adds them unprompted.
4. **`alert` needs posture, not a face.** Craned neck, off-frame stare. Otherwise it is
   indistinguishable from `neutral` at phone size.
5. **Don't share a prefix between frame names.** `art.py` derives the output stem from the
   common prefix, so `side`/`sit` produced `molly-body-si-*`. Hence `walk`/`sit`.
6. **Fix a bad cut by re-cutting, not regenerating.** `portrait` carries
   `"cutout": {"threshold": 210}` because the default left a 2.2% rim on `alert`.

## Checking

`make` and `cut` run QA automatically. Clean output is `rim 0.0%` and `ok`. A fur silhouette
under ~2% is acceptable; anything higher, adjust `threshold` before spending on a regenerate.

## The cutout rig

`tools/rig.py` slices a side-view sprite into animatable layers:

```bash
python3 tools/rig.py assets/molly/molly-body-walk.png assets/molly/rig
```

Parts are **cut from one painting rather than generated separately** — that way
registration is exact by construction, the light direction matches, and the
style cannot drift between parts. Separately generated parts get all three
wrong.

Output is `body.png` / `head.png` / `tail.png` plus `rig.json` carrying each
part's offset and a **pivot at the joint**, so rotating the head turns it about
the neck rather than spinning the image.

### The two things that make it work

1. **Bounded seams.** A cut line is infinite, so "everything left of the neck"
   also swallows the front legs. Each part needs a horizontal bound as well as
   its anatomical seam.
2. **Inpainting behind the joints.** Lifting a part off leaves a literal hole,
   and any rotation past a couple of degrees lets you see through her. The body
   is repaired by diffusing surrounding fur inward, in a band ~46px deep — deep
   enough to cover what a joint can expose, shallow enough that it doesn't
   restore the whole silhouette and leave a ghost trailing the real head.

### Joint limits

Measured in `rig-test.html`, and enforced in `js/ui/rig.js`. **These are not
stylistic** — past them the seams open:

| joint | limit |
| --- | --- |
| head rotate | ±11° |
| head lift | ±20px (sprite space) |
| tail rotate | ±26° |

A pose needing more range needs drawn art, not a bigger number.

### Bench

`rig-test.html` — emotional presets, per-joint sliders, checkerboard and seam
outlines. Use it before changing any limit.

## Environment plates (PRD §15A)

The camera looks down the trail from behind Molly Mae. Each location is a trail
corridor authored as layered plates, not a backdrop.

```bash
cd art/naturalist
python3 $SF/art.py gen plate_far  cedar --desc "an old-growth cedar trail" --quality high
python3 $SF/art.py gen plate_near cedar --desc "close foreground ferns at the edges" --quality high
cd ../..
cp art/sheets/naturalist/plate-cedar-far.png assets/scene/cedar-far.png
python3 tools/plate.py art/sheets/naturalist/plate-cedar-near.png assets/scene/cedar-near.png
```

`tools/plate.py` rather than `art.py cut`, because a plate must **keep its full
canvas**. `cut` finds the figure and crops to its bounding box, which is right
for a sprite and fatal for a plate — crop it and it no longer registers against
the other plates, so the parallax comes apart.

### Aspect ratios are not interchangeable

- **`far` is landscape (1536×1024).** Shown `cover` in a portrait viewport it
  fills the height and overflows the width, and that overflow *is* the margin
  the camera yaws into.
- **`near` is portrait (1024×1536).** This is the one that catches people out.
  A landscape near plate looks correct in the sheet and then vanishes in game:
  `cover` crops away exactly the left and right edges, which is where all the
  foreground foliage lives. Author it portrait so its edges land on the phone's
  edges.

The near plate prompt must be emphatic that the **centre is empty** — a clear
vertical channel with no foliage — or she walks behind a bush.

### Calibrating a location

`TRAIL` in `js/ui/camera.js` maps distance-down-the-trail to her size and
footing. Both come from one `depth` value, because in perspective they are the
same fact; setting size and ground independently is how you get a floating dog.

**Measure `far.ground` against the last visible bit of trail, not the horizon.**
The drawn trail recedes to a vanishing point, but foreground foliage hides it
long before that, so the walkable stretch is much shorter than the drawn one.
Calibrating to the horizon leaves her standing in mid-air halfway up the frame.

Re-measure per location in `camera-test.html`.

## Benches

| Page | For |
| --- | --- |
| `rig-test.html` | joint limits and seam checks on the cutout rig |
| `camera-test.html` | staging: her orientation, camera yaw, distance down the trail, foreground on/off |
| `bakeoff.html` | the record of the style decision |

## Walking down the trail

`Camera.setWalking(true)` starts an endless dolly. What sells forward motion is
**near foliage sweeping past**, not the background moving — which is also what
sells it when you actually walk through a forest.

### The far canopy does not move

`DOLLIES.far = false`, deliberately. Walking ten metres down a trail does not
change the distant view, and dollying it produces a cross-dissolve of highly
detailed trees against themselves a few percent apart. That reads as a soft
double-exposure over the whole frame — the single worst-looking bug in this
system, and it is tempting to reintroduce because "everything should move".

### Two copies, half a cycle apart

Dollying planes get two copies so there is nothing to snap back. Each grows and
fades as it passes, and the wrap happens while that copy is nearly transparent.

They fade with `sin(phase·π)^0.55` rather than a sum-to-one crossfade. Both
approaches are reasonable and the choice depends on whether the plane is
transparent:

- **Transparent overlays** (near, mid): fade in and out. Nothing behind them to
  show through.
- **Opaque plates**: a sum-to-one crossfade is wrong. Compositing is
  multiplicative, so up to a quarter of the backdrop shows through at the
  midpoint and the scene visibly dims twice a cycle. Keep the farther copy solid
  underneath and fade only the nearer one.

### Her gait

Three overlapping motions on top of her trail placement: a two-beat vertical
bob, a slower side-to-side weight shift, and a very slow drift in and out of
following distance. The last one matters most — a dog pinned at exactly the
same distance forever reads as *towed*. Letting her pull ahead and drop back is
most of what makes it feel like following an animal.

## The trail corridor

Scaling a plate toward the camera is a **zoom, not travel** — the same trees get
bigger and within seconds it is obvious you are going nowhere. Real travel needs
individual scenery in a virtual corridor: `js/ui/corridor.js`.

```bash
cd art/naturalist
python3 $SF/art.py gen trunks forest      --desc "old-growth conifer trunks" --quality high
python3 $SF/art.py gen undergrowth forest --desc "rainforest floor plants and deadwood" --quality high
python3 $SF/art.py gen ground trail       --desc "packed earth trail seen from directly above" --quality high
cd ../..
python3 tools/seamless.py art/sheets/naturalist/ground-trail.png assets/scene/ground-trail.png
```

Sprites cut with `art.py cut` land in `assets/molly/`; move them to
`assets/scene/scatter/`.

### Sizes are in metres, not pixels

`SCENERY` gives each kind a real-world `width`. A 1.4 m fern and a 2.6 m trunk at
the same distance then come out correct relative to each other with no
hand-tuning, and the same projection places Molly, so nothing can disagree about
where the ground is.

### Traps

**Trunks must be stretched vertically.** A trunk sprite is a ~7 m *segment*.
Scaled honestly it stops in mid-air partway up the frame and the forest reads as
a row of posts. Stretch it to run off the top of the screen — bark grain is
almost entirely vertical and takes the distortion without looking stretched.

**Recycle trunks early (15 m), not at the corridor's far end.** Far away they are
too short to fill the frame. The backdrop supplies the distant trees. Fade each
item in over the first stretch of its life or they pop into existence.

**Seed the corridor across its whole depth.** Spawning everything at the far end
starts the walk in a clearing that stays empty for half a minute.

**Everything needs a contact shadow.** A trunk's cut base sits on the trail like
a sticker otherwise — the same problem Molly had.

### The ground plane

A CSS 3D plane hinged at the horizon:

- `transform-origin: 50% 0%` — it must hinge at the horizon, not its centre
- its depth must stay inside the `perspective` distance, or most of the plane
  ends up behind the camera and it foreshortens to a sliver
- the texture tiles vertically by **mirroring** (`tools/seamless.py`).
  Cross-fading the seam does not guarantee a wrap — measured ~20/255 residual on
  this texture, which crawls visibly when scrolling. Stacking the image above a
  flipped copy is exact by construction; the mirror symmetry is undetectable on
  noisy ground seen at a shallow angle.

The ground **must not** be painted into the backdrop. When it was, pushing the
backdrop back optically — which is what makes it read as distance — blurred the
trail she walks on along with it.

## Normalising sprites

```bash
python3 tools/normalize.py specs.json assets/molly/norm
```

Cutting a sprite to its own bounding box throws away the thing the game needs:
how big she is. A rear view crops tight, a side view is twice as wide for the
same animal, and an airborne run frame is shorter than a standing one. Scaling
each by its own pixel size makes her change size from pose to pose.

`normalize.py` puts every pose on an identical canvas at one body scale,
registered on the spine, and records where her paws sit (`feet`). The game then
uses one number — canvas height in metres — instead of a value per pose.

**Measure the torso, not the silhouette.** The widest rows of a running dog are
wherever its legs are splayed, so a frame at full extension measures far wider
than the same dog with its legs gathered — normalising on that makes her shrink
and swell through the cycle. The upper half of the body is rump and ribcage and
barely changes.

**Register on the spine, not the feet.** The top of the body is stable while
legs and tail move. Registering on the ground line instead makes an airborne
frame yank the whole animal downward.

Poses from a different sheet, or whose widest dimension is not comparable (a
side view measures her *length*), need a manual `scale` in the spec.

## Animation: what does and does not work

**Generated frames are not an animation.** A four-frame run cycle was generated
with explicit, emphatic instructions that every frame be the same size at the
same distance on the same ground line. It came back with each frame a different
size, a different footing and a different body. Normalisation tightened the
footing spread from 0.62–1.17 to 0.67–0.91, but it cannot invent a shared body:
`anim-test.html` overlays the frames, and a usable cycle would show a tight
silhouette with only legs and tail differing. It shows a blur.

This is the same limitation the spriteforge skill warns about, and it does not
go away with better prompting — the model has no persistent model of the animal
between frames.

**What works is one drawing, rigged.** `tools/rig.py` cuts a single painting
into registered parts with pivots at the joints, so every inbetween is generated
by transform rather than by the model. It is exact by construction: the body
cannot drift because there is only ever one body. A rear-view run is the easier
case, since the legs are largely occluded by the body.

Use generation for **key poses**, and the rig for **motion between them**.

## Rigging a run

```bash
python3 tools/rig.py assets/molly/molly-away.png assets/molly/rig-away art/rig-away.json
```

`rig.py` now takes a JSON part definition, so any pose can be rigged. The
rear-view run uses four parts: body, tail, and two hind legs.

**A rear view is the easy case.** From behind, the legs are largely hidden by
the body, so modest rotation convinces — and the cues that actually sell a run
are the body rising twice per stride, rolling onto each driving leg, and the
tail answering a beat late. `runPose` in `js/ui/partsrig.js` is all of ~20 lines
because of that.

### Seam directions

A cut line is infinite and directional: a pixel belongs to the part when it is
on the left-hand side of every line, walking a→b. Reverse a line to take the
other side. Getting this wrong is the usual first failure — you ask for the tail
and get everything except the tail.

Every part also needs bounding lines, not just its anatomical seam. "Left of the
neck" silently includes the front legs.

### Phase and mirror cancel

Two legs in opposition need **either** a half-cycle phase offset **or** a
mirrored sign — never both. Applied together they cancel exactly and the legs
move in lockstep, which reads as hopping. One driver, opposite signs.

### Why this and not generated frames

`anim-test.html` shows both side by side. The generated cycle is four different
dogs; the rig is one drawing, so the body cannot drift, and inbetweens are free.
Use generation for **key poses**, the rig for **motion between them**.

## Prompting an animation cycle

**Describe the animation once. Do not describe the frames individually.**

This is the single biggest lever on frame consistency, and it is not obvious —
spelling out each frame's pose feels like *more* control, and produces much
less. Measured on the same subject, same sheet size, same model:

| prompt style | scale spread | footing spread |
| --- | --- | --- |
| a paragraph per frame | **32%** | **25%** |
| one holistic description | **3.2%** | **4.8%** |

A tenfold improvement from rewriting the prompt. Per-frame descriptions invite
the model to re-imagine the animal for each one — especially when those
descriptions reach for drama ("body stretched long and low", "back arched
upward"), which is an invitation to change its size and footing.

The template is `art/prompts/run-cycle-away.txt`. Its shape:

1. **What the sheet is** — "a four-frame sprite sheet of ONE continuous run
   cycle, read left to right".
2. **The animation as a whole** — one sentence, plus that the frames loop.
3. **The subject** — from `MOLLY-DESC.txt`.
4. **The view** — held constant across all frames.
5. **An explicit list of what must NOT vary** — size, distance, height of the
   back, tail shape and position, ear shape, coat.
6. **What may change** — "ONLY HER LEGS CHANGE. Everything above the hips is
   drawn identically four times."
7. Layout, style, and the usual negatives.

Point 6 does a lot of work. Freezing the body also makes the cycle *stiffer*
than life — but body bob, roll and tail swing are exactly what a rig adds well
on top, so it is worth trading.

```bash
tools/gen-cycle.sh art/prompts/run-cycle-away.txt cycle-run-v3 4
```

Generates, cuts, normalises and prints the consistency numbers. **Judge a cycle
on those numbers, not on the sheet** — a sheet can look fine and still swell
and shrink once it plays. Under ~6% on both spreads is usable.

## Multi-row sheets: several cycles in one generation

```bash
python3 ~/.claude/skills/spriteforge/scripts/imagegen.py \
  --prompt "$(cat art/prompts/gaits-away.txt)" \
  --ref assets/molly/molly-away.png --no-ref-note \
  --out art/sheets/naturalist/gaits-away.png --size 1536x1024 --quality high

python3 tools/gridcut.py art/sheets/naturalist/gaits-away.png \
  assets/molly/raw/gaits walk:4 trot:4 gallop:6
```

`tools/gridcut.py` exists because spriteforge's cutter **splits columns only**.
It finds the horizontal bands first, then splits each band into its own frame
count — so one generation can carry a walk, a trot and a gallop, each with a
different number of frames.

`--ref` with an existing on-model sprite plus `--no-ref-note` (a true edit, so
the subject carries over rather than just the style) holds identity well.

### It works, but it costs consistency

Measured against a single cycle generated on its own sheet:

| sheet | scale spread | overlay |
| --- | --- | --- |
| one cycle, 4 frames, own sheet | **3.2%** | tight |
| gaits sheet — walk row | 9.8% | tight |
| gaits sheet — trot row | 14.4% | tight |
| gaits sheet — gallop row | 10.8% | **blurred body** |

Frames on a three-row sheet are drawn at roughly half the linear resolution
(torso ~85px versus ~190px), and the model has far more to hold in mind. Walk
and trot survived it; the gallop — the most frames and the most dramatic body
change — did not.

**Use a multi-row sheet to explore several gaits cheaply, then regenerate the
one you are shipping on its own sheet.**

### The footing metric lies about airborne gaits

`normalize.py` reports footing spread from the lowest opaque pixel, so a gallop
with genuine airborne frames scores badly (27%) while being correct. Trust the
number for grounded gaits; trust the overlay for anything with suspension.

### White between the legs

Not an issue here, and worth knowing why: `strip_background` flood-fills inward
from the edges, and the gaps between her legs stay connected to the outside, so
they clear. Enclosed pockets — a paw crossing in front of a leg, a curled tail
touching the flank — would *not* clear, and `despeckle` only mops up blobs under
a few hundred pixels. Composite onto a saturated colour to check; white on white
hides exactly this.

## Placing a normalised sprite in the world

Two mistakes, both of which look like "the dog is wrong" rather than "the maths
is wrong", and which showed up together as *too small and floating above her
shadow*:

**1. `project()` normalises by viewport WIDTH.** Pass it a real-world width. It
is tempting to pass a canvas *height* since that is the dimension a normalised
sprite is defined by — that renders her at roughly half size. Derive height from
the canvas aspect instead.

**2. Seat the canvas's ground line, not the canvas bottom.** A normalised canvas
has empty space below her paws (`feet` in `sprites.json` says how much). Putting
the canvas bottom on the trail lifts her off the ground by exactly that gap, and
her shadow — which correctly sits on the trail — is left behind underneath her.

For a cycle, use the gait's **most planted frame** as its ground reference, not
each frame's own lowest pixel:

```js
g.groundFeet = Math.max(...frames.map(f => sprites[f].feet));
```

Registering every frame on its own feet glues an airborne gallop frame to the
earth and flattens the suspension. Taking the most planted frame means she
touches down on the beats that should and lifts off on the beats that should —
the shadow stays on the ground and she leaves it.

### Canvas scale is calibrated, not measured

`MOLLY_CANVAS_W = 1.52` m is set to reproduce the framing that already read
correctly on screen, and implies a ~0.48 m torso — wider than the animal really
is, because the sprite carries coat, tail spread and margin. Matching the
established framing matters more here than anatomical purity; just do not read
these numbers as anatomy.

## Transitions

A *cycle* loops; a *transition* plays once from a known pose to another and
holds there. `tools/make-prompts.py` builds both from one place, and they need
different treatment in three ways.

**Prompt.** Say explicitly that it is NOT a loop, name frame 1 and the final
frame, and state that the frames between are one movement evenly spaced in time.
Everything else follows the cycle rule: describe the movement once, then list
what must not change.

**Register on the FEET, not the spine.** For a cycle the feet move and the
spine is steady, so the spine is the anchor. For a sit or a lie it is the other
way round — her feet stay planted while the body drops — and pinning the spine
slides her into the ground as she sits.

```bash
python3 tools/normalize.py specs.json out feet --uniform
```

**One scale per sheet, not per frame** (`--uniform`). Per-frame scaling is right
for a cycle, where every frame is the same orientation and the torso
measurement means the same thing throughout. It is badly wrong for a turn: as
she rotates, the widest part of her stops being her girth and becomes her
length, the measurement nearly doubles, and "correcting" it makes her pulse
through the turn. Measure once where the metric is trustworthy — the standing
frame — and apply it to the whole sheet.

### Reverse gives the return trip free

Sitting → standing is the sit clip played backwards. Same for lying down and
both turns. Only generate the outbound half.

### The anchor pose

`art/prompts/stand-away.txt` produces the canonical standing rear view. Every
transition is generated with it as `--ref ... --no-ref-note`, so they all begin
from the same animal. Frame 1 of each still drifts slightly; if that matters,
discard it and use the standing sprite as frame 0.

### Always isolate after cutting

```bash
tools/isolate.py assets/molly/raw/turn180-*.png
```

A column split cuts at the thinnest gaps, which is the best a column-wise
splitter can do — but when a tail or a paw reaches across the gap, part of the
neighbouring dog lands inside the frame. In play it appears as a fragment
materialising from nowhere, which reads as a rendering bug rather than an art
one, so it is easy to chase in the wrong place.

`isolate.py` keeps the largest connected component and drops any other blob
**touching the left or right edge** — that edge contact is what a slice off a
neighbour looks like. Interior detail that happens to be detached is kept.

It found real damage on the turns: `turn90-3` was carrying 22,334 px of the
next frame (28% of the figure), `turn90-2` 4,619 px, `turn180-3` 2,821 px.
`gridcut.py` now runs it automatically; run it by hand after using
`cutout.py` directly.

**Check on a saturated background.** These frames looked fine on white, which
is exactly the problem — composite onto magenta and any bleed is unmissable.

## The behaviour director

`camera-test.html` sequences the whole sprite set autonomously: she stands,
walks on, sometimes breaks into a trot or a gallop, stops, does something, and
settles back to standing.

Two things make it read as an animal rather than a playlist.

**Carry an intent through the standing beat.** The first version chained
independent coin-flips at each phase, and produced long runs of the same kind of
thing — she stood and did five behaviours without ever moving off, because
nothing remembered what she had just done. Now finishing a gait sets intent
`behave`, finishing a behaviour sets intent `move`, and the standing beat
between them follows it. The result is the intended rhythm — move, stop, do
something, move off — while still never repeating.

**Play every behaviour forwards then backwards.** That returns her to standing
and is why only the outbound half of each transition had to be drawn.

Gait frames come from distance travelled and everything else is driven by the
director, so her feet stay planted while she eases in and out of a stop.

### Mixing the two registrations

Gaits are spine-registered and transitions feet-registered, so they cannot be
placed by a shared rule. Each clip instead carries its own `ground` — the canvas
fraction that sits on the trail — and placement uses that. Measured across
switches, her shadow holds to within ~18px, and that residue is her drifting in
and out of following distance rather than a registration mismatch.

## Connecting the animation to the simulation

`js/ui/animator.js` owns every sprite and the state machine between them. The
game does not pick frames — it says what she is *doing*, via
`poseForBehaviour(state)`, and the animator works out how to get there and back.

| behaviour (from `js/dog/utility.js`) | pose |
| --- | --- |
| `follow_player` | walk, or trot when she is keen |
| `head_home`, `cross_crossing` | trot |
| `chase` | gallop |
| `look_at_player` | **glance** — the check-in of §9 |
| `investigate_scent`, `dig`, `greet`, `splash`, `drink`, `eat`, `play` | turn90, side-on to it |
| `wait`, `retreat`, or fear > 0.42 | turn180, stopped and facing you |
| `rest` | lie |
| indoors | sit |

**Pace comes from the pose, not the other way round.** The animator reports the
clip's own speed, the camera eases toward it, and the corridor moves at that
rate — so the world only travels when she is actually walking, and it travels at
the speed of the gait she chose.

### Two mappings that needed pulling back

`investigate_spot` is her generic pottering-about behaviour and fires
constantly. Mapping it to a ninety-degree turn made her pivot every few seconds
like a weathervane; it is now a pause, which reads the same and costs nothing.

`follow_player` defaulted to a trot because the drive thresholds were low. An
ordinary walk is the default now, and she only picks up when she is genuinely
keen.

## Surfaces and structure

Each place sets its own ground texture, texture scale, scenery set, and whether
it has a handrail:

```js
creek_boardwalk: { ground: "boardwalk", groundScale: 13, scenery: "boardwalk", rail: true }
```

**Texture scale is per surface.** One global value cannot serve packed earth and
cedar planks: at the trail's scale, boardwalk planks came out the size of
railway sleepers. Gravel and creek cobbles need their own values too — the
grain size of the real material is what the number encodes.

**A fence is not scenery.** Rail posts were first added to the random scatter,
which cannot work: scatter puts things at random distances and random lateral
offsets, and a fence is *regular* — the regularity is the entire signal.
Randomly placed posts read as posts lying about. The handrail is now its own
structure in `corridor.js`: fixed lateral offset, even spacing, both sides,
recycled as it passes, with the far side mirrored so the rail stub always points
in toward the walkway.

The same will be true of anything else built rather than grown — a bridge deck,
a boardwalk edge, a fence line, a set of steps.


---

**See also:** `art/spriteforge-findings.md` — a consolidated write-up of the
gaps we hit in the spriteforge skill and the tools built to work around them,
with the measurements behind each one. That document is aimed at developing the
skill; this one is aimed at making art for this game.
