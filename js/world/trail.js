/**
 * Walking the trail network.
 *
 * The map (trailmap.js) says what the park is; this says where she is on it and
 * what that looks like from behind her.
 *
 * Everything the renderers need comes out of one operation: sample the route
 * ahead in world coordinates, then express those points in the camera's frame.
 * `bend(z)` is how far left or right the trail is at z metres ahead, and it is
 * measured off the real geometry rather than modelled -- so the path texture,
 * the scenery and Molly cannot disagree about where the trail is, and a fork
 * genuinely goes somewhere instead of running parallel forever.
 *
 * The camera looks along the trail, so absolute bearing is unobservable and is
 * never used; only the local turn rate is, and only to pan the backdrop.
 */

/** How far ahead the route is sampled, in metres. */
const LOOK = 40;

/** Sampling step along the trail, in metres. */
const STEP = 0.5;

/** How far a branch not taken is drawn past its junction. */
const GHOST_LEN = 26;

/**
 * The sharpest turn she will make at a junction, in radians.
 *
 * Without a limit the route happily doubles back on itself: two edges can meet
 * at any angle, and a near-hairpin measured out at 33 m of bend and a turn rate
 * of 29 degrees per metre. Nobody walks a trail that way -- at a fork you carry
 * on in roughly the direction you were already going.
 *
 * Not tighter than this, though. At a three-way node the arms fan out roughly
 * 120 degrees apart, so carrying on at all MEANS turning about 60 -- at 51
 * degrees nothing qualified and the "straightest of a bad lot" fallback fired
 * a quarter of the time, which is how the 121-degree turns got in.
 */
const MAX_TURN = 1.15;

/**
 * How far up the trail the camera looks, in metres.
 *
 * The camera aims at a point ahead rather than along the tangent under her
 * feet. That difference is the whole corner problem: the tangent steps at a
 * node, so following it snaps the world sideways, and easing toward it just
 * turns the snap into a lag -- during which the trail can be entirely behind
 * the camera and nothing is drawn at all. An aim point rounds the corner
 * gradually as she approaches, so the heading is continuous by construction
 * and never lags behind where she is actually going.
 */
const AIM = 9;

/** A light damping on top of the aim, to take the edge off. */
const CAM_EASE = 1.6;

/**
 * Passes of corner rounding over the sampled trail.
 *
 * Two edges meeting at a junction have different tangents, so the path has a
 * genuine kink there -- zero turning radius, walked in a single step. Aiming
 * the camera ahead smooths how the corner is *watched*, but the trail itself
 * still turned on a point. Smoothing the sampled line rounds the corner for
 * everything derived from it at once: the drawn path, the scenery beside it,
 * and where Molly walks.
 *
 * Each pass is a [1 2 1] kernel over samples STEP apart, so the radius grows as
 * sqrt(passes) -- this is about four metres. The radius is what caps how fast
 * the view can swing: a 68-degree turn inside a two-metre corner is 34 degrees
 * per metre however smoothly it is drawn, and it is the turn rate the player
 * feels, not the corner angle.
 *
 * Still small enough not to eat the shape of the trail itself, whose own
 * wander runs over tens of metres.
 */
const ROUND_PASSES = 55;

/** Extra trail sampled past a point of interest so it can be rounded at all. */
const ROUND_TAIL = 10;

/** How often a junction with a real choice is one she asks about. */
const ASK_CHANCE = 0.55;

/**
 * The sharpest branch she will offer, in radians.
 *
 * Wider than MAX_TURN on purpose. Left to herself she only counts the gentle
 * continuations, and at most junctions there is exactly one of those -- so
 * offering only what she would consider meant a real choice came up at a tenth
 * of junctions, roughly once every ten minutes of walking. Asked, she will put
 * a sharper branch on the table, because taking it is the player's call and
 * not hers.
 */
const ASK_TURN = 1.5;

/** How close to the junction she stops to ask, in metres. */
const ASK_DIST = 4.5;

/**
 * Round a sampled polyline, holding the ends still.
 *
 * Ping-pongs two flat arrays rather than allocating per pass: this runs on the
 * trail and on every visible branch, every frame.
 */
function roundOff(pts, passes) {
  const n = pts.length;
  if (n < 3) return pts;
  let ax = new Float64Array(n), ay = new Float64Array(n);
  let bx = new Float64Array(n), by = new Float64Array(n);
  for (let i = 0; i < n; i++) { ax[i] = pts[i].x; ay[i] = pts[i].y; }
  for (let p = 0; p < passes; p++) {
    bx[0] = ax[0]; by[0] = ay[0];
    bx[n - 1] = ax[n - 1]; by[n - 1] = ay[n - 1];
    for (let i = 1; i < n - 1; i++) {
      bx[i] = (ax[i - 1] + 2 * ax[i] + ax[i + 1]) / 4;
      by[i] = (ay[i - 1] + 2 * ay[i] + ay[i + 1]) / 4;
    }
    let tx = ax; ax = bx; bx = tx;
    let ty = ay; ay = by; by = ty;
  }
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = { x: ax[i], y: ay[i] };
  return out;
}

