/**
 * The forest, synthesised.
 *
 * Not a single audio file. Three reasons, in order of how much they mattered:
 * footsteps have to follow the gait she is actually in or they drift against
 * the animation within a couple of strides; a recorded ambience loops, and a
 * loop in a quiet scene is audible within a minute; and we had just spent real
 * effort getting the download down, which a few megabytes of stereo would undo.
 *
 * Everything here is noise and oscillators shaped by filters and envelopes:
 *
 *   wind      filtered noise, two bands, with gusts that never repeat
 *   birds     short pitch-swept phrases at random intervals, panned about
 *   footfall  a noise burst with a thump under it, fired per paw
 *
 * Browsers will not start audio without a gesture, so nothing is created until
 * `start()` is called from one. Before that this class is inert.
 */

/** Overall level. Meant to sit under the game, not accompany it. */
const MASTER = 0.5;

/**
 * Where each paw lands within one stride cycle, as a fraction of it.
 *
 * A dog is not a metronome. A walk is four evenly spaced beats, a trot is two
 * (diagonal pairs together), and a gallop is four in quick succession followed
 * by a silence where all four feet are off the ground -- that gap is most of
 * what makes a gallop sound like one.
 */
export const BEATS = {
  walk:   [0, 0.25, 0.5, 0.75],
  trot:   [0, 0.5],
  gallop: [0, 0.12, 0.34, 0.46],
};

/**
 * How many paws land between two points on the stride count.
 *
 * Pulled out of the update loop so it can be tested without an audio context.
 * Stride count runs upward and is never wrapped, so a beat is just a point on
 * the line and "did we pass it" is a comparison -- tracking a 0..1 phase
 * instead means every beat needs a wrap case, and the wrap cases are where a
 * footfall gets fired twice or dropped.
 */
export function beatsCrossed(from, to, beats, cap = 6) {
  let n = 0;
  for (const b of beats) {
    // Half-open: (from, to]. A beat landing exactly on a frame boundary
    // belongs to that frame and not to the next one as well -- closed at both
    // ends, a frame that happened to end on a beat fired it a second time.
    for (let k = Math.floor(from - b) + 1; k + b <= to && n < cap; k++) n++;
  }
  return n;
}

/** Per-gait footfall loudness. A gallop lands harder than an amble. */
const FOOT_GAIN = { walk: 0.16, trot: 0.24, gallop: 0.34 };

export class Sound {
  constructor() {
    this.ctx = null;
    this.phase = 0;        // stride cycles completed, counted upward
    this.nextBird = 0;
    this.clock = 0;
    this.muted = new URLSearchParams(location.search).has("mute");
  }

  /**
   * Called from a real gesture, or the browser refuses to make a sound.
   *
   * `external` lets a test drive the whole graph through an OfflineAudioContext
   * and measure what actually comes out. Sampling a live context from script
   * cannot: timers are throttled in a background tab, so a sixty-millisecond
   * chirp falls between two reads and looks like silence.
   */
  start(external = null) {
    if (this.muted) return;

    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!external && !Ctx) return;
      this.ctx = external || new Ctx();

      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      // Anchor the ramp explicitly. Without a starting point of its own it
      // ramps from whatever the parameter happens to hold, which is not the
      // same thing on every engine.
      this.master.gain.setValueAtTime(0, this.ctx.currentTime);
      this.master.gain.linearRampToValueAtTime(MASTER, this.ctx.currentTime + 2.5);

      this.noise = this.noiseBuffer();
      this.buildWind();
      this.nextBird = 2 + Math.random() * 4;

