/**
 * Molly Mae's persistent identity (PRD §6.0, §6.4).
 *
 * One canonical dog. The player does not roll traits or pick a temperament --
 * she is a specific individual, and her billed "friendly, curious, loyal" must
 * stay consistent with these numbers.
 */

import { initialNeeds, initialDrives } from "./needs.js";

export const MOLLY_TRAITS = {
  curiosity:    .84,   // billed: curious
  sociability:  .78,   // billed: friendly
  boldness:     .46,   // leaves room for the boardwalk to frighten her
  foodDrive:    .72,
  playfulness:  .81,
  independence: .34,   // billed: loyal -- stays oriented to the player
  persistence:  .63,
};

export function initialDog() {
  return {
    name: "Molly Mae",
    traits: { ...MOLLY_TRAITS },
    needs: initialNeeds(),
    drives: initialDrives(),
    emotion: { arousal: .25, valence: .35, fear: 0 },
    place: "cedar_trail",
    spot: "trailhead",
    behavior: null,       // { id, spot, target, ticksLeft, signals }
    hasCrossed: false,    // has she ever crossed the plank span
    walking: false,
  };
}

/**
 * Project continuous emotion onto the four expressed states (§6.3).
 *
 * Expression is quantized; there are exactly four faces and no frightened one.
 * Fear surfaces as `alert` plus posture and behaviour, which is a constraint the
 * art deliberately imposes.
 *
 * `previous` supplies hysteresis so the face does not flicker at a threshold.
 */
export function expressedEmotion(emotion, previous) {
  const { arousal, valence, fear } = emotion;
  const scores = {
    // Each state needs a real threshold crossed, not just a nudge -- otherwise a
    // resting dog reads `happy` and the four states stop meaning anything.
    alert:   fear * 1.7 + Math.max(0, arousal - .45) * 1.2 - valence * .3,
    curious: Math.max(0, arousal - .30) * 1.5 + Math.max(0, valence) * .3 - fear * .8,
    happy:   Math.max(0, valence - .35) * 2.4 - fear * 1.2 - Math.max(0, arousal - .85) * 2,
    neutral: .42 - Math.abs(valence) * .3 - arousal * .35 - fear * .6,
  };
  // Sticky: the current face gets a bonus, so small drifts don't switch it.
  if (previous && scores[previous] !== undefined) scores[previous] += .09;

  return Object.keys(scores).reduce((best, key) =>
    scores[key] > scores[best] ? key : best, "neutral");
}

/**
 * Body-language signals. These are the *only* channel for anything the four
 * faces cannot say -- notably fear (§6.3) -- so they carry real weight.
 */
export function bodySignals(dog) {
  const { emotion, needs } = dog;
  const signals = [];
  if (emotion.fear > .45) signals.push("tail_low", "ears_back", "weight_back");
  else if (emotion.fear > .2) signals.push("hesitating");
  if (emotion.arousal > .65) signals.push("tail_high", "ears_forward");
  if (emotion.valence > .5) signals.push("loose_wag");
  if (needs.fatigue > .7) signals.push("slow_gait", "lagging");
  if (needs.thirst > .7) signals.push("licking_lips");
  if (needs.hunger > .75) signals.push("watching_you");
  return signals;
}
