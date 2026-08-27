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
import { render, placeDog, offTrailFor, attentionSide } from "./ui/render.js";
import { Animator, nextPosture } from "./ui/animator.js";
import { Gestures, gestureToIntent, intentToAction } from "./ui/gestures.js";
import { Corridor } from "./ui/corridor.js";
import { renderInspector } from "./ui/debug.js";
import { save, load, clear } from "./storage.js";
import { PLACES } from "./world/places.js";
import { Trail } from "./world/trail.js";
import { TrailMap } from "./world/trailmap.js";
import { TrailPath } from "./ui/trailpath.js";
import { assetList, preload } from "./ui/preload.js";
import { Sound } from "./ui/sound.js";


const TICK_MS = 1400;          // one decision beat; deliberately unhurried
const root = document;

let sim;
let timer = null;
let debugOn = new URLSearchParams(location.search).has("debug");

/* ------------------------------------------------------------------ boot */

async function boot() {
  /*
   * Start fetching the scene before anything else, and run it alongside the
   * save load rather than after it -- they need nothing from each other.
   */
  const bar = document.querySelector("#loading-bar");
  const assets = assetList().then((urls) => preload(urls, (n, total) => {
    bar?.style.setProperty("--progress", `${(n / total * 100).toFixed(0)}%`);
  }));

  const saved = await load();
  const seed = saved?.game?.seed ?? freshSeed();
  const rng = makeRng(saved?.game?.rngState ?? seed);

  sim = new Simulation(saved || initialState(seed), rng);

  /*
   * However the last session ended, she starts a new one standing on the trail.
   * A second after the scene appears she turns to face you -- see `greet` --
   * so the first thing that happens is her noticing you have arrived, rather
   * than a pose that was already finished before you could see it.
   *
   * Forced rather than left to the saved state: what she happened to be doing
   * when the app was last closed is not how you should find her.
   */
  sim.dispatch(Events.setPace("stop"));
  sim.dispatch(Events.setPosture("stand"));

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
  /*
   * The park itself: a network of junctions and the trails between them,
   * generated once from the game seed so the same walk always lays out the same
   * park (§37). Its own random stream, kept apart from the scenery's, so a
   * change to the map does not reshuffle every fern.
   */
  const mapRng = makeRng(sim.state.game.seed ^ 0x5eed).float;
  sim.map = new TrailMap(mapRng);
  sim.trail = new Trail(sim.map, mapRng);

  sim.corridor = new Corridor(root.querySelector("#corridor"), {
    count: 46,
    rand: makeRng(sim.state.game.seed).float,
    set: PLACES[sim.state.dog.place].scenery,
    clearance: (s) => sim.trail.clearance(s),
  });
  sim.animator = await Animator.load(root.querySelector("#dog"));
  sim.path = new TrailPath(root.querySelector("#path"),
                           root.querySelector("#ground-wrap"),
                           root.querySelector("#scene"));

  // Camera state. These must be initialised: `undefined + speed * dt` is NaN,
  // which silently freezes the world while every other reading looks correct.
  sim.herZ = 2.4;
  sim.travelled = 0;
  sim.speed = 0;
  sim.yaw = 0;
  sim.asking = null;          // the junction she is waiting on an answer at

  /*
   * The forest. Silent until a gesture starts it -- browsers will not begin
   * audio on their own, and nothing here is created before that.
   */
  sim.sound = new Sound();

  /*
   * Gestures share the simulation path with the buttons: both produce a nudge
   * and let her own utility model choose (§2.1). So the dog learns the same
   * thing about the player either way (§9).
   */
  /*
   * Start the audio from the raw touch, not from the finished gesture.
   *
   * The gesture callback runs on pointerup, once a swipe has been told apart
   * from a tap. That is still inside the activation window, but pointerdown is
   * earlier and unconditional -- a drag that never resolves into a gesture at
   * all still counts. `start()` is safe to call repeatedly and will retry a
   * context that came up suspended, which is the state phones create them in.
   */
  const wake = () => sim.sound.start();
  const scene = root.querySelector("#scene");
  for (const ev of ["pointerdown", "touchstart", "keydown"]) {
    scene.addEventListener(ev, wake, { passive: true });
    root.addEventListener(ev, wake, { passive: true });
  }

  sim.gestures = new Gestures(scene, (g) => {
    sim.sound.start();      // and again, in case the first attempt was refused

    /*
     * A sideways swipe picks a branch -- whether or not she has stopped.
     *
     * Restricting it to the moments she stops to ask was wrong: forks are
     * drawn at every junction in view, so the player watches one approach for
     * twenty metres with the gesture doing nothing, which is indistinguishable
     * from the game ignoring them.
     */
    if (g.type === "turnleft" || g.type === "turnright") {
      const side = g.type === "turnleft" ? -1 : 1;
      if (sim.asking) {
        if (sim.trail.choose(side)) resumeFromAsk();
      } else {
        sim.trail.steer(side);
      }
      return;
    }

    /*
     * Swipe up while she is asking means "you decide" -- she keeps the branch
     * she had already picked and walks on. Waiting is not the only way out.
     */
    if (g.type === "sendon" && sim.asking) resumeFromAsk();

    const intent = gestureToIntent(g, sim.state);
    if (!intent) return;
    sim.dispatch(Events.setPace(intent.pace));

    if (intent.cyclePosture) {
      const to = nextPosture(sim.state.interaction.posture, sim.rng.float);
      sim.dispatch(Events.setPosture(to));
      // Sitting or lying down is a calming beat as well as a pose.
      if (to === "sit" || to === "lie") onAction(intentToAction({ settle: true }));
      draw();
      return;
    }
    if (intent.posture !== undefined) sim.dispatch(Events.setPosture(intent.posture));
    // Asking her on clears whatever a tap put her in, or she never moves off.
    if (intent.pace !== "stop") sim.dispatch(Events.setPosture(null));

    const action = intentToAction(intent);
    if (action) onAction(action);
  });

  /*
   * Everything is in. Reveal the scene FIRST and fade the cover over the top of
   * it: the corridor and the path measure their container to place anything at
   * all, and a hidden element measures zero.
   */
  await assets;
  root.querySelector("#app").hidden = false;
  const cover = root.querySelector("#loading");
  if (cover) {
    cover.classList.add("done");
    setTimeout(() => cover.remove(), 600);
  }
  greet();

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
    /*
     * Junctions she asks about.
     *
     * She stops a few metres short, turns and looks back, and waits. The
     * stopping is not a special case in the movement code: the looking-back
     * pose is not a gait, and the world only moves at the pace of the clip
     * she is in, so setting the pose stops her by itself.
     */
    if (sim.asking) {
      if (clock - sim.asking.since > ASK_TIMEOUT) {
        // Waited long enough. A dog does not stand at a fork indefinitely.
        sim.trail.decideAlone();
        resumeFromAsk();
      }
    } else if (sim.state.interaction.pace !== "stop" && sim.trail.pendingAsk()) {
      sim.asking = { since: clock };
      sim.paceBeforeAsk = sim.state.interaction.pace;
      sim.dispatch(Events.setPace("stop"));
      sim.dispatch(Events.setPosture("glance"));
      draw();
    }

    // One running total, owned by the walker -- see corridor.update.
    sim.trail.advance(sim.speed * dt, dt);
    sim.travelled = sim.trail.travelled;

    // The camera turns to keep her in view when she leaves the trail (§15A.2).
    const targetYaw = offTrailFor(sim.state) * 0.42;
    sim.yaw = (sim.yaw ?? 0) + (targetYaw - (sim.yaw ?? 0)) * (1 - Math.pow(0.06, dt));

    // Surface and scenery follow the place, so somewhere new looks new
    // underfoot and beside the trail, not just behind it.
    const place = PLACES[sim.state.dog.place];
    sim.corridor.setScenery(place.scenery || "forest");
    if (ground && sim.groundKind !== place.ground) {
      sim.groundKind = place.ground || "floor";
      /*
       * Just the forest floor now. The worn path used to be a second background
       * layer here, but a background cannot curve -- it is drawn by TrailPath
       * in screen space instead, sharing the corridor's projection.
       *
       * Ground textures are photographic and opaque, so they are JPEG.
       */
      ground.style.backgroundImage = `url("assets/scene/ground-${sim.groundKind}.jpg")`;
      ground.style.backgroundRepeat = "repeat";
      ground.style.backgroundSize = `${place.groundScale || 38}% auto`;
    }
    sim.path.setTexture(place.path || null);

    sim.corridor.setRail(!!place.rail);

    sim.bend = sim.trail.bendAt();
    sim.heading = sim.trail.turn;

    // Step aside to wait at a fork, and drift back to the middle afterwards.
    const asideTo = sim.asking ? sim.trail.takenSide() * ASK_STEP_ASIDE : 0;
    sim.aside = (sim.aside || 0) + (asideTo - (sim.aside || 0)) * (1 - Math.pow(0.05, dt));

    sim.sound.update(dt, { ...sim.animator.gait, speed: sim.speed });
    sim.corridor.update(dt, sim.speed, sim.yaw, sim.bend, sim.travelled);
    sim.path.draw(sim.travelled, sim.yaw, sim.bend, sim.trail.ghosts(), sim.trail.visibleTo);
    placeDog(root, sim, clock);

    if (ground) {
      const y = (sim.travelled * 34).toFixed(1);
      const x = (-sim.yaw * 120).toFixed(1);
      ground.style.backgroundPosition = `${x}px ${y}px`;
    }
    /*
     * The backdrop pans with the trail's heading as well as with her, because
     * on a bend the camera really is turning. Without it the distance sits
     * still while the trail swings, and the curve reads as the ground sliding
     * sideways rather than as you walking round something.
     */
    const backdrop = root.querySelector("#backdrop");
    if (backdrop) {
      const pan = -sim.yaw * 5 - Math.max(-0.9, Math.min(0.9, sim.heading * 12)) * 7;
      backdrop.style.transform = `translateX(${pan.toFixed(2)}%)`;
    }

    rafId = requestAnimationFrame(frame);
  };
  rafId = requestAnimationFrame(frame);
}

