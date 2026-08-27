/* art.js — every sprite in the game, generated once at boot.
   Shapes are shaded like little ellipsoids and then quantised to a five-step
   ramp, which is what gives the flat 8-bit look without hand-placing pixels. */
(function () {
  'use strict';
  var TD = window.TD;
  var Pix = TD.Pix, rgb = TD.rgb, hash2 = TD.hash2;

  var C = {
    fur: [0xffdf9e, 0xf5b45c, 0xd9862f, 0xa8571d, 0x74390f].map(rgb),
    furRim: rgb(0x4d2609),
    paw: rgb(0x2a180c),
    grass: [0x86c447, 0x6fae3a, 0x5b9530, 0x487d26].map(rgb),
    leafDark: [0x4f9433, 0x3d7a28, 0x2c5b1d].map(rgb),
    trunk: [0x7d5330, 0x5c3a20, 0x3d2513].map(rgb),
    rock: [0xc6bda8, 0xa39982, 0x7d745f, 0x584f3f].map(rgb),
    dirt: [0xd2a878, 0xb98a56, 0x9c6e40, 0x7d552f].map(rgb),
    ball: [0xe8ec6a, 0xc3cb3f, 0x93991f].map(rgb),
    white: rgb(0xffffff),
    cloud: [0xffffff, 0xdfeef7].map(rgb),
    wing: [0xffd45e, 0xe89b2c, 0x8c4f12].map(rgb)
  };

  /* Ellipsoid-ish lighting: fake a surface normal from position, dot with a
     fixed light, add directional "fur" streaks, quantise into `ramp`. */
  function shader(cx, cy, rx, ry, ramp, opt) {
    opt = opt || {};
    var fur = opt.fur == null ? 1 : opt.fur;
    var bias = opt.bias || 0;
    var lx = -0.5, ly = -0.62, lz = 0.6;
    return function (x, y) {
      var nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
      var q = nx * nx + ny * ny;
      var nz = Math.sqrt(Math.max(0.02, 1 - q));
      var d = nx * lx + ny * ly + nz * lz;
      d = d * 0.52 + 0.47 + bias;
      if (fur) {
        d += 0.055 * Math.sin(x * 2.25 + Math.sin(y * 0.55) * 2.2) * fur;
        d += 0.04 * Math.sin(x * 0.85 - y * 1.6) * fur;
        d += (hash2(x, y) - 0.5) * 0.06 * fur;
      }
      var i = Math.round((1 - d) * (ramp.length - 1));
      return ramp[i < 0 ? 0 : i >= ramp.length ? ramp.length - 1 : i];
    };
  }

  /* Wobbly ellipse — the wobble is what sells "fluffy" at this resolution. */
  function blobTest(cx, cy, rx, ry, seed, amp, freq) {
    amp = amp == null ? 0.05 : amp;
    freq = freq || 9;
    return function (x, y) {
      var dx = (x - cx) / rx, dy = (y - cy) / ry;
      var a = Math.atan2(dy, dx);
      var r = 1 + amp * Math.sin(a * freq + seed) + amp * 0.65 * Math.sin(a * (freq * 1.7) + seed * 2.3);
      return dx * dx + dy * dy <= r * r;
    };
  }

  function ellipse(p, cx, cy, rx, ry, shade) {
    p.shape(function (x, y) {
      var dx = (x - cx) / rx, dy = (y - cy) / ry;
      return dx * dx + dy * dy <= 1;
    }, shade);
  }

  function flat(c) { return function () { return c; }; }

  /* ---- dog ------------------------------------------------------------- */

  function buildDog() {
    var d = {};

    // Rump seen from behind: a fluffy oval, widest across the hips.
    var BW = 27, BH = 19;
    var body = new Pix(BW, BH);
    var taper = function (y) { return 0.72 + 0.28 * Math.min(1, y / (BH * 0.55)); };
    body.shape(function (x, y) {
      var dx = (x - (BW / 2 - 0.5)) / (BW * 0.49 * taper(y));
      var dy = (y - BH * 0.5) / (BH * 0.5);
      var a = Math.atan2(dy, dx);
      var r = 1 + 0.06 * Math.sin(a * 8 + 1.7) + 0.04 * Math.sin(a * 13 + 3.9);
      return dx * dx + dy * dy <= r * r;
    }, shader(BW * 0.38, BH * 0.3, BW * 0.5, BH * 0.52, C.fur, { fur: 1 }));
    // Spine crease and a shaded gap between the haunches — without these the
    // whole thing reads as one ball.
    body.shape(function (x, y) {
      return y > BH * 0.46 && y < BH * 0.88 && Math.abs(x - (BW / 2 - 0.5)) < 1.0;
    }, flat(C.fur[3]));
    body.rim(C.furRim);
    d.body = body.trim().bake();

    // Head: lighter than the body so it separates at a glance.
    var HW = 14, HH = 13;
    var head = new Pix(HW, HH);
    head.shape(blobTest(HW / 2 - 0.5, HH * 0.54, HW * 0.44, HH * 0.46, 4.2, 0.05, 7),
      shader(HW * 0.38, HH * 0.32, HW * 0.5, HH * 0.5, C.fur, { fur: 0.8, bias: 0.16 }));
    head.rim(C.furRim);
    d.head = head.trim().bake();

    // In the reference she runs with her ears flying straight out sideways,
    // so they are horizontal flaps rather than hanging lobes. Two tilts.
    function makeEar(tilt) {
      var w = 11, h = 10, p = new Pix(w, h);
      var sh = shader(w * 0.3, h * 0.34, w * 0.8, h * 0.6, C.fur, { fur: 1, bias: -0.04 });
      p.stroke(1.5, h / 2 + tilt * 2.0, w - 3.0, h / 2 - tilt * 2.4, 2.2, 3.2, sh);
      p.rim(C.furRim);
      return p.trim();
    }
    var earUp = makeEar(1), earFlat = makeEar(0.1);
    d.ears = [
      [earUp.flip().bake(), earUp.bake()],       // flapped up
      [earFlat.flip().bake(), earFlat.bake()]    // level
    ];

    // Legs are strokes, so the paw lands at a predictable offset.
    function leg(w, h, topR, botR, pawR) {
      var p = new Pix(w, h);
      var sh = shader(w * 0.35, h * 0.28, w * 0.6, h * 0.7, C.fur, { fur: 0.7, bias: -0.06 });
      p.stroke(w / 2, 1, w / 2 - 0.4, h - pawR - 1.2, topR, botR, sh);
      ellipse(p, w / 2 - 0.4, h - pawR - 0.5, pawR + 0.4, pawR, flat(C.paw));
      p.rim(C.furRim);
      ellipse(p, w / 2 - 0.4, h - pawR - 0.5, pawR - 0.3, pawR - 0.6, flat(C.paw));
      return p.trim().bake();
    }
    // One leg sprite per pair; the two sides differ only by animation phase.
    d.hind = leg(9, 15, 3.4, 2.1, 2.3);
    d.front = leg(7, 12, 2.6, 1.7, 1.9);

    // Three tail poses: curled left, up, curled right. Thick enough to read.
    /* Tail arcs up out of the rump and curls over to one side. Four poses
       give a wag that never sits bolt upright behind the head. */
    function tail(bend) {
      var w = 25, h = 16, p = new Pix(w, h);
      var sh = shader(w * 0.42, h * 0.34, w * 0.62, h * 0.62, C.fur, { fur: 1.5, bias: -0.04 });
      var c = w / 2;
      // Up out of the rump, over, and hooked back down — a curl, not a stick.
      p.stroke(c, h - 1, c + bend * 1.8, h * 0.50, 4.0, 3.3, sh);
      p.stroke(c + bend * 1.8, h * 0.50, c + bend * 7.4, h * 0.16, 3.3, 2.5, sh);
      p.stroke(c + bend * 7.4, h * 0.16, c + bend * 10.2, h * 0.50, 2.5, 1.8, sh);
      p.rim(C.furRim);
      return p.bake();
    }
    d.tail = [tail(-1), tail(-0.45), tail(0.45), tail(1)];
    return d;
  }

  /* ---- scenery --------------------------------------------------------- */

  function pine() {
    var w = 24, h = 44, p = new Pix(w, h);
    p.shape(function (x, y) { return y > h - 10 && Math.abs(x - w / 2) < 2.2; },
      shader(w / 2 - 2, h - 9, 3, 8, C.trunk, { fur: 0.3 }));
    for (var i = 0; i < 4; i++) {
      var ty = 3 + i * 8.6, tw = 3.5 + i * 3.1, th = 11;
      (function (ty, tw) {
        p.shape(function (x, y) {
          var t = (y - ty) / th;
          return t >= 0 && t <= 1 && Math.abs(x - w / 2 + 0.5) < tw * t + 1.4;
        }, shader(w / 2 - tw * 0.5, ty + 2, tw + 4, th, C.leafDark, { fur: 0.55 }));
      })(ty, tw);
    }
    p.rim(rgb(0x1d3f16));
    return p.trim().bake();
  }

  function broadleaf(seed) {
    var w = 30, h = 40, p = new Pix(w, h);
    p.shape(function (x, y) { return y > h - 15 && Math.abs(x - w / 2 + 0.5) < 2.4 - (h - y) * 0.02; },
      shader(w / 2 - 2, h - 12, 3.4, 12, C.trunk, { fur: 0.35 }));
    var lobes = [[0.5, 0.28, 0.46, 0.32], [0.28, 0.42, 0.3, 0.24], [0.73, 0.44, 0.3, 0.23], [0.5, 0.14, 0.3, 0.18]];
    for (var i = 0; i < lobes.length; i++) {
      var L = lobes[i];
      p.shape(blobTest(w * L[0], h * L[1], w * L[2], h * L[3], seed + i, 0.07, 7),
        shader(w * (L[0] - 0.12), h * (L[1] - 0.09), w * L[2], h * L[3], C.leafDark, { fur: 0.6 }));
    }
    p.rim(rgb(0x1d3f16));
    return p.trim().bake();
  }

  function bush(seed) {
    var w = 20, h = 14, p = new Pix(w, h);
    for (var i = 0; i < 3; i++) {
      var bx = w * (0.24 + i * 0.26), by = h * (0.62 - (i === 1 ? 0.16 : 0));
      p.shape(blobTest(bx, by, w * 0.24, h * 0.42, seed + i * 2.1, 0.09, 6),
        shader(bx - 2, by - 3, w * 0.26, h * 0.44, C.leafDark, { fur: 0.7 }));
    }
    p.rim(rgb(0x1d3f16));
    return p.trim().bake();
  }

  function rock(seed) {
    var w = 14, h = 10, p = new Pix(w, h);
    p.shape(blobTest(w / 2, h * 0.62, w * 0.46, h * 0.5, seed, 0.08, 5),
      shader(w * 0.36, h * 0.34, w * 0.5, h * 0.55, C.rock, { fur: 0.25 }));
    p.rim(rgb(0x393330));
    return p.trim().bake();
  }

  function log() {
    var w = 30, h = 12, p = new Pix(w, h);
    p.shape(function (x, y) {
      var dy = (y - h * 0.55) / (h * 0.34);
      var dx = (x - w * 0.5) / (w * 0.48);
      return dy * dy + Math.pow(Math.abs(dx), 6) <= 1;
    }, shader(w * 0.5, h * 0.3, w, h * 0.5, C.trunk, { fur: 0.6 }));
    ellipse(p, w - 4.0, h * 0.55, 2.8, h * 0.34, flat(C.trunk[0]));
    ellipse(p, w - 4.0, h * 0.55, 1.5, h * 0.18, flat(C.trunk[1]));
    p.rim(rgb(0x2c1a0e));
    return p.trim().bake();
  }

  function tuft(seed) {
    var w = 13, h = 9, p = new Pix(w, h);
    for (var i = 0; i < 8; i++) {
      var bx = 1.5 + i * 1.4, lean = (TD.hash1(seed * 71 + i * 13) - 0.5) * 3.4;
      var top = 1 + TD.hash1(i * 7 + seed * 3) * 4;
      p.stroke(bx, h - 1, bx + lean, top, 1.2, 0.6,
        flat(C.leafDark[i % 3 === 0 ? 0 : 1]));
    }
    // A couple of sunlit blades so the clump is not a solid slab.
    for (var j = 0; j < 3; j++) {
      var jx = 2 + TD.hash1(seed * 31 + j) * (w - 4);
      p.stroke(jx, h - 2, jx + 1, 2, 0.8, 0.5, flat(C.grass[0]));
    }
    return p.trim().bake();
  }

  function ball() {
    var w = 9, h = 9, p = new Pix(w, h);
    p.shape(blobTest(w / 2 - 0.5, h / 2 - 0.5, w * 0.46, h * 0.46, 0, 0.01, 4),
      shader(w * 0.34, h * 0.32, w * 0.5, h * 0.5, C.ball, { fur: 0 }));
    p.set(2, 3, C.white); p.set(6, 5, C.white);
    p.rim(rgb(0x6d7317));
    return p.trim().bake();
  }

  function stick() {
    var w = 16, h = 8, p = new Pix(w, h);
    p.stroke(1.5, h - 2.5, w - 2, 2.5, 1.4, 1.2, shader(w * 0.4, h * 0.3, w, h, C.trunk, { fur: 0.4 }));
    p.stroke(w * 0.55, h * 0.5, w * 0.72, h - 1.5, 1.1, 0.8, flat(C.trunk[1]));
    p.rim(rgb(0x2c1a0e));
    return p.trim().bake();
  }

  function butterfly() {
    var p = new Pix(9, 7);
    p.shape(blobTest(2.6, 3, 2.4, 2.6, 1, 0.1, 4), flat(C.wing[0]));
    p.shape(blobTest(6.4, 3, 2.4, 2.6, 2, 0.1, 4), flat(C.wing[1]));
    p.set(4, 2, C.wing[2]); p.set(4, 3, C.wing[2]); p.set(4, 4, C.wing[2]);
    return p.trim().bake();
  }

  function cloud(seed) {
    var w = 40, h = 16, p = new Pix(w, h);
    for (var i = 0; i < 4; i++) {
      var cx = w * (0.18 + i * 0.22), cy = h * (0.68 - Math.sin(i * 1.3 + seed) * 0.2);
      p.shape(blobTest(cx, cy, w * 0.17, h * 0.42, seed + i, 0.08, 5), flat(C.cloud[0]));
    }
    p.shape(function (x, y) { return y > h - 3 && p.at(x, y) === C.cloud[0]; }, flat(C.cloud[1]));
    return p.trim().bake();
  }

  function build() {
    return {
      dog: buildDog(),
      pine: pine(),
      tree: [broadleaf(0.5), broadleaf(3.1)],
      bush: [bush(1.2), bush(5.7)],
      rock: [rock(2.2), rock(6.4)],
      log: log(),
      tuft: [tuft(1), tuft(2), tuft(3)],
      ball: ball(),
      stick: stick(),
      butterfly: butterfly(),
      cloud: [cloud(0.7), cloud(2.9), cloud(4.4)]
    };
  }

  TD.C = C;
  TD.buildArt = build;
})();
