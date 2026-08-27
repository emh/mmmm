/**
 * The simulation loop (PRD §7 layer 1, §18).
 *
 * Pure local JavaScript, running continuously and never blocked on anything.
 * The AI layer, when it arrives in Phase 3, will be consulted *between* these
 * decisions -- it can never sit inside this loop (§25).
 */

import { Events, reduce } from "./state.js";
import { advanceNeeds, advanceDrives, clamp } from "./dog/needs.js";
import { BEHAVIORS } from "./dog/behavior.js";
import { selectBehavior } from "./dog/utility.js";
import { perceive, salience, describePerception } from "./dog/perception.js";
import { visitSpot, associate, remember, decayMemory, consolidate, learnStimulus, placeMemory } from "./dog/memory.js";
import { learnFromAction } from "./dog/learning.js";
import { rollStimuli, chooseNextSpot, maybeStartle } from "./world/encounters.js";
import { SPOTS, STIMULI, PLACES } from "./world/places.js";
import { expressedEmotion } from "./dog/dog.js";

/** How many simulated minutes one tick covers. */
export const MINUTES_PER_TICK = 2;

export class Simulation {
  constructor(state, rng) {
    this.state = state;
    this.rng = rng;
    this.lastTrace = null;       // most recent decision, for the inspector (§37)
    this.expressed = "neutral";
  }

  dispatch(event) {
    this.state = reduce(this.state, event);
    return this.state;
  }

  note(text, tone) {
    this.dispatch(Events.note(text, tone));
  }

  /* ------------------------------------------------------------ main tick */

  tick() {
    const before = this.state;
    this.dispatch(Events.tick(MINUTES_PER_TICK));

    // 1. Needs and drives advance.
    const dog = this.state.dog;
    const walking = !dog.behavior?.resting;
    const needs = advanceNeeds(dog.needs, MINUTES_PER_TICK, { walking });
    const drives = advanceDrives(dog.drives, MINUTES_PER_TICK, dog.traits);
    const emotion = settleEmotion(dog.emotion, MINUTES_PER_TICK);
    this.state = { ...this.state, dog: { ...this.state.dog, needs, drives, emotion } };

    // 2. Memory decays continuously; consolidation is periodic (§8.2, §8.3).
    if (this.state.game.tick % 30 === 0) {
      let memory = decayMemory(this.state.dog.memory, MINUTES_PER_TICK * 30);
      memory = consolidate(memory);
      this.dispatch(Events.replaceMemory(memory));
    }

    // 3. Finish or continue the current behaviour.
    if (this.state.dog.behavior) {
      const remaining = this.state.dog.behavior.ticksLeft - 1;
      if (remaining > 0) {
        this.dispatch(Events.beginBehavior({ ...this.state.dog.behavior, ticksLeft: remaining }));
        this.refreshExpression();
        return this.state;
      }
      this.completeBehavior();
    }

    // 4. Move if there is a reason to, then pick something new to do.
    if (!this.relocate()) this.decide();
    this.refreshExpression();
    return this.state;
  }

  /* ------------------------------------------------------------- movement */

  /**
   * Decide whether to go somewhere else before choosing a behaviour.
   *
   * Without this she stands wherever she was put: `eat` requires standing at
   * the bowl, so a fed dog would never reach her food, and a walk would never
   * progress along the trail. Needs pull her to a specific spot; otherwise the
   * exploration and curiosity drives make her drift.
   *
   * Returns true if she moved (which consumes the decision for this tick).
   */
  relocate() {
    const dog = this.state.dog;
    const target = this.neededSpot();

    if (target && target !== dog.spot) {
      this.arriveAt(dog.place, target);
      this.note(`Molly Mae goes to ${SPOTS[target].name}.`, "behavior");
      this.decide();
      return true;
    }

    // If the player is encouraging her across, she works her way back toward the
    // planks. Without this the whole §3 confidence arc is unreachable: she
    // retreats once, drifts off, and "Encourage her" has nothing to act on.
    // She still may not step on -- that is cross_crossing's decision, and fear
    // suppresses it -- but she has to be standing there to make it.
    const crossing = this.crossingSpot();
    if (crossing && dog.spot !== crossing &&
        this.state.interaction.nudge?.encourage?.includes("cross_crossing")) {
      this.arriveAt(dog.place, crossing);
      this.note("She comes back to the edge of the planks.", "plain");
      this.decide();
      return true;
    }

    // Nothing pressing -- drift, driven by how much is left to explore here.
    const ctx = perceive(this.state, this.rng);
    const restless = dog.drives.exploration * .5 + dog.drives.curiosity * .3;
    const nothingHere = ctx.stimuli.length === 0 ? .25 : 0;
    // Standing at an uncrossed crossing is a moment, not a place to drift out of.
    if (SPOTS[dog.spot].crossing && !dog.hasCrossed) return false;
    if (this.rng.chance(restless * .22 + nothingHere)) {
      const next = chooseNextSpot(this.state, this.rng);
      if (next !== dog.spot) {
        this.arriveAt(dog.place, next);
        this.decide();
        return true;
      }
    }
    return false;
  }

