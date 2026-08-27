/* audio.js — procedural chiptune blips. No files, no library. */
(function () {
  'use strict';
  var TD = window.TD;
  var ctx = null, master = null, muted = false;

  function init() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.28;
    master.connect(ctx.destination);
    return ctx;
  }
  function resume() {
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  /* One square/saw voice with a linear decay envelope. */
  function tone(freq, dur, type, vol, delay, slideTo) {
    if (!ctx || muted) return;
    var t0 = ctx.currentTime + (delay || 0);
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol == null ? 0.5 : vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol, hp) {
    if (!ctx || muted) return;
    var n = Math.floor(ctx.sampleRate * dur);
    var b = ctx.createBuffer(1, n, ctx.sampleRate);
    var d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var src = ctx.createBufferSource(); src.buffer = b;
    var f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = hp || 900;
    var g = ctx.createGain(); g.gain.value = vol == null ? 0.3 : vol;
    src.connect(f); f.connect(g); g.connect(master);
    src.start();
  }

  var api = {
    init: init,
    resume: resume,
    isMuted: function () { return muted; },
    setMuted: function (m) {
      muted = m;
      if (master) master.gain.value = m ? 0 : 0.28;
    },
    start: function () {
      tone(392, 0.09, 'square', 0.4, 0);
      tone(523, 0.09, 'square', 0.4, 0.09);
      tone(784, 0.16, 'square', 0.4, 0.18);
    },
    pickup: function (n) {
      var base = 660 * Math.pow(1.0595, Math.min(12, n || 0));
      tone(base, 0.06, 'square', 0.34, 0);
      tone(base * 1.5, 0.10, 'square', 0.30, 0.055);
    },
    stumble: function () {
      tone(220, 0.28, 'sawtooth', 0.38, 0, 70);
      noise(0.22, 0.28, 500);
    },
    scuff: function () {
      noise(0.10, 0.12, 1600);
    },
    step: function (hard) {
      tone(hard ? 96 : 78, 0.045, 'triangle', hard ? 0.20 : 0.12, 0);
    },
    milestone: function () {
      tone(523, 0.08, 'square', 0.35, 0);
      tone(659, 0.08, 'square', 0.35, 0.08);
      tone(880, 0.18, 'square', 0.35, 0.16);
    }
  };

  TD.audio = api;
})();
