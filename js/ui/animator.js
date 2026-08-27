/**
 * Molly Mae's animation state machine.
 *
 * Owns every sprite she can show and decides which frame is on screen. The
 * caller says what she is *doing*; this works out how to get there and how to
 * come back.
 *
 * Three kinds of clip, and they behave differently:
 *
 *   idle        one frame, held (standing)
 *   gait        loops, and its frame comes from DISTANCE TRAVELLED rather than
 *               a timer, so her feet stay planted at any pace -- including
 *               while easing in and out of a stop
 *   transition  plays once, holds its last frame, and plays BACKWARDS to
 *               return to standing. That reverse is why only the outbound half
 *               of each transition had to be drawn.
 *
 * Gaits are spine-registered and transitions feet-registered, so they cannot
 * share a placement rule. Each clip carries its own `ground` -- the canvas
 * fraction that sits on the trail -- and the renderer uses that.
 */

const CYCLES = "assets/molly/cycles/gaits";
const TRANS = "assets/molly/transitions";

/** Suggested pace in metres per second, and stride length in metres. */
export const GAIT_SPEC = {
  walk:   { pace: 1.1, stride: 0.62 },
  trot:   { pace: 2.6, stride: 1.05 },
  gallop: { pace: 6.0, stride: 2.30 },
};

/** How fast a transition plays, and how long it holds before returning. */
/*
 * `turn90` is not here on purpose. It was the off-trail pose -- side-on, nose in
 * the verge -- and with that set parked nothing maps to it, so loading its
 * frames would be a download for a pose the game cannot reach. The sprites are
 * still on disk; add the line back with the behaviours.
 */
const TRANSITION_SPEC = {
  sit:     { fps: 9 },
  lie:     { fps: 9 },
  turn180: { fps: 10 },
  glance:  { fps: 8 },
};

/**
 * The clips the Animator actually builds.
 *
 * Exported so the preloader fetches exactly these and nothing else. Reading
 * the sprite manifests wholesale instead pulls in `turn90` -- 181 KB of frames
 * for the off-trail pose, which has been parked since the off-trail behaviours
 * were -- and, worse, would quietly go on doing so as clips come and go.
 */
export const CLIPS = ["stand", ...Object.keys(GAIT_SPEC), ...Object.keys(TRANSITION_SPEC)];

/** Does a manifest key belong to `clip`? The Animator's own rule. */
export const clipOwns = (key, clip) => key === clip || key.startsWith(clip + "-");

export class Animator {
  constructor(container, clips) {
    this.el = container;
    this.clips = clips;
    this.all = Object.values(clips).flatMap((c) => c.imgs);

    this.pose = "stand";        // what the caller wants
    this.current = "stand";     // what is actually on screen
    this.frame = 0;
    this.acc = 0;
    this.leaving = false;       // playing a transition backwards
    this.show(clips.stand.imgs[0]);
  }

  static async load(container) {
    const [gaitMan, transMan] = await Promise.all([
      fetch(`${CYCLES}/sprites.json`).then((r) => r.json()),
      fetch(`${TRANS}/sprites.json`).then((r) => r.json()),
    ]);

    const build = (man, dir, prefix, extra) => {
      const keys = Object.keys(man.sprites)
        .filter((k) => k === prefix || k.startsWith(prefix + "-"))
        .sort((a, b) => (+(a.split("-")[1] || 0)) - (+(b.split("-")[1] || 0)));
      const imgs = keys.map((k) => {
        const im = document.createElement("img");
        im.src = `${dir}/${man.sprites[k].file}`;
        im.alt = "";
        im.draggable = false;
        Object.assign(im.style, { position: "absolute", inset: "0", width: "100%", display: "none" });
        container.appendChild(im);
        return im;
      });
      // A clip's ground line is its most planted frame: registering each frame
      // on its own lowest pixel would glue an airborne gallop frame to the
      // earth and flatten the suspension out of it.
      return { imgs, ground: Math.max(...keys.map((k) => man.sprites[k].feet)), ...extra };
    };

    const clips = { stand: build(transMan, TRANS, "stand", { kind: "idle" }) };
    for (const [k, spec] of Object.entries(GAIT_SPEC)) {
      clips[k] = build(gaitMan, CYCLES, k, { kind: "gait", ...spec });
    }
    for (const [k, spec] of Object.entries(TRANSITION_SPEC)) {
      clips[k] = build(transMan, TRANS, k, { kind: "transition", ...spec });
    }
    return new Animator(container, clips);
  }

  show(img) {
    for (const im of this.all) im.style.display = im === img ? "block" : "none";
  }

  /** What the caller wants her doing. Safe to call every frame. */
  setPose(pose) {
    if (this.clips[pose]) this.pose = pose;
  }

  /** Pace this clip implies, in m/s. Gaits move; everything else stands still. */
  get pace() {
    const c = this.clips[this.current];
    return c && c.kind === "gait" ? c.pace : 0;
  }

