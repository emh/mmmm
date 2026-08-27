/**
 * Three parts of the park, and the ground between them.
 *
 * The map says how the trails connect; this says what each stretch of it looks
 * like. Regions are assigned to JUNCTIONS, not to trails, which is what makes
 * the transitions solve themselves: an edge whose two ends are in different
 * regions IS the transition, and it is already exactly the right length -- the
 * walk from one to the other.
 *
 * That leaves nothing to place by hand and no seam to hide. A trail inside a
 * region reads as that region for its whole length; a trail between two reads
 * as a gradual change, because it is one.
 */

export const REGIONS = {
  /** Old growth: the park as it has been. Deep conifer forest, fern and salal. */
  cedar: {
    id: "cedar",
    ground: "floor",
    groundScale: 30,
    scenery: ["trunk-a.png", "trunk-b.png", "trunk-c.png", "trunk-d.png",
              "under-fern.png", "under-salal.png", "under-log.png", "under-stump.png"],
  },

  /** Broken rock and moss, with the big trees still standing over it. */
  rocky: {
    id: "rocky",
    ground: "rocky",
    groundScale: 26,
    scenery: ["trunk-b.png", "trunk-c.png", "trunk-d.png",
              "rock-slab.png", "rock-mossy.png", "w-boulder.png",
              "under-fern.png", "under-stump.png"],
  },

  /**
   * Open deciduous grove: smaller trees, grass underfoot, and enough sky that
   * the few big conifers left read as survivors rather than as the canopy.
   */
  grove: {
    id: "grove",
    ground: "grass",
    groundScale: 24,
    scenery: ["tree-alder.png", "tree-alder.png", "tree-alder.png",
              "grass-tuft.png", "grass-tuft.png",
              "under-fern.png", "trunk-b.png"],
  },
};

const ORDER = ["cedar", "rocky", "grove"];

/**
 * Give every junction a region, in three contiguous wedges.
 *
 * Wedges rather than anything cleverer because contiguity is the whole point:
 * scattering regions node by node would put a different landscape at every
 * turn, and the transition edges -- which is where the work happens -- would
 * outnumber the regions themselves.
 *
 * The park is not sliced from its centroid but from a point off to one side,
 * so the three parts come out different sizes and the walk does not feel like
 * a pie chart.
 */
export function assignRegions(map, rand = Math.random) {
  const n = map.nodes.length;
  const cx = map.nodes.reduce((a, p) => a + p.x, 0) / n;
  const cy = map.nodes.reduce((a, p) => a + p.y, 0) / n;
  const spread = Math.max(...map.nodes.map((p) => Math.hypot(p.x - cx, p.y - cy)));
  const ox = cx + (rand() - 0.5) * spread * 0.7;
  const oy = cy + (rand() - 0.5) * spread * 0.7;
  const turn = rand() * Math.PI * 2;

  for (const node of map.nodes) {
    let a = Math.atan2(node.y - oy, node.x - ox) - turn;
    while (a < 0) a += Math.PI * 2;
    node.region = ORDER[Math.min(ORDER.length - 1, Math.floor(a / (Math.PI * 2 / 3)))];
  }
  return map;
}

/** 0 before the change, 1 after it, easing through the middle of the edge. */
function ramp(t) {
  const u = Math.min(1, Math.max(0, (t - 0.28) / 0.44));
  return u * u * (3 - 2 * u);
}

/**
 * What the ground looks like `along` an edge, as a blend of two regions.
 *
 * Held at each end and changed through the middle, so a trail between two
 * regions still arrives somewhere definite rather than being permanently
 * halfway.
 */
export function regionMix(map, edgeId, fromNode, along) {
  const edge = map.edges[edgeId];
  const from = map.nodes[fromNode].region || "cedar";
  const to = map.nodes[map.other(edgeId, fromNode)].region || "cedar";
  const t = edge.length ? Math.min(1, Math.max(0, along / edge.length)) : 0;
  return { from: REGIONS[from], to: REGIONS[to], t: from === to ? 0 : ramp(t) };
}
