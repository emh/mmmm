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
const TRANSITION_SPEC = {
  sit:     { fps: 9 },
  lie:     { fps: 9 },
  turn90:  { fps: 10 },
  turn180: { fps: 10 },
  glance:  { fps: 8 },
};

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

  if (b === "rest") return "lie";

  // Frightened or asked to wait: she stops and turns to face you.
  if (dog.emotion.fear > 0.42 || b === "retreat" || b === "wait") return "turn180";

  // The check-in.
  if (b === "look_at_player") return "glance";

  /*
   * Something specific has her attention off the trail: she stops and turns
   * side-on to work at it.
   *
   * `investigate_spot` is deliberately NOT in this list. It is her generic
   * pottering-about behaviour and it fires constantly, so turning her ninety
   * degrees each time made her pivot every few seconds like a weathervane. A
   * pause reads as the same thing and costs nothing.
   */
  if (["investigate_scent", "dig", "greet", "splash", "drink", "eat", "play"].includes(b)) {
    return "turn90";
  }
  if (b === "investigate_spot") return "stand";

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
      const willing = dog.needs.fatigue < 0.7 && dog.emotion.fear < 0.3;
      return willing ? "gallop" : "trot";
    }
    const keen = dog.drives.exploration > 0.8 || dog.needs.exercise > 0.75;
    return keen ? "trot" : "walk";
  }

  return "stand";
}
