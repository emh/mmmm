/**
 * A generic cutout rig: load a rig.json, drive its parts by name.
 *
 * The point of rigging rather than generating frames is that there is only ever
 * one drawing, so the animal cannot drift between frames. Every inbetween is a
 * transform, which means the number of inbetweens is free -- smoothness costs
 * nothing once the rig exists.
 *
 * Each part carries a pivot at its joint, so rotation reads as a limb turning
 * rather than a picture spinning.
 */
export class PartsRig {
  constructor(container, manifest, basePath, order) {
    this.manifest = manifest;
    this.el = container;
    this.el.classList.add("rig");
    this.el.style.position = "relative";
    this.el.style.aspectRatio = `${manifest.width} / ${manifest.height}`;

    this.layers = {};
    const names = order || Object.keys(manifest.parts);
    for (const name of names) {
      const part = manifest.parts[name];
      if (!part) continue;
      const img = document.createElement("img");
      img.src = `${basePath}/${part.file}`;
      img.className = `rig-part rig-${name}`;
      img.alt = "";
      img.draggable = false;
      img.style.position = "absolute";
      img.style.display = "block";
      img.style.left = `${(part.offset[0] / manifest.width) * 100}%`;
      img.style.top = `${(part.offset[1] / manifest.height) * 100}%`;
      img.style.width = `${(part.size[0] / manifest.width) * 100}%`;
      if (part.pivot) {
        img.style.transformOrigin =
          `${(part.pivot[0] / part.size[0]) * 100}% ${(part.pivot[1] / part.size[1]) * 100}%`;
      }
      this.el.appendChild(img);
      this.layers[name] = img;
    }
  }

  /** rotate in degrees; dx/dy in sprite pixels; sx/sy are scale factors. */
  set(name, { rotate = 0, dx = 0, dy = 0, sx = 1, sy = 1 } = {}) {
    const img = this.layers[name];
    if (!img) return;
    const px = (v) => (v / this.manifest.width) * 100;
    const py = (v) => (v / this.manifest.height) * 100;
    img.style.transform =
      `translate(${px(dx).toFixed(3)}%, ${py(dy).toFixed(3)}%) ` +
      `rotate(${rotate.toFixed(2)}deg) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
  }
}

export async function loadPartsRig(container, basePath, order) {
  const manifest = await fetch(`${basePath}/rig.json`).then((r) => r.json());
  return new PartsRig(container, manifest, basePath, order);
}

/**
 * A rear-view run, driven entirely by transforms.
 *
 * From behind, a running dog reads through very few cues: the body rises and
 * falls twice per stride, it rolls onto each hind leg in turn, the hindquarters
 * swing, and the tail counter-balances a beat late. The legs themselves are
 * mostly hidden by the body -- which is why a rear view is the *easy* case to
 * rig, and why leg rotation can be modest and still convince.
 *
 * `t` is seconds; `speed` scales the stride rate.
 */
export function runPose(rig, t, speed = 1) {
  const TAU = Math.PI * 2;
  const stride = t * speed * 2.1;          // full stride cycles per second
  const phase = stride * TAU;

  // Body: two vertical beats per stride, plus a roll onto the driving leg.
  const bounce = -Math.abs(Math.sin(phase)) * 16 - 4;
  const roll = Math.sin(phase * 0.5) * 2.6;
  const sway = Math.sin(phase * 0.5) * 5;
  rig.set("body", { dy: bounce, dx: sway, rotate: roll, sy: 1 + Math.sin(phase) * 0.012 });

  // Hind legs, half a stride apart. A leg swinging forward is foreshortened,
  // so it shortens as it comes under the body -- that is most of what sells
  // depth from behind.
  /*
   * The hind legs oppose each other. Give them a half-cycle phase offset *or*
   * a mirrored sign, never both -- the two cancel exactly, and the legs end up
   * moving in lockstep, which reads as hopping rather than running. One driver,
   * opposite signs.
   */
  const swing = Math.sin(phase * 0.5);
  for (const [name, dir] of [["leg_l", 1], ["leg_r", -1]]) {
    const s = swing * dir;
    rig.set(name, {
      dy: bounce + Math.max(0, s) * 10,
      dx: sway + s * 7,
      rotate: s * 11,
      sy: 1 - Math.max(0, s) * 0.20,
    });
  }

  // The tail answers the roll a beat late, which is what stops the whole
  // animal reading as one rigid object being shaken.
  rig.set("tail", {
    dy: bounce * 0.85,
    dx: sway * 0.7,
    rotate: -Math.sin(phase * 0.5 - 0.9) * 9,
  });
}
