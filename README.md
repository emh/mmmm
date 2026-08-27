# Mighty Miss Molly Mae

A mobile-first web game about living alongside an autonomous dog in Pacific
Spirit Regional Park. You do not control Molly Mae. She has needs, drives, a
personality, memories, and a model of you — you choose opportunities and
respond, and she decides what to do.

See [design/mighty-miss-molly-mae-prd.md](design/mighty-miss-molly-mae-prd.md).

## Running it

No build step. Any static server:

```bash
python3 tools/serve.py
```

Then <http://localhost:8731/index.html>. It needs serving rather than `file://`
because it uses ES modules.

Use `tools/serve.py` rather than `python3 -m http.server`. It stamps a version
onto every relative import, because some browsers keep serving a cached module
graph regardless of `no-store` — and a stale module is a genuinely nasty bug:
the page runs a mix of old and new code, so the symptoms point everywhere except
the file that is actually stale. **Restart the server to pick up JS edits.**

Add `?debug=1`, press `d`, or tap ⚙ for the dog inspector (PRD §37).

## Tests

```bash
./test/run.sh
```

Runs the two scenarios the PRD says prove the design, across 12 seeds:

- `test/scenario.mjs` — §32: memory becomes visible behaviour. She finds an
  antler, and later pulls back toward that spot without prompting.
- `test/crossing.mjs` — §3: a fright at the boardwalk persists across sessions
  and produces hesitation, then patient encouragement rebuilds her confidence.

Both assert *causal links*, not fixed outcomes. Discovery is meant to be
uncertain, so `scenario` asserts that a pull appears **if and only if** she
found something — a seed where she finds nothing must show no pull.

## Status

**Phase 1 complete** (PRD §35) — local simulation, no LLM.

| Phase | State |
| --- | --- |
| 0 — Style bake-off | done; naturalist field guide adopted (§16) |
| 1 — Simulation prototype | done |
| 2 — Relationship prototype | player model exists and feeds behaviour; needs play-testing over repeated sessions |
| 3 — Neural layer | not started; `js/ai/` is the seam |
| 4 — Visual vertical slice | in progress — follow camera and trail corridor are live in the game; one location, no audio, no weather |

## Layout

```
index.html          shell
css/tokens.css      palette sampled from the concept art (§16.1)
rig-test.html       rig bench — joint sliders, seam check (see art/README.md)
camera-test.html    staging bench — follow camera, trail corridor, and the
                    behaviour director (auto by default; buttons override)
tools/rig.py        slices a sprite into the animatable rig
tools/normalize.py  puts every pose on one canvas at one body scale
js/ui/partsrig.js   generic cutout rig + the rear-view run driver
tools/serve.py      dev server; versions imports so JS edits actually load
tools/gen-cycle.sh  generate + cut + normalise an animation cycle, with metrics
art/prompts/        holistic cycle and transition prompts
art/spriteforge-findings.md   gaps found in the spriteforge skill, and what we
                    built to work around them
anim-test.html      animation bench — registration grid, overlay, playback
css/app.css         portrait-first layout (§29)
js/
  app.js            wiring, loop, save cadence
  state.js          one state tree + pure reducer (§21)
  simulation.js     the tick loop (§7 layer 1)
  rng.js            seeded RNG — every random draw goes through it (§37)
  storage.js        IndexedDB persistence (§22)
  dog/
    dog.js          identity, traits, emotion projection to 4 faces (§6.0/§6.3)
    needs.js        needs and drives (§6.1/§6.2)
    behavior.js     what she can do (§7 layer 2)
    utility.js      how she chooses, with a full decision trace (§7)
    memory.js       place/event/stimulus memory, decay, consolidation (§8)
    learning.js     her model of you (§9)
    perception.js   what she notices (§11)
  world/
    places.js       three locations, their spots and stimuli (§31)
    encounters.js   what the park offers moment to moment
  ui/
    render.js       DOM scene (§28 option A)
    animator.js     her animation state machine, driven by the simulation
    rig.js          the cutout rig — breathing, head carriage, tail, weight
    camera.js       the follow camera — yaw and plate parallax (§15A)
    corridor.js     the trail corridor — perspective scenery, recycled and swept past
    actions.js      3–5 contextual actions (§14)
    debug.js        the inspector (§37)
assets/molly/       her sprites — 4 faces, walk, sit
assets/scene/       backdrops (placeholder crops of the concept art)
```

## Things worth knowing before changing the model

Every one of these was a bug found by the scenario tests, and each is a trap
that is easy to fall back into.

1. **Fear must not compound.** Retreating deliberately records no memory — the
   startle is the memory. When retreat wrote a negative event, three retreats
   consolidated into a stronger `frightening` association, so being afraid made
   her more afraid faster than encouragement could help, and §3's arc could
   never close.
2. **A crossing must be worth more than a fright costs.** Otherwise patient
   play cannot win. Frights also taper as a place becomes safe and familiar.
3. **`head_home` only fires when the player asks, or when she is exhausted.** A
   frightened dog deciding to end the walk breaks §2.1 and strands the
   boardwalk arc.
4. **Crossing is repeatable.** `hasCrossed` only records that she has managed it
   once (which opens the far bank). Gating the behaviour on it meant confidence
   could never be rebuilt by doing the thing again.
5. **Fear has no face.** There are four portraits and no frightened one (§6.3),
   so fear reads as `alert` plus posture and behaviour. `expressedEmotion` must
   be refreshed anywhere emotion changes outside the tick — a startled dog still
   wearing a happy face is the most legibility-destroying bug available.
6. **She has to be able to walk to things.** Behaviours like `eat` require
   standing at the bowl; `relocate()` is what gets her there and what makes a
   walk progress at all.

## Known gaps

- Home has no art of its own; it reuses a forest backdrop under a dim indoor
  treatment. Real home art is a Phase 4 item.
- The rig is built from the **walk** sprite only, so resting and sitting still
  show a standing dog while the log says otherwise. `molly-body-sit.png` needs
  its own rig and a cross-fade.
- Only the cedar trail has scenery. The creek/boardwalk borrows it, which is
  wrong for a boardwalk over water, and home has no art of its own.
- She has one direction of travel. Turning off the trail is staged with a
  lateral offset and a camera yaw, not with her actually walking off it.
- Home has no art and no corridor — it reuses the cedar backdrop under a dim
  indoor treatment, with the corridor and moving ground hidden.
- Only the cedar trail has scenery and a backdrop. The creek/boardwalk and home
  still need theirs.
- The corridor is straight — no bends, junctions or clearings yet, and the
  scenery set is four trunks and four ground objects.
- The cutout rig is built from the side-on walk sprite, which under the follow
  camera is now the *off-trail* pose. The rear views are flat sprites for now.
- No audio (§17), no weather effects, no scent visualisation (§16.4).