export class Trail {
  /**
   * @param {TrailMap} map
   * @param {function} rand seeded 0..1, so a walk is reproducible (§37)
   */
  constructor(map, rand = Math.random) {
    this.map = map;
    this.rand = rand;
    this.travelled = 0;

    // Start at a junction, on a trail leading out of it.
    const start = map.nodes[Math.floor(rand() * map.nodes.length)];
    this.route = [this.segment(start.edges[Math.floor(rand() * start.edges.length)], start.id)];
    this.pos = 0;
    this.extend();
    const p = this.here();
    const t0 = this.aimPoint();
    const l0 = Math.hypot(t0.x - p.x, t0.y - p.y) || 1;
    this.camTx = (t0.x - p.x) / l0;
    this.camTy = (t0.y - p.y) / l0;
    this.resample();
  }

  segment(edgeId, from) {
    return { edge: edgeId, from, len: this.map.edges[edgeId].length };
  }

  /** The node a segment leads to. */
  exit(seg) {
    return this.map.other(seg.edge, seg.from);
  }

  /**
   * Make sure the route reaches past the sampling horizon.
   *
   * Choices are made here and then held, so the trail drawn ahead of her is
   * always already the one she is going to take. Deciding on arrival instead
   * would snap the path from straight-on to the chosen branch at the moment of
   * the choice.
   */
  extend() {
    let ahead = this.route.reduce((a, s) => a + s.len, 0) - this.pos;
    while (ahead < LOOK + GHOST_LEN) {
      const last = this.route[this.route.length - 1];
      const node = this.map.nodes[this.exit(last)];
      // Anything but straight back the way she came -- unless it is a dead end,
      // where turning round is the only thing left to do.
      const inTan = this.map.pointAt(last.edge, last.from, last.len);
      const bearing = Math.atan2(inTan.ty, inTan.tx);
      const turnOf = (e) => {
        const t = this.map.pointAt(e, node.id, 0);
        let a = Math.atan2(t.ty, t.tx) - bearing;
        while (a > Math.PI) a -= 2 * Math.PI;
        while (a < -Math.PI) a += 2 * Math.PI;
        return a;
      };
      const outward = node.edges.filter((e) => e !== last.edge);
      const options = outward.filter((e) => Math.abs(turnOf(e)) <= MAX_TURN);
      let pick;
      if (options.length) {
        /*
         * Weighted toward carrying straight on, not a flat coin flip.
         *
         * A junction usually has a gentle continuation and a sharper one, and
         * choosing uniformly took the sharp one half the time. At this weight
         * a 68-degree turn is about a tenth as likely as carrying straight on,
         * so she mostly walks through and turning off stays an event -- which
         * is both how a dog behaves and much easier to watch.
         */
        const w = options.map((e) => Math.cos(turnOf(e) / 2) ** 12);
        let roll = this.rand() * w.reduce((a, b) => a + b, 0);
        pick = options[options.length - 1];
        for (let i = 0; i < options.length; i++) {
          roll -= w[i];
          if (roll <= 0) { pick = options[i]; break; }
        }
      } else if (outward.length) {
        // Everything here doubles back; take the straightest of a bad lot.
        pick = outward.reduce((a, b) => (Math.abs(turnOf(a)) <= Math.abs(turnOf(b)) ? a : b));
      } else {
        pick = last.edge;                    // a dead end; turn round
      }
      const seg = this.segment(pick, node.id);
      /*
       * Whether this junction is one she asks about. Decided when the route is
       * extended, not on arrival, so it cannot flicker as she walks up to it --
       * and only where there is a genuine choice to offer.
       */
      const offer = outward.filter((e) => Math.abs(turnOf(e)) <= ASK_TURN);
      seg.options = offer.length >= 2 ? offer : null;
      seg.ask = !!seg.options && this.rand() < ASK_CHANCE;
      this.route.push(seg);
      ahead += seg.len;
    }
  }

  advance(ds) {
    if (!(ds > 0)) { this.resample(); return; }
    this.travelled += ds;
    this.pos += ds;
    while (this.route.length > 1 && this.pos >= this.route[0].len) {
      this.pos -= this.route[0].len;
      this.route.shift();
    }
    this.extend();
    this.resample(ds);
  }

