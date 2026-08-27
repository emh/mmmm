/**
 * Wiring (PRD §20).
 *
 * Owns the loop, the save cadence and the input surface. Everything
 * game-relevant lives in the modules this imports; this file should stay thin.
 */

import { initialState, Events } from "./state.js";
import { Simulation, MINUTES_PER_TICK } from "./simulation.js";
import { makeRng, freshSeed } from "./rng.js";
import { perceive, salience } from "./dog/perception.js";
import { ACTIONS } from "./ui/actions.js";
import { render, placeDog, offTrailFor } from "./ui/render.js";
import { Animator } from "./ui/animator.js";
import { Gestures, gestureToIntent, intentToAction } from "./ui/gestures.js";
import { Corridor } from "./ui/corridor.js";
import { renderInspector } from "./ui/debug.js";
import { save, load, clear } from "./storage.js";
import { PLACES } from "./world/places.js";

const TICK_MS = 1400;          // one decision beat; deliberately unhurried
const root = document;

let sim;
let timer = null;
let debugOn = new URLSearchParams(location.search).has("debug");

/* ------------------------------------------------------------------ boot */

async function boot() {
  const saved = await load();
  const seed = saved?.game?.seed ?? freshSeed();
  const rng = makeRng(saved?.game?.rngState ?? seed);

  sim = new Simulation(saved || initialState(seed), rng);

  if (saved) {
    // §18: bounded, gentle catch-up. Never punish absence.
    sim.applyElapsed(Date.now() - (saved.game.lastSimulationTimestamp || Date.now()));
    sim.note("You're back.", "plain");
  } else {
    sim.note("Molly Mae is asleep by the door.", "plain");
  }

  /*
   * The corridor animates on its own clock. The simulation ticks every 1.4s,
   * which is the right pace for decisions and completely wrong for motion --
   * driving the visuals off it is what made her look like a cardboard cutout.
   */
  sim.corridor = new Corridor(root.querySelector("#corridor"), {
    count: 46,
    rand: makeRng(sim.state.game.seed).float,
    set: PLACES[sim.state.dog.place].scenery,
  });
  sim.animator = await Animator.load(root.querySelector("#dog"));

  // Camera state. These must be initialised: `undefined + speed * dt` is NaN,
  // which silently freezes the world while every other reading looks correct.
  sim.herZ = 2.4;
  sim.travelled = 0;
  sim.speed = 0;
  sim.yaw = 0;

  /*
   * Gestures share the simulation path with the buttons: both produce a nudge
   * and let her own utility model choose (§2.1). So the dog learns the same
   * thing about the player either way (§9).
   */
  sim.gestures = new Gestures(root.querySelector("#scene"), (g) => {
    const intent = gestureToIntent(g, sim.state);
    if (!intent) return;
    sim.dispatch(Events.setPace(intent.pace));

    const action = intentToAction(intent);
    if (action) onAction(action);
  });

  startAnimation();
  bindControls();
  start();
  draw();

  // §37: a handle for reproducing simulation bugs from the console. Dev only.
  if (debugOn || location.hostname === "localhost") {
    window.__molly = {
      sim,
      go: (place, spot) => { sim.arriveAt(place, spot); draw(); },
      tick: (n = 1) => { for (let i = 0; i < n; i++) sim.tick(); draw(); },
      go_to: (place) => { sim.travelTo(place); draw(); },
      places: () => Object.keys(PLACES),
      trace: () => sim.lastTrace,
      state: () => sim.state,
    };
  }
}

function start() {
  if (timer) return;
  timer = setInterval(() => { sim.tick(); draw(); }, TICK_MS);
}

function stop() {
  clearInterval(timer);
  timer = null;
}

/* --------------------------------------------------------------- animation */

let rafId = null;
let clock = 0;