  /** The crossing spot in the current place, if there is one. */
  crossingSpot() {
    return PLACES[this.state.dog.place].spots.find((id) => SPOTS[id].crossing) || null;
  }

  /** The spot that would satisfy her most pressing need, if one is pressing. */
  neededSpot() {
    const { needs, place } = this.state.dog;
    const here = PLACES[place].spots;
    const wants = [];

    // She drinks where there is water; there is nowhere else to go for it.
    if (needs.thirst > .40) wants.push(["creek_edge", needs.thirst], ["shallows", needs.thirst]);

    const reachable = wants
      .filter(([spot]) => here.includes(spot))
      .sort((a, b) => b[1] - a[1]);
    return reachable.length ? reachable[0][0] : null;
  }

  refreshExpression() {
    this.expressed = expressedEmotion(this.state.dog.emotion, this.expressed);
  }

  /* --------------------------------------------------------- decision step */

  decide() {
    const ctx = perceive(this.state, this.rng);
    const { chosen, scored, shortlist } = selectBehavior(ctx);
    this.lastTrace = { ctx, scored, shortlist, chosen, source: "local" };

    if (!chosen) {
      this.dispatch(Events.beginBehavior({ id: "wait", ticksLeft: 1, verb: "waiting" }));
      return;
    }

    const spec = chosen.spec;
    const ticks = Math.max(1, Math.round(spec.minutes / MINUTES_PER_TICK));
    this.dispatch(Events.beginBehavior({
      id: spec.id,
      ticksLeft: ticks,
      verb: spec.verb(ctx),
      resting: spec.id === "rest",
    }));
    // Only narrate a genuine change of activity -- §15 prefers animation and
    // posture over running commentary.
    if (spec.id !== this.narratedBehavior) {
      this.note(`Molly Mae is ${spec.verb(ctx)}.`, "behavior");
      this.narratedBehavior = spec.id;
    }
  }

  completeBehavior() {
    const behaviorId = this.state.dog.behavior.id;
    const spec = BEHAVIORS[behaviorId];
    if (!spec) return;

    const ctx = perceive(this.state, this.rng);
    const result = spec.apply(ctx);
    this.dispatch(Events.applyBehavior(result));

    // Memory updates from what just happened.
    let memory = visitSpot(this.state.dog.memory, this.state.dog.spot);
    for (const event of result.events || []) {
      memory = remember(memory, { ...event, spot: event.spot || this.state.dog.spot, tick: this.state.game.tick });
      if (event.subject) memory = learnStimulus(memory, event.subject, event.valence * .25);
    }
    this.dispatch(Events.replaceMemory(memory));

    if (result.discovered) this.onDiscovery(result.discovered);
    if (result.crossed) {
      this.note(this.state.dog.hasCrossed
        ? "She trots across without breaking stride."
        : "She is across. She did not look back.", "good");
      let m = associate(this.state.dog.memory, "plank_span", "frightening", -.26);
      m = associate(m, "plank_span", "safe", +.22);
      this.dispatch(Events.replaceMemory(m));
      this.dispatch(Events.replaceMemory(m));
    }

    this.dispatch(Events.beginBehavior(null));
    if (result.moveTo) this.dispatch(Events.moveTo(null, result.moveTo));
  }

  onDiscovery(thing) {
    const spot = this.state.dog.spot;
    const label = STIMULI[thing]?.label || thing;
    this.note(`She has found ${label}.`, "discovery");
    let memory = associate(this.state.dog.memory, spot, "interesting", +.34);
    memory = associate(memory, spot, "safe", +.12);
    memory = remember(memory, {
      spot, type: "found_object", subject: thing,
      valence: .8, importance: .95, tick: this.state.game.tick,
    });
    this.dispatch(Events.replaceMemory(memory));
    this.state = {
      ...this.state,
      dog: { ...this.state.dog, emotion: { ...this.state.dog.emotion, valence: clamp(this.state.dog.emotion.valence + .45, -1, 1), arousal: clamp(this.state.dog.emotion.arousal + .25) } },
    };
  }

  /* --------------------------------------------------------- world motion */

  /** Drift to another spot in the current place. */
  wander() {
    const next = chooseNextSpot(this.state, this.rng);
    if (next === this.state.dog.spot) return;
    this.arriveAt(this.state.dog.place, next);
  }

