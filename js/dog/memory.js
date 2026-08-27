/**
 * Dog memory (PRD §8) -- the game's main progression system.
 *
 * There are no levels. Progression is the accumulation of familiarity, place
 * association, learned stimulus valence, and shared history. The park is meant
 * to turn from unknown wilderness into a map of things that happened.
 */

import { clamp } from "./needs.js";

export function initialMemory() {
  return {
    places: {},      // spotId -> { familiarity, associations }
    events: [],      // recent episodic memories, decayed and pruned
    stimuli: {},     // stimulusId -> learned valence adjustment
    nextEventId: 1,
  };
}

const blankPlace = () => ({
  familiarity: 0,
  associations: { safe: .3, interesting: .3, frightening: .05 },
});

export function placeMemory(memory, spotId) {
  return memory.places[spotId] || blankPlace();
}

/** Visiting a spot builds familiarity on a decelerating curve. */
export function visitSpot(memory, spotId) {
  const current = placeMemory(memory, spotId);
  return {
    ...memory,
    places: {
      ...memory.places,
      [spotId]: { ...current, familiarity: clamp(current.familiarity + (1 - current.familiarity) * .18) },
    },
  };
}

export function associate(memory, spotId, association, delta) {
  const current = placeMemory(memory, spotId);
  return {
    ...memory,
    places: {
      ...memory.places,
      [spotId]: {
        ...current,
        associations: {
          ...current.associations,
          [association]: clamp(current.associations[association] + delta),
        },
      },
    },
  };
}

/** Learned stimulus valence, layered on top of the stimulus's default (§6.5). */
export function stimulusBias(memory, stimulusId) {
  return memory.stimuli[stimulusId] || 0;
}

export function learnStimulus(memory, stimulusId, delta) {
  return {
    ...memory,
    stimuli: {
      ...memory.stimuli,
      [stimulusId]: clamp(stimulusBias(memory, stimulusId) + delta, -1, 1),
    },
  };
}

export function remember(memory, event) {
  const record = {
    id: `evt_${memory.nextEventId}`,
    importance: .5,
    valence: 0,
    ...event,
  };
  return {
    ...memory,
    events: [...memory.events, record],
    nextEventId: memory.nextEventId + 1,
  };
}

/**
 * Decay (§8.2). Low-importance memories fade; repeated, emotional or reinforced
 * ones persist. This is what separates a passing experience from a habit.
 */
export function decayMemory(memory, minutes) {
  const rate = minutes / (24 * 60);
  const events = memory.events
    .map((e) => ({ ...e, importance: e.importance - rate * .12 * (1 - Math.abs(e.valence)) }))
    .filter((e) => e.importance > .08)
    .slice(-60);                       // hard cap; consolidation handles the rest

  const places = {};
  for (const [id, mem] of Object.entries(memory.places)) {
    places[id] = {
      familiarity: Math.max(0, mem.familiarity - rate * .004),
      // Slow on purpose: §8.2 wants repeated, emotional memories to persist.
      // A strong association should survive a week away and fade over months,
      // not wash out in a few days.
      associations: {
        safe:        drift(mem.associations.safe, .3, rate * .010),
        interesting: drift(mem.associations.interesting, .3, rate * .012),
        frightening: drift(mem.associations.frightening, .05, rate * .008),
      },
    };
  }
  return { ...memory, events, places };
}

/** Pull a value gently back toward its resting baseline. */
function drift(value, baseline, amount) {
  if (value > baseline) return Math.max(baseline, value - amount);
  return Math.min(baseline, value + amount);
}

/**
 * Consolidation (§8.3). Several similar events at one spot collapse into a
 * durable place association, then stop occupying episodic slots.
 *
 * The PRD allows an LLM to assist here; the local version is deliberately
 * sufficient on its own so Phase 1 needs no network.
 */
export function consolidate(memory) {
  const bySpot = {};
  for (const event of memory.events) {
    if (!event.spot) continue;
    (bySpot[event.spot] ||= []).push(event);
  }

  let next = memory;
  const absorbed = new Set();
  for (const [spotId, events] of Object.entries(bySpot)) {
    if (events.length < 3) continue;
    const mean = events.reduce((sum, e) => sum + e.valence, 0) / events.length;
    next = associate(next, spotId, mean >= 0 ? "interesting" : "frightening", Math.abs(mean) * .30);
    if (mean >= 0) next = associate(next, spotId, "safe", mean * .18);
    // Keep the most important one as the story; the rest become the association.
    const keep = events.reduce((best, e) => (e.importance > best.importance ? e : best));
    events.forEach((e) => { if (e.id !== keep.id) absorbed.add(e.id); });
  }
  return { ...next, events: next.events.filter((e) => !absorbed.has(e.id)) };
}

/** Memories relevant to a spot, most important first -- used by the inspector and the AI layer. */
export function recall(memory, spotId, limit = 5) {
  return memory.events
    .filter((e) => e.spot === spotId)
    .sort((a, b) => b.importance - a.importance)
    .slice(0, limit);
}
