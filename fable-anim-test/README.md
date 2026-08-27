# Molly Dash

An 8-bit endless runner built from the dog in `reference.mp4` — a golden pup
seen from behind, galloping down a winding dirt trail. She runs forever; you
steer, and the trail keeps bending out from under you.

Vanilla JavaScript. No build step, no dependencies, no image files. Every
sprite is generated in code at load.

## Play

```bash
python3 -m http.server 8742
```

Then open <http://localhost:8742/index.html>. It also runs straight from
`file://` — the scripts are classic `<script>` tags, not modules.

- **Steer** — swipe/drag anywhere, or arrow keys / `A`,`D`
- **Start, pause** — tap, or `Space`
- **Mute** — the ♪ button, or `M`
- **End the run** — pause, then ■ (or `Esc` twice)

Drag steering is relative: the anchor slides once you hit full lock, so you can
hold a hard turn without running out of thumb.

## How it plays

Stay on the trail and the multiplier climbs to ×8. Step into the grass and you
slow down, the multiplier resets and the screen edges flush red. Balls and
sticks on the trail are points; rocks, logs and tree trunks trip her. Past 250m
the trail starts putting obstacles in the running line, and the bends tighten
as you go. There is no game over — your best is banked as you run.

## How it works

A scanline pseudo-3D renderer. Sky, hills and ground are written directly into
a `Uint32Array` and flushed with one `putImageData`; props and Molly go on top
as nearest-neighbour `drawImage` calls. The canvas is roughly 185×400 and CSS
scales it to fill the screen with `image-rendering: pixelated`, so the chunky
look is real pixels rather than a filter. About 0.8 ms/frame on desktop.

The trail is a pure function of distance — four sine waves, the two short ones
growing with difficulty — so the path ahead never changes shape and nothing
about the world needs to be stored. Scenery, pickups and obstacles are
fixed-pitch slot streams keyed by a hash of the slot index: infinite, stable,
and allocation-free.

| File | |
| --- | --- |
| `js/pix.js` | pixel buffer, shape fills, hash noise |
| `js/art.js` | every sprite, generated and shaded from code |
| `js/font.js` | 4×5 bitmap font |
| `js/world.js` | trail curve, widths, procedural prop placement |
| `js/render.js` | scanline renderer |
| `js/dog.js` | Molly, assembled from parts each frame |
| `js/hud.js` | text overlay and screen tints |
| `js/audio.js` | procedural WebAudio blips |
| `js/game.js` | state, input, loop |

`sprites.html` is a dev page that draws the gait cycle at 10× for tweaking the
character. Note that browsers cache the plain `<script>` files aggressively —
hard-refresh after editing, or you will run a mix of old and new code.

## Tuning

Most of the feel lives in a handful of constants:

- `js/world.js` — `CAM_H`, `DOG_Z`, `centerAt`, `halfWidthAt`, `speedAt`
- `js/game.js` — `MAX_VX` (top lateral speed), `STEER_SNAP` (steering lag)

The trail is only playable while `max|dC/dz| × speed` stays under `MAX_VX`.
It currently peaks at about 2.1 m/s against a 2.5 m/s limit, so a perfect line
is always available — with less and less margin as you go.