function startAnimation() {
  let last = performance.now();
  const ground = root.querySelector("#ground");

  const frame = (now) => {
    const dt = Math.min((now - last) / 1000, 0.1);   // clamp after a tab stall
    last = now;
    clock += dt;

    /*
     * Pace comes from the animator, which gets it from the clip the simulation
     * asked for. So the world only moves when she is actually walking, and it
     * moves at the speed of the gait she chose -- an amble, a trot, or a
     * chase. Standing and sniffing stops the world, which is the whole point
     * of a follow camera.
     */
    sim.animator.update(dt, sim.travelled);
    const target = sim.animator.pace;
    sim.speed = (sim.speed ?? 0) + (target - (sim.speed ?? 0)) * (1 - Math.pow(0.12, dt));
    sim.travelled += sim.speed * dt;

    // The camera turns to keep her in view when she leaves the trail (§15A.2).
    const targetYaw = offTrailFor(sim.state) * 0.42;
    sim.yaw = (sim.yaw ?? 0) + (targetYaw - (sim.yaw ?? 0)) * (1 - Math.pow(0.06, dt));

    // Surface and scenery follow the place, so somewhere new looks new
    // underfoot and beside the trail, not just behind it.
    const place = PLACES[sim.state.dog.place];
    sim.corridor.setScenery(place.scenery || "forest");
    if (ground && sim.groundKind !== place.ground) {
      sim.groundKind = place.ground || "trail";
      ground.style.backgroundImage = `url("assets/scene/ground-${sim.groundKind}.png")`;
      // Texture scale is per surface: gravel and planks are much finer-grained
      // than a packed-earth trail, and one global scale makes boardwalk planks
      // come out the size of railway sleepers.
      ground.style.backgroundSize = `${place.groundScale || 38}% auto`;
    }
    sim.corridor.setRail(!!place.rail);

    sim.corridor.update(dt, sim.speed, sim.yaw);
    placeDog(root, sim, clock);

    if (ground) {
      ground.style.backgroundPositionY = `${(sim.travelled * 34).toFixed(1)}px`;
      ground.style.backgroundPositionX = `${(-sim.yaw * 120).toFixed(1)}px`;
    }
    const backdrop = root.querySelector("#backdrop");
    if (backdrop) backdrop.style.transform = `translateX(${(-sim.yaw * 5).toFixed(2)}%)`;

    rafId = requestAnimationFrame(frame);
  };
  rafId = requestAnimationFrame(frame);
}

function stopAnimation() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
}

/* ------------------------------------------------------------------ draw */

function draw() {
  render(root, sim);

  /*
   * No action bar. Everything it offered is a gesture now -- call her back,
   * send her on, wait, a hand on her, a treat, take a turning -- and a row of
   * labelled verbs read like a command menu in a game whose premise is that
   * you influence rather than command (§2.1).
   */

  root.body.classList.toggle("debug", debugOn);
  if (debugOn) renderInspector(root.querySelector("#inspector"), sim);
}

/* ---------------------------------------------------------------- input */

function onAction(action) {
  sim.playerAction(action);
  draw();
  persist();
}

function bindControls() {
  // Dev controls are hidden unless asked for.
  const corner = root.querySelector("#corner");
  if (new URLSearchParams(location.search).has("dev")) corner.hidden = false;
  root.querySelector("#toggle-debug").onclick = () => { debugOn = !debugOn; draw(); };

  root.querySelector("#reset").onclick = async () => {
    if (!confirm("Forget Molly Mae and start over? Her memories will be lost.")) return;
    await clear();
    location.reload();
  };

  addEventListener("keydown", (e) => {
    if (e.key === "d") { debugOn = !debugOn; corner.hidden = false; draw(); }
  });

  // §22: persist on visibility change, and stop simulating in the background.
  addEventListener("visibilitychange", () => {
    if (document.hidden) { stop(); stopAnimation(); persist(); }
    else {
      sim.applyElapsed(Date.now() - sim.state.game.lastSimulationTimestamp);
      start(); startAnimation(); draw();
    }
  });
}

/* -------------------------------------------------------------- persist */

let saveQueued = false;
function persist() {
  if (saveQueued) return;
  saveQueued = true;
  setTimeout(async () => {
    saveQueued = false;
    if (!sim) return;                 // nothing to save if boot never finished
    sim.dispatch(Events.setRngState(sim.rng.snapshot()));
    await save(sim.state);
  }, 400);
}

// Periodic checkpoint (§22).
setInterval(persist, 20000);

/*
 * A failed boot used to be silent: `boot` is async, so anything it threw became
 * an unhandled rejection, and the first visible symptom was the periodic save
 * tripping over an undefined `sim` twenty seconds later -- which points nowhere
 * near the actual fault. Say so immediately instead.
 */
boot().catch((err) => {
  console.error("boot failed", err);
  const scene = root.querySelector("#scene");
  if (scene) {
    scene.insertAdjacentHTML("beforeend",
      `<pre style="position:absolute;inset:8px;z-index:99;overflow:auto;color:#E8B98A;
        background:rgba(20,24,16,.92);padding:10px;font:11px/1.4 ui-monospace,monospace;
        white-space:pre-wrap">boot failed

${(err && err.stack) || err}</pre>`);
  }
});