  /**
   * The point AIM metres up the rounded trail that the camera looks at.
   *
   * Sampled well past AIM and then read from the middle. `roundOff` holds its
   * endpoints fixed, so taking the last sample would pin the one point the
   * camera actually uses to the unrounded line -- the corner would be rounded
   * everywhere except in the place that decides where the camera points.
   */
  aimPoint() {
    const i = Math.round(AIM / STEP);
    const n = i + Math.round(ROUND_TAIL / STEP);
    const pts = new Array(n + 1);
    for (let k = 0; k <= n; k++) pts[k] = this.ahead(k * STEP);
    return roundOff(pts, ROUND_PASSES)[i];
  }

  /**
   * The junction she is standing at wanting an answer, or null.
   *
   * Only within ASK_DIST of it: further back she is still walking, and past it
   * the choice has already been made.
   */
  pendingAsk() {
    const next = this.route[1];
    if (!next || !next.ask) return null;
    const gap = this.route[0].len - this.pos;
    if (gap > ASK_DIST) return null;
    return { node: next.from, options: next.options, gap };
  }

  /**
   * Which side of the view a branch lies on: -1 left, +1 right.
   *
   * Measured in the camera's own frame off a point up the branch, so it is the
   * side the player actually sees it on -- not the side it is on in the map's
   * coordinates, which the camera has no relationship to.
   */
  sideOf(edgeId, node) {
    const p0 = this.p0;
    const p = this.map.pointAt(edgeId, node, 8);
    const lat = (p.x - p0.x) * p0.ty - (p.y - p0.y) * p0.tx;
    return lat < 0 ? -1 : 1;
  }

  /**
   * Take the branch on `side`, or the straightest if neither is on that side.
   *
   * The route past this junction was chosen on the old branch, so it is thrown
   * away and rebuilt -- everything downstream of a different turn is different.
   */
  choose(side) {
    const ask = this.pendingAsk();
    if (!ask) return false;
    const match = ask.options.filter((e) => this.sideOf(e, ask.node) === side);
    const pick = match.length
      ? match[Math.floor(this.rand() * match.length)]
      : null;
    if (pick === null) return false;
    const next = this.route[1];
    next.edge = pick;
    next.len = this.map.edges[pick].length;
    next.ask = false;
    this.route.length = 2;
    this.extend();
    this.resample();
    return true;
  }

  /** Stop asking and keep the branch she had already picked. */
  decideAlone() {
    if (this.route[1]) this.route[1].ask = false;
  }

  /** Her own position and facing on the map. */
  here() {
    return this.map.pointAt(this.route[0].edge, this.route[0].from, this.pos);
  }

  /** A world point along the route, `d` metres ahead of her. */
  ahead(d) {
    let rest = this.pos + d;
    for (const seg of this.route) {
      if (rest <= seg.len) return this.map.pointAt(seg.edge, seg.from, rest);
      rest -= seg.len;
    }
    const last = this.route[this.route.length - 1];
    return this.map.pointAt(last.edge, last.from, last.len);
  }

  /**
   * Rebuild the camera-frame view of the trail ahead.
   *
   * Forward distance is NOT arc length: round a bend the trail covers ground
   * without getting much further away, and on a hard enough turn it stops
   * receding at all. Sampling stops where forward distance stops increasing,
   * which is exactly the point where the trail has turned out of view -- so a
   * sharp corner simply ends, rather than folding back over itself.
   */
  resample(ds = 0) {
    const p = this.here();

    // Aim at a point up the trail; fall back to the tangent if that point is
    // somehow on top of her (a doubled-back stub).
    const t = this.aimPoint();
    let ax = t.x - p.x, ay = t.y - p.y;
    const al = Math.hypot(ax, ay);
    if (al < 0.5) { ax = p.tx; ay = p.ty; }
    else { ax /= al; ay /= al; }

    const k = 1 - Math.exp(-Math.max(0, ds) / CAM_EASE);
    let tx = this.camTx + (ax - this.camTx) * k;
    let ty = this.camTy + (ay - this.camTy) * k;
    const l = Math.hypot(tx, ty) || 1;
    this.camTx = tx / l;
    this.camTy = ty / l;
    const p0 = { x: p.x, y: p.y, tx: this.camTx, ty: this.camTy };
    this.p0 = p0;
    /*
     * Skip the leading stretch rather than stopping at it.
     *
     * Mid-corner the camera is still swinging round while the trail has already
     * turned, so the first few metres can be level with the camera or behind
     * it. Breaking on the first non-increasing sample threw the whole view away
     * and drew nothing; skipping until the trail is genuinely ahead draws it
     * entering from the side, which is what rounding a corner looks like.
     */
    const raw = [];
    for (let d = 0; d <= LOOK; d += STEP) raw.push(this.ahead(d));
    const pts = roundOff(raw, ROUND_PASSES);

    const fwd = [], lat = [];
    let last = -Infinity;
    for (const q of pts) {
      const dx = q.x - p0.x, dy = q.y - p0.y;
      const f = dx * p0.tx + dy * p0.ty;
      if (!fwd.length) {
        if (f <= 0.25) continue;
      } else if (f <= last) break;
      last = f;
      fwd.push(f);
      lat.push(dx * p0.ty - dy * p0.tx);
    }
    this.fwd = fwd;
    this.lat = lat;
    // Rebuilt lazily: a burst of scenery respawns asks for these many times in
    // one frame, and re-sampling every branch each time is pure waste.
    this._ghosts = null;

    // Local turn rate, in radians per metre. The only thing absolute bearing
    // is ever used for, and only to pan the backdrop.
    const b = this.ahead(6);
    this.turn = Math.atan2(b.ty, b.tx) - Math.atan2(this.camTy, this.camTx);
    if (this.turn > Math.PI) this.turn -= 2 * Math.PI;
    if (this.turn < -Math.PI) this.turn += 2 * Math.PI;
    this.turn /= 6;
  }

