/**
 * The trail network: a real map, generated once from the seed.
 *
 * Until now a "fork" was a lateral shift with a ghost branch that faded into
 * the trees. It led nowhere. Walk a loop back to the same junction and there
 * would be nothing there, because nothing was ever recorded. This is the map
 * that makes a junction a place rather than an effect: the branch she does not
 * take is a real edge going to a real node, and it is still there when she
 * comes back to it.
 *
 * Nodes are junctions with honest 2D positions in metres; edges are the
 * stretches of trail between them. Everything else -- which way she went, what
 * is drawn, where the scenery may stand -- is derived from this.
 *
 * Generated from the seed, so the same walk always lays out the same park.
 */

/** How far apart junctions are allowed to be placed, in metres. */
const MIN_SEP = 44;
const MAX_LINK = 132;

/**
 * The most trails that may meet at one node.
 *
 * Three: the one she arrives on, and the two she chooses between. The degree
 * cap is enforced even when repairing connectivity -- an unreachable corner of
 * the park is a smaller problem than a junction the controls cannot express.
 */
const MAX_DEGREE = 3;

/** The least angle two trails may leave the same junction by. */
const MIN_FAN = 0.7;

/**
 * How far off the through-line a side trail joins, in radians.
 *
 * A real trail junction is a path carrying on with something joining it, not
 * three arms at arbitrary angles.
 *
 * This band is what sets the sharpest corner in the game. Arriving along a
 * spur, the turn onto the main trail is the ONLY option that is not a hairpin,
 * so it is forced -- no route weighting can avoid it. Keeping the spur shallow
 * keeps that forced corner walkable; keeping it past 30 degrees keeps the two
 * trails visibly separate where they meet.
 */
const SPUR_MIN = 0.55, SPUR_MAX = 0.85;

/**
 * How far a trail may leave a node from the direction of its own neighbour.
 *
 * Without this the angular design is a wish that the geometry need not grant.
 * Told to run "straight through" a two-edge node whose neighbours actually sit
 * ninety degrees apart, one arm ends up pointing 135 degrees away from the node
 * it has to reach, and the edge loops right round to get there. Measured across
 * eight maps, nine tenths of the arms were within 142 degrees of their
 * neighbour -- which is to say the design was routinely impossible.
 *
 * Clamping makes it a preference. Relaxation then moves the junctions so the
 * clamp binds less and less.
 */
const MAX_STRAIN = 0.62;

/** Layout relaxation: how hard each force pulls, and the limits on it. */
const ANG_GAIN = 0.10;
const SPRING = 0.14;
const REPEL = 0.6;
const REST = 78;
const MAX_STEP = 1.6;

/** How far a junction may be moved from where it was first placed. */
const LEASH = 34;

const wrap = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

/** Samples per edge for the arc-length table. */
const SAMPLES = 120;

/*
 * The wander laid along each edge.
 *
 * The graph gives topology and the large-scale line; on its own that is a
 * gentle Hermite bow across seventy-odd metres, which measured out at about a
 * fifth of the curvature that reads as a curve. This is the metre-scale
 * curviness that makes it feel like a trail rather than a survey line.
 *
 * Tuned by curvature -- A/L^2 -- because that is the only part the eye can
 * see: the camera turns to look along the trail, so the swing itself cancels.
 * The spatial period is 2*pi*L, and it has to stay well above the ~16 m of
 * trail that is clear of haze, or a whole S-bend fits on screen and the trail
 * reads as a snake. These give ~0.036/m at a period of 107 m and 53 m.
 */
const W1 = 5.5, WL1 = 17.0;
const W2 = 1.2, WL2 = 8.5;

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const len = (v) => Math.hypot(v.x, v.y);
const cross = (a, b) => a.x * b.y - a.y * b.x;

