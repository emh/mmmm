/**
 * Rendering (PRD §15, §15A).
 *
 * The world view is a trail corridor seen from a pace or two behind her. This
 * module's whole job is turning simulation state into staging: which way she is
 * facing, how far ahead she is, whether we are walking, and where the camera is
 * looking.
 *
 * The four portraits are deliberately NOT used here. They were once pinned
 * beside her as a medallion, which was a HUD badge in a game built on reading
 * the animal (§2.2, §15). From behind she has no face at all, so emotion reads
 * through orientation, posture and tail -- exactly as §15A.3 intends.
 */

import { PLACES, SPOTS, STIMULI } from "../world/places.js";

/** The shared sprite canvas, in pixels. */
const CANVAS = [380, 600];
import { bodySignals } from "../dog/dog.js";
import { project, depthLayer, MOLLY_CANVAS_W } from "./corridor.js";
import { poseForBehaviour } from "./animator.js";

/**
 * Her facing, derived from what she is doing (§15A.3).
 *
 * Orientation is the most legible channel at phone size -- more than any facial
 * expression -- so this mapping carries most of the game's communication.
 */
/** How far off the trail her attention has taken her, -1..1. */
export function offTrailFor(state) {
  const behavior = state.dog.behavior?.id;
  if (!behavior) return 0;
  if (["investigate_scent", "chase", "dig", "splash", "greet"].includes(behavior)) {
    // Deterministic per spot, so she does not jitter side to side while she
    // works at the same patch of ground.
    const spot = state.dog.spot;
    let h = 0;
    for (let i = 0; i < spot.length; i++) h = (h * 31 + spot.charCodeAt(i)) | 0;
    return ((h % 200) / 200 - 0.5) * 1.5;
  }
  return 0;
}

export function render(root, sim) {
  const state = sim.state;
  const place = PLACES[state.dog.place];
  const spot = SPOTS[state.dog.spot];

  const scene = root.querySelector("#scene");
  root.querySelector("#backdrop").style.backgroundImage =
    `url("assets/scene/${place.art}.png")`;

  renderDog(root, sim);
}

/**
 * Place her in the corridor.
 *
 * She uses the corridor's own projection, so she cannot disagree with the
 * scenery about where the ground is, and her depth layer is computed the same
 * way so a fern nearer than her occludes her correctly.
 */
function renderDog(root, sim) {
  if (!sim.animator) return;
  const pose = poseForBehaviour(sim.state);
  sim.animator.setPose(pose);

  const el = root.querySelector("#dog");
  el.setAttribute("aria-label", `Molly Mae, ${describePose(pose)}`);
  el.dataset.pose = pose;
}

/** Called every animation frame -- placement, not content. */
export function placeDog(root, sim, t) {
  const scene = root.querySelector("#scene");
  const el = root.querySelector("#dog");
  const vw = scene.clientWidth, vh = scene.clientHeight;

  const travelling = sim.animator ? sim.animator.isMoving : false;

  // Gait: a two-beat bob, a weight shift, and a slow drift in and out of
  // following distance. The drift matters most -- a dog pinned at a fixed
  // distance reads as towed rather than followed.
  const bob = travelling ? Math.abs(Math.sin(t * 5.2)) : 0;
  const weight = travelling ? Math.sin(t * 2.6) : 0;
  const drift = travelling ? Math.sin(t * 0.33) * 0.28 : Math.sin(t * 0.21) * 0.08;

  const z = Math.max(1.3, (sim.herZ ?? 2.4) + drift);

  /*
   * Every sprite shares one canvas, so she is sized by the canvas's real-world
   * width and seated by the ACTIVE CLIP's ground line -- not the canvas bottom,
   * which is empty space below her paws. Seating the bottom lifts her off the
   * ground by exactly that gap and strands her shadow underneath.
   */
  const p = project(z, MOLLY_CANVAS_W, vw, vh);
  const width = p.width;                 // project() normalises by viewport width
  const height = width * (CANVAS[1] / CANVAS[0]);
  const ground = sim.animator ? sim.animator.ground : 0.8;
  const lateral = (offTrailFor(sim.state) + weight * 0.05) * vw * 0.62 / z;

  el.style.width = `${width.toFixed(1)}px`;
  el.style.height = `${height.toFixed(1)}px`;
  el.style.left = `${(vw / 2 + lateral - width / 2).toFixed(1)}px`;
  el.style.top = `${(p.groundY - height * ground - bob * height * 0.02).toFixed(1)}px`;
  el.style.zIndex = String(depthLayer(z));

  const shadow = root.querySelector("#shadow");
  if (shadow) {
    // The shadow belongs to the trail, so it lives in scene coordinates. An
    // airborne gallop frame then lifts her off it, which is correct.
    const sw = width * 0.55;
    shadow.style.width = `${sw.toFixed(1)}px`;
    shadow.style.height = `${(sw * 0.28).toFixed(1)}px`;
    shadow.style.left = `${(vw / 2 + lateral).toFixed(1)}px`;
    shadow.style.top = `${p.groundY.toFixed(1)}px`;
    shadow.style.zIndex = String(depthLayer(z) - 1);
  }
}

/* Screen readers get the pose named (§30); it is never shown as text. */
const POSE_WORDS = {
  stand: "standing, facing away down the trail",
  walk: "walking ahead of you",
  trot: "trotting ahead of you",
  gallop: "running ahead of you",
  glance: "looking back at you over her shoulder",
  turn90: "turned side-on, attending to something off the trail",
  turn180: "stopped, facing you",
  sit: "sitting",
  lie: "lying down",
};
const describePose = (p) => POSE_WORDS[p] || p;

/*
 * Body language used to be rendered as words -- "tail low", "ears back" --
 * because a static sprite could not show it. The animation shows it now, so
 * the words are gone. §2.2 always wanted behaviour read off the animal rather
 * than off a readout; this is the first build where that is actually possible.
 */

/**
 * At most three actions, and only when there is genuinely something to decide.
 *
 * The old bar padded itself with whatever was legal -- Keep walking / Let her
 * explore / Call her back / Head home sat there permanently, which made every
 * moment look like a decision point and none of them feel like one. §14 asks
 * for 3-5 relevant actions; the interesting half of that rule is that an empty
 * bar is a valid answer.
 */
export function renderActions(root, actions, onPick) {
  const bar = root.querySelector("#actions");
  const shown = actions.slice(0, 3);

  const same = bar.dataset.keys === shown.map((a) => a.id).join(",");
  if (same) return;
  bar.dataset.keys = shown.map((a) => a.id).join(",");

  bar.innerHTML = "";
  for (const action of shown) {
    const button = document.createElement("button");
    button.className = "action";
    button.textContent = action.label;
    button.onclick = () => onPick(action);
    bar.appendChild(button);
  }
  bar.classList.toggle("empty", shown.length === 0);
}
