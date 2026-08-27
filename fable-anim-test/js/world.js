/* world.js — the trail itself.
   Everything here is a pure function of world distance `z`, so the path ahead
   never changes shape and nothing needs to be stored. */
(function () {
  'use strict';
  var TD = window.TD;
  var hash1 = TD.hash1, hash2 = TD.hash2;

  var CAM_H = 2.25;         // camera height, metres
  var DOG_Z = 2.8;          // how far ahead of the camera Molly runs
  var VIEW = 78;            // draw distance, metres
  var FOG_NEAR = 22, FOG_FAR = 74;

  function diffAt(z) { return Math.min(1, z / 1500); }

  /* Trail centreline offset in metres. Four sines: two long lazy meanders the
     player barely notices, two short ones that do the actual work. The short
     amplitudes grow with distance, so late turns bite. */
  function centerAt(z) {
    var d = diffAt(z);
    return 2.2 * Math.sin(z * 0.0165) +
           1.5 * Math.sin(z * 0.0075 + 1.7) +
           (0.45 + 0.80 * d) * Math.sin(z * 0.050 + 4.2) +
           (0.12 + 0.34 * d) * Math.sin(z * 0.105 + 2.4);
  }

  /* Trail narrows as you get further out. */
  function halfWidthAt(z) { return 0.86 - 0.19 * diffAt(z); }

  /* The edges wander independently of the centreline, so the path looks worn
     rather than paved. Returns metres of extra width on that side. */
  function edgeAt(z, side) {
    return side < 0
      ? 0.15 * Math.sin(z * 1.31) + 0.09 * Math.sin(z * 3.07 + 2.0)
      : 0.15 * Math.sin(z * 1.63 + 1.1) + 0.09 * Math.sin(z * 2.57);
  }
  function speedAt(z) { return 9 + 5 * diffAt(z); }

  /* --- procedural props -------------------------------------------------
     Each stream is a fixed-pitch series of slots; a hash of the slot index
     decides what (if anything) lives there. Infinite, allocation-free. */

  var SCENERY_STEP = 1.9;
  var PICKUP_STEP = 11;
  var OBSTACLE_STEP = 19;
  var LITTER_STEP = 0.55;

  /* side is -1 or 1. Returns null or {kind, variant, off, wh} where `off` is
     metres from the centreline and `wh` is the prop's world height. */
  function sceneryAt(slot, side) {
    var h = hash2(slot * 2 + (side > 0 ? 1 : 0), 91);
    if (h > 0.68) return null;
    var r = hash2(slot, side * 17 + 5);
    var spread = hash2(slot, side * 31 + 3);
    var kind, variant = (hash1(slot * 3 + side) * 2) | 0, wh;
    if (r < 0.46) { kind = 'tuft'; wh = 0.3 + spread * 0.22; }
    else if (r < 0.58) { kind = 'bush'; wh = 0.58; }
    else if (r < 0.66) { kind = 'rock'; wh = 0.22; }
    else if (r < 0.71) { kind = 'log'; wh = 0.26; }
    else if (r < 0.89) { kind = 'tree'; wh = 4.2 + spread * 2.4; }
    else { kind = 'pine'; wh = 5.4 + spread * 2.8; }
    // Bigger things stand further back so they never crowd the running line.
    var near = (kind === 'tree' || kind === 'pine') ? 2.4 : 0.1;
    // Big trunks stay within a few metres of the path, or they simply never
    // make it into frame at close range.
    var reach = (kind === 'tree' || kind === 'pine') ? 6.0 : 7.0;
    var off = (halfWidthAt(slot * SCENERY_STEP) + near + spread * spread * reach) * side;
    return { kind: kind, variant: variant, off: off, wh: wh };
  }

  function pickupAt(slot) {
    var h = hash2(slot, 401);
    if (h > 0.72) return null;
    var hw = halfWidthAt(slot * PICKUP_STEP);
    return {
      kind: h < 0.42 ? 'ball' : 'stick',
      off: (hash2(slot, 733) - 0.5) * 1.35 * hw,
      wh: h < 0.42 ? 0.26 : 0.2
    };
  }

  function obstacleAt(slot) {
    var z = slot * OBSTACLE_STEP;
    if (z < 260) return null;
    var h = hash2(slot, 977);
    var chance = 0.30 + 0.30 * diffAt(z);
    if (h > chance) return null;
    var hw = halfWidthAt(z);
    var big = hash2(slot, 313);
    return {
      kind: big < 0.45 ? 'log' : 'rock',
      variant: (big * 2) | 0,
      off: (hash2(slot, 155) - 0.5) * 1.55 * hw,
      wh: big < 0.45 ? 0.3 : 0.26,
      hit: big < 0.45 ? 0.6 : 0.4
    };
  }

  TD.world = {
    CAM_H: CAM_H, DOG_Z: DOG_Z, VIEW: VIEW,
    FOG_NEAR: FOG_NEAR, FOG_FAR: FOG_FAR,
    SCENERY_STEP: SCENERY_STEP, PICKUP_STEP: PICKUP_STEP,
    OBSTACLE_STEP: OBSTACLE_STEP, LITTER_STEP: LITTER_STEP,
    diffAt: diffAt, centerAt: centerAt, halfWidthAt: halfWidthAt, edgeAt: edgeAt, speedAt: speedAt,
    sceneryAt: sceneryAt, pickupAt: pickupAt, obstacleAt: obstacleAt
  };
})();