/**
 * A beat after the scene appears, she turns and looks at you.
 *
 * Held back rather than set at boot so the turn is something you watch happen.
 * Skipped if you got in first -- a tap or a swipe in that first second is a
 * clearer statement of intent than a scripted greeting.
 */
function greet() {
  setTimeout(() => {
    const { pace, posture } = sim.state.interaction;
    if (pace !== "stop" || posture !== "stand") return;
    sim.dispatch(Events.setPosture("turn180"));
    draw();
  }, 1000);
}

/**
 * How far she steps off the trail centre to wait at a fork, in metres.
 *
 * She is about a hundred and fifty screen pixels wide at following distance,
 * and a fork opens roughly ninety pixels across at the junction -- so standing
 * on the centre line she covers the very thing she is asking about. Moving her
 * closer would only make her wider; stepping aside is what actually clears it,
 * and it is what a dog waiting at a fork does anyway.
 */
const ASK_STEP_ASIDE = 0.95;

/** How long she will wait at a junction before choosing for herself. */
const ASK_TIMEOUT = 10;

/** Done asking: pick up the pace she was on before she stopped. */
function resumeFromAsk() {
  if (!sim.asking) return;
  sim.trail.decideAlone();
  sim.asking = null;
  sim.dispatch(Events.setPosture(null));
  sim.dispatch(Events.setPace(sim.paceBeforeAsk || "walk"));
  draw();
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
    sim.sound?.setPaused(document.hidden);
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
