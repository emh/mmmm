/* pix.js — tiny pixel-art rasteriser.
   Everything in this game is drawn from code into small Uint32 buffers, then
   blitted at 1:1 into a low-res canvas that gets upscaled with nearest-neighbour.
   No image files, no build step. */
(function () {
  'use strict';
  var TD = (window.TD = window.TD || {});

  /* 0xRRGGBB -> the ABGR word that ImageData wants on little-endian machines. */
  function rgb(hex) {
    return (255 << 24) | ((hex & 255) << 16) | (((hex >> 8) & 255) << 8) | ((hex >> 16) & 255);
  }
  function rgba(hex, a) {
    return ((a & 255) << 24) | ((hex & 255) << 16) | (((hex >> 8) & 255) << 8) | ((hex >> 16) & 255);
  }
  /* Blend two packed opaque colours. t=0 -> a, t=1 -> b. */
  function mix(a, b, t) {
    var ar = a & 255, ag = (a >> 8) & 255, ab = (a >> 16) & 255;
    var br = b & 255, bg = (b >> 8) & 255, bb = (b >> 16) & 255;
    return (255 << 24) |
      ((((ab + (bb - ab) * t) | 0) & 255) << 16) |
      ((((ag + (bg - ag) * t) | 0) & 255) << 8) |
      (((ar + (br - ar) * t) | 0) & 255);
  }

  /* Deterministic hash noise, used for fur texture and scenery placement.
     A 32-bit avalanche mixer — the classic float-multiply hash correlates
     badly on the near-sequential slot indices this game feeds it. */
  function hash1(n) {
    n = n | 0;
    n = Math.imul(n ^ (n >>> 15), 0x2c1b3c6d);
    n ^= n >>> 12;
    n = Math.imul(n ^ (n >>> 15), 0x297a2d39);
    n ^= n >>> 15;
    return (n >>> 0) / 4294967296;
  }
  function hash2(x, y) {
    return hash1(Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ 0x9e3779b9);
  }

  function Pix(w, h) {
    this.w = w; this.h = h;
    this.d = new Uint32Array(w * h);
  }
  Pix.prototype.set = function (x, y, c) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.d[y * this.w + x] = c;
  };
  Pix.prototype.at = function (x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.d[y * this.w + x];
  };
  /* Fill every pixel where inside(x,y) is truthy with shade(x,y). */
  Pix.prototype.shape = function (inside, shade) {
    for (var y = 0; y < this.h; y++) {
      for (var x = 0; x < this.w; x++) {
        if (inside(x + 0.5, y + 0.5)) this.d[y * this.w + x] = shade(x, y);
      }
    }
  };
  /* Darken the inner rim so the silhouette reads against busy scenery. */
  Pix.prototype.rim = function (c) {
    var w = this.w, h = this.h, src = this.d, out = new Uint32Array(src);
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var i = y * w + x;
        if (!src[i]) continue;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1 ||
            !src[i - 1] || !src[i + 1] || !src[i - w] || !src[i + w]) out[i] = c;
      }
    }
    this.d = out;
  };
  Pix.prototype.blit = function (src, ox, oy) {
    for (var y = 0; y < src.h; y++) {
      for (var x = 0; x < src.w; x++) {
        var c = src.d[y * src.w + x];
        if (c) this.set(ox + x, oy + y, c);
      }
    }
  };
  /* Crop to the opaque bounding box so draw offsets stay predictable. */
  Pix.prototype.trim = function () {
    var minX = this.w, minY = this.h, maxX = -1, maxY = -1;
    for (var y = 0; y < this.h; y++) {
      for (var x = 0; x < this.w; x++) {
        if (!this.d[y * this.w + x]) continue;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    if (maxX < 0) return new Pix(1, 1);
    var out = new Pix(maxX - minX + 1, maxY - minY + 1);
    for (var yy = 0; yy < out.h; yy++)
      for (var xx = 0; xx < out.w; xx++)
        out.d[yy * out.w + xx] = this.d[(yy + minY) * this.w + xx + minX];
    return out;
  };
  Pix.prototype.flip = function () {
    var out = new Pix(this.w, this.h);
    for (var y = 0; y < this.h; y++)
      for (var x = 0; x < this.w; x++)
        out.d[y * this.w + x] = this.d[y * this.w + (this.w - 1 - x)];
    return out;
  };
  /* Bake into a real canvas so we can drawImage (and scale) it cheaply. */
  Pix.prototype.bake = function () {
    var c = document.createElement('canvas');
    c.width = this.w; c.height = this.h;
    var ctx = c.getContext('2d');
    var img = ctx.createImageData(this.w, this.h);
    new Uint32Array(img.data.buffer).set(this.d);
    ctx.putImageData(img, 0, 0);
    return { w: this.w, h: this.h, c: c, d: this.d };
  };

  /* Thick line segment, used to build tails and legs from a few control points. */
  Pix.prototype.stroke = function (x0, y0, x1, y1, r0, r1, shade) {
    var steps = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
    for (var i = 0; i <= steps; i++) {
      var t = i / steps, cx = x0 + (x1 - x0) * t, cy = y0 + (y1 - y0) * t, r = r0 + (r1 - r0) * t;
      for (var y = Math.floor(cy - r); y <= cy + r; y++) {
        for (var x = Math.floor(cx - r); x <= cx + r; x++) {
          var dx = x + 0.5 - cx, dy = y + 0.5 - cy;
          if (dx * dx + dy * dy <= r * r) this.set(x, y, shade(x, y));
        }
      }
    }
  };

  TD.rgb = rgb; TD.rgba = rgba; TD.mix = mix;
  TD.hash1 = hash1; TD.hash2 = hash2;
  TD.Pix = Pix;
})();
