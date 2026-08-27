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

import { regionMix } from "./regions.js";

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

/**
 * A light damping on top of the aim: metres walked, and seconds elapsed.
 *
 * Distance alone was a bug with a long reach. Standing still means ds is zero,
 * which makes the easing factor exactly zero -- so the camera could not turn AT
 * ALL while she was stopped. Every fix for "the fork is not framed when she
 * stops" was landing on a camera that was never going to move: the aim point
 * blended correctly onto the fork and the heading simply never followed it.
 */
const CAM_EASE = 1.6;
const CAM_EASE_TIME = 0.8;

/**
 * Seconds to swing the camera between looking up the trail and looking at the
 * junction she has stopped at.
 *
 * Eased by TIME, not by distance -- she is standing still for all of it, so a
 * distance-based ease would never move. Switching the aim outright instead put
 * a jump at each end of every ask, which measured as a doubling of the worst
 * view swing in the game.
 */
const AIM_BLEND = 0.55;

/**
 * How far both branches must be drawable before she will offer a choice.
 *
 * Some edges curve hard just past their node. In the camera's frame such a
 * branch stops getting further away within a metre or two, sampling ends there,
 * and it draws as a stub -- a third of forks looked like that. Asking about a
 * fork the player cannot see is worse than not asking at all.
 */
const MIN_SHOW = 9;

/**
 * The fastest a DRAWN branch may turn, in radians per metre.
 *
 * The topology is the invariant; the line on the ground is not. A branch only
 * has to leave in the right direction and reach the next node -- how it gets
 * there is ours to choose. Some edges curve hard just past their node, and
 * traced faithfully they stop receding from the camera within a metre or two,
 * which is what drew a third of forks as stubs.
 *
 * Following the real edge's heading but capping how fast the drawn line may
 * turn toward it keeps the branch heading away from the camera, so it stays
 * visible for its whole length. It arrives at the same place; it simply gets
 * there without the kink.
 */
const SOFT_TURN = 0.05;

/**
 * How far a DRAWN branch may end up from the trail it leaves, in radians.
 *
 * A branch stops being drawable once it passes ninety degrees off the camera,
 * because from there it no longer gets further away and the sampling has
 * nothing left to follow. Capping the drawn heading well short of that means
 * it always keeps receding, so it reads as a path going off into the trees
 * rather than as a stub.
 *
 * The real edge may of course wander further than this on its way to the next
 * node -- but by then it is deep in the haze, where the difference between the
 * line we draw and the line on the map is not observable.
 */
const SOFT_MAX_DEV = 1.0;

/**
 * How far a drawn branch is splayed off the trail it leaves, in radians.
 *
 * Tracing the true departure angle is honest and unreadable. The branches open
 * about ninety screen pixels apart at the junction and Molly is a hundred wide,
 * so the dog stands squarely in front of the fork and the player sees one path.
 *
 * The line on the ground is ours to choose, so the branch is drawn leaving
 * wide -- at least this far off the trunk -- and allowed to bend back toward
 * its real heading over the following stretch. It reaches the same node; it
 * just announces itself first.
 */
const SPLAY = 0.62;

/**
 * How far back along the trail a branch is drawn before it leaves, in metres.
 *
 * A branch that starts exactly at its node begins with a straight cut across
 * the ribbon -- and because it is already splayed by then, that cut sits off to
 * one side of the trail and only catches it at a corner. It reads as a piece of
 * path lying near the trail rather than joining it.
 *
 * Running it back down the trunk first, and rounding the whole line together,
 * means the two share the same ground for a few metres and part company
 * smoothly. That is what makes a crotch instead of a gap.
 *
 * A few metres is all it needs -- the rounding reaches about two. Set as long
 * as the stopping distance it redraws the whole visible trail underneath the
 * main ribbon, which costs a second pass over every row for nothing.
 */
const MERGE = 4.5;

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

