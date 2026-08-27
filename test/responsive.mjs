import { initialState, Events } from "../js/state.js";
import { Simulation } from "../js/simulation.js";
import { makeRng } from "../js/rng.js";
import { gestureToIntent, intentToAction } from "../js/ui/gestures.js";
import { poseForBehaviour } from "../js/ui/animator.js";

// From a standing start with a scent underfoot, does asking her on get her moving?
let moved = 0, trials = 20;
for (let seed = 1; seed <= trials; seed++) {
  const sim = new Simulation(initialState(seed), makeRng(seed));
  sim.arriveAt("cedar_trail", "fern_hollow");
  sim.dispatch(Events.setStimuli("fern_hollow", ["deer_scent"]));
  const intent = gestureToIntent({ type: "sendon" }, sim.state);
  sim.dispatch(Events.setPace(intent.pace));
  sim.playerAction(intentToAction(intent));
  let walked = false;
  for (let i = 0; i < 3 && !walked; i++) {
    const pose = poseForBehaviour(sim.state);
    if (pose === "walk" || pose === "trot" || pose === "gallop") walked = true;
    sim.tick();
  }
  if (walked) moved++;
}
console.log(`sets off within 3 ticks of being asked: ${moved}/${trials}`);
