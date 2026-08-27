/**
 * What the park offers moment to moment (PRD §10).
 *
 * Stimuli are rolled when Molly Mae arrives somewhere, so a spot is not the
 * same twice. A dense world with overlapping sensory layers matters more than a
 * big one -- the same five spots should keep producing new combinations.
 */

import { SPOTS, STIMULI, reachableSpots, PLACES } from "./places.js";

/** Roll the stimuli present at a spot on arrival. */
export function rollStimuli(spotId, rng, state) {
  const spec = SPOTS[spotId];
  const present = [];
  for (const entry of spec.stimuli || []) {
    let chance = entry.chance;
    // Weather and time nudge what's about (§38 open question, kept simple here).
    if (state.world.weather === "rain" && STIMULI[entry.id].scent) chance *= .6;
    if (rng.chance(chance)) present.push(entry.id);
  }
  // Something she has already found stays found, and stops being a discovery.
  const found = state.world.found[spotId] || [];
  return [...present, ...found];
}

/**
 * Where she drifts next inside a place. Weighted by how interesting she finds
 * each spot -- which is where place memory turns into visible behaviour, and
 * what makes the §32 scenario read as memory-driven rather than scripted.
 */
export function chooseNextSpot(state, rng) {
  const dog = state.dog;
  const options = reachableSpots(dog.place, dog.hasCrossed).filter((id) => id !== dog.spot);
  if (!options.length) return dog.spot;

  return rng.weighted(options, (id) => {
    const mem = dog.memory.places[id];
    let weight = 1;
    if (mem) {
      /*
       * Memory dominates where she goes. §8 makes it the progression system --
       * the park turning from unknown wilderness into a map of things that
       * happened -- so a place where something real happened has to outweigh
       * ordinary novelty by a clear margin, or the discovery never shows up in
       * behaviour and the whole system is invisible.
       */
      weight += mem.associations.interesting * 3.4;
      weight -= mem.associations.frightening * 2.0;
      weight += (1 - mem.familiarity) * .45;             // novelty
    } else {
      weight += .8;                                      // never been -- worth a look
    }
    const draws = SPOTS[id].draws || {};
    for (const [drive, amount] of Object.entries(draws)) {
      weight += (dog.drives[drive] ?? 0) * amount * .9;
    }
    return Math.max(.05, weight);
  });
}

/**
 * A startling event can happen while she is on a crossing (§3, §31).
 *
 * The chance falls away as the place becomes familiar. A fright is meant to be
 * a formative event she carries forward, not a recurring tax on the same spot:
 * at a flat rate she gets re-frightened faster than patient encouragement can
 * rebuild her confidence, and the arc §3 describes can never close.
 */
export function maybeStartle(state, rng) {
  // Which spot is the crossing is the world's business, not this function's.
  // It was the plank span; it is the fallen log now, and it will be both once
  // the boardwalk comes back.
  if (!SPOTS[state.dog.spot]?.crossing) return null;

  const memory = state.dog.memory.places[state.dog.spot];
  const familiarity = memory ? memory.familiarity : 0;
  const safety = memory ? memory.associations.safe : .3;

  let chance = .35 * (1 - familiarity * .85) * (1 - safety * .5);
  if (state.dog.hasCrossed) chance *= .3;

  return rng.chance(Math.max(0, chance)) ? "loud_noise" : null;
}

export const placeName = (id) => PLACES[id].name;
