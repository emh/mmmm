/* dog.js — Molly, assembled from parts every frame.
   The gallop is driven by one phase value: body bob, leg lift, ear flap and
   tail wag are all offsets from it, which keeps the cycle readable at 30px. */
(function () {
  'use strict';
  var TD = window.TD;
  var TAU = Math.PI * 2;

  function blit(ctx, sp, x, y) {
    ctx.drawImage(sp.c, Math.round(x), Math.round(y));
  }

  /* Chunky elliptical shadow, drawn as scanlines so it stays pixel-crisp. */
  function shadow(ctx, cx, cy, rx, ry, alpha) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#3c2a12';
    for (var y = -ry; y <= ry; y++) {
      var dx = rx * Math.sqrt(Math.max(0, 1 - (y / ry) * (y / ry)));
      ctx.fillRect(Math.round(cx - dx), Math.round(cy + y), Math.round(dx * 2), 1);
    }
    ctx.globalAlpha = 1;
  }

  function drawDog(ctx, D, s, r, horizon) {
    var z = TD.world.DOG_Z;
    var footX = r.px(s.dogX, z, s.camX);
    var footY = r.py(z, horizon);

    var p = s.gait % 1;
    var lean = s.lean;
    var run = s.runBlend;                       // 0 when barely moving, 1 at speed

    // Vertical bounce of the whole animal, plus a squash on the down beat.
    var bob = -Math.sin(p * TAU) * 3.4 * run - 1.2 * run;
    var squash = Math.max(0, -Math.sin(p * TAU)) * run;

    var stum = s.stumble > 0 ? s.stumble : 0;
    var jitterX = stum > 0 ? Math.sin(s.time * 60) * 2.2 * stum : 0;
    var jitterY = stum > 0 ? Math.abs(Math.sin(s.time * 47)) * 1.6 * stum : 0;

    var cx = footX + jitterX;
    var gy = footY + jitterY;

    shadow(ctx, cx, gy - 1, 12 - squash * 1.2, 3, 0.26 + 0.06 * (1 - run));

    var hind = D.hind, front = D.front, body = D.body, head = D.head;

    var bodyBottom = gy - 8 + bob + squash * 1.4;
    var bodyTop = bodyBottom - body.h;

    // Front legs first — they are on the far side of the body.
    for (var f = 0; f < 2; f++) {
      var q = (p + (f ? 0.75 : 0.25)) % 1;
      var lift = Math.max(0, Math.sin(q * TAU)) * 4.5 * run;
      var sw = Math.cos(q * TAU) * 1.4 * run;
      blit(ctx, front, cx + (f ? 1.6 : -5.0) + sw + lean * 1.0, gy - front.h - 1 - lift + bob * 0.5);
    }

    // Hind legs, alternating.
    for (var i = 0; i < 2; i++) {
      var qh = (p + (i ? 0.5 : 0)) % 1;
      var lifth = Math.max(0, Math.sin(qh * TAU)) * 7 * run;
      var swh = Math.cos(qh * TAU) * 1.9 * run;
      blit(ctx, hind, cx + (i ? 1.4 : -8.2) + swh + lean * 1.4, gy - hind.h + 1 - lifth + bob * 0.7);
    }

    blit(ctx, body, cx - body.w / 2 + lean * 1.8, bodyTop);

    // Tail plume, swung well clear of the rump so it reads at this size.
    var wag = Math.max(-1, Math.min(1, Math.sin(s.time * 12) * run + lean * 0.8));
    var ti = wag < -0.5 ? 0 : wag < 0 ? 1 : wag < 0.5 ? 2 : 3;
    var tail = D.tail[ti];
    // The tail sprite keeps its root at bottom-centre, so it plants on the rump.
    blit(ctx, tail, cx - tail.w / 2 + (ti - 1.5) * 3.6 - lean * 2.0,
      bodyTop + 13 - tail.h + bob * 0.4);

    // Head clears the shoulders, ears hang off its sides.
    var headY = bodyTop - head.h + 3 + bob * 0.5;
    var headX = cx - head.w / 2 + lean * 4.0;
    // Ears flap on the stride and stream outward with speed.
    var flap = Math.sin(p * TAU + 0.9);
    var out = 1.3 * run;
    var pair = D.ears[Math.abs(flap) > 0.45 ? 0 : 1];
    var earY = headY + head.h * 0.28 - flap * 2.0 * run;
    blit(ctx, pair[0], headX - pair[0].w + 3 - out + lean * 1.2, earY);
    blit(ctx, pair[1], headX + head.w - 3 + out + lean * 1.2, earY);
    blit(ctx, head, headX, headY);
  }

  TD.drawDog = drawDog;
})();
