/**
 * The trail corridor (PRD §15A.4, revised).
 *
 * Scaling a fixed plate toward the camera is a *zoom*, not travel -- the same
 * trees simply get bigger, and after a few seconds it is obvious you are not
 * going anywhere. Actual travel needs individual scenery placed in a virtual
 * corridor: each trunk, fern and log has a real position, sweeps past the
 * camera as you advance, and is recycled to the far end with new properties.
 * Nothing repeats on any fixed period, so the walk can run indefinitely.
 *
 * Coordinates: `x` is metres left/right of the trail centre, `z` is metres
 * ahead of the camera. The ground plane is at the camera's feet.
 */

/*
 * Camera geometry.
 *
 * These three are solved together against one fixed point: Molly at a
 * comfortable following distance should be about 54px wide in a 375px-wide
 * portrait viewport, with her feet around three quarters down the frame. That
 * is the framing that read correctly in the staging bench.
 *
 * A true adult eye height of 1.55 m cannot satisfy it -- the geometry puts a
 * dog that size off the bottom of the screen, because ground close to a
 * standing adult is very low in frame. So the camera sits lower, at about a
 * metre, which is nearer the dog's own world and reads as more intimate. This
 * is a game camera, not a survey instrument.
 */
const FOCAL = 0.62;      // narrower FOV = things swell faster as they approach
const HORIZON = 0.56;    // where the ground meets the distance, fraction from top
const EYE = 0.95;        // camera height in metres

const NEAR = 0.9;      // recycle once closer than this
const FAR = 26;        // spawn out here -- beyond this the backdrop takes over

/**
 * What can appear beside the trail, with how often and how big.
 *
 * `width` is the sprite's real-world width in metres, which is what makes the
 * scale work out: a 1.4 m fern and a 2.6 m trunk sit at the same distance and
 * come out the right size relative to each other without hand-tuning.
 */
const SCENERY = [
  { file: "trunk-a.png",    width: 2.1, weight: 1.6, minX: 2.4, maxX: 11, anchor: 1, spawnZ: 15, tall: true },
  { file: "trunk-b.png",    width: 1.3, weight: 1.6, minX: 2.2, maxX: 12, anchor: 1, spawnZ: 15, tall: true },
  { file: "trunk-c.png",    width: 2.8, weight: 1.1, minX: 3.0, maxX: 12, anchor: 1, spawnZ: 15, tall: true },
  { file: "trunk-d.png",    width: 0.9, weight: 1.1, minX: 2.0, maxX: 13, anchor: 1, spawnZ: 15, tall: true },
  { file: "under-fern.png", width: 1.5, weight: 6, minX: 1.0, maxX: 6.5, anchor: 1 },
  { file: "under-salal.png",width: 1.3, weight: 4, minX: 1.1, maxX: 7,   anchor: 1 },
  { file: "under-log.png",  width: 2.6, weight: 1.4, minX: 1.6, maxX: 7, anchor: 1 },
  { file: "under-stump.png",width: 1.4, weight: 1.2, minX: 1.5, maxX: 7, anchor: 1 },
];

const TOTAL_WEIGHT = SCENERY.reduce((s, k) => s + k.weight, 0);

function pickKind(rand) {
  let roll = rand() * TOTAL_WEIGHT;
  for (const kind of SCENERY) {
    roll -= kind.weight;
    if (roll <= 0) return kind;
  }
  return SCENERY[0];
}

export class Corridor {
  /**
   * @param {HTMLElement} el      container, position:relative
   * @param {number} count        how many scenery items exist at once
   * @param {function} rand       seeded RNG, so a walk is reproducible (§37)
   */
  constructor(el, { count = 34, rand = Math.random, basePath = "assets/scene/scatter" } = {}) {
    this.el = el;
    this.rand = rand;
    this.basePath = basePath;
    this.items = [];

    for (let i = 0; i < count; i++) {
      const img = document.createElement("img");
      img.className = "scatter";
      img.draggable = false;
      img.alt = "";
      el.appendChild(img);
      /*
       * Spread the initial population down the corridor rather than spawning it
       * all at the far end, or the first walk starts in a clearing and stays
       * empty for half a minute while the scenery walks in.
       *
       * Trunks recycle at 15 m, so seed them inside that; anything further is
       * the backdrop's job.
       */
      const item = this.spawn({ img });
      const reach = item.kind.spawnZ ?? FAR;
      item.z = NEAR + (reach - NEAR) * (i + 0.5) / count;
      item.spawnedAt = reach;
      this.items.push(item);
    }
    this.sort();
  }

  spawn(item) {
    const kind = pickKind(this.rand);
    item.spawnedAt = kind.spawnZ ?? FAR;
    const side = this.rand() < 0.5 ? -1 : 1;
    item.kind = kind;
    item.x = side * (kind.minX + this.rand() * (kind.maxX - kind.minX));
    item.z = item.z ?? FAR;
    item.jitter = 0.82 + this.rand() * 0.42;      // size variation within a kind
    item.img.src = `${this.basePath}/${kind.file}`;
    return item;
  }

  /*
   * Depth sorting is derived from z directly rather than from sorted order, so
   * anything else on the trail -- Molly, an encounter -- can compute its own
   * layer with the same function and interleave correctly. A fern at 2 m
   * occludes her at 2.4 m without either knowing about the other.
   */
  sort() {
    for (const item of this.items) item.img.style.zIndex = String(depthLayer(item.z));
  }

