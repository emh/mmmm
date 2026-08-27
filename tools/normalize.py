#!/usr/bin/env python3
"""
Put every Molly sprite on one canvas at one scale.

Sprites are cut to their own bounding boxes, which throws away the thing the
game actually needs: how big she is. A rear view crops tight, a side view is
twice as wide for the same animal, and an airborne run frame is shorter than a
standing one. Scaling any of those by their own pixel dimensions makes her
change size from pose to pose.

Worse, image models do not hold scale across the frames of a sheet even when
told to, so a generated run cycle arrives with every frame a different size
sitting at a different height. Fixing that by hand does not scale; measuring
and re-registering does.

Output: uniform canvases, all identical in size, her body at a consistent
scale, registered on a stable anatomical landmark. The game then needs one
number -- canvas height in metres -- instead of a value per pose.
"""
import json, os, sys

sys.path.insert(0, os.path.expanduser("~/.claude/skills/spriteforge/scripts"))
from cutout import read_png, to_rgba, write_rgba

ALPHA = 40

# Where a feet-registered frame's ground line sits in the canvas.
FEET_FRAC = 0.80


def row_extents(w, h, rgba):
    out = []
    for y in range(h):
        first = last = -1
        base = y * w
        for x in range(w):
            if rgba[(base + x) * 4 + 3] > ALPHA:
                if first < 0:
                    first = x
                last = x
        out.append((first, last, 0 if first < 0 else last - first + 1))
    return out


def measure(w, h, rgba):
    """
    Body scale and a registration point.

    `ref` is taken from the widest rows rather than the bounding box, because a
    tail flung sideways or a leg stretched forward wrecks a bounding-box
    measurement while barely affecting the animal's girth.

    `back_y` is the top of the body -- the first row substantial enough to be
    back or skull rather than an ear tip. Registering on the spine keeps her
    steady while legs and tail move, which is what an animation needs.
    """
    rows = row_extents(w, h, rgba)
    widths = sorted((r[2] for r in rows if r[2] > 0), reverse=True)
    if not widths:
        return None

    # Provisional scale from the widest rows, only to locate the top of the body.
    rough = widths[len(widths) // 8] if len(widths) > 8 else widths[0]
    back_y = next((y for y, r in enumerate(rows) if r[2] >= rough * 0.34), 0)
    bottom_y = max((y for y, r in enumerate(rows) if r[2] > 0), default=h - 1)

    # Measure the TORSO, not the whole silhouette.
    #
    # The widest rows of a running dog are wherever its legs happen to be
    # splayed, so a frame at full extension measures far "wider" than the same
    # dog with its legs gathered -- and normalising on that shrinks and swells
    # her through the cycle. The upper half of the body, from the spine down, is
    # rump and ribcage: it barely changes whatever the legs are doing.
    torso = [r[2] for r in rows[back_y:back_y + max(4, int((bottom_y - back_y) * 0.5))] if r[2] > 0]
    torso.sort()
    ref = torso[len(torso) // 2] if torso else rough

    band = [r for r in rows[back_y:back_y + max(4, int(h * 0.30))] if r[2] > 0]
    centre = (sum((r[0] + r[1]) / 2 for r in band) / len(band)) if band else w / 2
    return {"ref": ref, "back_y": back_y, "centre": centre, "bottom": bottom_y}


def resample(sw, sh, src, dw, dh, scale, ox, oy):
    out = bytearray(dw * dh * 4)
    inv = 1.0 / scale
    for y in range(dh):
        sy = int((y - oy) * inv)
        if sy < 0 or sy >= sh:
            continue
        for x in range(dw):
            sx = int((x - ox) * inv)
            if sx < 0 or sx >= sw:
                continue
            s = (sy * sw + sx) * 4
            if src[s + 3] == 0:
                continue
            d = (y * dw + x) * 4
            out[d:d + 4] = src[s:s + 4]
    return out


def normalize(specs, outdir, canvas=(380, 600), target_ref=120, back_frac=0.125,
              register="spine", uniform_groups=False):
    """
    `specs` maps output name -> {"src": path, "scale": optional manual factor}.

    A manual factor is needed where the automatic body-width measurement is not
    comparable -- most obviously a side view, whose widest dimension is her
    length rather than her girth.

    `register` picks the anatomical landmark every frame is pinned to, and the
    right choice depends on what the frames are:

    - "spine" for a CYCLE. The feet move and the body is steady, so pinning the
      top of the back keeps her from bobbing on top of her own gait.
    - "feet" for a TRANSITION. Sitting or lying down, her feet stay planted
      while the spine legitimately drops. Pinning the spine there would slide
      her into the ground as she sits.

    `uniform_groups` gives every frame sharing a name prefix the SAME scale,
    taken from the first frame of that group.

    Per-frame scaling is right for a cycle, where every frame shows the same
    orientation and the torso measurement means the same thing throughout. It
    is badly wrong for a turn: as she rotates, the widest part of her stops
    being her girth and becomes her length, so the measurement doubles and
    "correcting" it makes her pulse. One scale per sheet, measured where the
    metric is trustworthy, beats a per-frame correction built on a metric that
    is not.
    """
    os.makedirs(outdir, exist_ok=True)
    dw, dh = canvas
    manifest = {"canvas": [dw, dh], "backFrac": back_frac, "sprites": {}}

    group_scale = {}
    for name, spec in specs.items():
        w, h, ch, px = read_png(spec["src"])
        rgba = to_rgba(w, h, ch, px)
        m = measure(w, h, rgba)
        if not m:
            print(f"  {name}: empty, skipped", file=sys.stderr)
            continue

        scale = spec.get("scale") or (target_ref / m["ref"])
        if uniform_groups:
            group = name.rsplit("-", 1)[0]
            scale = group_scale.setdefault(group, scale)
        ox = dw / 2 - m["centre"] * scale
        if (spec.get("register") or register) == "feet":
            oy = dh * FEET_FRAC - m["bottom"] * scale
        else:
            oy = dh * back_frac - m["back_y"] * scale

        write_rgba(os.path.join(outdir, f"{name}.png"), dw, dh,
                   resample(w, h, rgba, dw, dh, scale, ox, oy))

        feet = (m["bottom"] * scale + oy) / dh
        manifest["sprites"][name] = {"file": f"{name}.png",
                                     "scale": round(scale, 4), "feet": round(feet, 4)}
        print(f"  {name:12} ref={m['ref']:4}  scale={scale:.3f}  feet={feet:.3f}")

    with open(os.path.join(outdir, "sprites.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"  -> {outdir}/sprites.json")
    return manifest


if __name__ == "__main__":
    reg = sys.argv[3] if len(sys.argv) > 3 else "spine"
    uni = "--uniform" in sys.argv
    normalize(json.load(open(sys.argv[1])), sys.argv[2], register=reg, uniform_groups=uni)
