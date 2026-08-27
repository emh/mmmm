/* render.js — a scanline pseudo-3D renderer.
   Sky, hills and ground are written straight into a Uint32 buffer (one
   putImageData per frame); props and Molly go on top as nearest-neighbour
   drawImage calls. The whole canvas is tiny and gets upscaled by CSS. */
(function () {
  'use strict';
  var TD = window.TD;
  var rgb = TD.rgb, mix = TD.mix, hash1 = TD.hash1, hash2 = TD.hash2;
  var W3 = TD.world;

  var SKY = [0x4fa8dd, 0x74c2e8, 0x9ed8f0, 0xc4e9f5, 0xdff3f8].map(rgb);
  var HAZE = rgb(0xd6ecdf);
  var HILL_FAR = rgb(0x8fb98a), HILL_FAR_LIT = rgb(0xa4c99a);
  var HILL_NEAR = rgb(0x6a9c5c), HILL_NEAR_LIT = rgb(0x83b46c);
  var TREELINE = [0x3f7a33, 0x2f5f27].map(rgb);
  var GRASS = [0x74b23c, 0x66a032, 0x7ab93f, 0x74b03a].map(rgb);
  var GRASS_VERGE = rgb(0x8ac04a);        // sunlit fringe right at the edge
  var DIRT = [0xbe8f5c, 0xb5874f, 0xc99e69, 0xc09562].map(rgb);
  var EDGE_L = rgb(0xd6b782), EDGE_D = rgb(0x8d6a3e);
  var RUT_D = rgb(0xb08054), RUT_L = rgb(0xcfa678);
  var RUTS = [-0.58, 0.6];
  var SUN = rgb(0xfff6cf);

  function Layer(w, h) {
    this.c = document.createElement('canvas');
    this.c.width = w; this.c.height = h;
    this.ctx = this.c.getContext('2d');
    this.img = this.ctx.createImageData(w, h);
    this.buf = new Uint32Array(this.img.data.buffer);
    this.w = w; this.h = h;
  }
  Layer.prototype.clear = function () { this.buf.fill(0); };
  Layer.prototype.flush = function () { this.ctx.putImageData(this.img, 0, 0); };

  function Renderer(canvas, art) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.art = art;
    this.items = [];
    this.hudSig = '';
    this.resize(canvas.clientWidth || 360, canvas.clientHeight || 640);
  }

  Renderer.prototype.resize = function (cssW, cssH) {
    var portrait = cssH >= cssW;
    var targetH = portrait ? 400 : 250;
    var h = targetH;
    var w = Math.max(120, Math.min(560, Math.round(h * cssW / cssH)));
    this.W = w; this.H = h;
    this.canvas.width = w; this.canvas.height = h;
    this.ctx.imageSmoothingEnabled = false;
    this.img = this.ctx.createImageData(w, h);
    this.buf = new Uint32Array(this.img.data.buffer);
    this.hud = new Layer(w, h);
    this.hudSig = '';
    this.F = h * 0.40;
    this.horizon = Math.round(h * 0.40);
    // Per-row fog strength, recomputed only on resize.
    this.fog = new Float32Array(h);
    for (var y = 0; y < h; y++) {
      var dy = y - this.horizon;
      var z = dy > 0 ? W3.CAM_H * this.F / dy : 1e9;
      var t = (z - W3.FOG_NEAR) / (W3.FOG_FAR - W3.FOG_NEAR);
      this.fog[y] = t < 0 ? 0 : t > 1 ? 1 : t;
    }
  };

  /* World point -> screen. */
  Renderer.prototype.px = function (worldX, z, camX) {
    return this.W / 2 + (worldX - camX) * this.F / z;
  };
  Renderer.prototype.py = function (z, horizon) {
    return horizon + W3.CAM_H * this.F / z;
  };

  function span(buf, W, y, x0, x1, c) {
    if (x1 <= 0 || x0 >= W) return;
    if (x0 < 0) x0 = 0;
    if (x1 > W) x1 = W;
    // Typed arrays silently drop fractional indices, so pin the row first.
    var o = (y | 0) * W;
    for (var x = x0 | 0; x < x1; x++) buf[o + x] = c;
  }

  function blitBuf(buf, W, H, sp, ox, oy) {
    for (var y = 0; y < sp.h; y++) {
      var ry = oy + y;
      if (ry < 0 || ry >= H) continue;
      for (var x = 0; x < sp.w; x++) {
        var c = sp.d[y * sp.w + x];
        if (!c) continue;
        var rx = ox + x;
        if (rx >= 0 && rx < W) buf[ry * W + rx] = c;
      }
    }
  }

  /* ---- background ------------------------------------------------------ */

  Renderer.prototype.drawSky = function (s, horizon) {
    var buf = this.buf, W = this.W, H = this.H;
    var art = this.art;
    // Banded gradient — hard steps rather than a smooth ramp.
    var bands = 7;
    for (var y = 0; y < horizon; y++) {
      var t = y / horizon;
      var b = Math.min(bands - 1, (t * bands) | 0) / (bands - 1);
      var i = b * (SKY.length - 1);
      var i0 = i | 0, i1 = Math.min(SKY.length - 1, i0 + 1);
      span(buf, W, y, 0, W, mix(SKY[i0], SKY[i1], i - i0));
    }
    // Sun
    var sunX = W * 0.70 - s.camX * 0.6, sunY = horizon * 0.46, sr = Math.max(5, this.H * 0.028);
    for (var yy = Math.floor(sunY - sr); yy <= sunY + sr; yy++) {
      if (yy < 0 || yy >= horizon) continue;
      var dx = Math.sqrt(Math.max(0, sr * sr - (yy - sunY) * (yy - sunY)));
      span(buf, W, yy, Math.round(sunX - dx), Math.round(sunX + dx), SUN);
    }

    // Clouds drift slowly and wrap.
    var span2 = W + 90;
    for (var ci = 0; ci < 5; ci++) {
      var sp = art.cloud[ci % art.cloud.length];
      var base = hash1(ci * 13 + 2) * span2;
      var cx = ((base - s.camZ * 0.10 - s.camX * 1.4) % span2 + span2) % span2 - 45;
      var cy = horizon * (0.16 + hash1(ci * 7 + 5) * 0.42);
      blitBuf(buf, W, H, sp, Math.round(cx), Math.round(cy));
    }

    // Two ridgelines, the nearer one darker and moving faster.
    var shiftFar = -s.camX * 1.8 - s.camZ * 0.012;
    var shiftNear = -s.camX * 4.2 - s.camZ * 0.05;
    var ampF = this.H * 0.055, ampN = this.H * 0.038;
    for (var x = 0; x < W; x++) {
      var uf = x + shiftFar;
      var yf = horizon - ampF * (0.55 + 0.45 * Math.sin(uf * 0.019)) - ampF * 0.5 * Math.sin(uf * 0.047 + 1.3);
      for (var y2 = Math.max(0, yf | 0); y2 < horizon; y2++) {
        buf[y2 * W + x] = (y2 - yf < 2) ? HILL_FAR_LIT : HILL_FAR;
      }
      var un = x + shiftNear;
      var yn = horizon - ampN * (0.5 + 0.5 * Math.sin(un * 0.026 + 2.2)) - ampN * 0.45 * Math.sin(un * 0.061);
      for (var y3 = Math.max(0, yn | 0); y3 < horizon; y3++) {
        buf[y3 * W + x] = (y3 - yn < 2) ? HILL_NEAR_LIT : HILL_NEAR;
      }
      // Ragged treeline hugging the horizon.
      var ut = x + shiftNear * 1.7;
      var th = 3 + 5 * hash1((ut * 0.5) | 0) + 3 * Math.sin(ut * 0.31);
      for (var y4 = Math.max(0, (horizon - th) | 0); y4 < horizon; y4++) {
        buf[y4 * W + x] = (y4 < horizon - th + 2) ? TREELINE[0] : TREELINE[1];
      }
    }
  };

  /* ---- ground ---------------------------------------------------------- */

  Renderer.prototype.drawGround = function (s, horizon) {
    var buf = this.buf, W = this.W, H = this.H, F = this.F;
    var camX = s.camX, camZ = s.camZ;
    var view = W3.VIEW;
    // Starts on the horizon row itself; leaving it to the sky loop leaves a
    // one-pixel unwritten seam.
    for (var y = horizon; y < H; y++) {
      var dy = y - horizon;
      var z = dy > 0 ? W3.CAM_H * F / dy : Infinity;
      if (!(z <= view)) { span(buf, W, y, 0, W, HAZE); continue; }
      var zw = camZ + z;
      var k = F / z;
      var center = W3.centerAt(zw);
      var hw = W3.halfWidthAt(zw);
      var cx = this.px(center, z, camX);
      var fog = this.fog[y];

      var gi = ((zw * 0.38) | 0) & 1;
      var g = GRASS[gi], verge = GRASS_VERGE;
      var di = ((zw * 0.5) | 0) & 1;
      var d = DIRT[di], dL = DIRT[di + 2];
      if (fog > 0) {
        g = mix(g, HAZE, fog); verge = mix(verge, HAZE, fog);
        d = mix(d, HAZE, fog); dL = mix(dL, HAZE, fog);
      }

      span(buf, W, y, 0, W, g);

      var lx = cx - (hw + W3.edgeAt(zw, -1)) * k;
      var rx = cx + (hw + W3.edgeAt(zw, 1)) * k;
      var x0 = Math.round(lx), x1 = Math.round(rx);
      // Sunlit fringe of longer grass hugging the tread.
      var fr = Math.max(1, Math.round(0.13 * k));
      span(buf, W, y, x0 - fr, x0, verge);
      span(buf, W, y, x1, x1 + fr, verge);

      if (x1 > x0) {
        span(buf, W, y, x0, x1, d);
        // Worn, lighter centre where paws have packed the dirt.
        var inner = (x1 - x0) * 0.24;
        span(buf, W, y, Math.round(cx - inner), Math.round(cx + inner), dL);
        var e = Math.max(1, (( x1 - x0) * 0.06) | 0);
        span(buf, W, y, x0, x0 + e, mix(EDGE_D, HAZE, fog));
        span(buf, W, y, x1 - e, x1, mix(EDGE_L, HAZE, fog));
        // Packed ruts running with the path. World-aligned, so they stream
        // toward the camera and carry most of the sense of speed up close.
        if (z < 24) {
          var rw = Math.max(1, (0.05 * k) | 0);
          for (var u = 0; u < 2; u++) {
            // Broken into scuffs by a hash on distance, or they read as lane paint.
            if (hash2((zw * 0.7) | 0, u * 37 + 9) > 0.55) continue;
            var uo = RUTS[u] + 0.24 * Math.sin(zw * 0.41 + u * 2.1);
            var rxp = Math.round(cx + uo * hw * k);
            span(buf, W, y, rxp, rxp + rw, mix(u ? RUT_L : RUT_D, HAZE, fog));
          }
        }
      }
    }
  };

  /* Leaf litter: flat specks pinned to the trail. Cheap, and the single best
     cue that you are actually moving. */
  Renderer.prototype.drawLitter = function (s, horizon) {
    var ctx = this.ctx, F = this.F, camX = s.camX, camZ = s.camZ;
    var step = W3.LITTER_STEP;
    var i0 = Math.ceil((camZ + 1.0) / step), i1 = Math.floor((camZ + 40) / step);
    for (var i = i1; i >= i0; i--) {
      for (var k = 0; k < 4; k++) {
        var h = hash2(i, k * 57 + 11);
        if (h > 0.62) continue;
        var zw = i * step;
        var z = zw - camZ;
        if (z < 1.1) continue;
        var hw = W3.halfWidthAt(zw);
        var wx = W3.centerAt(zw) + (hash2(i, k * 13 + 3) - 0.5) * 2 * hw * 0.94;
        var sx = this.px(wx, z, camX);
        var sy = this.py(z, horizon);
        var sz = Math.max(1, Math.min(4, Math.round((0.05 + hash2(i, k + 71) * 0.07) * F / z)));
        if (sy > this.H || sx < -8 || sx > this.W + 8) continue;
        ctx.globalAlpha = Math.max(0.15, 1 - this.fog[Math.max(0, Math.min(this.H - 1, sy | 0))]);
        ctx.fillStyle = h < 0.20 ? '#8a5f33' : h < 0.42 ? '#a97c47' : '#d3ae7d';
        ctx.fillRect(Math.round(sx), Math.round(sy), sz, Math.max(1, sz - 1) | 0);
      }
    }
    ctx.globalAlpha = 1;
  };

  /* ---- props ----------------------------------------------------------- */

  Renderer.prototype.pushItem = function (sp, z, sx, sy, wh, alpha, shadow) {
    var scale = wh * this.F / z / sp.h;
    var dw = Math.max(1, Math.round(sp.w * scale));
    var dh = Math.max(1, Math.round(sp.h * scale));
    if (dh < 2 || sx + dw < -4 || sx - dw > this.W + 4) return;
    var it = this.items[this.items.n] || (this.items[this.items.n] = {});
    it.sp = sp; it.z = z;
    it.x = Math.round(sx - dw / 2); it.y = Math.round(sy - dh);
    it.w = dw; it.h = dh; it.a = alpha; it.shadow = shadow ? 1 : 0;
    this.items.n++;
  };

  Renderer.prototype.drawProps = function (s, horizon) {
    var art = this.art, camX = s.camX, camZ = s.camZ;
    this.items.n = 0;

    var step = W3.SCENERY_STEP;
    var s0 = Math.ceil((camZ + 1.0) / step), s1 = Math.floor((camZ + W3.VIEW) / step);
    for (var i = s0; i <= s1; i++) {
      for (var side = -1; side <= 1; side += 2) {
        var o = W3.sceneryAt(i, side);
        if (!o) continue;
        var zw = i * step, z = zw - camZ;
        // Tall props are dropped just before they would fill the screen.
        if (z < (o.wh > 2 ? 4.0 : 1.0)) continue;
        var wx = W3.centerAt(zw) + o.off;
        var sp = o.kind === 'tuft' ? art.tuft[o.variant % art.tuft.length]
          : o.kind === 'bush' ? art.bush[o.variant % 2]
          : o.kind === 'rock' ? art.rock[o.variant % 2]
          : o.kind === 'log' ? art.log
          : o.kind === 'tree' ? art.tree[o.variant % 2]
          : art.pine;
        this.pushItem(sp, z, this.px(wx, z, camX), this.py(z, horizon), o.wh,
          1 - this.fog[Math.min(this.H - 1, Math.max(0, this.py(z, horizon) | 0))] * 0.5,
          o.kind !== 'tuft' && o.wh <= 1.0);
      }
    }

    // Obstacles sitting in the running line.
    var os = W3.OBSTACLE_STEP;
    var o0 = Math.ceil((camZ + 1.0) / os), o1 = Math.floor((camZ + W3.VIEW) / os);
    for (var j = o0; j <= o1; j++) {
      if (s.cleared[j]) continue;
      var ob = W3.obstacleAt(j);
      if (!ob) continue;
      var ozw = j * os, oz = ozw - camZ;
      if (oz < 1.0) continue;
      var owx = W3.centerAt(ozw) + ob.off;
      var osp = ob.kind === 'log' ? art.log : art.rock[ob.variant % 2];
      this.pushItem(osp, oz, this.px(owx, oz, camX), this.py(oz, horizon), ob.wh, 1, true);
    }

    // Pickups bob a little so they catch the eye.
    var ps = W3.PICKUP_STEP;
    var p0 = Math.ceil((camZ + 1.0) / ps), p1 = Math.floor((camZ + W3.VIEW * 0.75) / ps);
    for (var k = p0; k <= p1; k++) {
      if (s.taken[k]) continue;
      var pu = W3.pickupAt(k);
      if (!pu) continue;
      var pzw = k * ps, pz = pzw - camZ;
      if (pz < 1.0) continue;
      var pwx = W3.centerAt(pzw) + pu.off;
      var bob = Math.sin(s.time * 4 + k) * 0.05 * this.F / pz;
      this.pushItem(pu.kind === 'ball' ? art.ball : art.stick, pz,
        this.px(pwx, pz, camX), this.py(pz, horizon) - bob, pu.wh, 1);
    }

    // Butterflies, purely for the vibe.
    for (var b = 0; b < 3; b++) {
      var bz = 6 + ((s.time * 0.9 + b * 4.4) % 16);
      var bwx = W3.centerAt(camZ + bz) + Math.sin(s.time * 1.7 + b * 2.2) * 2.6 + (b - 1) * 1.4;
      var by = this.py(bz, horizon) - (0.55 + Math.sin(s.time * 3.1 + b) * 0.18) * this.F / bz;
      this.pushItem(art.butterfly, bz, this.px(bwx, bz, camX), by, 0.12, 0.95);
    }

    // Painter's algorithm.
    var n = this.items.n, arr = this.items;
    var list = arr.slice(0, n);
    list.sort(function (a, b) { return b.z - a.z; });
    var ctx = this.ctx;
    for (var q = 0; q < n; q++) {
      var it = list[q];
      if (it.shadow) {
        // Two tapered rows read as a contact shadow; a plain rect reads as a slab.
        ctx.globalAlpha = it.a * 0.25;
        ctx.fillStyle = '#33240f';
        var sw = Math.max(3, Math.min(26, (it.w * 0.82) | 0));
        var sw2 = Math.max(2, (sw * 0.55) | 0);
        var by = it.y + it.h;
        ctx.fillRect(it.x + (((it.w - sw) / 2) | 0), by - 1, sw, 1);
        ctx.fillRect(it.x + (((it.w - sw2) / 2) | 0), by - 2, sw2, 1);
      }
      ctx.globalAlpha = it.a;
      ctx.drawImage(it.sp.c, 0, 0, it.sp.w, it.sp.h, it.x, it.y, it.w, it.h);
    }
    ctx.globalAlpha = 1;
  };

  Renderer.prototype.drawParticles = function (s, horizon) {
    var ctx = this.ctx;
    for (var i = 0; i < s.dust.length; i++) {
      var p = s.dust[i];
      if (p.life <= 0) continue;
      var z = p.z - s.camZ;
      if (z < 0.7) continue;
      var sx = this.px(p.x, z, s.camX);
      var sy = this.py(z, horizon) - p.y * this.F / z;
      var sz = Math.max(1, Math.min(3, Math.round((0.03 + p.r) * this.F / z)));
      var t = p.life / p.max;
      ctx.globalAlpha = t * 0.8;
      ctx.fillStyle = p.c;
      ctx.fillRect(Math.round(sx - sz / 2), Math.round(sy - sz / 2), sz, sz);
    }
    ctx.globalAlpha = 1;
  };

  Renderer.prototype.draw = function (s) {
    // Integer horizon: scanlines must land on whole rows, and a fractional
    // one also makes the whole ground shimmer as the camera bobs.
    var horizon = Math.round(this.horizon + s.pitch);
    this.drawSky(s, horizon);
    this.drawGround(s, horizon);
    this.ctx.putImageData(this.img, 0, 0);
    this.drawLitter(s, horizon);
    this.drawProps(s, horizon);
    this.drawParticles(s, horizon);
    TD.drawDog(this.ctx, this.art.dog, s, this, horizon);
    TD.drawHud(this, s);
  };

  TD.Renderer = Renderer;
  TD.Layer = Layer;
  TD.span = span;
  TD.blitBuf = blitBuf;
})();
