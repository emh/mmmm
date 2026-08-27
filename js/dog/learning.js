/**
 * The dog's model of the player (PRD §9) and how experience updates it.
 *
 * This is the half of the relationship that usually goes missing: the dog is
 * also learning *you*. Her expectations of what you will do feed straight into
 * behaviour selection, so a player who always recalls gets a dog who checks in
 * before acting, and a player who always follows gets a confident explorer.
 */

import { clamp } from "./needs.js";

export function initialPlayerModel() {
  return {
    // Each is a rate in 0..1, seeded at "no idea yet" and moved by observation.
    permitsExploration: .5,
    recallsOften:       .5,
    givesTreats:        .5,
    followsCuriosity:   .5,
    respondsCalmly:     .5,
    interruptsChasing:  .5,
    playsOften:         .5,
    // How much evidence we have. Early expectations should be weakly held.
    observations: 0,
  };
}

/**
 * Nudge a tendency toward `toward`. Learning rate falls as evidence accumulates,
 * so early sessions move the model fast and later ones refine it.
 */
export function observe(model, key, toward) {
  const rate = Math.max(.06, .35 / (1 + model.observations * .06));
  return {
    ...model,
    [key]: clamp(model[key] + (toward - model[key]) * rate),
    observations: model.observations + 1,
  };
}

/** How confident the dog is that her model of you is right. */
export function modelConfidence(model) {
  return clamp(model.observations / 40);
}

/**
 * What the player's chosen action teaches the dog.
 *
 * Each entry maps an action to the tendencies it is evidence for. One action
 * can be evidence for several things at once.
 */
export const ACTION_LESSONS = {
  follow:      [["followsCuriosity", 1], ["permitsExploration", 1]],
  wait:        [["permitsExploration", .8], ["respondsCalmly", 1]],
  call_back:   [["recallsOften", 1], ["permitsExploration", 0], ["interruptsChasing", 1]],
  encourage:   [["respondsCalmly", 1], ["permitsExploration", .9]],
  turn_back:   [["respondsCalmly", .7], ["permitsExploration", .2]],
  let_explore: [["permitsExploration", 1], ["followsCuriosity", .9]],
  offer_treat: [["givesTreats", 1]],
  play:        [["playsOften", 1]],
  comfort:     [["respondsCalmly", 1]],
  keep_going:  [["permitsExploration", .7]],
};

export function learnFromAction(model, actionId) {
  const lessons = ACTION_LESSONS[actionId];
  if (!lessons) return model;
  return lessons.reduce((acc, [key, toward]) => observe(acc, key, toward), model);
}

/**
 * Expectation used by the utility formula (§7): given what she believes about
 * you, how likely is it that pursuing this behaviour goes well?
 *
 * Weighted by confidence, so a dog who barely knows you does not act on strong
 * assumptions.
 */
export function expectation(model, behaviorId) {
  const confidence = modelConfidence(model);
  const raw = rawExpectation(model, behaviorId);
  return 1 + (raw - 1) * confidence;
}

function rawExpectation(model, behaviorId) {
  switch (behaviorId) {
    case "investigate_scent":
    case "investigate_spot":
      // She commits to an investigation if you tend to let her.
      return .55 + model.permitsExploration * .55 + model.followsCuriosity * .35;
    case "chase":
      return .60 + (1 - model.interruptsChasing) * .70;
    case "look_at_player":
      // Checking in is *more* likely when she expects to be recalled.
      return .70 + model.recallsOften * .80;
    case "play":
      return .70 + model.playsOften * .55;
    case "cross_crossing":
      return .70 + model.respondsCalmly * .50;
    case "follow_player":
      return .80 + (1 - model.permitsExploration) * .35;
    default:
      return 1;
  }
}

/** Human-readable summary for the debug inspector (§37). */
export function describePlayerModel(model) {
  const label = (v) => (v > .72 ? "usually" : v > .55 ? "often" : v > .45 ? "sometimes" : v > .28 ? "rarely" : "almost never");
  return [
    `${label(model.permitsExploration)} lets her explore`,
    `${label(model.recallsOften)} calls her back`,
    `${label(model.followsCuriosity)} follows her curiosity`,
    `${label(model.givesTreats)} gives treats`,
    `${label(model.respondsCalmly)} stays calm`,
  ];
}