/**
 * How often a junction with a real choice is one she asks about.
 *
 * High, because by the time this applies the junction has already had to pass
 * a much harder test: both branches must draw as visible paths. Most of the
 * thinning happens there, so being choosy here as well just made forks rare.
 */
const ASK_CHANCE = 0.9;

/**
 * The sharpest branch she will offer, in radians.
 *
 * Wider than MAX_TURN, because left to herself she only counts the gentle
 * continuations and at most junctions there is exactly one of those -- offering
 * only what she would take meant a real choice came up at a tenth of junctions.
 * Asked, she will put a sharper branch on the table, because taking it is the
 * player's call and not hers.
 *
 * But not much sharper. At 1.5 rad a branch leaves almost perpendicular and
 * turns out of frame within a metre: measured, those drew as a 0.2 m stub, and
 * choosing one left the trail itself a stub. An option that cannot be seen is
 * not an option.
 */
const ASK_TURN = 1.05;

/**
 * The least angle between the two branches she will offer, in radians.
 *
 * A fork has to look like a fork. Ten junctions in sixty-nine had arms three or
 * four degrees apart -- 0.2 m of separation two metres past the node -- which
 * is a bend in the trail, not a choice, however it is drawn. Below this she
 * simply walks through and says nothing.
 */
const ASK_SPREAD = 0.42;

/**
 * How far short of the junction she stops to ask, in metres.
 *
 * Well back, because the camera follows from behind HER. Stopping four metres
 * out put the fork barely two metres past the dog, where her own body covers
 * it -- the branches were measurably metres apart and the player saw one path.
 *
 * Not so far back that the split happens in the haze either: from here the Y
 * opens between about ten and sixteen metres, which is the stretch of trail
 * that is both ahead of her and still clear.
 */
export const ASK_DIST = 7.0;

/**
 * How close she can be to a junction and still be steered onto the other arm.
 *
 * Below this the turn would have to happen under her feet, which reads as the
 * trail jumping rather than as her taking the other path.
 */
