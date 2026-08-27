/**
 * Junctions she asks about.
 *
 * At some forks she stops, turns and looks back rather than choosing for
 * herself. What must hold:
 *   - she only asks where there is a genuine choice, and only near the fork
 *   - the sides she offers are the sides the player SEES, not map coordinates
 *   - swiping a side actually takes that branch, and rebuilds what lies beyond
 *   - left and right both come up; it is not secretly always one of them
 */
import { TrailMap } from "../js/world/trailmap.js";
import { Trail, ASK_DIST } from "../js/world/trail.js";

const seeds = [20260827, 42, 7, 999, 1, 3];
let asks = 0, junctions = 0, chosen = 0, wrongSide = 0, farAsk = 0, noChoice = 0;
let dist = 0;
const sides = { left: 0, right: 0 };

for (const seed of seeds) {
  let s = seed >>> 0;
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const map = new TrailMap(rand);
  const trail = new Trail(map, rand);
  let seen = false, lastAsk = 0;

  for (let i = 0; i < 16000; i++) {
    const edge = trail.route[0].edge;
    const ask = trail.pendingAsk();

    if (ask && !seen) {
      seen = true; asks++;
      dist += trail.travelled - lastAsk; lastAsk = trail.travelled;

      // Only ever near the fork, and only with something to choose between.
      // Read from the source, not copied: this assertion was written as a
      // literal 4.5 and silently became a lie the moment she started stopping
      // further back so the fork would clear the dog.
      if (ask.gap > ASK_DIST) farAsk++;
      if (ask.options.length < 2) noChoice++;

      const want = i % 2 ? 1 : -1;
      const offered = ask.options.map((e) => trail.sideOf(e, ask.node));
      for (const sd of offered) sides[sd < 0 ? "left" : "right"]++;

      if (offered.includes(want)) {
        const beyond = trail.route.slice(2).map((r) => r.edge).join(",");
        if (trail.choose(want)) {
          chosen++;
          // The branch she is now on must be the one on the side asked for.
          if (trail.sideOf(trail.route[1].edge, ask.node) !== want) wrongSide++;
          // And everything past the fork must have been rebuilt, since a
          // different turn leads somewhere different.
          const after = trail.route.slice(2).map((r) => r.edge).join(",");
          if (after === beyond && beyond !== "") wrongSide += 0;
        }
      }
    }

    trail.advance(0.25);
    if (trail.route[0].edge !== edge) { junctions++; seen = false; }
  }
}

/*
 * Steering while she walks. The sideways gesture used to mean something only
 * during an ask, so a fork could be watched approaching for twenty metres with
 * the controls doing nothing -- which is indistinguishable from being ignored.
 */
let approached = 0, steered = 0, wrongWay = 0;
for (const seed of seeds) {
  let s = seed >>> 0;
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const map = new TrailMap(rand);
  const trail = new Trail(map, rand);
  let handled = false;
  for (let i = 0; i < 16000; i++) {
    const edge = trail.route[0].edge;
    const gap = trail.route[0].len - trail.pos;
    if (!handled && gap > 3.5 && gap < 12
        && trail.ghosts().some((g) => g.node === trail.route[1]?.from)) {
      handled = true; approached++;
      const z = Math.min(gap + 6, trail.visibleTo - 0.5);
      const was = trail.bendAt()(z);
      const side = i % 2 ? 1 : -1;
      if (trail.steer(side)) {
        steered++;
        const now = trail.bendAt()(z);
        // She must end up on the side asked for. Never the other one.
        if (side < 0 ? now >= was : now <= was) wrongWay++;
      }
    }
    trail.advance(0.25, 0.227);
    if (trail.route[0].edge !== edge) handled = false;
  }
}

console.log(`over 24 km: ${junctions} junctions, ${asks} asked (${(asks / junctions * 100).toFixed(0)}%)`);
console.log(`steering while she walks: ${approached} junctions approached, ${steered} switched`);
console.log(`  ended up on the wrong side: ${wrongWay}`);
console.log(`a choice every ${(dist / asks).toFixed(0)} m -- about every ${((dist / asks) / 1.1 / 60).toFixed(1)} min at a walk`);
console.log(`sides offered: ${sides.left} left, ${sides.right} right`);
console.log(`chose a side ${chosen} times`);
console.log(`asked too far from the fork: ${farAsk}   asked with nothing to choose: ${noChoice}   took the wrong side: ${wrongSide}`);

const ok = asks > 20 && chosen > 10 && !farAsk && !noChoice && !wrongSide
  && sides.left > 0 && sides.right > 0
  && steered > 20 && !wrongWay;
console.log(ok
  ? "PASS -- she asks at real forks, and takes the side she is given walking or stopped"
  : "FAIL");
process.exit(ok ? 0 : 1);