/** Do segments pq and rs properly cross? Shared endpoints do not count. */
function crosses(p, q, r, s) {
  if (p === r || p === s || q === r || q === s) return false;
  const d1 = cross(sub(q, p), sub(r, p));
  const d2 = cross(sub(q, p), sub(s, p));
  const d3 = cross(sub(s, r), sub(p, r));
  const d4 = cross(sub(s, r), sub(q, r));
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

export class TrailMap {
  constructor(rand = Math.random, { count = 16, radius = 168, settle = true } = {}) {
    this.rand = rand;
    this.nodes = this.scatter(count, radius);
    this.edges = [];
    this.link();
    this.shape(settle);
  }

  /**
   * Junction positions: rejection sampling in a disc.
   *
   * A minimum separation matters more than it looks. Junctions closer together
   * than the ~34 m the camera can see would put two forks on screen at once,
   * and the trail would read as a tangle rather than a network.
   */
  scatter(count, radius) {
    const nodes = [];
    for (let tries = 0; tries < count * 400 && nodes.length < count; tries++) {
      const a = this.rand() * Math.PI * 2;
      const r = radius * Math.sqrt(this.rand());
      const p = { id: nodes.length, x: Math.cos(a) * r, y: Math.sin(a) * r, edges: [] };
      if (nodes.every((n) => len(sub(n, p)) >= MIN_SEP)) nodes.push(p);
    }
    return nodes;
  }

  addEdge(a, b, force = false) {
    const A = this.nodes[a], B = this.nodes[b];
    if (A.edges.some((e) => this.other(e, a) === b)) return false;
    // Never more than three trails at a node: you arrive on one and choose
    // between two. A fourth makes it a three-way choice, which the left/right
    // gesture has no answer for and which reads as a tangle on screen.
    if (A.edges.length >= MAX_DEGREE || B.edges.length >= MAX_DEGREE) return false;
    // No trail may cross another without a junction there to explain it --
    // unless the alternative is a piece of the park she can never reach.
    if (!force) {
      for (const e of this.edges) {
        if (crosses(A, B, this.nodes[e.a], this.nodes[e.b])) return false;
      }
    }
    const id = this.edges.length;
    this.edges.push({ id, a, b });
    A.edges.push(id);
    B.edges.push(id);
    return true;
  }

  other(edgeId, nodeId) {
    const e = this.edges[edgeId];
    return e.a === nodeId ? e.b : e.a;
  }

  /**
   * Connect the junctions.
   *
   * Nearest pairs first, which gives short natural trails and, because it keeps
   * going well past bare connectivity, plenty of loops -- so she can wander
   * indefinitely and keep arriving somewhere she has been.
   */
  link() {
    const pairs = [];
    for (let i = 0; i < this.nodes.length; i++) {
      for (let j = i + 1; j < this.nodes.length; j++) {
        pairs.push([len(sub(this.nodes[i], this.nodes[j])), i, j]);
      }
    }
    pairs.sort((p, q) => p[0] - q[0]);
    for (const [d, i, j] of pairs) { if (d <= MAX_LINK) this.addEdge(i, j); }

    /*
     * Nearest-first with a crossing rule leaves islands: a cluster links up
     * tightly among itself and every edge out of it crosses something. Joining
     * whatever is still separate is not optional -- an unreachable node is a
     * piece of park she can never get to, and a separate component she starts
     * in is a park with three junctions in it.
     */
    const root = this.nodes.map((_, i) => i);
    const find = (i) => { while (root[i] !== i) i = root[i] = root[root[i]]; return i; };
    for (const e of this.edges) root[find(e.a)] = find(e.b);
    for (const [, i, j] of pairs) {
      if (find(i) === find(j)) continue;
      if (this.addEdge(i, j, true)) root[find(i)] = find(j);
    }

    /*
     * Dead ends. One or two are fine -- a park has spurs -- but a trail that
     * stops means turning her round, so keep them rare.
     */
    for (const n of this.nodes) {
      if (n.edges.length > 1) continue;
      for (const [, i, j] of pairs) {
        if (i !== n.id && j !== n.id) continue;
        if (this.addEdge(i, j)) break;
      }
    }
  }

  /**
   * Decide, for every node, which way each of its trails leaves it.
   *
   * This is what stops the network kinking. A node with exactly two edges is
   * not a junction at all -- it is a bend, and there is nothing to choose
   * there, so whatever angle its two edges happen to meet at is an angle she is
   * forced to walk. Measured over 16 km that produced fifty-odd turns of
   * 80-100 degrees and one of 152. Giving both edges the same through-line
   * makes a two-edge node a smooth bend instead.
   *
   * Real junctions -- three edges or more -- keep their fan, because there the
   * angle is a choice and the walker can decline the sharp ones.
   */
  /**
   * The direction each trail should leave a node by, as bearings.
   *
   * This is the angular design of a junction, computed from wherever the nodes
   * currently sit. Both the layout relaxation and the final tangents read it --
   * relaxation moves the nodes until reality agrees with it, and the tangents
   * apply whatever small correction is left.
   *
   *   two edges    a bend, not a junction: made exactly straight through, so
   *                there is nothing to choose and nothing to turn
   *   three plus   a trail carrying on with something joining it: the
   *                straightest pair is made exactly opposite, and every other
   *                arm joins near the far end of that line
   */
  armBearings(n) {
    const dirTo = (edgeId) => {
      const o = this.nodes[this.other(edgeId, n.id)];
      const d = sub(o, n);
      return Math.atan2(d.y, d.x);
    };
    const out = new Map();

    if (n.edges.length === 1) {
      out.set(n.edges[0], dirTo(n.edges[0]));
      return out;
    }

    if (n.edges.length === 2) {
      const [e1, e2] = n.edges;
      const a1 = dirTo(e1), a2 = dirTo(e2);
      const raw2 = new Map([[e1, a1], [e2, a2]]);
      const through = Math.atan2(
        Math.sin(a2) - Math.sin(a1),
        Math.cos(a2) - Math.cos(a1),
      );
      out.set(e1, through + Math.PI);
      out.set(e2, through);
      return this.clampStrain(out, raw2);
    }

    const raw = new Map(n.edges.map((e) => [e, dirTo(e)]));
    const arms = n.edges.map((e) => ({ e, a: raw.get(e) }));
    let bi = 0, bj = 1, best = Infinity;
    for (let i = 0; i < arms.length; i++) {
      for (let j = i + 1; j < arms.length; j++) {
        const off = Math.abs(Math.abs(wrap(arms[i].a - arms[j].a)) - Math.PI);
        if (off < best) { best = off; bi = i; bj = j; }
      }
    }
    const through = Math.atan2(
      Math.sin(arms[bi].a) - Math.sin(arms[bj].a),
      Math.cos(arms[bi].a) - Math.cos(arms[bj].a),
    );
    arms[bi].a = through;
    arms[bj].a = through + Math.PI;

    // Spurs alternate sides so two never stack up together, and the side is a
    // property of the node rather than a fresh coin flip, so relaxation is
    // chasing a fixed target instead of a moving one.
    let side = (n.id % 2) ? 1 : -1;
    for (let i = 0; i < arms.length; i++) {
      if (i === bi || i === bj) continue;
      const d = wrap(arms[i].a - (through + Math.PI));
      const mag = Math.min(SPUR_MAX, Math.max(SPUR_MIN, Math.abs(d)));
      arms[i].a = through + Math.PI + (d >= 0 ? side : -side) * mag;
      side = -side;
    }
    for (const arm of arms) out.set(arm.e, arm.a);
    return this.clampStrain(out, raw);
  }

  /** Hold every arm within MAX_STRAIN of the way its own neighbour lies. */
  clampStrain(want, raw) {
    for (const [e, a] of want) {
      const base = raw.get(e);
      const d = Math.max(-MAX_STRAIN, Math.min(MAX_STRAIN, wrap(a - base)));
      want.set(e, base + d);
    }
    return want;
  }

  /**
   * Move the junctions until the layout agrees with the angular design.
   *
   * The topology is the invariant; where the junctions physically sit is not.
   * Imposing the through-line on the tangents alone left every edge leaving in
   * a direction that was not toward its neighbour, so it had to curve hard to
   * get there -- and it curved hardest right at the node, which is exactly
   * where she is turning. Relaxing the positions removes that strain instead of
   * smoothing over it afterwards.
   *
   * Three forces: turn each node's arms toward the bearings they want, hold
   * edges near a comfortable length, and keep unrelated junctions apart. No
   * edge is ever added or removed, so the network she can walk is untouched.
   */
  relax(iters = 500) {
    const N = this.nodes.length;
    const fx = new Float64Array(N), fy = new Float64Array(N);
    const home = this.nodes.map((n) => ({ x: n.x, y: n.y }));

    for (let it = 0; it < iters; it++) {
      fx.fill(0); fy.fill(0);
      // Ease off as it settles, so it converges instead of ringing.
      const gain = 0.55 * (1 - it / iters) + 0.05;

      for (const n of this.nodes) {
        const want = this.armBearings(n);
        for (const e of n.edges) {
          const m = this.nodes[this.other(e, n.id)];
          const d = sub(m, n), r = len(d) || 1;
          const cur = Math.atan2(d.y, d.x);
          const turn = wrap(want.get(e) - cur) * ANG_GAIN;
          // Swing the neighbour round this node, and take the reaction on the
          // node itself so the network does not drift as a whole.
          const tx = -Math.sin(cur) * r * turn, ty = Math.cos(cur) * r * turn;
          fx[m.id] += tx * 0.5; fy[m.id] += ty * 0.5;
          fx[n.id] -= tx * 0.5; fy[n.id] -= ty * 0.5;
        }
      }

      for (const e of this.edges) {
        const A = this.nodes[e.a], B = this.nodes[e.b];
        const d = sub(B, A), r = len(d) || 1;
        const pull = (r - REST) * SPRING;
        const ux = d.x / r, uy = d.y / r;
        fx[e.a] += ux * pull; fy[e.a] += uy * pull;
        fx[e.b] -= ux * pull; fy[e.b] -= uy * pull;
      }

      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const A = this.nodes[i], B = this.nodes[j];
          if (A.edges.some((e) => this.other(e, i) === j)) continue;
          const d = sub(B, A), r = len(d) || 1;
          if (r >= MIN_SEP) continue;
          const push = (MIN_SEP - r) * REPEL;
          fx[i] -= (d.x / r) * push; fy[i] -= (d.y / r) * push;
          fx[j] += (d.x / r) * push; fy[j] += (d.y / r) * push;
        }
      }

      for (const n of this.nodes) {
        // Cap the step: one badly-placed node can otherwise fling itself across
        // the park and take the whole layout with it.
        let dx = fx[n.id] * gain, dy = fy[n.id] * gain;
        const l = Math.hypot(dx, dy);
        if (l > MAX_STEP) { dx = dx / l * MAX_STEP; dy = dy / l * MAX_STEP; }
        n.x += dx; n.y += dy;
        // Leashed to where it started, so the park keeps its overall shape and
        // one runaway node cannot drag the layout across the map.
        const h = home[n.id];
        const off = Math.hypot(n.x - h.x, n.y - h.y);
        if (off > LEASH) {
          n.x = h.x + (n.x - h.x) * LEASH / off;
          n.y = h.y + (n.y - h.y) * LEASH / off;
        }
      }
    }

    /*
     * Relaxation can push two unrelated trails across each other. Rather than
     * constrain every step, back the whole thing off toward where it started
     * until nothing crosses -- the topology is the thing that must survive, and
     * the original layout is known to be crossing-free.
     */
    for (let attempt = 0; attempt < 8 && this.crossings(); attempt++) {
      for (const n of this.nodes) {
        const h = home[n.id];
        n.x = h.x + (n.x - h.x) * 0.5;
        n.y = h.y + (n.y - h.y) * 0.5;
      }
    }
    if (this.crossings()) {
      for (const n of this.nodes) { n.x = home[n.id].x; n.y = home[n.id].y; }
    }
  }

  /** How many pairs of trails cross without a junction to explain it. */
  crossings() {
    let c = 0;
    for (let i = 0; i < this.edges.length; i++) {
      for (let j = i + 1; j < this.edges.length; j++) {
        const e = this.edges[i], f = this.edges[j];
        if (crosses(this.nodes[e.a], this.nodes[e.b],
                    this.nodes[f.a], this.nodes[f.b])) c++;
      }
    }
    return c;
  }

  /** Apply whatever correction the relaxed layout has not already achieved. */
  tangents() {
    this.tan = new Map();
    const key = (n, e) => n * 1000 + e;
    for (const n of this.nodes) {
      const want = this.armBearings(n);
      for (const [e, a] of want) {
        this.tan.set(key(n.id, e), { x: Math.cos(a), y: Math.sin(a) });
      }
    }
  }

  /**
   * Give every edge a curve and an arc-length table.
   *
   * A cubic Hermite between the two nodes, using the leaving directions decided
   * above, plus the wander laid along it.
   */
  shape(settle = true) {
    if (settle) this.relax();
    this.tangents();
    const key = (n, e) => n * 1000 + e;
    for (const e of this.edges) {
      const A = this.nodes[e.a], B = this.nodes[e.b];
      const L = len(sub(B, A));
      const bow = 0.62 * L;
      const da = this.tan.get(key(e.a, e.id));
      const db = this.tan.get(key(e.b, e.id));
      e.ta = { x: da.x * bow, y: da.y * bow };
      // The Hermite derivative at B points along travel, INTO the node -- the
      // opposite of the direction the trail leaves B by.
      e.tb = { x: -db.x * bow, y: -db.y * bow };

      const ph1 = this.rand() * Math.PI * 2, ph2 = this.rand() * Math.PI * 2;
      const pts = [], cum = [0];
      for (let i = 0; i <= SAMPLES; i++) {
        const t = i / SAMPLES;
        const h00 = 2 * t ** 3 - 3 * t ** 2 + 1;
        const h10 = t ** 3 - 2 * t ** 2 + t;
        const h01 = -2 * t ** 3 + 3 * t ** 2;
        const h11 = t ** 3 - t ** 2;
        const p = {
          x: h00 * A.x + h10 * e.ta.x + h01 * B.x + h11 * e.tb.x,
          y: h00 * A.y + h10 * e.ta.y + h01 * B.y + h11 * e.tb.y,
        };

        const g00 = 6 * t * t - 6 * t, g10 = 3 * t * t - 4 * t + 1;
        const g01 = -6 * t * t + 6 * t, g11 = 3 * t * t - 2 * t;
        const dx = g00 * A.x + g10 * e.ta.x + g01 * B.x + g11 * e.tb.x;
        const dy = g00 * A.y + g10 * e.ta.y + g01 * B.y + g11 * e.tb.y;
        const dl = Math.hypot(dx, dy) || 1;

        /*
         * sin^2 taper, not sin: zero in both value AND slope at each end, so
         * the wander cannot tilt the trail where it meets a node. A plain sine
         * leaves a kink there, and a kink at a fork is the one place it would
         * be obvious.
         */
        const taper = Math.sin(Math.PI * t) ** 2;
        const u = t * L;
        const w = taper * (W1 * Math.sin(u / WL1 + ph1) + W2 * Math.sin(u / WL2 + ph2));
        p.x += (-dy / dl) * w;
        p.y += (dx / dl) * w;

        pts.push(p);
        if (i) cum.push(cum[i - 1] + len(sub(pts[i], pts[i - 1])));
      }
      e.pts = pts;
      e.cum = cum;
      e.length = cum[cum.length - 1];
    }
  }

  /**
   * A point along an edge, `s` metres from node `from`.
   *
   * Returns the position and the unit tangent pointing in the direction of
   * travel, which is what the camera needs to know which way is forward.
   */
  pointAt(edgeId, from, s) {
    const e = this.edges[edgeId];
    const forward = e.a === from;
    const want = forward ? s : e.length - s;
    const cum = e.cum;

    let lo = 0, hi = cum.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= want) lo = mid; else hi = mid;
    }
    const span = cum[hi] - cum[lo] || 1;
    const t = Math.min(1, Math.max(0, (want - cum[lo]) / span));
    const p = e.pts[lo], q = e.pts[hi];
    const d = sub(q, p), dl = len(d) || 1;
    const sign = forward ? 1 : -1;
    return {
      x: p.x + d.x * t,
      y: p.y + d.y * t,
      tx: (d.x / dl) * sign,
      ty: (d.y / dl) * sign,
    };
  }
}
