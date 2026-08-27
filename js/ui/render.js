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
import { bodySignals } from "../dog/dog.js";
import { project, depthLayer, MOLLY_CANVAS_W } from "./corridor.js";

/**
 * Her facing, derived from what she is doing (§15A.3).
 *
 * Orientation is the most legible channel at phone size -- more than any facial
 * expression -- so this mapping carries most of the game's communication.
 */
/*
 * Normalised sprites: identical canvases, one body scale, registered on the
 * spine. `feet` says where her paws sit within the canvas, so a frame with her
 * legs gathered under her does not sink into the ground.
 *
 * `side` and `sit` are not normalised yet -- they came from a different sheet,
 * and the automatic torso measurement is not comparable for a side view, whose
 * widest dimension is her length. They need a manual scale factor.
 */
const ORIENTATION = {
  away:    { file: "assets/molly/norm/away.png",    feet: 0.741 },
  glance:  { file: "assets/molly/norm/glance.png",  feet: 0.768 },
  turning: { file: "assets/molly/norm/turning.png", feet: 0.669 },
  facing:  { file: "assets/molly/norm/facing.png",  feet: 0.877 },
  side:    { file: "assets/molly/molly-body-walk.png", feet: 1, raw: 1.05 },  // nose to tail
  sit:     { file: "assets/molly/molly-body-sit.png",  feet: 1, raw: 0.45 },  // front-on, shoulder to shoulder
};

export function orientationFor(state) {
  const dog = state.dog;
  const behavior = dog.behavior?.id;

  // At home, or settled: sitting, facing you.
  if (PLACES[dog.place].indoors || behavior === "rest") return "sit";

  // Checking in over her shoulder -- the single most readable gesture she has.
  if (behavior === "look_at_player") return "glance";

  // Asking, waiting, or refusing: she turns and faces you.
  if (behavior === "wait" || behavior === "retreat") return "facing";
  if (dog.emotion.fear > 0.42) return "facing";

  // Her attention is off the trail, not on you.
  if (["investigate_scent", "investigate_spot", "chase", "dig", "greet",
       "splash", "drink", "play", "eat"].includes(behavior)) return "side";

  // Heading somewhere with intent, angled off the centre line.
  if (behavior === "head_home") return "turning";

  return "away";
}

/** How far off the trail her attention has taken her, -1..1. */
export function offTrailFor(state) {
  const behavior = state.dog.behavior?.id;
  if (!behavior) return 0;
  if (["investigate_scent", "chase", "dig", "splash", "greet"].includes(behavior)) {
    // Deterministic per spot, so she doesn't jitter side to side.
    const spot = state.dog.spot;
    let h = 0;
    for (let i = 0; i < spot.length; i++) h = (h * 31 + spot.charCodeAt(i)) | 0;
    return ((h % 200) / 200 - 0.5) * 1.5;
  }
  return 0;
}

/** Is she actually travelling, or busy with something in one place? */
export function isTravelling(state) {
  const behavior = state.dog.behavior?.id;
  if (!behavior) return false;
  if (PLACES[state.dog.place].indoors) return false;
  return ["follow_player", "head_home", "cross_crossing", "investigate_spot"].includes(behavior);
}

export function render(root, sim) {
  const state = sim.state;
  const place = PLACES[state.dog.place];
  const spot = SPOTS[state.dog.spot];

  const scene = root.querySelector("#scene");
  scene.classList.toggle("is-indoors", !!place.indoors);
  root.querySelector("#backdrop").style.backgroundImage =
    `url("assets/scene/${place.art}.png")`;

  root.querySelector("#place-name").textContent = place.name;
  root.querySelector("#spot-name").textContent = spot.name;
  root.querySelector("#clock").textContent = clock(state.game);

  renderDog(root, sim);
  renderSignals(root, sim);
  renderLog(root, state);
}

/**
 * Place her in the corridor.
 *
 * She uses the corridor's own projection, so she cannot disagree with the
 * scenery about where the ground is, and her depth layer is computed the same
 * way so a fern nearer than her occludes her correctly.
 */
function renderDog(root, sim) {
  const { dog } = sim.state;
  const scene = root.querySelector("#scene");
  const el = root.querySelector("#dog");
  const img = root.querySelector("#dog-img");

  const orientation = orientationFor(sim.state);
  const pose = ORIENTATION[orientation];
  if (img.getAttribute("src") !== pose.file) img.setAttribute("src", pose.file);
  sim.pose = pose;

  el.setAttribute("aria-label", `Molly Mae, ${describeOrientation(orientation)}`);
  el.dataset.orientation = orientation;
}

