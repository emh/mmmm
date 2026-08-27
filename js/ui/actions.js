/**
 * Contextual actions (PRD §14).
 *
 * Only 3-5 relevant actions, ever, and never padded to a fixed count. The set
 * is derived from what is actually happening, so the action bar is itself a
 * readout of the situation.
 *
 * Actions influence; they do not puppet (§2.1). Each one sets a nudge that
 * biases the utility scorer, and teaches the dog something about the player.
 */

import { SPOTS, STIMULI } from "../world/places.js";

/** Nudge strength -- how hard an instruction leans on the next decision. */
const FIRM = 3.2;
const SOFT = 1.9;

export const ACTIONS = {
  follow:      { id: "follow",      label: "Follow",         nudge: { encourage: ["investigate_scent", "investigate_spot"], strength: FIRM } },
  wait:        { id: "wait",        label: "Wait",           nudge: { encourage: ["wait", "look_at_player"], strength: SOFT } },
  call_back:   { id: "call_back",   label: "Call her back",  nudge: { encourage: ["follow_player", "look_at_player"], discourage: ["investigate_scent", "chase"], strength: FIRM } },
  let_explore: { id: "let_explore", label: "Let her explore",nudge: { encourage: ["investigate_scent", "investigate_spot", "dig"], strength: FIRM } },
  encourage:   { id: "encourage",   label: "Encourage her",  nudge: { encourage: ["cross_crossing"], discourage: ["retreat"], strength: FIRM } },
  turn_back:   { id: "turn_back",   label: "Turn back",      nudge: { encourage: ["retreat", "wait"], strength: FIRM } },
  offer_treat: { id: "offer_treat", label: "Offer a treat",  care: "treat", nudge: { encourage: ["follow_player"], strength: SOFT } },
  comfort:     { id: "comfort",     label: "Comfort her",    care: "comfort", nudge: { encourage: ["wait"], strength: SOFT } },
  play:        { id: "play",        label: "Play with her",  nudge: { encourage: ["play", "splash"], strength: FIRM } },
  let_swim:    { id: "let_swim",    label: "Let her swim",   nudge: { encourage: ["splash"], strength: FIRM } },
  keep_going:  { id: "keep_going",  label: "Keep walking",   nudge: { encourage: ["follow_player", "investigate_spot"], strength: SOFT } },
  rest_here:   { id: "rest_here",   label: "Rest here",      nudge: { encourage: ["rest"], strength: FIRM } },
};

/**
 * Choose which actions to show. Order matters -- the most natural response
 * comes first, since §29 wants one-handed thumb operation.
 */
/**
 * What is worth offering right now.
 *
 * Rewritten to be sparing. The old version answered "what is legal here?" and
 * so the bar was never empty -- Keep walking / Let her explore / Call her back /
 * Head home sat there permanently, which made every moment look like a decision
 * and none of them feel like one. This answers "is there something to decide?",
 * and most of the time the honest answer is no: she is walking, you are walking,
 * nothing needs saying. Gestures cover the rest.
 */
export function contextualActions(state, ctx) {
  const dog = state.dog;
  const ids = [];

  // Frightened, or on the crossing she has not made yet -- the set piece.
  if (dog.emotion.fear > .3 || (SPOTS[dog.spot].crossing && !dog.hasCrossed)) {
    ids.push("encourage", "wait", "turn_back");
    if (dog.emotion.fear > .5) ids.push("comfort");
    return build(ids, state);
  }

  // Something has her nose down.
  if (ctx.strongestScent) {
    ids.push("follow", "wait", "call_back");
    if (state.playerModel.givesTreats > .6) ids.push("offer_treat");
    return build(ids, state);
  }

  // Water.
  if (ctx.hasStimulus("water")) {
    ids.push("let_swim", "keep_going", "call_back");
    return build(ids, state);
  }

  // Something to chase.
  if (ctx.preyId) {
    ids.push("call_back", "let_explore", "wait");
    return build(ids, state);
  }

  // Settled: sitting or lying down is an invitation.
  if (dog.behavior?.id === "rest") {
    ids.push("offer_treat", "play");
    return build(ids, state);
  }

  // Ordinary walking needs nothing said. Gestures are always available.
  return build([], state);
}

function build(ids, state) {
  return ids.map((id) => ({ ...ACTIONS[id], available: true })).slice(0, 5);
}