  /**
   * Read a sampled (forward, lateral) curve at forward distance z.
   *
   * Clamped at both ends rather than returning a sentinel. How far the curve
   * actually extends is a separate question, answered by `visibleTo`, and
   * callers that care about it are told the range explicitly -- an in-band
   * "no value" here got quietly turned into a lateral of zero, which drew the
   * trail going straight ahead at the exact moment it had turned out of view.
   */
  static read(fwd, lat, z) {
    if (!fwd.length) return 0;
    if (z <= fwd[0]) return lat[0];
    if (z >= fwd[fwd.length - 1]) return lat[lat.length - 1];
    let lo = 0, hi = fwd.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (fwd[mid] <= z) lo = mid; else hi = mid;
    }
    const span = fwd[hi] - fwd[lo] || 1;
    const t = (z - fwd[lo]) / span;
    return lat[lo] + (lat[hi] - lat[lo]) * t;
  }

  /** (z) => how far left (-) or right (+) the trail is, z metres ahead. */
  bendAt() {
    const { fwd, lat } = this;
    return (z) => Trail.read(fwd, lat, z);
  }

  /** How far ahead the trail stops being drawable, in metres. */
  get visibleTo() {
    return this.fwd.length ? this.fwd[this.fwd.length - 1] : 0;
  }

  /**
   * The branches she is not taking at the next junction.
   *
   * Real edges off the real map, sampled the same way -- which is what makes
   * them leave at their own angle and actually go somewhere. The old fake fork
   * was the main line shifted sideways by a fixed amount, so once it finished
   * separating it ran exactly parallel, and a constant gap converges toward the
   * vanishing point in perspective. It looked like the fork rejoined.
   */
  ghosts() {
    if (this._ghosts) return this._ghosts;
    const out = [];
    const p0 = this.p0;
    let d = this.route[0].len - this.pos;          // distance to the junction
    for (let i = 0; i < this.route.length - 1 && d <= LOOK; i++) {
      const node = this.map.nodes[this.exit(this.route[i])];
      const taken = this.route[i + 1].edge;
      for (const e of node.edges) {
        if (e === taken || e === this.route[i].edge) continue;
        const braw = [];
        for (let t = 0; t <= GHOST_LEN; t += STEP) braw.push(this.map.pointAt(e, node.id, t));
        const bpts = roundOff(braw, ROUND_PASSES);
        const fwd = [], lat = [];
        let last = -Infinity;
        for (const p of bpts) {
          const dx = p.x - p0.x, dy = p.y - p0.y;
          const f = dx * p0.tx + dy * p0.ty;
          if (f <= last) break;
          last = f;
          fwd.push(f);
          lat.push(dx * p0.ty - dy * p0.tx);
        }
        if (fwd.length < 3) continue;
        out.push({
          fromZ: fwd[0],
          toZ: fwd[fwd.length - 1],
          bend: (z) => Trail.read(fwd, lat, z),
        });
      }
      d += this.route[i + 1].len;
    }
    this._ghosts = out;
    return out;
  }

  /**
   * How far out to keep scenery clear at absolute arc length `s`.
   *
   * Zero away from a junction -- the scenery's own minimum offsets handle the
   * ordinary trail. Near one it returns the lateral reach of the branches she
   * is not taking, so the undergrowth parts around the whole junction instead
   * of growing down the middle of another path.
   */
  clearance(s) {
    const z = s - this.travelled;
    let worst = 0;
    for (const g of this.ghosts()) {
      if (z < g.fromZ || z > g.toZ) continue;
      const v = g.bend(z);
      if (Math.abs(v) > Math.abs(worst)) worst = v;
    }
    return worst;
  }
}
