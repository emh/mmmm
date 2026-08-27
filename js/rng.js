/**
 * Deterministic seeded RNG.
 *
 * PRD §37 requires a reproducible seed so simulation bugs can be replayed.
 * Every stochastic decision in the dog model must draw from here, never from
 * Math.random, or replays diverge.
 */

/** mulberry32 — small, fast, good enough for behaviour noise. */
export function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    /** [0,1) */
    float: next,
    /** [min,max) */
    range: (min, max) => min + next() * (max - min),
    /** integer [min,max] inclusive */
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    /** true with probability p */
    chance: (p) => next() < p,
    pick: (list) => list[Math.floor(next() * list.length)],
    /** symmetric noise in [-amount, +amount] */
    noise: (amount) => (next() * 2 - 1) * amount,
    /**
     * Weighted pick. Used for behaviour selection: PRD §7 asks that we choose
     * among high-utility candidates rather than always the argmax, so the dog
     * has a recognisable personality without being mechanically predictable.
     */
    weighted: (items, weightOf) => {
      const weights = items.map(weightOf);
      const total = weights.reduce((sum, w) => sum + Math.max(0, w), 0);
      if (total <= 0) return items[0];
      let roll = next() * total;
      for (let i = 0; i < items.length; i++) {
        roll -= Math.max(0, weights[i]);
        if (roll <= 0) return items[i];
      }
      return items[items.length - 1];
    },
    /** current internal state, so a save can resume the exact sequence */
    snapshot: () => a,
  };
}

export function restoreRng(snapshot) {
  const rng = makeRng(0);
  // makeRng closes over `a`; rebuild by seeding with the stored value.
  return makeRng(snapshot >>> 0);
}

/** A seed that is stable per-save but arbitrary per new game. */
export function freshSeed() {
  return (Date.now() ^ (Math.random() * 0xFFFFFFFF)) >>> 0;
}
