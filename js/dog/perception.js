/**
 * Dog-relevant perception (PRD §2.3, §11).
 *
 * The player sees a trail and a bridge. Molly Mae perceives scent, movement,
 * water, and the site of something that happened before. Perception is a
 * first-class system, not flavour text -- what she notices is what she can act
 * on, and the utility layer reads directly from this.
 */

import { SPOTS, STIMULI, PLACES } from "../world/places.js";
import { placeMemory, stimulusBias } from "./memory.js";

/** Build the decision context handed to the utility scorer. */
export function perceive(state, rng) {
  const dog = state.dog;
  const active = state.world.stimuli[dog.spot] || [];
  const spotDef = SPOTS[dog.spot];

  const scents = active
    .filter((id) => STIMULI[id].scent)
    .sort((a, b) => interestOf(state, b) - interestOf(state, a));

  const prey = active.find((id) => id === "squirrel" || id === "frog") || null;

  return {
    // --- world -------------------------------------------------------
    place: dog.place,
    spot: dog.spot,
    spotName: spotDef.name,
    stimuli: active,
    scents,
    strongestScent: scents[0] || null,
    preyId: prey,
    preyLabel: prey ? STIMULI[prey].label : null,
    hasStimulus: (id) => active.includes(id),
    spotHasTreasure: (state.world.found[dog.spot] || []).length > 0,
    retreatSpot: retreatTarget(dog),

    // --- dog ---------------------------------------------------------
    traits: dog.traits,
    drives: dog.drives,
    emotion: dog.emotion,
    memory: dog.memory,
    hasCrossed: dog.hasCrossed,
    lastBehavior: dog.behavior?.id || null,

    // --- relationship ------------------------------------------------
    playerModel: state.playerModel,
    playerSupported: state.interaction.playerSupported,
    nudge: state.interaction.nudge,
    pace: state.interaction.pace,

    rng,
  };
}

function interestOf(state, stimulusId) {
  return STIMULI[stimulusId].interest + stimulusBias(state.dog.memory, stimulusId);
}

/**
 * Where a frightened dog backs off to: the way she came.
 *
 * On a crossing that is the spot before it, and past a crossing it is back to
 * the crossing itself. Derived from the place's own spot order rather than
 * named spots, so it keeps working as the park changes.
 */
function retreatTarget(dog) {
  const spots = PLACES[dog.place]?.spots || [];
  const i = spots.indexOf(dog.spot);
  if (SPOTS[dog.spot]?.beyondCrossing) {
    const crossing = spots.find((id) => SPOTS[id].crossing);
    if (crossing) return crossing;
  }
  return i > 0 ? spots[i - 1] : spots[0] || "trailhead";
}

/**
 * How salient the current situation is -- used to decide whether this moment
 * deserves the player's attention (§14: show actions only when they matter).
 */
export function salience(ctx) {
  let value = 0;
  for (const id of ctx.stimuli) {
    const s = STIMULI[id];
    value = Math.max(value, s.interest + (s.startling ? .3 : 0));
  }
  if (ctx.emotion.fear > .3) value = Math.max(value, .8);
  const mem = placeMemory(ctx.memory, ctx.spot);
  if (mem.associations.interesting > .6) value = Math.max(value, .65);
  return value;
}

/**
 * A short, non-numeric description of what she is attending to.
 * §2.2/§11: never "deer scent 76%" -- the player infers from behaviour.
 */
export function describePerception(ctx) {
  if (!ctx.stimuli.length) return null;
  const top = ctx.stimuli
    .map((id) => STIMULI[id])
    .sort((a, b) => b.interest - a.interest)[0];
  return top.label;
}
