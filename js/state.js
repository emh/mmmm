/**
 * One explicit state tree and pure reducer transitions (PRD §21).
 *
 *   nextState = reduce(state, event)
 *
 * Keeping every change funnelled through here is what makes autonomous
 * behaviour reproducible, testable, saveable and debuggable -- which matters
 * more than usual in a game that deliberately hides its internals from the
 * player (§37).
 */

import { initialDog } from "./dog/dog.js";
import { initialMemory } from "./dog/memory.js";
import { initialPlayerModel } from "./dog/learning.js";
import { clamp } from "./dog/needs.js";

export const SAVE_VERSION = 1;

export function initialState(seed) {
  const dog = initialDog();
  dog.memory = initialMemory();
  return {
    game: {
      version: SAVE_VERSION,
      seed,
      rngState: seed,
      tick: 0,
      minutes: 7 * 60,            // start at 7am
      day: 1,
      lastSimulationTimestamp: Date.now(),
    },
    dog,
    world: {
      weather: "clear",
      stimuli: {},                // spotId -> [stimulusId]
      found: {},                  // spotId -> [discovered thing]
      bowlHasFood: false,
      visitedPlaces: ["home"],
    },
    playerModel: initialPlayerModel(),
    interaction: {
      context: null,              // what the player is being asked about
      actions: [],
      nudge: null,                // { encourage:[], discourage:[], strength, expires }
      playerSupported: false,
      log: [],                    // recent observable events, newest last
    },
  };
}

/* ------------------------------------------------------------------ events */

export const Events = {
  tick:          (minutes) => ({ type: "TICK", minutes }),
  setStimuli:    (spot, stimuli) => ({ type: "SET_STIMULI", spot, stimuli }),
  beginBehavior: (behavior) => ({ type: "BEGIN_BEHAVIOR", behavior }),
  applyBehavior: (result) => ({ type: "APPLY_BEHAVIOR", result }),
  moveTo:        (place, spot) => ({ type: "MOVE_TO", place, spot }),
  playerAction:  (action) => ({ type: "PLAYER_ACTION", action }),
  setContext:    (context, actions) => ({ type: "SET_CONTEXT", context, actions }),
  setNudge:      (nudge) => ({ type: "SET_NUDGE", nudge }),
  note:          (text, tone) => ({ type: "NOTE", text, tone }),
  care:          (kind) => ({ type: "CARE", kind }),
  replaceMemory: (memory) => ({ type: "REPLACE_MEMORY", memory }),
  replacePlayerModel: (model) => ({ type: "REPLACE_PLAYER_MODEL", model }),
  setRngState:   (rngState) => ({ type: "SET_RNG_STATE", rngState }),
};

/* ----------------------------------------------------------------- reducer */

