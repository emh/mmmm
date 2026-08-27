/* hud.js — text overlay. Rasterised into its own layer and only redrawn when
   something visible changes, so the per-frame cost is one drawImage. */
(function () {
  'use strict';
  var TD = window.TD;
  var rgb = TD.rgb, font = TD.font;

  var WHITE = rgb(0xfdfdf2);
  var SHADOW = rgb(0x223018);
  var GOLD = rgb(0xffd45e);
  var WARN = rgb(0xff6b4a);
  var DIM = rgb(0xbfd6a8);

  /* Full one-pixel outline, not just a drop shadow — the sky, the grass and
     the sun all pass behind this text at some point. */
  var RING = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
  function t(L, str, x, y, color, scale, align) {
    for (var i = 0; i < RING.length; i++) {
      font.text(L.buf, L.w, L.h, str, x + RING[i][0] * scale, y + RING[i][1] * scale,
        SHADOW, scale, align);
    }
    font.text(L.buf, L.w, L.h, str, x, y, color, scale, align);
  }

  function box(L, x0, y0, x1, y1, c) {
    for (var y = Math.max(0, y0); y < Math.min(L.h, y1); y++) {
      TD.span(L.buf, L.w, y, x0, x1, c);
    }
  }

  function drawHud(r, s) {
    var W = r.W, H = r.H;
    var blink = ((s.time * 2.2) | 0) & 1;
    var sig = [s.mode, s.dist | 0, s.score | 0, s.best | 0,
      s.mult.toFixed(1), s.offTrail ? 1 : 0, blink, W, H].join('|');

    if (sig !== r.hudSig) {
      r.hudSig = sig;
      var L = r.hud;
      L.clear();
      var pad = Math.max(4, (W * 0.035) | 0);
      // Extra room up top so the readout clears notches and status bars.
      var top = pad + Math.round(H * 0.035);
      var sc = W < 200 ? 2 : 3;

      if (s.mode === 'title') {
        var cy = H * 0.17;
        var big = Math.max(4, (W / 46) | 0) + 2;
        t(L, 'MOLLY', W / 2, cy, GOLD, big, 0);
        t(L, 'DASH', W / 2, cy + big * 7, WHITE, big, 0);
        t(L, 'STAY ON THE TRAIL', W / 2, cy + big * 15, DIM, sc - 1, 0);
        if (blink) t(L, 'TAP TO RUN', W / 2, H * 0.70, WHITE, sc, 0);
        t(L, 'SWIPE  OR  < >  TO STEER', W / 2, H * 0.70 + sc * 9, DIM, sc - 1, 0);
        if (s.best > 0) t(L, 'BEST ' + (s.best | 0), W / 2, H * 0.70 + sc * 16, GOLD, sc - 1, 0);
      } else {
        t(L, (s.dist | 0) + ' M', pad, top, WHITE, sc, -1);
        if (s.mult > 1.05) {
          t(L, 'X' + s.mult.toFixed(1), pad, top + sc * 7, GOLD, sc - 1, -1);
        }
        t(L, '' + (s.score | 0), W - pad, top, GOLD, sc, 1);
        t(L, 'BEST ' + (s.best | 0), W - pad, top + sc * 7, DIM, sc - 1, 1);
        if (s.offTrail) {
          t(L, 'OFF TRAIL', W / 2, H * 0.30, blink ? WARN : rgb(0xffb08a), sc, 0);
        }
        if (s.toast && s.toastT > 0) {
          t(L, s.toast, W / 2, H * 0.38, GOLD, sc, 0);
        }
        if (s.mode === 'paused') {
          var bw = font.width('PAUSED', sc + 1, 1) + sc * 8;
          var by = Math.round(H * 0.40);
          box(L, (W - bw) / 2, by, (W + bw) / 2, by + sc * 13, rgb(0x14210d));
          t(L, 'PAUSED', W / 2, by + sc * 3, WHITE, sc + 1, 0);
          t(L, 'TAP TO RESUME', W / 2, by + sc * 17, DIM, sc - 1, 0);
        }
      }
      L.flush();
    }

    var ctx = r.ctx;

    // Off-trail warning bleeds in from the edges rather than dimming the play area.
    if (s.offTrail && s.mode === 'play') {
      var a = Math.min(0.5, 0.16 + s.offTime * 0.9);
      var g = ctx.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0, 'rgba(168,34,18,' + a + ')');
      g.addColorStop(0.42, 'rgba(168,34,18,0)');
      g.addColorStop(0.58, 'rgba(168,34,18,0)');
      g.addColorStop(1, 'rgba(168,34,18,' + a + ')');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    if (s.flash > 0) {
      ctx.fillStyle = 'rgba(255,240,190,' + (s.flash * 0.5) + ')';
      ctx.fillRect(0, 0, W, H);
    }
    if (s.mode === 'title' || s.mode === 'paused') {
      ctx.fillStyle = 'rgba(18,26,12,0.42)';
      ctx.fillRect(0, 0, W, H);
    }
    ctx.drawImage(r.hud.c, 0, 0);
  }

  TD.drawHud = drawHud;
})();
