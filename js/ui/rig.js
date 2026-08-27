/**
 * The cutout rig (PRD §16 "simplified, expressive dog animation").
 *
 * Molly Mae is drawn as three registered layers -- body, head, tail -- sliced
 * from one painting by tools/rig.py. Because they come from a single drawing
 * they share a light direction and cannot drift apart in style, and because
 * each carries a pivot at its joint, rotating one reads as the animal moving
 * rather than the picture turning.
 *
 * Everything here is secondary motion: breathing, weight shift, head carriage,
 * tail. There is no walk cycle yet -- that needs more drawn frames -- so a walk
 * is sold with body bob, lean and forward travel instead.
 *
 * This replaces the portrait medallion, which was a HUD element in a game whose
 * whole premise is reading the animal rather than a readout (§2.2, §15).
 */

const TAU = Math.PI * 2;

export class Rig {
  constructor(container, manifest, basePath) {
    this.manifest = manifest;
    this.el = container;
    this.el.classList.add("rig");
    this.el.style.aspectRatio = `${manifest.width} / ${manifest.height}`;

    /*
     * Contact shadow. A drop-shadow filter follows the silhouette, which reads
     * as a sticker with a glow -- it never says "standing on the ground". An
     * ellipse under the feet that tightens and darkens as she settles is what
     * actually plants her in the scene.
     */
    this.shadow = document.createElement("div");
    this.shadow.className = "rig-shadow";
    this.el.appendChild(this.shadow);

    this.layers = {};
    for (const name of ["body", "tail", "head"]) {
      const part = manifest.parts[name];
      if (!part) continue;
      const img = document.createElement("img");
      img.src = `${basePath}/${part.file}`;
      img.className = `rig-part rig-${name}`;
      img.alt = "";
      img.draggable = false;

      // Position and pivot as percentages, so the rig scales with the scene.
      const pct = (v, total) => `${(v / total) * 100}%`;
      img.style.left = pct(part.offset[0], manifest.width);
      img.style.top = pct(part.offset[1], manifest.height);
      img.style.width = pct(part.size[0], manifest.width);
      if (part.pivot) {
        img.style.transformOrigin = `${(part.pivot[0] / part.size[0]) * 100}% ${(part.pivot[1] / part.size[1]) * 100}%`;
      }
      this.el.appendChild(img);
      this.layers[name] = img;
    }

    this.t = 0;
    this.pose = { arousal: .25, valence: .3, fear: 0, walking: false, tired: false, expressed: "neutral" };
    this.smoothed = { head: 0, headLift: 0, tail: 0, lean: 0 };
  }

  setPose(pose) {
    Object.assign(this.pose, pose);
  }

  /**
   * Target angles for the current emotional state.
   *
   * This is where the four expressed states (§6.3) become visible on the body
   * instead of on a badge. Fear has no face, so it has to live here: head low
   * and back, tail tucked, weight off the front feet.
   */
  targets() {
    const { arousal, valence, fear, expressed, tired } = this.pose;
    let head = 0;        // + = nose down, - = nose up
    let headLift = 0;    // vertical carriage, px in sprite space
    let tail = 0;        // resting tail angle
    let lean = 0;

    switch (expressed) {
      case "curious": head = -4; headLift = -6; tail = -6; break;
      case "alert":   head = -9; headLift = -16; tail = -12; lean = -1.5; break;
      case "happy":   head = -2; headLift = -4; tail = -14; break;
      default:        head = 1;  headLift = 0;  tail = 0;
    }
    if (fear > .25) {
      // Overrides everything: she draws back and drops.
      head = 7 * fear;
      headLift = 10 * fear;
      tail = 20 * fear;         // tucked down
      lean = 3 * fear;
    }
    if (tired) { head += 4; headLift += 6; tail += 6; }
    return { head, headLift, tail, lean, arousal, valence, fear };
  }

  /** Advance the animation. `dt` in seconds. */
  update(dt) {
    this.t += dt;
    const T = this.targets();
    const ease = 1 - Math.pow(0.0015, dt);      // frame-rate independent smoothing
    for (const key of ["head", "headLift", "tail", "lean"]) {
      this.smoothed[key] += (T[key] - this.smoothed[key]) * ease;
    }

    const { arousal, valence, fear, walking } = this.pose;

    // Breathing -- faster and deeper when roused, shallow when settled.
    const breathRate = 0.28 + arousal * 0.45;
    const breath = Math.sin(this.t * TAU * breathRate);
    const breathDepth = 0.006 + arousal * 0.004;

    // Walking is sold with bob and travel, not a leg cycle.
    const stepRate = 1.35;
    const step = walking ? Math.sin(this.t * TAU * stepRate) : 0;
    const bob = walking ? step * 1.1 : breath * 0.35;
    const sway = walking ? Math.sin(this.t * TAU * stepRate * 0.5) * 0.7 : 0;

    // Tail: wags with good feeling, stills with fear.
    const wagDrive = Math.max(0, valence) * (0.45 + arousal * 0.9) * (1 - fear);
    const wagRate = 1.6 + wagDrive * 3.4;
    const wagAmp = wagDrive * 16;
    const wag = Math.sin(this.t * TAU * wagRate) * wagAmp;

    // Head has its own slow drift, so she never looks frozen.
    const drift = Math.sin(this.t * TAU * 0.11) * 1.6 + Math.sin(this.t * TAU * 0.29) * 0.7;

    /*
     * Joint limits, measured in rig-test.html.
     *
     * These are not stylistic choices -- past them the cut seams open and you
     * can see through her at the neck and rump. The inpainted band behind each
     * joint only covers so much. If a pose needs more range than this, it needs
     * drawn art, not a bigger number.
     */
    const clamp = (v, lim) => Math.max(-lim, Math.min(lim, v));
    const pctY = (v) => (v / this.manifest.height) * 100;

    if (this.layers.body) {
      this.layers.body.style.transform =
        `translateY(${pctY(bob)}%) rotate(${(this.smoothed.lean + sway * 0.25).toFixed(2)}deg) scaleY(${(1 + breath * breathDepth).toFixed(4)})`;
    }
    if (this.layers.head) {
      this.layers.head.style.transform =
        `translateY(${pctY(clamp(bob + this.smoothed.headLift, 20))}%) rotate(${clamp(this.smoothed.head + drift, 11).toFixed(2)}deg)`;
    }
    if (this.shadow) {
      // Lifts and softens on the up-beat of a stride, as weight leaves the feet.
      const lift = walking ? (1 - Math.abs(step)) : 1;
      this.shadow.style.transform = `translateX(-50%) scaleX(${(0.94 + lift * 0.10).toFixed(3)}) scaleY(${(0.82 + lift * 0.22).toFixed(3)})`;
      this.shadow.style.opacity = (0.30 + lift * 0.16).toFixed(3);
    }
    if (this.layers.tail) {
      this.layers.tail.style.transform =
        `translateY(${pctY(bob * 0.6)}%) rotate(${clamp(this.smoothed.tail + wag, 26).toFixed(2)}deg)`;
    }
  }
}

export async function loadRig(container, basePath) {
  const manifest = await fetch(`${basePath}/rig.json`).then((r) => r.json());
  return new Rig(container, manifest, basePath);
}
