/**
 * Utility-based behaviour selection (PRD §7 layer 2).
 *
 *   utility = drive_weight
 *           × personality_bias
 *           × environmental_relevance
 *           × memory_association
 *           × learned_expectation
 *           × situational_modifier
 *           + bounded_noise
 *
 * Every factor is kept separate rather than collapsed into one number, because
 * §36 requires that any behaviour be explainable after the fact -- and §37 wants
 * the breakdown visible in the inspector. If the dog ever looks random, this
 * trace is how we prove it wasn't.
 */

import { BEHAVIORS, OFF_TRAIL, OFF_TRAIL_ENABLED } from "./behavior.js";
import { placeMemory, stimulusBias } from "./memory.js";
import { expectation } from "./learning.js";
import { STIMULI, SPOTS } from "../world/places.js";

/** How strongly each behaviour's governing drive is currently felt. */
function driveWeight(spec, ctx) {
  const { drives, emotion } = ctx;
  switch (spec.drive) {
    case "curiosity":  return .20 + drives.curiosity * 1.6;
    case "play":       return .15 + drives.play * 1.5;
    case "prey":       return .10 + drives.prey * 1.9;
    case "social":     return .15 + drives.social * 1.4;
    case "exploration":return .20 + drives.exploration * 1.4;
    case "security":   return .10 + emotion.fear * 2.6 + drives.security * 1.2;
    /*
     * Settling is not a security behaviour.
     *
     * `rest` was weighted off `security`, which sits near zero unless she is
     * frightened -- so lying down scored about 0.16 against looking at you at
     * 1.0, and asking her to settle could never win however hard it nudged.
     * What actually makes a dog lie down is being calm, so weight it off the
     * absence of arousal.
     */
    case "settle":     return .25 + (1 - emotion.arousal) * 1.7;
    case "attachment": return .35 + (1 - ctx.traits.independence) * .9;
    default:           return 1;
  }
}

/** Traits bias behaviour without determining it (§6.4). */
function personalityBias(spec, traits) {
  switch (spec.id) {
    case "investigate_scent":
    case "investigate_spot":
    case "dig":              return .5 + traits.curiosity * 1.0;
    case "chase":            return .4 + traits.playfulness * .7 + traits.boldness * .6;
    case "play":
    case "splash":           return .5 + traits.playfulness * 1.0;
    case "greet":            return .4 + traits.sociability * 1.1;
    case "cross_crossing":   return .25 + traits.boldness * 1.3;
    case "retreat":          return 1.5 - traits.boldness * .8;
    case "follow_player":    return .5 + (1 - traits.independence) * 1.0;
    case "look_at_player":   return .4 + (1 - traits.independence) * 1.1;
    default:                 return 1;
  }
}

/** Does the environment actually afford this right now? */
function environmentalRelevance(spec, ctx) {
  const here = SPOTS[ctx.spot];
  switch (spec.id) {
    case "investigate_scent": {
      if (!ctx.strongestScent) return 0;
      const s = STIMULI[ctx.strongestScent];
      return .3 + s.interest * 1.3;
    }
    case "chase": {
      const prey = ctx.preyId ? STIMULI[ctx.preyId] : null;
      return prey ? .3 + prey.interest * 1.4 : 0;
    }
    case "splash":  return ctx.hasStimulus("water") ? 1.6 : 0;
    case "play":    return ctx.hasStimulus("stick") ? 1.5 : .7;
    case "greet":   return ctx.hasStimulus("hiker") ? 1.4 : 1.0;
    case "rest":    return .9;
    case "cross_crossing": return here.crossing ? 1.2 : 0;
    default: {
      // Generic: does this spot pull on the drive this behaviour serves?
      const draw = (here.draws || {})[spec.drive];
      return draw ? .8 + draw : .9;
    }
  }
}

/**
 * What she remembers about here, and about this kind of thing.
 *
 * A frightening association suppresses everything except retreat and waiting;
 * an interesting one lifts investigation. This is the factor that makes the
 * §32 scenario legible -- the pull back toward the antler spot lives here.
 */
function memoryAssociation(spec, ctx) {
  const mem = placeMemory(ctx.memory, ctx.spot);
  const { interesting, frightening, safe } = mem.associations;

  if (spec.id === "retreat" || spec.id === "wait") {
    return .6 + frightening * 1.8;
  }
  let value = .55 + interesting * .9 + safe * .35 - frightening * 1.1;

  if (spec.id === "investigate_scent" && ctx.strongestScent) {
    value += stimulusBias(ctx.memory, ctx.strongestScent) * .8;
  }
  if (spec.id === "chase" && ctx.preyId) {
    value += stimulusBias(ctx.memory, ctx.preyId) * .8;
  }
  // Novelty: an unfamiliar spot is interesting in itself.
  if (spec.drive === "curiosity" || spec.drive === "exploration") {
    value += (1 - mem.familiarity) * .45;
  }
  return Math.max(.05, value);
}