const STEER_MIN = 3.0;

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
      /*
       * Offer exactly two branches, the pair that separates most widely.
       *
       * Two because the gesture is left or right -- a third option has nothing
       * to map onto. The widest pair because that is the one that reads as a
       * fork from behind her.
       */
      const offer = outward.filter((e) => Math.abs(turnOf(e)) <= ASK_TURN);
      /*
       * The pair that separates most widely. Which side of the view each falls
       * on is not a condition -- of any two branches one is always further
       * left and the other further right, and that is what the swipe resolves
       * against. Requiring them to straddle the centre line as well threw away
       * a third of the junctions for no gain the player could see.
       */
      let pair = null, best = ASK_SPREAD;
      for (let i = 0; i < offer.length; i++) {
        for (let j = i + 1; j < offer.length; j++) {
          const spread = Math.abs(turnOf(offer[i]) - turnOf(offer[j]));
          if (spread > best) { best = spread; pair = [offer[i], offer[j]]; }
        }
      }
      seg.options = pair;
      seg.ask = !!pair && this.rand() < ASK_CHANCE;
      this.route.push(seg);
      ahead += seg.len;
    }
  }

  advance(ds, dt = 0) {
    if (!(ds > 0)) { this.resample(0, dt); return; }
    this.travelled += ds;
    this.pos += ds;
    while (this.route.length > 1 && this.pos >= this.route[0].len) {
      this.pos -= this.route[0].len;
      this.route.shift();
    }
    this.extend();
    this.resample(ds, dt);
  }

  /**
   * The point AIM metres up the rounded trail that the camera looks at.
   *
   * Sampled well past AIM and then read from the middle. `roundOff` holds its
   * endpoints fixed, so taking the last sample would pin the one point the
   * camera actually uses to the unrounded line -- the corner would be rounded
   * everywhere except in the place that decides where the camera points.
   */
  /**
   * Where the camera looks: up the trail, or at a junction she has stopped at.
   *
   * The route always holds a provisional choice, so up the trail means already
   * turning onto one arm before the player has answered -- which frames a fork
   * as "straight on, and something off to the side" rather than as a Y. Looking
   * at the node puts both branches either side of centre, which is the entire
   * point of stopping to ask.
   *
   * The two are blended, never switched: a switch jumps the view at both ends
   * of every ask.
   */
  aimPoint() {
    const i = Math.round(AIM / STEP);
    const n = i + Math.round(ROUND_TAIL / STEP);
    const pts = new Array(n + 1);
    for (let k = 0; k <= n; k++) pts[k] = this.ahead(k * STEP);
    const far = roundOff(pts, ROUND_PASSES)[i];

    const b = this.aimAtNode || 0;
    if (b < 0.002) return far;

    /*
     * Look at the junction itself: down the trunk she is standing on.
     *
     * Not at the midpoint between the two branches, which was the obvious
     * idea and is wrong -- both arms can lie the same side of the trail, and
     * the camera then swings far enough to carry Molly out of frame. She is
     * the subject; the fork is what is in front of her. Down the trunk keeps
     * her centred and opens the Y ahead of her, which is the shot.
     */
    const gap = Math.max(1, this.route[0].len - this.pos);
    const near = this.ahead(gap);
    return { x: far.x + (near.x - far.x) * b, y: far.y + (near.y - far.y) * b };
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
   * Steer onto the branch on `side` at the junction ahead, while she walks.
   *
   * Forks are drawn at every junction in view, not only the ones she stops to
   * ask about -- so the player can watch one coming for twenty metres. Making
   * the sideways gesture mean something only during an ask left them watching
   * a fork arrive with no way to act on it.
   *
   * Judged on the DRAWN branches, because that is what the player is steering
   * by. Returns false when she is already headed that way, or when the
   * junction is too close to turn onto anything without teleporting.
   */
  steer(side) {
    const next = this.route[1];
    if (!next) return false;
    const gap = this.route[0].len - this.pos;
    if (gap < STEER_MIN || gap > LOOK) return false;

    const here = this.ghosts().filter((g) => g.node === next.from);
    if (!here.length) return false;

    const z = Math.min(gap + 6, this.visibleTo - 0.5);
    const mine = this.bendAt()(z);
    let pick = null, bestLat = null;
    for (const g of here) {
      if (z < g.fromZ || z > g.toZ) continue;
      const lat = g.bend(z);
      if (side < 0 ? lat >= mine : lat <= mine) continue;   // not that way
      if (bestLat === null || (side < 0 ? lat < bestLat : lat > bestLat)) {
        bestLat = lat; pick = g;
      }
    }
    if (!pick) return false;
    return this.takeBranch(pick.edge, side, z, mine);
  }

  /**
   * Switch to `edge`, and put it back if it did not go the way asked.
   *
   * A branch is drawn one way as a ghost -- rate-limited and splayed clear of
   * the trail -- and another way once it IS the trail, straight off the route.
   * Two different lines, so no amount of care picking by the ghost can predict
   * exactly where the main ribbon lands. Rather than predict it, do it and
   * look: one steer in seven used to end up on the opposite branch from the
   * one asked for, and there is no version of that a player forgives.
   */
  takeBranch(edge, side, z, wasLat) {
    const next = this.route[1];
    const keep = { edge: next.edge, len: next.len, ask: next.ask, vetted: next.vetted };
    const tail = this.route.slice(2);

    next.edge = edge;
    next.len = this.map.edges[edge].length;
    next.ask = false;
    next.vetted = true;
    this.route.length = 2;
    this.extend();
    this.resample();

    const now = this.bendAt()(z);
    if (side < 0 ? now < wasLat : now > wasLat) return true;

    Object.assign(next, keep);
    this.route.length = 2;
    this.route.push(...tail);
    this.extend();
    this.resample();
    return false;
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
    /*
     * Answering always resolves the ask, whether or not it changes her mind.
     * Pressing the side she is already headed is a confirmation, not a no-op --
     * standing there because the player agreed with her would read as being
     * ignored.
     */
    this.steer(side);
    this.decideAlone();
    return true;
  }

  /** Which side of the trail the branch she is provisionally on lies. */
  takenSide() {
    const next = this.route[1];
    if (!next) return 1;
    return this.sideOf(next.edge, next.from);
  }

  /** Stop asking and keep the branch she had already picked. */
  decideAlone() {
    if (this.route[1]) this.route[1].ask = false;
  }

  /**
   * Put her down in a named region. A development affordance, not a mechanic.
   *
   * Prefers a trail with BOTH ends in the region, so she arrives somewhere that
   * reads as that place rather than halfway through a transition into it.
   */
  jumpTo(regionId) {
    const whole = this.map.edges.filter((e) =>
      this.map.nodes[e.a].region === regionId && this.map.nodes[e.b].region === regionId);
    const any = this.map.edges.filter((e) =>
      this.map.nodes[e.a].region === regionId || this.map.nodes[e.b].region === regionId);
    const pool = whole.length ? whole : any;
    if (!pool.length) return false;

    const edge = pool[Math.floor(this.rand() * pool.length)];
    const from = this.map.nodes[edge.a].region === regionId ? edge.a : edge.b;
    this.route = [this.segment(edge.id, from)];
    this.pos = this.route[0].len * 0.35;
    this.aimAtNode = 0;
    this.extend();

    // Point the camera before sampling: the easing cannot turn it on a frame
    // that covers no time and no distance, so it has to start correct.
    const p = this.here();
    const t0 = this.aimPoint();
    const l = Math.hypot(t0.x - p.x, t0.y - p.y) || 1;
    this.camTx = (t0.x - p.x) / l;
    this.camTy = (t0.y - p.y) / l;
    this.resample();
    return true;
  }

  /** The ground she is on, as a blend of two regions. */
  region() {
    const seg = this.route[0];
    return regionMix(this.map, seg.edge, seg.from, this.pos);
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
  resample(ds = 0, dt = 0) {
    this.vetAsk();
    // Ease toward the junction while she is asking, and back afterwards.
    const want = this.pendingAsk() ? 1 : 0;
    this.aimAtNode = (this.aimAtNode || 0)
      + (want - (this.aimAtNode || 0)) * (1 - Math.exp(-Math.max(0, dt) / AIM_BLEND));

    const p = this.here();

    // Aim at a point up the trail; fall back to the tangent if that point is
    // somehow on top of her (a doubled-back stub).
    const t = this.aimPoint();
    let ax = t.x - p.x, ay = t.y - p.y;
    const al = Math.hypot(ax, ay);
    if (al < 0.5) { ax = p.tx; ay = p.ty; }
    else { ax /= al; ay /= al; }

    const k = 1 - Math.exp(-(Math.max(0, ds) / CAM_EASE + Math.max(0, dt) / CAM_EASE_TIME));
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
   * How far a branch stays drawable, in a frame aimed between the two arms.
   *
   * Measured in the frame the player will actually see it in -- looking down
   * the trunk at the junction -- not the frame the camera happens to be in
   * while she is still walking up to it. Judging by the present heading, or by
   * any other frame, passes forks that then draw as stubs.
   */
  /**
   * A branch as it is DRAWN: the real edge's direction, softened.
   *
   * Integrates a heading that chases the edge's own but may not turn faster
   * than SOFT_TURN, so the line bends instead of kinking.
   */
  softBranch(edge, node, len, ref = null, startDev = null) {
    const start = this.map.pointAt(edge, node, 0);
    let x = start.x, y = start.y, h = Math.atan2(start.ty, start.tx);
    if (startDev !== null) h = ref + startDev;
    const bound = (a) => {
      if (ref === null) return a;
      let d = a - ref;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      return ref + Math.max(-SOFT_MAX_DEV, Math.min(SOFT_MAX_DEV, d));
    };
    h = bound(h);

    const pts = [{ x, y }];
    const cap = SOFT_TURN * STEP;
    for (let d = STEP; d <= len; d += STEP) {
      const q = this.map.pointAt(edge, node, d);
      let dh = bound(Math.atan2(q.ty, q.tx)) - h;
      while (dh > Math.PI) dh -= 2 * Math.PI;
      while (dh < -Math.PI) dh += 2 * Math.PI;
      h = bound(h + Math.max(-cap, Math.min(cap, dh)));
      x += Math.cos(h) * STEP;
      y += Math.sin(h) * STEP;
      pts.push({ x, y });
    }
    return pts;
  }

  /** The direction the trail arrives at a node by -- what a branch leaves from. */
  trunkHeading(seg) {
    const t = this.map.pointAt(seg.edge, seg.from, seg.len);
    return Math.atan2(t.ty, t.tx);
  }

  forkSpan(ask) {
    const here = this.here();
    // The frame the camera will actually be in: looking down the trunk at the
    // junction. Judging in any other frame passes forks that then stub.
    const node = this.map.pointAt(this.route[0].edge, this.route[0].from, this.route[0].len);
    let tx = node.x - here.x, ty = node.y - here.y;
    const l = Math.hypot(tx, ty) || 1;
    tx /= l; ty /= l;

    let worst = Infinity;
    for (const e of ask.options) {
      let last = -Infinity, first = null, end = 0;
      for (const p of this.softBranch(e, ask.node, GHOST_LEN, this.trunkHeading(this.route[0]))) {
        const f = (p.x - here.x) * tx + (p.y - here.y) * ty;
        if (first === null) { if (f <= 0.25) continue; first = f; }
        else if (f <= last) break;
        last = f; end = f;
      }
      worst = Math.min(worst, first === null ? 0 : end - first);
    }
    return worst;
  }

  /**
   * Decide, once, whether a junction ahead is worth stopping at.
   *
   * Sticky: the answer must not flicker as she walks the last few metres in.
   */
  vetAsk() {
    const next = this.route[1];
    if (!next || !next.ask || next.vetted) return;
    if (this.route[0].len - this.pos > ASK_DIST + 4) return;
    next.vetted = true;
    if (this.forkSpan({ node: next.from, options: next.options }) < MIN_SHOW) {
      next.ask = false;
    }
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
        /*
         * Splayed away from the branch she is on -- but splayed RELATIVE to
         * it, so their order is preserved.
         *
         * Pushing the branch out to a fixed angle from the trunk flips that
         * order whenever both arms lean the same way: the one that is really
         * on the right gets drawn further out and reads as the left one. That
         * put one steer in seven onto the opposite branch from the one asked
         * for. Measuring the splay from the taken arm instead guarantees both
         * a visible gap AND that left on screen is left in the model.
         */
        const ref = this.trunkHeading(this.route[i]);
        const devOf = (id) => {
          const p = this.map.pointAt(id, node.id, 0);
          let d = Math.atan2(p.ty, p.tx) - ref;
          while (d > Math.PI) d -= 2 * Math.PI;
          while (d < -Math.PI) d += 2 * Math.PI;
          return d;
        };
        const td = devOf(taken);
        const gd = devOf(e);
        const apart = Math.sign(gd - td) || 1;
        const drawnDev = td + apart * Math.max(Math.abs(gd - td), SPLAY);
        /*
         * Start back down the trail she is on, then peel away. Rounding the
         * joined line smooths the corner at the node into a fork.
         */
        const seg = this.route[i];
        const back = Math.min(MERGE, seg.len);
        const raw = [];
        for (let d = seg.len - back; d < seg.len - 1e-6; d += STEP) {
          raw.push(this.map.pointAt(seg.edge, seg.from, d));
        }
        raw.push(...this.softBranch(e, node.id, GHOST_LEN, ref, drawnDev));
        const bpts = roundOff(raw, ROUND_PASSES);
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
          edge: e,
          node: node.id,
          at: d,                       // distance to the junction it leaves
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
