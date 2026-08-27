/* game.js — state, input and the loop. */
(function () {
  'use strict';
  var TD = window.TD;
  var W3 = TD.world;

  var MAX_VX = 2.5;        // top lateral speed, metres/sec
  var STEER_SNAP = 9;      // how fast lateral velocity chases the input
  var BEST_KEY = 'mollydash.best';
  var MUTE_KEY = 'mollydash.mute';

  var canvas, renderer, art;
  var keys = {};
  var steer = 0, pointerId = null, pointerAnchor = 0, pointerMoved = 0;

  var s = {
    mode: 'title',
    time: 0,
    dogZ: W3.DOG_Z, dogX: 0, vx: 0,
    camX: 0, camZ: 0,
    dist: 0, score: 0, best: 0, mult: 1, onTime: 0,
    gait: 0, lean: 0, runBlend: 0, pitch: 0,
    offTrail: false, offTime: 0, stumble: 0, flash: 0,
    toast: '', toastT: 0,
    combo: 0, nextMilestone: 250,
    taken: {}, cleared: {},
    dust: [], lastStep: -1
  };

  for (var i = 0; i < 64; i++) s.dust.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vy: 0, r: 0, c: '#c9a273' });
  var dustHead = 0;

  function puff(x, y, z, vy, r, c) {
    var p = s.dust[dustHead++ % s.dust.length];
    p.x = x; p.y = y; p.z = z; p.vy = vy; p.r = r; p.c = c;
    p.max = p.life = 0.4 + Math.random() * 0.4;
  }

  var bestDirty = false, bestSaveAt = 0;

  function saveBest(force) {
    if (!bestDirty) return;
    var now = Date.now();
    if (!force && now - bestSaveAt < 4000) return;
    bestSaveAt = now;
    bestDirty = false;
    try { localStorage.setItem(BEST_KEY, String(Math.round(s.best))); } catch (e) {}
  }

  function reset() {
    s.dogZ = W3.DOG_Z; s.dogX = W3.centerAt(W3.DOG_Z); s.vx = 0;
    s.camZ = 0; s.camX = s.dogX;
    s.dist = 0; s.score = 0; s.mult = 1; s.onTime = 0;
    s.offTrail = false; s.offTime = 0; s.stumble = 0; s.flash = 0;
    s.toast = ''; s.toastT = 0; s.combo = 0; s.nextMilestone = 250;
    s.taken = {}; s.cleared = {};
    for (var i = 0; i < s.dust.length; i++) s.dust[i].life = 0;
  }

  function toast(msg) { s.toast = msg; s.toastT = 1.1; }

  /* --- simulation -------------------------------------------------------- */

  function step(dt) {
    s.time += dt;

    var autopilot = s.mode !== 'play' || s.autopilot;
    var input;
    if (autopilot) {
      // On the title screen Molly runs herself, badly enough to look alive.
      var want = W3.centerAt(s.dogZ + 6) + Math.sin(s.time * 0.7) * 0.5;
      input = Math.max(-1, Math.min(1, (want - s.dogX) * 1.1));
    } else {
      input = Math.max(-1, Math.min(1, steer + (keys.right ? 1 : 0) - (keys.left ? 1 : 0)));
    }

    var slow = (s.offTrail ? 0.66 : 1) * (1 - 0.45 * s.stumble);
    var speed = W3.speedAt(s.dist) * slow;

    s.vx += (input * MAX_VX - s.vx) * (1 - Math.exp(-dt * STEER_SNAP));
    s.dogX += s.vx * dt;
    s.dogZ += speed * dt;
    s.dist = s.dogZ - W3.DOG_Z;

    s.camZ = s.dogZ - W3.DOG_Z;
    s.camX += (s.dogX - s.camX) * (1 - Math.exp(-dt * 5.0));

    s.lean += (Math.max(-1, Math.min(1, s.vx / MAX_VX)) - s.lean) * (1 - Math.exp(-dt * 8));
    s.runBlend += (Math.min(1, speed / 7) - s.runBlend) * (1 - Math.exp(-dt * 4));

    var prevGait = s.gait;
    s.gait += speed / 3.4 * dt;
    s.pitch = Math.sin(s.gait * Math.PI * 2) * 1.3 * s.runBlend +
      (s.offTrail ? Math.sin(s.time * 41) * 1.6 : 0);

    // Paw-fall thumps twice per stride.
    var beat = Math.floor(s.gait * 2);
    if (beat !== s.lastStep) {
      s.lastStep = beat;
      if (s.mode === 'play') TD.audio.step(beat % 2 === 0);
    }

    /* on/off trail */
    var center = W3.centerAt(s.dogZ);
    var hw = W3.halfWidthAt(s.dogZ);
    var wasOff = s.offTrail;
    var rel = s.dogX - center;
    var margin = 0.14;
    s.offTrail = rel < -(hw + W3.edgeAt(s.dogZ, -1)) + margin ||
                 rel > (hw + W3.edgeAt(s.dogZ, 1)) - margin;

    if (s.offTrail) {
      s.offTime += dt;
      s.onTime = 0;
      if (s.mult > 1) { s.mult = 1; }
      if (!wasOff && s.mode === 'play') TD.audio.scuff();
      if (Math.random() < dt * 70) {
        puff(s.dogX + (Math.random() - 0.5) * 0.35, 0.05, s.dogZ - 0.35,
          0.5 + Math.random(), 0.07, Math.random() < 0.5 ? '#8bbf4a' : '#c9a273');
      }
    } else {
      s.offTime = 0;
      s.onTime += dt;
      s.mult = Math.min(8, 1 + s.onTime * 0.13);
      if (Math.random() < dt * 12 * s.runBlend) {
        puff(s.dogX + (Math.random() - 0.5) * 0.4, 0.04, s.dogZ - 0.4,
          0.35 + Math.random() * 0.5, 0.04, '#c9a273');
      }
    }

    if (s.mode === 'play') {
      s.score += speed * dt * s.mult * 0.7;
      // The run never ends, so the best has to be banked as it happens.
      if (s.score > s.best) { s.best = s.score; bestDirty = true; }
      if (s.dist > s.nextMilestone) {
        while (s.dist > s.nextMilestone) s.nextMilestone += 250;
        s.score += 100;
        toast('+100');
        s.flash = 0.5;
        TD.audio.milestone();
      }
    }

    s.stumble = Math.max(0, s.stumble - dt * 1.7);
    s.flash = Math.max(0, s.flash - dt * 3);
    s.toastT = Math.max(0, s.toastT - dt);

    for (var i = 0; i < s.dust.length; i++) {
      var p = s.dust[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      p.y += p.vy * dt;
      p.vy -= 1.4 * dt;
      p.r += dt * 0.06;
    }

    if (s.mode === 'play') collide();
    prune();
  }

  function collide() {
    var ps = W3.PICKUP_STEP;
    var pi = Math.round(s.dogZ / ps);
    for (var k = pi - 1; k <= pi + 1; k++) {
      if (k < 0 || s.taken[k]) continue;
      var pu = W3.pickupAt(k);
      if (!pu) continue;
      var pz = k * ps;
      if (Math.abs(pz - s.dogZ) > 0.75) continue;
      if (Math.abs(s.dogX - (W3.centerAt(pz) + pu.off)) > 0.45) continue;
      s.taken[k] = 1;
      s.combo++;
      var pts = Math.round((pu.kind === 'ball' ? 50 : 30) * s.mult);
      s.score += pts;
      toast('+' + pts);
      s.flash = 0.35;
      TD.audio.pickup(s.combo);
    }

    var os = W3.OBSTACLE_STEP;
    var oi = Math.round(s.dogZ / os);
    for (var j = oi - 1; j <= oi + 1; j++) {
      if (j < 0 || s.cleared[j]) continue;
      var ob = W3.obstacleAt(j);
      if (!ob) continue;
      var oz = j * os;
      if (Math.abs(oz - s.dogZ) > 0.55) continue;
      if (Math.abs(s.dogX - (W3.centerAt(oz) + ob.off)) > ob.hit) continue;
      s.cleared[j] = 1;
      hit();
    }

    // Only the big trunks stop you; brush and tufts are cosmetic.
    var ss = W3.SCENERY_STEP;
    var si = Math.round(s.dogZ / ss);
    for (var t = si - 1; t <= si + 1; t++) {
      if (t < 0 || s.cleared['s' + t]) continue;
      for (var side = -1; side <= 1; side += 2) {
        var o = W3.sceneryAt(t, side);
        if (!o || (o.kind !== 'tree' && o.kind !== 'pine')) continue;
        var tz = t * ss;
        if (Math.abs(tz - s.dogZ) > 0.5) continue;
        if (Math.abs(s.dogX - (W3.centerAt(tz) + o.off)) > 0.42) continue;
        s.cleared['s' + t] = 1;
        hit();
      }
    }
  }

  function hit() {
    if (s.stumble > 0.4) return;
    s.stumble = 1;
    s.combo = 0;
    s.mult = 1;
    s.onTime = 0;
    s.score = Math.max(0, s.score - 60);
    toast('OUCH');
    TD.audio.stumble();
    for (var i = 0; i < 10; i++) {
      puff(s.dogX + (Math.random() - 0.5) * 0.9, 0.05 + Math.random() * 0.2, s.dogZ - 0.3,
        1.2 + Math.random() * 1.4, 0.05, Math.random() < 0.5 ? '#c9a273' : '#9c6e40');
    }
  }

  /* Drop consumed-slot bookkeeping once it is behind the camera. */
  function prune() {
    var pi = Math.floor(s.camZ / W3.PICKUP_STEP) - 3;
    for (var k in s.taken) if (+k < pi) delete s.taken[k];
    var oi = Math.floor(s.camZ / W3.OBSTACLE_STEP) - 3;
    var si = Math.floor(s.camZ / W3.SCENERY_STEP) - 3;
    for (var j in s.cleared) {
      if (j.charCodeAt(0) === 115) { if (+j.slice(1) < si) delete s.cleared[j]; }
      else if (+j < oi) delete s.cleared[j];
    }
  }

  /* --- input ------------------------------------------------------------- */

  function beginRun() {
    TD.audio.init();
    TD.audio.resume();
    if (s.mode === 'title') {
      reset();
      s.mode = 'play';
      TD.audio.start();
    } else if (s.mode === 'paused') {
      s.mode = 'play';
    }
  }

  function togglePause() {
    if (s.mode === 'play') s.mode = 'paused';
    else if (s.mode === 'paused') s.mode = 'play';
  }

  function endRun() {
    saveBest(true);
    s.mode = 'title';
    reset();
  }

  function bindInput() {
    window.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { keys.left = 1; e.preventDefault(); }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { keys.right = 1; e.preventDefault(); }
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (s.mode === 'title') beginRun(); else togglePause();
      }
      if (e.key === 'Escape') { e.preventDefault(); if (s.mode === 'play') togglePause(); else if (s.mode === 'paused') endRun(); }
      if (e.key === 'm' || e.key === 'M') toggleMute();
    });
    window.addEventListener('keyup', function (e) {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = 0;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = 0;
    });

    /* Relative drag steering: the anchor slides once you saturate, so you can
       hold a hard turn without running out of screen. */
    var surface = document.getElementById('stage');
    function down(e) {
      if (pointerId !== null) return;
      pointerId = e.pointerId;
      pointerAnchor = e.clientX;
      pointerMoved = 0;
      surface.setPointerCapture && surface.setPointerCapture(e.pointerId);
      TD.audio.init();
      TD.audio.resume();
    }
    function move(e) {
      if (e.pointerId !== pointerId) return;
      var span = Math.max(60, window.innerWidth * 0.17);
      var dx = e.clientX - pointerAnchor;
      pointerMoved = Math.max(pointerMoved, Math.abs(dx));
      if (dx > span) pointerAnchor = e.clientX - span;
      if (dx < -span) pointerAnchor = e.clientX + span;
      dx = e.clientX - pointerAnchor;
      steer = Math.max(-1, Math.min(1, dx / span));
    }
    function up(e) {
      if (e.pointerId !== pointerId) return;
      pointerId = null;
      steer = 0;
      if (pointerMoved < 10) {
        if (s.mode === 'title' || s.mode === 'paused') beginRun();
      }
    }
    surface.addEventListener('pointerdown', down);
    surface.addEventListener('pointermove', move);
    surface.addEventListener('pointerup', up);
    surface.addEventListener('pointercancel', up);
    surface.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    document.getElementById('btn-pause').addEventListener('click', function (e) {
      e.stopPropagation();
      if (s.mode === 'title') beginRun(); else togglePause();
      syncButtons();
    });
    document.getElementById('btn-sound').addEventListener('click', function (e) {
      e.stopPropagation();
      toggleMute();
    });
    document.getElementById('btn-quit').addEventListener('click', function (e) {
      e.stopPropagation();
      endRun();
      syncButtons();
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { saveBest(true); if (s.mode === 'play') s.mode = 'paused'; }
    });
    window.addEventListener('pagehide', function () { saveBest(true); });
  }

  function toggleMute() {
    TD.audio.init();
    var m = !TD.audio.isMuted();
    TD.audio.setMuted(m);
    try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch (e) {}
    syncButtons();
  }

  var lastBtnSig = '';
  function syncButtons() {
    var sig = (TD.audio.isMuted() ? 'm' : '-') + s.mode;
    if (sig === lastBtnSig) return;
    lastBtnSig = sig;
    document.getElementById('btn-sound').textContent = TD.audio.isMuted() ? '\u266a\u0338' : '\u266a';
    document.getElementById('btn-pause').textContent = s.mode === 'play' ? '\u2016' : '\u25b6';
    document.getElementById('btn-quit').hidden = s.mode !== 'paused';
  }

  /* --- loop -------------------------------------------------------------- */

  var last = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (!last) last = now;
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (s.mode !== 'paused') {
      // Sub-step so fast phones and slow phones behave the same.
      var n = Math.max(1, Math.ceil(dt / (1 / 60)));
      for (var i = 0; i < n; i++) step(dt / n);
    } else {
      s.time += dt;
    }
    renderer.draw(s);
    syncButtons();
    saveBest(false);
  }

  function fit() {
    var r = document.getElementById('stage').getBoundingClientRect();
    renderer.resize(Math.max(1, r.width), Math.max(1, r.height));
  }

  function boot() {
    canvas = document.getElementById('screen');
    art = TD.buildArt();
    renderer = new TD.Renderer(canvas, art);
    try { s.best = parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0; } catch (e) {}
    try { TD.audio.setMuted(localStorage.getItem(MUTE_KEY) === '1'); } catch (e) {}
    reset();
    bindInput();
    fit();
    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', function () { setTimeout(fit, 250); });
    syncButtons();
    document.body.classList.add('ready');
    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  TD.state = s;
})();