/** Called every animation frame -- placement, not content. */
export function placeDog(root, sim, t) {
  const scene = root.querySelector("#scene");
  const el = root.querySelector("#dog");
  const img = root.querySelector("#dog-img");
  if (!img.naturalWidth) return;

  const vw = scene.clientWidth, vh = scene.clientHeight;

  // Indoors there is no corridor to agree with, so she is simply staged.
  if (PLACES[sim.state.dog.place].indoors) {
    const w = vw * 0.42;
    el.style.width = `${w.toFixed(1)}px`;
    el.style.left = `${(vw / 2 - w / 2).toFixed(1)}px`;
    el.style.top = `${(vh * 0.92 - w * (img.naturalHeight / img.naturalWidth)).toFixed(1)}px`;
    el.style.zIndex = "50";
    return;
  }

  const travelling = isTravelling(sim.state);

  // Gait: a two-beat bob, a weight shift, and a slow drift in and out of
  // following distance. The drift matters most -- a dog pinned at a fixed
  // distance reads as towed rather than followed.
  const bob = travelling ? Math.abs(Math.sin(t * 5.2)) : 0;
  const weight = travelling ? Math.sin(t * 2.6) : 0;
  const drift = travelling ? Math.sin(t * 0.33) * 0.28 : Math.sin(t * 0.21) * 0.08;

  const z = Math.max(1.3, (sim.herZ ?? 2.4) + drift);
  const pose = sim.pose || ORIENTATION.away;

  /*
   * Normalised poses are sized by the canvas height and then offset so the
   * canvas's own ground line -- not its bottom edge -- lands on the trail.
   * Un-normalised ones still project by their real-world width.
   */
  let width, height, groundY;
  if (pose.raw) {
    const p = project(z, pose.raw, vw, vh);
    width = p.width;
    height = width * (img.naturalHeight / img.naturalWidth);
    groundY = p.groundY;
  } else {
    const p = project(z, MOLLY_CANVAS_W, vw, vh);
    width = p.width;                    // project() normalises by viewport width
    height = width * (img.naturalHeight / img.naturalWidth);
    groundY = p.groundY;
  }
  const lateral = (offTrailFor(sim.state) + weight * 0.05) * vw * 0.62 / z;

  el.style.width = `${width.toFixed(1)}px`;
  el.style.left = `${(vw / 2 + lateral - width / 2).toFixed(1)}px`;
  el.style.top = `${(groundY - height * pose.feet - bob * height * 0.03).toFixed(1)}px`;
  el.style.zIndex = String(depthLayer(z));
}

const ORIENTATION_WORDS = {
  away: "walking ahead of you",
  glance: "looking back at you",
  turning: "turning off the trail",
  facing: "facing you",
  side: "attending to something off the trail",
  sit: "sitting",
};
const describeOrientation = (o) => ORIENTATION_WORDS[o] || o;

/**
 * Body language, in words. §30 requires important events be communicable
 * without sound, and §2.2 requires behaviour over numbers -- so the signals are
 * named, never quantified. They matter more under this camera, because from
 * behind there is no face to read.
 */
function renderSignals(root, sim) {
  const el = root.querySelector("#signals");
  const signals = bodySignals(sim.state.dog);
  const label = { tail_low: "tail low", ears_back: "ears back", weight_back: "leaning away",
                  hesitating: "hesitating", tail_high: "tail up", ears_forward: "ears forward",
                  loose_wag: "loose wag", slow_gait: "walking slowly", lagging: "falling behind",
                  licking_lips: "licking her lips", watching_you: "watching you" };
  el.innerHTML = signals.map((s) => `<span>${label[s] || s}</span>`).join("");
}

function renderLog(root, state) {
  const el = root.querySelector("#log");
  el.innerHTML = state.interaction.log.slice(-5)
    .map((e) => `<p class="tone-${e.tone}">${e.text}</p>`)
    .join("");
}

export function renderActions(root, actions, contextText, onPick) {
  const bar = root.querySelector("#actions");
  const line = root.querySelector("#context-line");

  line.textContent = contextText || "";
  line.classList.toggle("visible", !!contextText);

  bar.innerHTML = "";
  for (const action of actions) {
    const button = document.createElement("button");
    button.className = "action";
    button.textContent = action.label;
    button.onclick = () => onPick(action);
    bar.appendChild(button);
  }
  bar.classList.toggle("empty", actions.length === 0);
}

function clock(game) {
  const h = Math.floor(game.minutes / 60);
  const m = Math.floor(game.minutes % 60);
  const suffix = h < 12 ? "am" : "pm";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `Day ${game.day} · ${hour}:${String(m).padStart(2, "0")}${suffix}`;
}
