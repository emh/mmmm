/**
 * PRD §32 MVP Scenario Test, run headlessly.
 *
 *   treat -> walk -> deer scent -> Follow -> antler -> walk on
 *   -> later walk -> shows interest in the same place, unprompted
 *
 * "If this interaction feels convincing, the central design is working."
 */
import { initialState, Events } from "../js/state.js";
import { Simulation } from "../js/simulation.js";
import { makeRng } from "../js/rng.js";
import { placeMemory, recall } from "../js/dog/memory.js";
import { perceive } from "../js/dog/perception.js";
import { chooseNextSpot } from "../js/world/encounters.js";
import { ACTIONS, contextualActions } from "../js/ui/actions.js";

const seed = Number(process.argv[2] || 20260826);
const rng = makeRng(seed);
const sim = new Simulation(initialState(seed), rng);
const say = (s) => console.log(s);

say(`\n=== §32 scenario, seed ${seed} ===\n`);

// 1. Player gives her a treat. (There is no home and no bowl -- §31's "feed"
//    is a treat on the trail now, and the scenario tests the same causal chain.)
sim.care("treat");
for (let i = 0; i < 8; i++) sim.tick();
say(`1. Treat given. hunger=${sim.state.dog.needs.hunger.toFixed(2)}  doing: ${sim.state.dog.behavior?.verb}`);

// 2-3. Walk the Cedar Trail.
sim.travelTo("cedar_trail");
say(`2-3. On ${sim.state.dog.place} at ${sim.state.dog.spot}`);

// 4. Get her to the fern hollow and ensure a deer scent is there.
sim.arriveAt("cedar_trail", "fern_hollow");
sim.dispatch(Events.setStimuli("fern_hollow", ["deer_scent"]));
const ctx = perceive(sim.state, rng);
say(`4. At ${ctx.spotName}, she notices: ${ctx.strongestScent}`);

// 5. Context actions appear.
const actions = contextualActions(sim.state, ctx);
say(`5. Actions offered: ${actions.map(a => a.label).join(" / ")}`);

// 6. Player follows.
sim.playerAction(ACTIONS.follow);
say(`6. Player follows. She is ${sim.state.dog.behavior?.verb}`);

// 7. Run until she investigates and maybe discovers.
let found = false;
for (let i = 0; i < 40 && !found; i++) {
  sim.tick();
  if ((sim.state.world.found.fern_hollow || []).length) found = true;
  if (!sim.state.dog.behavior && !found) {
    sim.dispatch(Events.setStimuli("fern_hollow", ["deer_scent"]));
    sim.playerAction(ACTIONS.follow);
  }
}
say(`7. Discovery at fern_hollow: ${found ? "ANTLER FOUND" : "nothing this time"}`);

// 8. Association formed.
const mem = placeMemory(sim.state.dog.memory, "fern_hollow");
say(`8. fern_hollow -> interesting=${mem.associations.interesting.toFixed(3)} familiarity=${mem.familiarity.toFixed(3)}`);
say(`   memories here: ${recall(sim.state.dog.memory, "fern_hollow").map(e => e.type).join(", ") || "none"}`);

// 9. Walk on; time passes.
sim.travelTo("gravel_loop");
for (let i = 0; i < 60; i++) sim.tick();
say(`9. Moved on. day=${sim.state.game.day}`);

// 10-11. A later walk: from the junction, where does she pull?
sim.travelTo("cedar_trail");
sim.arriveAt("cedar_trail", "junction");
const draws = {};
const trials = 400;
for (let i = 0; i < trials; i++) draws[chooseNextSpot(sim.state, makeRng(seed + i))] =
  (draws[chooseNextSpot(sim.state, makeRng(seed + i))] || 0) + 1;
const ranked = Object.entries(draws).sort((a, b) => b[1] - a[1]);
say(`10-11. From the junction, over ${trials} draws she goes:`);
for (const [spot, n] of ranked) say(`        ${spot.padEnd(14)} ${(n / trials * 100).toFixed(1)}%`);

// 12. Is the behaviour recognisably memory-driven?
const fernShare = (draws.fern_hollow || 0) / trials;
const others = ranked.filter(([s]) => s !== "fern_hollow").map(([, n]) => n / trials);
const topOther = Math.max(...others, 0);
say(`\n12. fern_hollow share ${(fernShare * 100).toFixed(1)}% vs next-best ${(topOther * 100).toFixed(1)}%`);

/*
 * The assertion is conditional, because discovery is meant to be uncertain.
 * What must hold is the *causal link*:
 *   found     -> a strong association AND a visible pull toward the spot
 *   not found -> no manufactured pull
 * A seed that finds nothing is a valid playthrough, not a failed test.
 */
let pass, verdict;
if (found) {
  pass = mem.associations.interesting > .4 && fernShare > topOther;
  verdict = pass
    ? "PASS — she found it, and the pull back is visible."
    : "FAIL — she found it, but the memory does not show up in behaviour.";
} else {
  pass = fernShare <= topOther + .02;
  verdict = pass
    ? "PASS (no discovery) — correctly shows no pull toward a place nothing happened."
    : "FAIL — a pull appeared without anything having happened there.";
}
say(`\n${verdict}\n`);
process.exit(pass ? 0 : 1);