/** Situational overrides -- fear, exhaustion, the player's last instruction. */
function situationalModifier(spec, ctx) {
  let m = 1;

  // Fear narrows the option set hard. A frightened dog does not play.
  if (ctx.emotion.fear > .35) {
    if (["play", "splash", "dig", "chase", "investigate_scent"].includes(spec.id)) m *= .25;
  }
  // Stepping onto something that frightened her is graded by how afraid she is
  // right now, not a single threshold -- so encouragement works progressively
  // as she settles, rather than flipping on at an arbitrary line.
  if (spec.id === "cross_crossing") m *= Math.max(.04, 1 - ctx.emotion.fear * 1.35);
  /*
   * When the player has asked her to stop, she stops.
   *
   * Not absolutely -- she can still look back, settle, or notice something --
   * but she does not wander off down the trail, and she does not start working
   * at a scent. Without this "stop" only stopped her feet: she carried on
   * choosing errands, so opening the app found her mid-investigation rather
   * than waiting for you.
   */
  const TRAVELLING = ["follow_player", "cross_crossing"];
  const ERRANDS = ["investigate_scent", "investigate_spot", "dig", "splash",
                   "play", "greet", "chase"];

  if (ctx.pace === "stop") {
    if ([...TRAVELLING, ...ERRANDS].includes(spec.id)) m *= .12;
    if (["wait", "look_at_player", "rest", "retreat"].includes(spec.id)) m *= 2.4;
  } else {
    /*
     * Asked on, she goes on.
     *
     * The stop case was made authoritative and the walk case was not, so a
     * scent at the trailhead simply outscored walking and she turned side-on
     * the moment you asked her to move -- which reads as the game ignoring
     * you. Asking is still an ask: a strong enough scent can win, and a run
     * suppresses errands harder than a walk does, because a dog at a gallop is
     * not stopping to sniff.
     */
    const run = ctx.pace === "run";
    const asked = !!ctx.nudge?.encourage?.includes(spec.id);
    /*
     * The pace is a standing preference, not a leash.
     *
     * A hard damp on errands made her set off promptly and then walk past
     * everything -- responsive, and dull. The sharp push to get her moving
     * comes from the nudge the gesture fires, which expires after a few ticks;
     * what remains is a mild lean toward carrying on, so a good scent can still
     * stop her mid-walk. A run leans harder, because a dog at a gallop really
     * is not stopping to sniff.
     */
    if (TRAVELLING.includes(spec.id)) m *= run ? 2.2 : 1.35;
    /*
     * A specific instruction beats the general pace.
     *
     * "Follow" and "let her explore" exist precisely to release her to a
     * scent, and the walking pace was damping the very thing they asked for --
     * so telling her to go and look made her *less* likely to. The pace is the
     * default; a nudge naming this behaviour is the exception to it.
     */
    if (ERRANDS.includes(spec.id) && !asked) m *= run ? .35 : .82;
    if (["wait", "rest"].includes(spec.id) && !asked) m *= .35;
  }

  // A recent player instruction biases the next choice without forcing it (§2.1).
  if (ctx.nudge) {
    if (ctx.nudge.encourage?.includes(spec.id)) m *= ctx.nudge.strength;
    if (ctx.nudge.discourage?.includes(spec.id)) m *= 1 / ctx.nudge.strength;
  }
  // Don't immediately repeat what she just finished.
  if (ctx.lastBehavior === spec.id && spec.id !== "follow_player") m *= .35;

  // Needs that have become urgent override the ambient pull of the forest.

  return m;
}

/** Score one behaviour, keeping every factor for the inspector. */
export function scoreBehavior(spec, ctx) {
  // Parked behaviours are refused before candidacy, so they never place and
  // never show up in the inspector as a near-miss she was tempted by.
  if (!OFF_TRAIL_ENABLED && OFF_TRAIL.has(spec.id)) return null;
  if (!spec.candidate(ctx)) return null;

  const factors = {
    drive:       driveWeight(spec, ctx),
    personality: personalityBias(spec, ctx.traits),
    environment: environmentalRelevance(spec, ctx),
    memory:      memoryAssociation(spec, ctx),
    expectation: expectation(ctx.playerModel, spec.id),
    situational: situationalModifier(spec, ctx),
  };
  if (factors.environment <= 0) return null;

  const product = factors.drive * factors.personality * factors.environment
                * factors.memory * factors.expectation * factors.situational;
  const noise = ctx.rng.noise(.12);

  return { id: spec.id, spec, factors, noise, utility: Math.max(0, product + noise) };
}

export function scoreAll(ctx) {
  return Object.values(BEHAVIORS)
    .map((spec) => scoreBehavior(spec, ctx))
    .filter(Boolean)
    .sort((a, b) => b.utility - a.utility);
}

/**
 * Choose among the strong candidates rather than always taking the argmax (§7).
 * That is what produces a recognisable personality that is still not mechanical.
 */
export function selectBehavior(ctx) {
  const scored = scoreAll(ctx);
  if (!scored.length) return { chosen: null, scored: [] };

  const best = scored[0].utility;
  const shortlist = scored.filter((s) => s.utility >= best * .62).slice(0, 4);
  const chosen = ctx.rng.weighted(shortlist, (s) => Math.pow(s.utility, 2.4));

  return { chosen, scored, shortlist };
}
