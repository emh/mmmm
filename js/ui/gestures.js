/**
 * A gesture layer for influencing Molly Mae without words.
 *
 * The action bar was always a compromise: §2.1 says the player *influences*
 * rather than commands, and a row of labelled verbs reads like a command menu.
 * Gestures fit the fiction better -- you are a person on a trail with a dog,
 * and what you actually do is call, wave on, wait, and reach down to touch her.
 *
 * The vocabulary is deliberately tiny, and each gesture means one thing that a
 * person would recognise:
 *
 *   swipe up     ask her on          (desktop: up arrow)
 *   swipe down   ask her to ease off  (desktop: down arrow)
 *   tap          stop                 (desktop: space)
 *   tap again    settle
 *
 * Nothing here decides what she does. Each gesture sets the same kind of nudge
 * the buttons set, and her own utility model still chooses (§2.1, §7).
 */

const TAP_MS = 300;
const SWIPE_PX = 44;

export class Gestures {
  /**
   * @param {HTMLElement} el      the scene
   * @param {function} onGesture  ({type, at}) -> void
   */
  constructor(el, onGesture) {
    this.el = el;
    this.onGesture = onGesture;
    this.ink = el.querySelector("#gesture-ink");
    this.start = null;

    el.addEventListener("pointerdown", (e) => this.down(e));
    el.addEventListener("pointermove", (e) => this.move(e));
    el.addEventListener("pointerup", (e) => this.up(e));
    el.addEventListener("pointercancel", () => this.cancel());
    // A drag on the scene should not select or scroll the page under it.
    el.style.touchAction = "none";

    /*
     * Keys are listened for on the document in the CAPTURE phase, and the
     * scene is made focusable and focused on load and on any touch.
     *
     * A bare window listener is not enough in practice: in an embedded frame
     * the document often has no keyboard focus at all, so nothing arrives --
     * and if any element does hold focus, space activates it instead of
     * reaching the game. Both failures look identical from the outside: the
     * page seems to react to something, and the dog does nothing.
     */
    el.tabIndex = 0;
    el.style.outline = "none";
    const grabFocus = () => {
      // In an embedded frame, focusing the element is not enough -- the frame's
      // window has to take focus from the host too, or keydown never fires.
      try { window.focus(); } catch { /* cross-origin host: nothing to do */ }
      el.focus({ preventScroll: true });
    };
    el.addEventListener("pointerdown", grabFocus);
    addEventListener("pointerdown", grabFocus);
    setTimeout(grabFocus, 0);

    document.addEventListener("keydown", (e) => this.key(e), true);
  }

  /**
   * Keyboard equivalents, so the game is playable without a touchscreen.
   *
   * Same three signals, same code path -- these are not a second input scheme,
   * they are the same vocabulary reached a different way.
   */
  key(e) {
    const KEYS = { ArrowUp: "sendon", ArrowDown: "recall", " ": "tap", Spacebar: "tap" };
    const type = KEYS[e.key];
    if (!type) return;
    // Held keys must not spam the ladder, and space must not scroll the page.
    if (e.repeat) return;
    if (e.target.matches?.("input, textarea, select")) return;
    // Stop space from scrolling the page, and from activating whatever element
    // happens to hold focus.
    e.preventDefault();
    e.stopPropagation();

    // Mark it where she is, so the feedback reads as being about her.
    const r = this.el.getBoundingClientRect();
    const dog = this.el.querySelector("#dog")?.getBoundingClientRect();
    const at = dog
      ? { x: dog.left - r.left + dog.width / 2, y: dog.top - r.top + dog.height * 0.7 }
      : { x: r.width / 2, y: r.height * 0.6 };
    this.fire(type, at);
  }

  local(e) {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  down(e) {
    this.start = { ...this.local(e), t: performance.now(), moved: false };
  }

  move(e) {
    if (!this.start) return;
    const p = this.local(e);
    if (Math.hypot(p.x - this.start.x, p.y - this.start.y) > 10) this.start.moved = true;
  }

  up(e) {
    if (!this.start) return;
    const p = this.local(e);
    const dy = p.y - this.start.y;
    const dx = p.x - this.start.x;
    const dt = performance.now() - this.start.t;
    this.start = null;

    /*
     * Vertical only. This is a trail seen in perspective, so "on you go" and
     * "ease off" are up and down the screen -- and restricting the axis means a
     * sloppy diagonal still does what was meant instead of nothing.
     */
    if (Math.abs(dy) >= SWIPE_PX && Math.abs(dy) > Math.abs(dx)) {
      this.fire(dy < 0 ? "sendon" : "recall", p);
    } else if (dt <= TAP_MS || Math.hypot(dx, dy) < 12) {
      this.fire("tap", p);
    }
  }

  cancel() {
    this.start = null;
  }

  fire(type, at) {
    this.mark(at, type);
    this.onGesture({ type, at });
  }

  /** A brief mark where you touched. Feedback without a word. */
  mark(at, type) {
    if (!this.ink) return;
    const d = document.createElement("div");
    d.className = `ink ink-${type}`;
    d.style.left = `${at.x}px`;
    d.style.top = `${at.y}px`;
    this.ink.appendChild(d);
    setTimeout(() => d.remove(), 700);
  }
}

/**
 * The whole vocabulary, as a pace ladder.
 *
 *   swipe up     ask her on -- stopped becomes a walk, a walk becomes a run
 *   swipe down   ask her to ease off -- a run becomes a walk
 *   tap          stop. She will usually turn and look at you
 *   tap again    settle -- sit or lie down, her choice which
 *
 * Four gestures on one axis, which is learnable in seconds and needs no label.
 * Everything is an *ask*: she can stop at a scent while you have asked for a
 * walk, or break into a run when you only asked her on (§2.1).
 */
const LADDER = ["stop", "walk", "run"];

export function gestureToIntent(g, state) {
  const pace = state.interaction.pace || "stop";
  const at = LADDER.indexOf(pace);

  switch (g.type) {
    case "sendon":                                  // swipe away from you
      return { pace: LADDER[Math.min(LADDER.length - 1, at + 1)] };

    case "recall":                                  // swipe toward you
      return { pace: LADDER[Math.max(0, at - 1)] };

    case "tap":
      // Stopped already? Then a tap asks her to settle. Which of sitting or
      // lying down she picks is hers, and follows how tired she is.
      if (pace === "stop") return { pace: "stop", settle: true };
      return { pace: "stop" };

    default:
      return null;
  }
}

/**
 * The nudge an intent produces.
 *
 * Gestures go through the same path the old buttons did, so her utility model
 * still chooses and she still learns the same things about the player (§9).
 */
export function intentToAction(intent) {
  if (intent.settle) {
    return { id: "rest_here", label: "settle",
             nudge: { encourage: ["rest", "wait"],
                      discourage: ["follow_player", "investigate_scent"], strength: 3.0 } };
  }
  switch (intent.pace) {
    case "stop":
      return { id: "wait", label: "stop",
               nudge: { encourage: ["wait", "look_at_player"],
                        discourage: ["follow_player", "chase", "investigate_scent"],
                        strength: 3.0 } };
    case "walk":
      return { id: "keep_going", label: "walk on",
               nudge: { encourage: ["follow_player", "investigate_spot"], strength: 2.4 } };
    case "run":
      return { id: "let_explore", label: "run",
               nudge: { encourage: ["follow_player", "chase"], strength: 2.6 } };
    default:
      return null;
  }
}
