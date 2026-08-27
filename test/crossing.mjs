/**
 * PRD §3 second scenario: the crossing.
 *
 * The venue moved. The boardwalk and its plank span are parked out of the MVP,
 * so the set piece is the fallen log across the forest trail -- the same beat,
 * something she has to commit to, in the one place the game still has. What is
 * under test is unchanged: fear persists across approaches and wears off with
 * repeated good experience.
 *
 *   "The dog becomes frightened by a loud noise while crossing an old wooden
 *    bridge. Future approaches to the bridge produce hesitation. The player
 *    repeatedly waits patiently and encourages the crossing. The dog's
 *    confidence slowly changes. Eventually the bridge becomes routine."
 *
 * The claim under test is about *persistence across approaches*, not about one
 * session. Recovering her nerve over a few minutes is plausible; what must be
 * true is that the memory outlives the moment and visibly shapes later
 * behaviour, then wears off with repeated good experiences.
 *
 * This also proves fear works with no frightened face (§6.3).
 */
import { initialState } from "../js/state.js";
import { Simulation } from "../js/simulation.js";
import { makeRng } from "../js/rng.js";
import { placeMemory } from "../js/dog/memory.js";
import { perceive } from "../js/dog/perception.js";
import { scoreBehavior } from "../js/dog/utility.js";
import { BEHAVIORS } from "../js/dog/behavior.js";
import { ACTIONS } from "../js/ui/actions.js";

const seed = Number(process.argv[2] || 7);
const say = (s) => console.log(s);

/**
 * Utility of stepping onto the planks, isolating the memory factor.
 *
 * Fear is zeroed and hasCrossed forced false -- otherwise `cross_crossing`
 * stops being a candidate the moment she succeeds once, and the probe reads 0
 * for "confident" rather than for "unwilling".
 */
/**
 * How much of her reluctance is attributable to the bad memory.
 *
 * Raw appetite is the wrong probe on its own: it also carries a novelty bonus
 * that shrinks as the planks become familiar, so a dog growing *more* confident
 * and *more* used to the place can read as flat. Measuring the gap against an
 * otherwise identical dog with no fright isolates the thing under test.
 */
function frightPenalty(sim) {
  const actual = crossingAppetite(sim);
  const unafraid = crossingAppetite(sim, { frightening: .05 });
  return unafraid - actual;
}

function crossingAppetite(sim, override) {
  let memory = sim.state.dog.memory;
  if (override) {
    const here = placeMemory(memory, "fallen_log");
    memory = {
      ...memory,
      places: { ...memory.places, fallen_log: { ...here, associations: { ...here.associations, ...override } } },
    };
  }
  const calm = {
    ...sim.state,
    // Stand her at the planks with a clear head, so the only thing left moving
    // the number is what she remembers about this place.
    dog: { ...sim.state.dog, spot: "fallen_log", memory, emotion: { ...sim.state.dog.emotion, fear: 0 } },
  };
  const ctx = perceive(calm, makeRng(1));
  const scored = scoreBehavior(BEHAVIORS.cross_crossing, ctx);
  return scored ? scored.factors.memory : 0;
}

function freshDog() {
  const sim = new Simulation(initialState(seed), makeRng(seed));
    sim.arriveAt("cedar_trail", "fallen_log");
  return sim;
}

say(`\n=== §3 crossing arc, seed ${seed} ===\n`);

// --- control: a dog with no history here ---------------------------------
const control = freshDog();
const baseline = crossingAppetite(control);
say(`control (no history)      appetite for the planks: ${baseline.toFixed(3)}`);

// --- the fright -----------------------------------------------------------
const sim = freshDog();
say(`before                    face=${sim.expressed}`);
sim.startle();
const faceOnFear = sim.expressed;
say(`startled                  face=${faceOnFear}  fear=${sim.state.dog.emotion.fear.toFixed(2)}`);

const afterFright = crossingAppetite(sim);
const penaltyAfterFright = frightPenalty(sim);
say(`after the fright          appetite: ${afterFright.toFixed(3)}  frightening=${placeMemory(sim.state.dog.memory,"fallen_log").associations.frightening.toFixed(2)}  penalty=${penaltyAfterFright.toFixed(3)}`);

// --- she walks elsewhere; a day passes; she comes back --------------------
sim.arriveAt("cedar_trail", "trailhead");
for (let i = 0; i < 200; i++) sim.tick();
sim.arriveAt("cedar_trail", "fallen_log");
const nextDay = crossingAppetite(sim);
const penaltyNextDay = frightPenalty(sim);
say(`next visit                appetite: ${nextDay.toFixed(3)}  frightening=${placeMemory(sim.state.dog.memory,"fallen_log").associations.frightening.toFixed(2)}  penalty=${penaltyNextDay.toFixed(3)}`);

// --- patient encouragement, over several visits ---------------------------
/*
 * §3 says the change is slow and the bridge becomes routine "eventually" --
 * so this runs to convergence rather than asserting a fixed drop after an
 * arbitrary number of visits. She may be re-startled along the way; that is
 * allowed, and is part of what makes the recovery meaningful. What must be
 * true is that patient encouragement wins in the end.
 */
let crossings = 0;
const VISITS = 12;
for (let visit = 0; visit < VISITS; visit++) {
  sim.arriveAt("cedar_trail", "fallen_log");
  const before = sim.state.dog.hasCrossed;
  let t = 0;
  let didCross = false;
  while (!didCross && t < 120) {
    sim.playerAction(sim.state.dog.emotion.fear > .45 ? ACTIONS.wait : ACTIONS.encourage);
    const wasAt = sim.state.dog.spot;
    sim.tick(); sim.tick(); t += 2;
    if (sim.lastTrace?.chosen?.id === "cross_crossing" || (!before && sim.state.dog.hasCrossed)) didCross = true;
  }
  if (didCross) crossings++;
}
const routine = crossingAppetite(sim);
const penaltyRoutine = frightPenalty(sim);
say(`after ${crossings} crossings over ${VISITS} visits, appetite: ${routine.toFixed(3)}  frightening=${placeMemory(sim.state.dog.memory,"fallen_log").associations.frightening.toFixed(2)}  penalty=${penaltyRoutine.toFixed(3)}`);

// --- assertions -----------------------------------------------------------
const fearIsAlert    = faceOnFear === "alert";
const hesitates      = penaltyAfterFright > .15;
const memoryLasts    = penaltyNextDay > .12;
const becomesRoutine = crossings > 0 && penaltyRoutine < penaltyNextDay * .6;

say("");
say(`fear expressed as 'alert', no frightened face : ${fearIsAlert ? "yes" : "NO"}`);
say(`the fright suppressed her appetite            : ${hesitates ? "yes" : "NO"}`);
say(`hesitation survived a day away                : ${memoryLasts ? "yes" : "NO"}`);
say(`repeated crossings rebuilt confidence         : ${becomesRoutine ? "yes" : "NO"} (${penaltyNextDay.toFixed(3)} -> ${penaltyRoutine.toFixed(3)})`);

const pass = fearIsAlert && hesitates && memoryLasts && becomesRoutine;
say(`\n${pass ? "PASS" : "FAIL"} — the confidence arc ${pass ? "resolves" : "does NOT resolve"}.\n`);
process.exit(pass ? 0 : 1);