export function reduce(state, event) {
  switch (event.type) {
    case "TICK": {
      const minutes = state.game.minutes + event.minutes;
      return {
        ...state,
        game: {
          ...state.game,
          tick: state.game.tick + 1,
          minutes: minutes % (24 * 60),
          day: state.game.day + Math.floor(minutes / (24 * 60)),
          lastSimulationTimestamp: Date.now(),
        },
        interaction: {
          ...state.interaction,
          nudge: expireNudge(state.interaction.nudge, state.game.tick + 1),
        },
      };
    }

    case "SET_STIMULI":
      return {
        ...state,
        world: { ...state.world, stimuli: { ...state.world.stimuli, [event.spot]: event.stimuli } },
      };

    case "BEGIN_BEHAVIOR":
      return { ...state, dog: { ...state.dog, behavior: event.behavior } };

    case "APPLY_BEHAVIOR":
      return applyBehaviorResult(state, event.result);

    case "MOVE_TO": {
      const place = event.place || state.dog.place;
      const visited = state.world.visitedPlaces.includes(place)
        ? state.world.visitedPlaces
        : [...state.world.visitedPlaces, place];
      return {
        ...state,
        dog: { ...state.dog, place, spot: event.spot, walking: place !== "home" },
        world: { ...state.world, visitedPlaces: visited },
      };
    }

    case "SET_CONTEXT":
      return {
        ...state,
        interaction: { ...state.interaction, context: event.context, actions: event.actions },
      };

    case "SET_NUDGE":
      return { ...state, interaction: { ...state.interaction, nudge: event.nudge } };

    case "PLAYER_ACTION":
      return {
        ...state,
        interaction: {
          ...state.interaction,
          playerSupported: ["follow", "let_explore", "encourage", "wait"].includes(event.action),
        },
      };

    case "CARE":
      return applyCare(state, event.kind);

    case "NOTE": {
      // Collapse consecutive repeats. She goes on walking with you for many
      // ticks; saying so six times reads as a stuck game, not a calm one.
      const log = state.interaction.log;
      const last = log[log.length - 1];
      if (last && last.text === event.text) {
        return {
          ...state,
          interaction: {
            ...state.interaction,
            log: [...log.slice(0, -1), { ...last, tick: state.game.tick, repeats: (last.repeats || 1) + 1 }],
          },
        };
      }
      return {
        ...state,
        interaction: {
          ...state.interaction,
          log: [...log, { text: event.text, tone: event.tone || "plain", tick: state.game.tick }].slice(-40),
        },
      };
    }

    case "REPLACE_MEMORY":
      return { ...state, dog: { ...state.dog, memory: event.memory } };

    case "REPLACE_PLAYER_MODEL":
      return { ...state, playerModel: event.model };

    case "SET_RNG_STATE":
      return { ...state, game: { ...state.game, rngState: event.rngState } };

    default:
      return state;
  }
}

/* ----------------------------------------------------------------- helpers */

function expireNudge(nudge, tick) {
  if (!nudge) return null;
  return tick >= nudge.expires ? null : nudge;
}

function applyBehaviorResult(state, result) {
  let dog = state.dog;
  let world = state.world;

  if (result.needs)   dog = { ...dog, needs: addClamped(dog.needs, result.needs) };
  if (result.drives)  dog = { ...dog, drives: addClamped(dog.drives, result.drives) };
  if (result.emotion) dog = { ...dog, emotion: addEmotion(dog.emotion, result.emotion) };
  if (result.crossed) dog = { ...dog, hasCrossed: true };
  if (result.ateFood) world = { ...world, bowlHasFood: false };

  if (result.discovered) {
    const existing = world.found[dog.spot] || [];
    world = { ...world, found: { ...world.found, [dog.spot]: [...existing, result.discovered] } };
  }
  if (result.moveTo) dog = { ...dog, spot: result.moveTo };

  return { ...state, dog, world };
}

function applyCare(state, kind) {
  let dog = state.dog;
  let world = state.world;
  switch (kind) {
    case "feed":     world = { ...world, bowlHasFood: true }; break;
    case "water":    dog = { ...dog, needs: addClamped(dog.needs, { thirst: -.9 }) }; break;
    case "treat":
      dog = { ...dog, needs: addClamped(dog.needs, { hunger: -.15 }),
                      emotion: addEmotion(dog.emotion, { valence: +.3, arousal: +.1 }) };
      break;
    case "comfort":
      dog = { ...dog, emotion: addEmotion(dog.emotion, { fear: -.35, arousal: -.2, valence: +.15 }) };
      break;
    case "groom":
      dog = { ...dog, emotion: addEmotion(dog.emotion, { valence: +.2, arousal: -.15 }) };
      break;
  }
  return { ...state, dog, world };
}

function addClamped(base, deltas) {
  const next = { ...base };
  for (const [key, delta] of Object.entries(deltas)) next[key] = clamp((next[key] || 0) + delta);
  return next;
}

function addEmotion(base, deltas) {
  return {
    arousal: clamp((base.arousal || 0) + (deltas.arousal || 0)),
    valence: clamp((base.valence || 0) + (deltas.valence || 0), -1, 1),
    fear:    clamp((base.fear    || 0) + (deltas.fear    || 0)),
  };
}
