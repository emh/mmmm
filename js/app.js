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
import { contextualActions, contextLine, ACTIONS } from "./ui/actions.js";
import { render, renderActions, placeDog, isTravelling, offTrailFor } from "./ui/render.js";
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
  });
  sim.herZ = 2.4;
  sim.travelled = 0;
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

/** A comfortable walking pace, metres per second. */
const PACE = 1.3;

function startAnimation() {
  let last = performance.now();
  const ground = root.querySelector("#ground");

  const frame = (now) => {
    const dt = Math.min((now - last) / 1000, 0.1);   // clamp after a tab stall
    last = now;
    clock += dt;

    // She only travels when she is actually going somewhere. Standing and
    // sniffing stops the world, which is the whole point of a follow camera.
    const travelling = isTravelling(sim.state);
    sim.speed = (sim.speed ?? 0) + ((travelling ? PACE : 0) - (sim.speed ?? 0)) * (1 - Math.pow(0.12, dt));
    sim.travelled += sim.speed * dt;

    // The camera turns to keep her in view when she leaves the trail (§15A.2).
    const targetYaw = offTrailFor(sim.state) * 0.42;
    sim.yaw = (sim.yaw ?? 0) + (targetYaw - (sim.yaw ?? 0)) * (1 - Math.pow(0.06, dt));

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

  const ctx = perceive(sim.state, sim.rng);
  const actions = contextualActions(sim.state, ctx);
  const line = contextLine(sim.state, ctx);
  renderActions(root, actions, line, onAction);

  renderTravel();

  root.body.classList.toggle("debug", debugOn);
  if (debugOn) renderInspector(root.querySelector("#inspector"), sim);
}

/** Higher-level navigation (§14) -- no joystick, no steering. */
function renderTravel() {
  const el = root.querySelector("#travel");
  const here = sim.state.dog.place;
  el.innerHTML = "";
  for (const id of PLACES[here].connects) {
    const b = document.createElement("button");
    b.className = "travel-btn";
    b.textContent = PLACES[id].name;
    b.onclick = () => { sim.travelTo(id); draw(); persist(); };
    el.appendChild(b);
  }
}

/* ---------------------------------------------------------------- input */

function onAction(action) {
  sim.playerAction(action);
  draw();
  persist();
}

function bindControls() {
  for (const btn of root.querySelectorAll("[data-care]")) {
    btn.onclick = () => { sim.care(btn.dataset.care); draw(); persist(); };
  }

  root.querySelector("#toggle-debug").onclick = () => { debugOn = !debugOn; draw(); };

  root.querySelector("#reset").onclick = async () => {
    if (!confirm("Forget Molly Mae and start over? Her memories will be lost.")) return;
    await clear();
    location.reload();
  };

  addEventListener("keydown", (e) => {
    if (e.key === "d") { debugOn = !debugOn; draw(); }
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