  arriveAt(placeId, spotId) {
    this.dispatch(Events.moveTo(placeId, spotId));
    const stimuli = rollStimuli(spotId, this.rng, this.state);
    this.dispatch(Events.setStimuli(spotId, stimuli));

    const startle = maybeStartle(this.state, this.rng);
    if (startle) {
      this.dispatch(Events.setStimuli(spotId, [...stimuli, startle]));
      this.startle();
    }
    this.dispatch(Events.beginBehavior(null));
  }

  startle() {
    const dog = this.state.dog;
    const fear = clamp(dog.emotion.fear + .55 * (1.4 - dog.traits.boldness));
    this.state = {
      ...this.state,
      dog: { ...dog, emotion: { ...dog.emotion, fear, arousal: clamp(dog.emotion.arousal + .4) } },
    };
    /*
     * How much a fright teaches her depends on what she already believes about
     * the place. The first bad moment somewhere unknown is formative; the same
     * noise somewhere she has crossed happily a dozen times is startling but
     * not revelatory. Without this taper a single re-fright wipes out several
     * successful crossings and the §3 arc cannot converge.
     */
    const here = placeMemory(dog.memory, dog.spot);
    const taper = 1 - here.associations.safe * .6 - (dog.hasCrossed ? .2 : 0);
    const impact = Math.max(.08, .30 * taper);

    let memory = associate(dog.memory, dog.spot, "frightening", +impact);
    memory = associate(memory, dog.spot, "safe", -impact * .5);
    memory = remember(memory, {
      spot: dog.spot, type: "frightened", subject: "loud_noise",
      valence: -.7, importance: .85, tick: this.state.game.tick,
    });
    this.dispatch(Events.replaceMemory(memory));
    this.note("Something cracks in the trees. She freezes.", "alarm");
    // The face must follow immediately -- a startled dog still wearing a happy
    // face is the single most legibility-destroying bug in this design.
    this.refreshExpression();
  }

  travelTo(placeId) {
    // Arrive at the place's first spot. A hardcoded map silently breaks every
    // time a location is added, and fails deep inside stimulus rolling rather
    // than at the call.
    const entry = PLACES[placeId].spots[0];
    this.arriveAt(placeId, entry);
    this.note(`You walk to ${PLACES[placeId].name}.`, "plain");
  }

  /* -------------------------------------------------------- player action */

  playerAction(action) {
    this.dispatch(Events.playerAction(action.id));
    this.dispatch(Events.replacePlayerModel(learnFromAction(this.state.playerModel, action.id)));

    if (action.care) this.dispatch(Events.care(action.care));
    if (action.nudge) {
      this.dispatch(Events.setNudge({ ...action.nudge, expires: this.state.game.tick + 6 }));
    }
    this.note(`You: ${action.label.toLowerCase()}.`, "player");

    // An instruction is a decision point -- re-decide now rather than waiting.
    this.dispatch(Events.beginBehavior(null));
    this.decide();
    this.refreshExpression();
  }

  care(kind) {
    this.dispatch(Events.care(kind));
    this.dispatch(Events.replacePlayerModel(learnFromAction(this.state.playerModel, kind)));
    this.note(`You ${kind} her.`, "player");
  }

  /* ------------------------------------------------------------- elapsed */

  /**
   * Resume after the tab was suspended (§18). Bounded and gentle -- the game is
   * about companionship, not punishment for being away.
   */
  applyElapsed(realMs) {
    const minutes = Math.min(realMs / 60000, 12 * 60);   // cap at 12h of change
    if (minutes < 1) return;
    const dog = this.state.dog;
    const needs = advanceNeeds(dog.needs, minutes * .35, { walking: false });
    const drives = advanceDrives(dog.drives, minutes * .5, dog.traits);
    let memory = decayMemory(dog.memory, minutes);
    memory = consolidate(memory);
    this.state = {
      ...this.state,
      dog: { ...dog, needs, drives, memory, emotion: settleEmotion(dog.emotion, minutes) },
    };
    if (minutes > 60) this.note("She gets up to meet you at the door.", "good");
  }

  get salience() {
    return salience(perceive(this.state, this.rng));
  }
}

/** Emotions are short-lived and return toward baseline (§6.3). */
function settleEmotion(emotion, minutes) {
  const rate = minutes / 45;
  return {
    arousal: clamp(emotion.arousal + (.25 - emotion.arousal) * Math.min(1, rate)),
    valence: clamp(emotion.valence + (.20 - emotion.valence) * Math.min(1, rate * .7), -1, 1),
    // Fear fades slowly on purpose. If it evaporates in a few ticks, the §3
    // confidence arc collapses into a formality -- the player never has to be
    // patient, and "she doesn't like this bridge" never becomes true.
    fear:    clamp(emotion.fear * Math.max(0, 1 - rate * .22)),
  };
}