  /** Canvas fraction that sits on the trail, for placement. */
  get ground() {
    return (this.clips[this.current] || this.clips.stand).ground;
  }

  get isMoving() {
    return this.clips[this.current]?.kind === "gait";
  }

  update(dt, travelled) {
    const cur = this.clips[this.current];

    if (cur.kind === "transition") {
      this.acc += dt;
      if (this.acc >= 1 / cur.fps) {
        this.acc = 0;
        if (this.leaving) {
          this.frame--;
          if (this.frame <= 0) {          // back at standing; adopt the new pose
            this.leaving = false;
            this.current = this.clips[this.pose] ? this.pose : "stand";
            this.frame = 0;
          }
        } else if (this.frame < cur.imgs.length - 1) {
          this.frame++;
        } else if (this.pose !== this.current) {
          this.leaving = true;            // asked for something else; back out
        }
      }
      this.show(cur.imgs[Math.max(0, Math.min(this.frame, cur.imgs.length - 1))]);
      return;
    }

    // Idle or gait: switching between them is instant, since both start and end
    // with her upright and on her feet.
    if (this.pose !== this.current) {
      this.current = this.pose;
      this.frame = 0;
      this.acc = 0;
    }

    const now = this.clips[this.current];
    if (now.kind === "gait") {
      const n = now.imgs.length;
      this.show(now.imgs[Math.floor((travelled / now.stride) * n) % n]);
    } else {
      this.show(now.imgs[0]);
    }
  }
}

/**
 * Where a tap takes her next.
 *
 * A cycle rather than a ladder, so tapping always does something:
 *
 *   on her feet      she looks back, turns to face you, sits, or lies down
 *   looking back     she stands, turns to face you, sits, or lies down
 *   facing you       she turns back -- the one pose with a single way out
 *   sitting/lying    she gets up
 *
 * Which of the options she picks is hers; that she responds is not. Before
 * this, a tap asked the utility model to "settle", `rest` was the only
 * behaviour that answered, and `rest` mapped to lying down -- so she never sat,
 * and once down a tap had nothing left to say.
 */
export function nextPosture(current, rand = Math.random) {
  /*
   * Squared up and facing you is a one-way pose: she came round to look at
   * you, and the only thing to do next is turn back. Letting her go from
   * facing you straight to sitting or lying would skip the getting-up-and-round
   * that makes the turn read as a turn.
   */
  if (current === "sit" || current === "lie" || current === "turn180") return "stand";
  const options = current === "glance"
    ? ["stand", "sit", "lie", "turn180"]
    : ["glance", "sit", "lie", "turn180"];
  return options[Math.floor(rand() * options.length)];
}

/**
 * What the simulation's chosen behaviour looks like.
 *
 * This is the whole point of the connection: she is not animated at random, she
 * is animated because of what she decided to do. `look_at_player` -- the
 * check-in §9 describes -- becomes the glance over her shoulder; a scent stops
 * her and turns her side-on; a chase becomes a gallop.
 */
export function poseForBehaviour(state) {
  const dog = state.dog;
  const b = dog.behavior?.id;
  const asked = state.interaction.pace || "stop";

  // Frightened: nothing the player asked for outranks this.
  if (dog.emotion.fear > 0.42 || b === "retreat") return "turn180";

  /*
   * A posture set by tapping wins over whatever she would otherwise be doing.
   *
   * Without this the tap cycle could not work: `rest` maps to lying down and
   * nothing at all mapped to sitting, so settling could only ever produce the
   * same pose -- which is exactly what it did.
   */
  if (state.interaction.posture) return state.interaction.posture;

  if (b === "rest") return "lie";
  if (b === "wait") return "turn180";

  // The check-in.
  if (b === "look_at_player") return "glance";

  /*
   * The off-trail set is parked, so there is no side-on pose any more. When it
   * comes back, so does the turn90 mapping that went with it.
   */

  /*
   * Pottering follows the asked-for pace instead of standing still.
   *
   * `investigate_spot` fires constantly AND is one of the behaviours the "walk
   * on" nudge encourages -- so mapping it to a standing pose meant asking her
   * to walk frequently produced a dog standing still. It is sniffing as she
   * goes, which looks like walking.
   */
  if (b === "investigate_spot") {
    if (asked === "stop") return "stand";
    return asked === "run" ? "trot" : "walk";
  }

  if (b === "chase") return "gallop";

  if (["follow_player", "cross_crossing"].includes(b)) {
    /*
     * The player's asked-for pace sets the ceiling; she picks within it.
     *
     * Asked to run she usually will, but a tired or timid dog trots instead --
     * which is the point of asking rather than commanding (§2.1). Asked to
     * stop, she stops, whatever she was doing.
     */
    if (asked === "stop") return "stand";
    if (asked === "run") {
      // Only fear holds her back now. There is no tiredness to say no with.
      return dog.emotion.fear < 0.3 ? "gallop" : "trot";
    }
    const keen = dog.drives.exploration > 0.8 || dog.drives.play > 0.8;
    return keen ? "trot" : "walk";
  }

  return "stand";
}