      /*
       * Phones take the audio away and do not give it back.
       *
       * A call, an alarm, or another app claiming output leaves the context
       * suspended -- iOS has a whole "interrupted" state for it. Nothing
       * re-runs on its own afterwards, so without this the forest goes quiet
       * for the rest of the session and only a fresh gesture would notice.
       */
      this.ctx.addEventListener?.("statechange", () => {
        if (this.ctx.state !== "running" && !document.hidden) {
          this.ctx.resume().catch(() => {});
        }
      });
    }

    /*
     * Resume every time, not just on the first call.
     *
     * This is two bugs, and mobile hits both. A context created inside a
     * gesture often comes up already running on desktop -- which is what made
     * this look fine in testing -- but on a phone it is reliably created
     * SUSPENDED and has to be resumed explicitly. And returning early once a
     * context existed meant no later gesture could rescue it: tapping and
     * swiping forever would never produce a sound.
     *
     * resume() rejects if it is called outside a gesture, which is fine -- the
     * next gesture will try again.
     */
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
  }

  /** Two seconds of white noise, reused by everything that needs a hiss. */
  noiseBuffer() {
    const n = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  /**
   * Wind, in two bands.
   *
   * The high band is leaves -- narrow, around a kilohertz, which is where
   * rustle lives. The low band is the air itself moving through the trunks.
   * Both are driven by slow oscillators on frequency and level, at periods
   * that share no common multiple, so the gusts never fall into a pattern the
   * ear can catch.
   */
  buildWind() {
    const ctx = this.ctx;
    const bed = ctx.createGain();
    bed.gain.value = 0.5;
    bed.connect(this.master);

    const leaves = ctx.createBufferSource();
    leaves.buffer = this.noise;
    leaves.loop = true;
    const leafBand = ctx.createBiquadFilter();
    leafBand.type = "bandpass";
    leafBand.frequency.value = 950;
    leafBand.Q.value = 0.7;
    const leafGain = ctx.createGain();
    leafGain.gain.value = 0.20;
    leaves.connect(leafBand).connect(leafGain).connect(bed);
    leaves.start();

    const air = ctx.createBufferSource();
    air.buffer = this.noise;
    air.loop = true;
    const airBand = ctx.createBiquadFilter();
    airBand.type = "lowpass";
    airBand.frequency.value = 240;
    const airGain = ctx.createGain();
    airGain.gain.value = 0.30;
    air.connect(airBand).connect(airGain).connect(bed);
    air.start();

    // Gusts. Periods chosen not to line up: 13.7 s against 8.3 s against 19 s.
    this.lfo(0.073, 420, leafBand.frequency);   // brightness rises with the gust
    this.lfo(0.120, 0.085, leafGain.gain);
    this.lfo(0.053, 0.115, airGain.gain);
  }

  /** A slow sine on an AudioParam: depth either side of its current value. */
  lfo(hz, depth, param) {
    const osc = this.ctx.createOscillator();
    osc.frequency.value = hz;
    const amp = this.ctx.createGain();
    amp.gain.value = depth;
    osc.connect(amp).connect(param);
    osc.start();
    return osc;
  }

  /**
   * One paw landing: a short burst of earth, with a soft thump under it.
   *
   * The burst alone reads as a twig snapping; the low sine is the weight of the
   * animal, and it is what makes it a footstep rather than a click.
   */
  footfall(gait) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const level = (FOOT_GAIN[gait] || 0.18) * (0.82 + Math.random() * 0.36);

    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.85 + Math.random() * 0.3;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 1300 + Math.random() * 900;
    band.Q.value = 1.1;
    const env = ctx.createGain();
    env.gain.setValueAtTime(level, t);
    env.gain.exponentialRampToValueAtTime(0.0005, t + 0.085);
    src.connect(band).connect(env).connect(this.master);
    src.start(t);
    src.stop(t + 0.12);

    const thump = ctx.createOscillator();
    thump.type = "sine";
    thump.frequency.setValueAtTime(120 + Math.random() * 30, t);
    thump.frequency.exponentialRampToValueAtTime(58, t + 0.07);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(level * 0.7, t);
    tg.gain.exponentialRampToValueAtTime(0.0005, t + 0.09);
    thump.connect(tg).connect(this.master);
    thump.start(t);
    thump.stop(t + 0.12);
  }

  /**
   * A bird, somewhere off in the trees.
   *
   * A chirp is a fast pitch sweep, not a tone -- two to five of them in a
   * phrase, each a little different. Panned at random and rolled off at the
   * top so it sits behind the trees rather than beside your ear.
   */
  bird() {
    const ctx = this.ctx;
    const start = ctx.currentTime + Math.random() * 0.1;
    const notes = 2 + Math.floor(Math.random() * 4);
    const base = 2400 + Math.random() * 1800;
    const rising = Math.random() < 0.5;

    const far = ctx.createBiquadFilter();
    far.type = "lowpass";
    // 5200 clipped the top of the sweep, which is most of what makes a chirp
    // sound like a bird rather than a beep.
    far.frequency.value = 7000;
    const out = ctx.createGain();
    // Measured against the wind bed: at the level this started on, a chirp
    // peaked at 1.1x the wind and simply vanished into it.
    out.gain.value = 0.17 + Math.random() * 0.12;

    let tail = far;
    if (ctx.createStereoPanner) {
      const pan = ctx.createStereoPanner();
      pan.pan.value = Math.random() * 1.6 - 0.8;
      tail = far.connect(pan);
    }
    tail.connect(out).connect(this.master);

    for (let i = 0; i < notes; i++) {
      const t = start + i * (0.075 + Math.random() * 0.07);
      const f0 = base * (1 + (Math.random() - 0.5) * 0.16);
      const f1 = rising ? f0 * 1.5 : f0 * 0.66;
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(f0, t);
      osc.frequency.exponentialRampToValueAtTime(f1, t + 0.05);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(1, t + 0.006);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      osc.connect(env).connect(far);
      osc.start(t);
      osc.stop(t + 0.09);
    }
  }

  /**
   * @param {number} dt        seconds
   * @param {object} gait      { moving, clip, stride, speed } from the animator
   */
  update(dt, gait) {
    if (!this.ctx || this.ctx.state !== "running") return;
    this.clock += dt;

    /*
     * Footfalls come from distance covered, not from a timer -- the same rule
     * the gait animation itself uses. That is what keeps a paw landing with
     * the sound of it while she eases in and out of a stop.
     */
    const beats = BEATS[gait.clip];
    if (gait.moving && beats && gait.stride > 0) {
      const was = this.phase;
      this.phase += (gait.speed * dt) / gait.stride;
      // Capped, so a tab that stalls for a second does not come back with a
      // hundred footfalls queued at once.
      const n = beatsCrossed(was, this.phase, beats);
      for (let i = 0; i < n; i++) this.footfall(gait.clip);
    } else {
      /*
       * Start the next gait just before its first beat, not on it. The beat
       * window is half-open, so resting exactly at zero would swallow the
       * opening footfall of every gait.
       */
      this.phase = -1e-4;
    }

    if (this.clock >= this.nextBird) {
      this.bird();
      this.nextBird = this.clock + 5 + Math.random() * 14;
    }
  }

  /** Quiet while the tab is hidden -- the game is paused anyway (§22). */
  setPaused(paused) {
    if (!this.ctx) return;
    if (paused && this.ctx.state === "running") this.ctx.suspend();
    if (!paused && this.ctx.state === "suspended") this.ctx.resume();
  }
}
