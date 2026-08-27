/**
 * The behaviour catalogue (PRD §7 layer 2).
 *
 * Each behaviour knows when it is a candidate, how long it takes, and what it
 * does to the dog and the world. Scoring lives in utility.js; this file is the
 * vocabulary of things Molly Mae can actually do.
 *
 * Critical rule from §7: the engine owns reality. Nothing here -- and nothing
 * the AI layer may later suggest -- can invent a spot, stimulus or capability
 * that is not present in the current state.
 */

import { STIMULI, SPOTS } from "../world/places.js";

/**
 * A behaviour spec:
 *   id            stable identifier
 *   verb(ctx)     short present-tense description shown to the player
 *   candidate(ctx) whether it may be considered right now
 *   minutes       how long it occupies her
 *   drive         which drive it primarily serves (for utility weighting)
 *   apply(ctx)    returns { needs?, drives?, emotion?, memory?, events? }
 */
export const BEHAVIORS = {
  drink: {
    id: "drink", drive: "thirst", minutes: 2,
    verb: () => "drinking",
    candidate: (c) => c.hasStimulus("water") && c.needs.thirst > .12,
    apply: () => ({ needs: { thirst: -.9 }, emotion: { valence: +.1 } }),
  },
  rest: {
    id: "rest", drive: "fatigue", minutes: 25,
    verb: () => "lying down",
    candidate: (c) => c.needs.fatigue > .35,
    apply: (c) => ({
      needs: { fatigue: -.45 },
      emotion: { arousal: -.3, valence: +.05, fear: -.15 },
    }),
  },
  investigate_scent: {
    id: "investigate_scent", drive: "curiosity", minutes: 5,
    verb: (c) => `nose down in ${c.spotName}`,
    candidate: (c) => c.scents.length > 0,
    apply: (c) => {
      const scent = c.strongestScent;
      const found = c.rng.chance(discoveryChance(c, scent));
      return {
        drives: { curiosity: -.45, exploration: -.15 },
        emotion: { arousal: +.15, valence: +.12 },
        discovered: found ? "antler" : null,
        events: [{
          spot: c.spot, type: "investigated", subject: scent,
          valence: found ? .8 : .2, importance: found ? .9 : .3,
        }],
      };
    },
  },
  investigate_spot: {
    id: "investigate_spot", drive: "curiosity", minutes: 4,
    verb: (c) => `sniffing around ${c.spotName}`,
    candidate: () => true,
    apply: (c) => ({
      drives: { curiosity: -.25, exploration: -.20 },
      emotion: { arousal: +.05 },
      events: [{ spot: c.spot, type: "visited", valence: .05, importance: .12 }],
    }),
  },
  chase: {
    id: "chase", drive: "prey", minutes: 3,
    verb: (c) => `chasing ${c.preyLabel}`,
    candidate: (c) => c.hasStimulus("squirrel") || c.hasStimulus("frog"),
    apply: (c) => ({
      needs: { fatigue: +.06 },
      drives: { prey: -.75, play: -.2 },
      emotion: { arousal: +.4, valence: +.3 },
      events: [{ spot: c.spot, type: "chased", subject: c.preyId, valence: .45, importance: .35 }],
    }),
  },
  play: {
    id: "play", drive: "play", minutes: 6,
    verb: (c) => (c.hasStimulus("stick") ? "tossing a stick around" : "bouncing about"),
    candidate: (c) => c.drives.play > .35,
    apply: (c) => ({
      needs: { fatigue: +.05 },
      drives: { play: -.7 },
      emotion: { arousal: +.3, valence: +.45 },
      events: [{ spot: c.spot, type: "played", valence: .5, importance: .3 }],
    }),
  },
  splash: {
    id: "splash", drive: "play", minutes: 8,
    verb: () => "wading in the creek",
    candidate: (c) => c.hasStimulus("water") && c.drives.play > .25,
    apply: () => ({
      needs: { thirst: -.3, fatigue: +.05 },
      drives: { play: -.6 },
      emotion: { arousal: +.25, valence: +.5 },
      events: [{ spot: "creek_edge", type: "swam", valence: .6, importance: .45 }],
    }),
  },
  dig: {
    id: "dig", drive: "curiosity", minutes: 4,
    verb: () => "digging",
    candidate: (c) => !SPOTS[c.spot].crossing && c.drives.curiosity > .5,
    apply: () => ({ drives: { curiosity: -.3 }, emotion: { arousal: +.2, valence: +.2 } }),
  },
  greet: {
    id: "greet", drive: "social", minutes: 4,
    verb: (c) => (c.hasStimulus("hiker") ? "saying hello to a hiker" : "reading another dog's mark"),
    candidate: (c) => c.hasStimulus("hiker") || c.hasStimulus("dog_scent"),
    apply: () => ({
      drives: { social: -.6 },
      emotion: { arousal: +.15, valence: +.25 },
      events: [{ spot: null, type: "social", valence: .3, importance: .2 }],
    }),
  },
  follow_player: {
    id: "follow_player", drive: "attachment", minutes: 3,
    verb: () => "walking with you",
    candidate: () => true,
    apply: () => ({ emotion: { arousal: -.05, fear: -.08 } }),
  },
  look_at_player: {
    id: "look_at_player", drive: "attachment", minutes: 1,
    verb: () => "looking back at you",
    candidate: () => true,
    apply: () => ({ emotion: { arousal: +.05 } }),
  },
  cross_crossing: {
    id: "cross_crossing", drive: "exploration", minutes: 4,
    verb: (c) => (c.hasCrossed ? "crossing the planks" : "stepping onto the planks"),
    // Crossing is a repeatable act, not a one-time unlock. `hasCrossed` only
    // records that she has managed it at least once (which opens the far bank);
    // gating the behaviour on it meant confidence could never be rebuilt by
    // doing the thing again, which is exactly how §3 says it should be rebuilt.
    candidate: (c) => SPOTS[c.spot].crossing,
    apply: (c) => ({
      emotion: { fear: -.2, valence: +.35, arousal: +.1 },
      crossed: true,
      events: [{ spot: c.spot, type: "crossed", valence: .55, importance: .8 }],
    }),
  },
  retreat: {
    id: "retreat", drive: "security", minutes: 2,
    verb: () => "backing away",
    candidate: (c) => c.emotion.fear > .25,
    /*
     * Retreating records nothing.
     *
     * It is her coping response, not a fresh bad experience -- the startle is
     * the memory. Writing a negative event here created a doom loop: afraid ->
     * retreat -> three retreats consolidate into a stronger `frightening`
     * association -> more afraid. Fear compounded faster than patient
     * encouragement could undo it, so the §3 arc could never close.
     */
    apply: (c) => ({
      emotion: { fear: -.12, arousal: -.1, valence: -.05 },
      moveTo: c.retreatSpot,
    }),
  },
  wait: {
    id: "wait", drive: "security", minutes: 2,
    verb: () => "waiting",
    candidate: () => true,
    apply: () => ({ emotion: { arousal: -.1, fear: -.05 } }),
  },
};

/**
 * Whether an investigation turns up something real.
 *
 * The §32 scenario hinges on this: following her into the fern hollow on a deer
 * scent should sometimes produce the antler. Player support raises the odds,
 * which is what makes "I followed her and she found something" feel earned
 * rather than random.
 */
function discoveryChance(c, scentId) {
  if (c.spotHasTreasure) return 0;            // already found here
  if (scentId !== "deer_scent") return .03;
  let chance = .22;
  if (c.playerSupported) chance += .30;       // player chose Follow / Let her explore
  chance += c.traits.persistence * .15;
  return Math.min(.75, chance);
}

export const behavior = (id) => BEHAVIORS[id];
export const allBehaviors = () => Object.values(BEHAVIORS);
