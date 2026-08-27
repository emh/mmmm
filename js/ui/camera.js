/**
 * The follow camera (PRD §15A).
 *
 * The player stands on the trail a few paces behind Molly Mae, at adult eye
 * height, looking down the trail. This module owns that framing: where the
 * camera is looking, how it eases toward her, and how the layered plates move
 * to sell depth.
 *
 * Two motions, per §15A.2:
 *   advance -- the world scales toward the camera as she walks on
 *   yaw     -- the camera pans sideways to keep her in view when she leaves
 *              the trail, which is why plates are authored wider than the
 *              portrait viewport
 */

/**
 * Where the trail sits in frame, as fractions of the viewport.
 *
 * `depth` 0 is right in front of the camera, 1 is at the vanishing point. Both
 * her size and her footing derive from it, because on a trail seen in
 * perspective those two are the same fact: further away is smaller *and*
 * higher up the frame. Setting them independently is how you get a dog that
 * floats.
 */
export const TRAIL = {
  near: { size: 0.268, ground: 0.055 },
  far:  { size: 0.077, ground: 0.305 },
};

/*
 * Calibrated against the cedar plate. Note `far.ground` is well below the
 * plate's apparent vanishing point: the trail disappears behind foreground
 * foliage long before it reaches the horizon, so the *walkable* stretch is
 * shorter than the drawn one. Placing her by the horizon leaves her floating
 * above the ground in mid-air. Re-measure this per location.
 */
/** Size and footing for a given distance down the trail. */
export function trailPlacement(depth) {
  const t = Math.max(0, Math.min(1, depth));
  // Perspective is not linear -- things shrink fast as they leave you.
  const k = Math.pow(t, 0.72);
  return {
    size:   TRAIL.near.size   + (TRAIL.far.size   - TRAIL.near.size)   * k,
    ground: TRAIL.near.ground + (TRAIL.far.ground - TRAIL.near.ground) * k,
  };
}

/** Parallax rates. `mid` is the reference plane -- the trail she walks on. */
const PARALLAX = { far: 0.34, mid: 1.0, near: 1.85 };

/**
 * How much each plane grows over one full walk cycle.
 *
 * This is the whole sense of forward motion. Near foliage rushes past; the far
 * canopy barely stirs. Getting the ratio wrong is what makes a walk feel like a
 * slideshow -- if the far plane moves noticeably, the forest appears to be
 * made of paper.
 */
const GROWTH = { far: 0, mid: 0.30, near: 0.62 };

/**
 * Which planes travel past the camera and therefore need the two-copy dolly.
 *
 * The far canopy does not. Walking ten metres down a trail genuinely does not
 * change the distant view, and dollying it produces a cross-dissolve of highly
 * detailed trees against themselves a few percent apart -- which reads as a
 * soft double-exposure over the entire frame. One static copy is both cheaper
 * and more truthful. The sense of forward motion comes from near foliage
 * sweeping past, which is what it comes from when you actually walk.
 */
const DOLLIES = { far: false, mid: true, near: true };

/** Seconds for one plate to travel from far to past the camera. */
const CYCLE = 13;

export class Camera {
  constructor(el) {
    this.el = el;
    this.planes = {};
    this.dogLayer = null;

    // Where the camera is looking, in viewport widths either side of centre.
    this.yaw = 0;
    this.targetYaw = 0;

    // Position within the endless dolly, 0..1. Never resets -- it wraps.
    this.phase = 0;
    this.speed = 0;
    this.targetSpeed = 0;

    this.sway = 0;

    // How far ahead she is (0 = at the camera, 1 = at the vanishing point) and
    // how far she has strayed off the trail (-1 left, +1 right).
    this.depth = 0.5;
    this.offTrail = 0;
  }

  /** Place her along the trail and across it. */
  place(depth, offTrail = 0) {
    this.depth = Math.max(0, Math.min(1, depth));
    this.offTrail = Math.max(-1, Math.min(1, offTrail));
  }

  /** Point the camera at a horizontal position: -1 hard left, +1 hard right. */
  lookAt(x) {
    this.targetYaw = Math.max(-1, Math.min(1, x));
  }

  /** Walk on, or stop. `speed` 1 is a comfortable pace, 0 is standing still. */
  setWalking(on, speed = 1) {
    this.targetSpeed = on ? speed : 0;
  }

  /**
   * Build the planes for a location.
   *
   * `names` is ordered back to front. Molly is inserted between `mid` and
   * `near` (or before the last plane) so foreground growth passes in front of
   * her -- that occlusion is what puts her *in* the park rather than on top of
   * it, and no amount of shadow or grading substitutes for it (§15A.4).
   */
  setPlates(place, names) {
    this.el.querySelectorAll(".plane").forEach((n) => n.remove());
    this.planes = {};

    const dogAfter = names.includes("mid") ? "mid" : names[names.length - 2] || names[0];
    for (const name of names) {
      /*
       * Two copies of every plate, half a cycle apart.
       *
       * Walking forward means the world grows toward the camera, and a single
       * copy has to snap back to the start when it runs out -- which reads as a
       * hitch every few seconds. Two copies offset by half a cycle, each fading
       * in small and out large, dolly forever with nothing to snap.
       */
      const group = document.createElement("div");
      group.className = `plane-group group-${name}`;
      const pair = [];
      const copies = DOLLIES[name] === false ? [0] : [0, 1];
      for (const half of copies) {
        const plane = document.createElement("div");
        plane.className = `plane plane-${name}`;
        plane.style.backgroundImage = `url("assets/scene/${place}-${name}.png")`;
        group.appendChild(plane);
        pair.push(plane);
      }
      this.el.appendChild(group);
      this.planes[name] = pair;
      if (name === dogAfter && this.dogLayer) this.el.appendChild(this.dogLayer);
    }
    if (this.dogLayer && !this.dogLayer.parentNode) this.el.appendChild(this.dogLayer);
  }

