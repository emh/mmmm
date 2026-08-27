/**
 * Footsteps follow the gait.
 *
 * The rate has to come out of distance covered, not a timer, or the paws drift
 * against the animation within a couple of strides -- the animation is driven
 * by distance for the same reason.
 *
 * What must hold: the number of footfalls per second equals the stride rate
 * times the paws that land per stride, no beat is fired twice or dropped
 * however the frames fall, and a stalled tab cannot return a flood.
 */
import { BEATS, beatsCrossed } from "../js/ui/sound.js";
import { GAIT_SPEC } from "../js/ui/animator.js";

let bad = 0;
console.log("gait     expected   measured   per stride");
for (const [gait, spec] of Object.entries(GAIT_SPEC)) {
  const beats = BEATS[gait];
  if (!beats) { console.log(`  ${gait}: no beats defined`); bad++; continue; }

  // Ten seconds at an irregular frame rate, as a real one is.
  let phase = 0, n = 0, t = 0;
  while (t < 10) {
    const dt = 1 / 60 * (0.6 + Math.random() * 0.9);
    const was = phase;
    phase += (spec.pace * dt) / spec.stride;
    n += beatsCrossed(was, phase, beats);
    t += dt;
  }
  const expected = (spec.pace / spec.stride) * beats.length;
  const measured = n / t;
  const off = Math.abs(measured - expected) / expected;
  if (off > 0.02) bad++;
  console.log(`  ${gait.padEnd(7)} ${expected.toFixed(2).padStart(6)}/s ` +
              `${measured.toFixed(2).padStart(9)}/s ${String(beats.length).padStart(9)} paws` +
              (off > 0.02 ? "   OFF" : ""));
}

// One frame after a long stall must not dump a burst.
const flood = beatsCrossed(0, 400, BEATS.gallop);
console.log(`\nafter a 400-stride stall, one frame fires ${flood} footfalls (capped)`);
if (flood > 6) bad++;

// A frame with no movement fires nothing.
if (beatsCrossed(3.25, 3.25, BEATS.walk) !== 0) { console.log("a still frame fired a footfall"); bad++; }

console.log(bad ? "FAIL" : "PASS -- footfalls track the gait at every pace");
process.exit(bad ? 1 : 0);
