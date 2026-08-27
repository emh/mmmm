import { initialState, Events } from "../js/state.js";
import { Simulation } from "../js/simulation.js";
import { makeRng } from "../js/rng.js";
import { gestureToIntent, intentToAction } from "../js/ui/gestures.js";
import { poseForBehaviour } from "../js/ui/animator.js";

let settled = 0, trials = 12;
for (let seed = 1; seed <= trials; seed++) {
  const sim = new Simulation(initialState(seed), makeRng(seed));
  // Walk her a while so she is roused, as she would be in play.
  sim.dispatch(Events.setPace("walk"));
  for (let i = 0; i < 10; i++) sim.tick();

  // tap 1 -> stop
  let intent = gestureToIntent({ type: "tap" }, sim.state);
  sim.dispatch(Events.setPace(intent.pace));
  sim.playerAction(intentToAction(intent));
  for (let i = 0; i < 3; i++) sim.tick();
  const afterTap1 = sim.state.dog.behavior?.id;

  // tap 2 -> settle
  intent = gestureToIntent({ type: "tap" }, sim.state);
  const isSettle = !!intent.settle;
  sim.dispatch(Events.setPace(intent.pace));
  sim.playerAction(intentToAction(intent));

  let got = null;
  for (let i = 0; i < 8 && !got; i++) {
    sim.tick();
    if (sim.state.dog.behavior?.id === "rest") got = poseForBehaviour(sim.state);
  }
  if (got) settled++;
  if (seed <= 4) {
    console.log(`seed ${String(seed).padEnd(2)} tap1->${String(afterTap1).padEnd(15)} ` +
                `tap2 is settle=${isSettle}  arousal=${sim.state.dog.emotion.arousal.toFixed(2)}  ` +
                `-> ${got ? "rest, pose=" + got : "did NOT settle"}`);
  }
}
console.log(`\nsettled in ${settled}/${trials} trials`);
process.exit(settled >= trials * 0.8 ? 0 : 1);
