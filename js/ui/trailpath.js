/**
 * The worn path, drawn in screen space.
 *
 * It used to be a CSS background layer on the 3D ground plane, which worked
 * only while the trail was straight. Curving it there is not possible: the
 * plane is rotated about a line at the horizon, so plane-space rows map to
 * world distance PROJECTIVELY, not linearly. Offsetting row by row would bend
 * the texture by one law while the scenery bent by another, and the trees would
 * end up standing in the path.
 *
 * So the path is drawn with the same projection the corridor uses for every
 * trunk and fern. One geometry, no disagreement possible. It also fixes
 * something that was quietly wrong before: the texture now advances with real
 * distance travelled rather than at a flat plane-space rate.
 *
 * The canvas lives inside #ground-wrap, whose top edge is exactly the horizon
 * and which extends well past both sides of the scene -- so a curve can swing
 * off-frame without being clipped, and canvas y is simply screen y below the
 * horizon.
 */

import { FOCAL, EYE } from "./corridor.js";

/** Full width of the worn path in metres, texture margins included. */
const TRAIL_W = 2.4;

/** How many metres of trail one tile of the texture covers. */
const TEX_METRES = 7.5;

/**
 * How far up the trail the path is drawn, and where it starts giving way to
 * the distance haze.
 *
 * These have to be generous, because curvature needs distance to show. The
 * first pass faded the path out by 8 m, which is inside the range where a bend
 * is still only a few pixels off centre -- the trail curved correctly and
 * looked dead straight. Running it out to the haze is what makes the bend
 * visible at all.
 */
const MAX_Z = 30;
const FADE_FROM = 16;

/** Screen rows per drawn strip. */
const STRIP = 2;

/** Metres over which a branch not taken fades away into the trees. */
const GHOST_FADE = 11;

export class TrailPath {
  constructor(canvas, wrap, scene) {
    this.canvas = canvas;
    this.wrap = wrap;
    this.scene = scene;
    this.ctx = canvas.getContext("2d");
    this.tex = null;
    this.texName = null;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
  }

  /** Load the texture for a surface, e.g. "earth" or "gravel". */
  setTexture(name) {
    if (name === this.texName) return;
    this.texName = name;
    if (!name) { this.tex = null; return; }
    const img = new Image();
    img.src = `assets/scene/path-${name}.png`;
    img.decoding = "async";
    // Only adopt it once it can actually be drawn, so a half-loaded texture
    // never paints a band of nothing across the trail.
    img.onload = () => { if (this.texName === name) this.tex = img; };
  }

  resize(w, h) {
    const bw = Math.round(w * this.dpr), bh = Math.round(h * this.dpr);
    if (this.canvas.width === bw && this.canvas.height === bh) return;
    this.canvas.width = bw;
    this.canvas.height = bh;
  }

  /**
   * @param {number} travelled  metres walked so far
   * @param {number} yaw        camera turn, same units the scenery uses
   * @param {function} bend     (z) => lateral metres of the trail at z ahead
   * @param {Array}   ghosts    branches not taken: {bend, fromZ, toZ}
   * @param {number}  visibleTo how far ahead the trail is still in view --
   *                            past a sharp corner it has turned out of frame
   */
  draw(travelled, yaw, bend, ghosts = [], visibleTo = Infinity) {
    const { width: cw, height: ch } = this.wrap.getBoundingClientRect();
    const vw = this.scene.clientWidth, vh = this.scene.clientHeight;
    if (!cw || !vw || !this.tex) return;

    this.resize(cw, ch);
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);

    // The wrap is centred on the scene and overhangs it on both sides; its top
    // edge sits on the horizon. That makes the mapping from screen to canvas a
    // single offset on each axis.
    const offX = (cw - vw) / 2;

    ctx.save();
    /*
     * Branches first, so the trail she is actually on draws over them where
     * they overlap at the junction. They share this routine exactly -- a fork
     * is the same ribbon with a different centreline, which is what keeps the
     * two seamless where they part company.
     */
    for (const g of ghosts) {
      this.ribbon(vw, vh, ch, offX, travelled, yaw, g.bend, g.fromZ, g.toZ);
    }
    this.ribbon(vw, vh, ch, offX, travelled, yaw, bend, 0, visibleTo);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  ribbon(vw, vh, ch, offX, travelled, yaw, bend, fromZ, toZ) {
    const ctx = this.ctx;
    const tex = this.tex;
    const pxPerMetre = tex.height / TEX_METRES;
    // The row where the far cutoff lands, so we never loop over rows we skip.
    const yFar = vh * EYE * FOCAL / MAX_Z;

    for (let y = Math.max(1, yFar); y < ch; y += STRIP) {
      // Invert the corridor's own ground projection: it puts a point at
      // distance z this far below the horizon, so this far below the horizon
      // is that distance.
      const z = vh * EYE * FOCAL / y;
      const zNext = vh * EYE * FOCAL / (y + STRIP);

      const scale = vw * FOCAL / z;
      const halfW = (TRAIL_W / 2) * scale;
      if (halfW < 0.5) continue;
      const off = bend(z);
      if (Number.isNaN(off)) continue;
      const cx = vw / 2 + (off - yaw * 2.6) * scale + offX;

      /*
       * The texture advances with distance, and one strip covers the depth
       * between this row and the next -- which is a few centimetres at her
       * feet and several metres near the cutoff. Taking that span from the
       * source is what keeps the texture from sliding against the ground.
       */
      // A branch exists only over its own stretch of trail.
      if (z < fromZ || z > toZ) continue;
      const s = travelled + z;
      const span = Math.max(0.001, z - zNext);
      const srcY = ((s % TEX_METRES) + TEX_METRES) % TEX_METRES * pxPerMetre;
      const srcH = Math.min(tex.height, span * pxPerMetre);

      const haze = z <= FADE_FROM ? 1
        : Math.max(0, 1 - (z - FADE_FROM) / (MAX_Z - FADE_FROM));
      // A branch also fades along its own length, so it goes into the trees
      // rather than stopping dead.
      const tail = Number.isFinite(toZ)
        ? Math.min(1, Math.max(0, (toZ - z) / GHOST_FADE))
        : 1;
      ctx.globalAlpha = haze * tail;

      // A tile boundary inside the strip needs two draws, or drawImage clamps
      // and the texture visibly stalls for a row.
      const over = srcY + srcH - tex.height;
      if (over > 0) {
        const firstH = srcH - over;
        const split = STRIP * (firstH / srcH);
        ctx.drawImage(tex, 0, srcY, tex.width, firstH,
                      cx - halfW, y, halfW * 2, split);
        ctx.drawImage(tex, 0, 0, tex.width, over,
                      cx - halfW, y + split, halfW * 2, STRIP - split);
      } else {
        ctx.drawImage(tex, 0, srcY, tex.width, srcH,
                      cx - halfW, y, halfW * 2, STRIP);
      }
    }
  }
}