  /**
   * @param {number} dt     seconds
   * @param {number} speed  metres per second along the trail
   * @param {number} yaw    camera turn, in the same units the plates use
   */
  update(dt, speed, yaw = 0) {
    const { width: vw, height: vh } = this.el.getBoundingClientRect();
    if (!vw) return;

    for (const item of this.items) {
      item.z -= speed * dt;
      if (item.z < NEAR) {
        item.z = item.kind.spawnZ ?? FAR;         // trunks come back sooner
        this.spawn(item);
      }
      item.img.style.zIndex = String(depthLayer(item.z));

      // Perspective projection onto the viewport.
      const invZ = 1 / item.z;
      const screenW = vw * item.kind.width * FOCAL * invZ * item.jitter;
      const groundY = vh * HORIZON + vh * EYE * FOCAL * invZ;
      const screenX = vw * 0.5 + (item.x - yaw * 2.6) * vw * FOCAL * invZ;

      const img = item.img;
      if (screenW < 1.2 || groundY < 0) { img.style.display = "none"; continue; }
      img.style.display = "";
      img.style.width = `${screenW.toFixed(1)}px`;

      /*
       * A trunk sprite is a *segment* of trunk, roughly seven metres of it.
       * Scaled honestly it stops in mid-air partway up the frame, which looks
       * like a row of posts rather than old growth. Stretching it vertically to
       * run off the top of the screen is a lie the material forgives: bark
       * grain is almost entirely vertical, so it takes the distortion without
       * reading as stretched.
       */
      if (item.kind.tall) {
        img.style.height = `${(groundY + vh * 0.2).toFixed(1)}px`;
      } else {
        img.style.height = "auto";
      }
      /*
       * `anchor` 1 puts the sprite's bottom edge on the ground line. Trunks are
       * cropped at both ends, so their cut base sits exactly where the earth is
       * and reads as going into it. Letting any of it hang below the ground
       * line just shows the cut against the backdrop.
       */
      img.style.left = `${(screenX - screenW / 2).toFixed(1)}px`;
      const drawnH = item.kind.tall
        ? groundY + vh * 0.2
        : screenW * (img.naturalHeight / (img.naturalWidth || 1));
      img.style.top = `${(groundY - drawnH * item.kind.anchor).toFixed(1)}px`;

      /*
       * Distance haze, plus a fade over the first stretch of each item's life.
       *
       * Trunks are recycled at 15 m rather than 46 m: a trunk sprite is a
       * segment, not a whole tree, so far away it ends in mid-air instead of
       * reaching the canopy. Bringing them back sooner keeps them tall enough
       * to fill the frame -- and the backdrop already supplies the distant
       * trees. The fade is what stops them popping into existence.
       */
      const born = item.spawnedAt || FAR;
      const fadeIn = Math.min(1, Math.max(0, (born - item.z) / (born * 0.22)));
      const haze = Math.min(1, Math.max(0, (item.z - 5) / (FAR - 5)));
      img.style.opacity = ((1 - haze * 0.72) * fadeIn).toFixed(3);
      /*
       * A silhouette drop-shadow grounds each item. Without it a trunk's cut
       * base sits on the trail like a sticker -- the same problem Molly had
       * before she got a contact shadow. It fades with distance along with
       * everything else.
       */
      const contact = Math.max(0, 1 - haze * 1.4);
      const shadow = contact > 0.05
        ? ` drop-shadow(0 ${(screenW * 0.012).toFixed(1)}px ${(screenW * 0.03).toFixed(1)}px rgba(24,20,12,${(0.5 * contact).toFixed(2)}))`
        : "";
      img.style.filter = (haze > 0.02
        ? `brightness(${(1 + haze * 0.30).toFixed(3)}) saturate(${(1 - haze * 0.55).toFixed(3)}) blur(${(haze * 1.1).toFixed(2)}px)`
        : "none") + shadow;
    }

  }
}

/**
 * Stacking order for something at distance z. Nearer draws in front.
 * Shared by every object on the trail so they interleave without coordination.
 */
export function depthLayer(z) {
  return Math.max(1, Math.round(4000 - z * 60));
}

/**
 * Project anything else onto the same ground plane.
 *
 * Molly must use this rather than her own placement curve. Two projections
 * means she drifts out of agreement with the scenery as she changes distance --
 * she'll sink into the ground or float above it depending on where she is.
 *
 * `realWidth` is the subject's width in metres. Returns pixels.
 */
export function project(zMetres, realWidth, vw, vh) {
  const z = Math.max(0.6, zMetres);
  return {
    width: vw * realWidth * FOCAL / z,
    groundY: vh * HORIZON + vh * EYE * FOCAL / z,
  };
}

/**
 * Molly's sprite canvas, in metres.
 *
 * Every pose is normalised onto one canvas at one body scale
 * (tools/normalize.py), so the game needs a single number instead of a
 * real-world size per pose. That per-pose approach was the bug: projecting
 * every sprite against one *width* rendered the side view -- about a metre
 * long for the same animal -- at half scale.
 *
 * The canvas is 380x600 px at a target torso width of 120 px, and it is
 * calibrated to the framing that read correctly on screen rather than to a tape
 * measure: 1.52 m of canvas width puts her at the size she was before
 * normalisation. That implies a generous ~0.48 m torso, which is wider than the
 * animal really is -- the sprite carries coat, tail spread and a margin, and
 * matching the established framing matters more here than anatomical purity.
 */
export const MOLLY_CANVAS_W = 1.52;

/**
 * Kept for callers that think in height; derived from the canvas aspect.
 * Note `project()` normalises by viewport WIDTH, so anything passed to it must
 * be a width. Passing a height renders the subject far too small.
 */
export const MOLLY_CANVAS_H = MOLLY_CANVAS_W * (600 / 380);

/** Kept for the older benches, which still place by width. */
export const MOLLY_WIDTH = 0.55;

export const CORRIDOR = { FOCAL, HORIZON, EYE, NEAR, FAR };