  /** The element Molly lives in, so it can be slotted between planes. */
  attachDog(el) {
    this.dogLayer = el;
  }

  update(dt) {
    // Ease, never snap. The lag between her and the centre of frame is itself
    // information -- whether she is pulling ahead or hanging back (§15A.2).
    const ease = 1 - Math.pow(0.05, dt);
    this.yaw += (this.targetYaw - this.yaw) * ease;

    // She does not start and stop like a machine; the pace eases in and out.
    this.speed += (this.targetSpeed - this.speed) * (1 - Math.pow(0.12, dt));
    this.phase = (this.phase + (dt / CYCLE) * this.speed) % 1;
    const walking = this.speed > 0.05;

    // A slow figure-of-eight, so the camera reads as carried by a person
    // rather than mounted on a rail. Small enough to be felt, not seen.
    this.sway += dt;
    const bobX = Math.sin(this.sway * 0.9) * 0.006 + (walking ? Math.sin(this.sway * 3.1) * 0.004 : 0);
    const bobY = walking ? Math.abs(Math.sin(this.sway * 3.1)) * 0.5 : Math.sin(this.sway * 0.6) * 0.25;

    for (const [name, pair] of Object.entries(this.planes)) {
      const p = PARALLAX[name] ?? 1;
      const growth = GROWTH[name] ?? 0.3;
      const shift = -(this.yaw + bobX) * p * 14;               // % of plane width

      const dollies = DOLLIES[name] !== false;
      pair.forEach((plane, half) => {
        if (!dollies) {
          plane.style.opacity = "1";
          plane.style.transform =
            `translate3d(${shift.toFixed(3)}%, ${(bobY * p).toFixed(2)}px, 0)`;
          return;
        }
        const phase = (this.phase + half * 0.5) % 1;
        const scale = 1 + phase * growth;

        /*
         * Dollying planes are transparent overlays, so they fade in as they
         * arrive and out as they sweep past -- there is no backdrop behind
         * them to show through, which is what made a sum-to-one crossfade the
         * wrong tool here.
         *
         * The two copies are half a cycle apart, so one is always near full
         * while the other is arriving or leaving. A broad peak keeps foliage
         * present continuously instead of pulsing.
         */
        const alpha = Math.pow(Math.sin(phase * Math.PI), 0.55);
        plane.style.zIndex = phase >= 0.5 ? "1" : "0";
        plane.style.opacity = alpha.toFixed(4);
        plane.style.transform =
          `translate3d(${shift.toFixed(3)}%, ${(bobY * p).toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;
      });
    }
    /*
     * Molly's own placement and gait.
     *
     * Size and footing come from her distance down the trail. On top of that
     * she gets a stride: a two-beat vertical bob, a slower side-to-side weight
     * shift, and a very slow drift in and out of the camera's comfortable
     * following distance. That last one matters more than it sounds -- a dog
     * pinned at exactly the same distance forever reads as towed. Letting her
     * pull a little ahead and drop back is most of what makes it feel like
     * following a real animal.
     */
    if (this.dogLayer) {
      const stride = walking ? Math.sin(this.sway * 5.0) : 0;
      const weight = walking ? Math.sin(this.sway * 2.5) : 0;
      const wander = walking ? Math.sin(this.sway * 0.37) * 0.05 : 0;

      const place = trailPlacement(Math.max(0, Math.min(1, (this.depth ?? 0.5) + wander)));
      this.dogLayer.style.width = `${(place.size * 100).toFixed(2)}%`;
      this.dogLayer.style.bottom = `${(place.ground * 100 + Math.abs(stride) * 0.55).toFixed(2)}%`;
      this.dogLayer.style.setProperty("--off-trail",
        `${((this.offTrail ?? 0) * 26 + weight * 0.8).toFixed(2)}%`);
      this.dogLayer.style.setProperty("--gait", `${(weight * 1.1).toFixed(2)}deg`);
    }

    // Molly sits on the mid plane, so she shares its parallax exactly.
    if (this.dogLayer) {
      const shift = -(this.yaw + bobX) * PARALLAX.mid * 14;
      this.dogLayer.style.setProperty("--cam-shift", `${shift.toFixed(3)}%`);
      this.dogLayer.style.setProperty("--cam-bob", `${(bobY * PARALLAX.mid).toFixed(2)}px`);
    }
  }
}
