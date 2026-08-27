/**
 * The tap cycle.
 *
 * A tap must always do something. The mechanic it replaces could not: tapping
 * asked the utility model to "settle", `rest` was the only behaviour that
 * answered it, and `rest` mapped to lying down -- so she never sat, and once
 * down a tap had nothing left to say.
 *
 * What must hold:
 *   - on the move, a tap stops her and she looks back
 *   - every further tap changes the pose; none is ever a no-op
 *   - from sitting or lying she gets up, always
 *   - sitting, lying, standing and looking back are all reachable
 */
import { initialState, Events } from "../js/state.js";
import { Simulation } from "../js/simulation.js";
import { makeRng } from "../js/rng.js";
import { gestureToIntent } from "../js/ui/gestures.js";
import { poseForBehaviour, nextPosture } from "../js/ui/animator.js";

const TAPS = 14;
const seen = new Set();
let stuck = 0, notUp = 0, trials = 12;

for (let seed = 1; seed <= trials; seed++) {
  const sim = new Simulation(initialState(seed), makeRng(seed));
  const rng = makeRng(seed + 900);

  sim.dispatch(Events.setPace("walk"));
  for (let i = 0; i < 10; i++) sim.tick();

  // Tap 1, on the move: she stops and looks back.
  let intent = gestureToIntent({ type: "tap" }, sim.state);
  sim.dispatch(Events.setPace(intent.pace));
  sim.dispatch(Events.setPosture(intent.posture));
  let pose = poseForBehaviour(sim.state);
  if (seed === 1) console.log(`tap 1 (on the move) -> pace=${sim.state.interaction.pace} pose=${pose}`);
  seen.add(pose);

  const trail = [pose];
  for (let n = 0; n < TAPS; n++) {
    const before = sim.state.interaction.posture;
    intent = gestureToIntent({ type: "tap" }, sim.state);
    if (!intent.cyclePosture) { stuck++; break; }
    const to = nextPosture(before, rng.float);
    sim.dispatch(Events.setPosture(to));
    sim.tick();

    const now = poseForBehaviour(sim.state);
    if (now === trail[trail.length - 1]) stuck++;
    // Down means down, and facing you has one way out: the next tap is stand,
    // with no choice about it.
    if ((before === "sit" || before === "lie" || before === "turn180") && to !== "stand") notUp++;
    trail.push(now);
    seen.add(now);
  }
  if (seed === 1) console.log("cycle:", trail.join(" -> "));
}

console.log(`\nposes reached: ${[...seen].sort().join(", ")}`);
console.log(`taps that changed nothing: ${stuck}   failed to get up / turn back: ${notUp}`);

const reachable = ["glance", "lie", "sit", "stand", "turn180"].every((p) => seen.has(p));
console.log(reachable && !stuck && !notUp
  ? "PASS -- every tap lands, and she sits as well as lying down"
  : "FAIL");
process.exit(reachable && !stuck && !notUp ? 0 : 1);
