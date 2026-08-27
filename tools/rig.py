#!/usr/bin/env python3
"""
Cut a side-view sprite into an animatable cutout rig.

Why cut rather than generate parts separately: registration. Parts sliced from
one drawing line up perfectly by construction, share one light direction, and
cannot drift in style between frames -- all three of which are exactly what
separately generated parts get wrong.

Each part is written as its own PNG plus an offset, and the manifest records a
pivot so the renderer can rotate a head about the neck or a tail about the rump.
Seams are feathered, and the body keeps everything underneath, so a few degrees
of rotation never opens a visible hole.
"""
import json, os, sys, math

sys.path.insert(0, os.path.expanduser("~/.claude/skills/spriteforge/scripts"))
from cutout import read_png, to_rgba, write_rgba


def load(path):
    w, h, ch, px = read_png(path)
    return w, h, bytearray(to_rgba(w, h, ch, px))


def side_of(px, py, a, b):
    """Signed distance-ish of point p from the line a->b. Negative = left."""
    (ax, ay), (bx, by) = a, b
    return (bx - ax) * (py - ay) - (by - ay) * (px - ax)


def feathered_mask(w, h, cuts, feather):
    """
    1.0 where the part lives, 0.0 elsewhere, smooth across `feather` px.

    `cuts` is a list of (a, b) lines; a pixel belongs to the part when it is on
    the negative (left-hand) side of every line, walking a->b. Reverse a line to
    take the other side.
    """
    mask = [0.0] * (w * h)
    for y in range(h):
        for x in range(w):
            worst = None
            for a, b in cuts:
                d = side_of(x, y, a, b)
                length = math.hypot(b[0] - a[0], b[1] - a[1]) or 1
                d /= length
                worst = d if worst is None else max(worst, d)
            # worst < 0 -> inside. Feather the boundary.
            t = 0.5 - (worst / feather)
            mask[y * w + x] = 0.0 if t <= 0 else (1.0 if t >= 1 else t)
    return mask


def apply_mask(w, h, rgba, mask, invert=False, harden=None):
    """
    `harden` erases only where the mask is above that value, leaving the
    feathered fringe untouched. Used for the body: if both layers fade across
    the same seam their alphas sum to less than one and the join reads as a
    dark line. Keeping the body opaque under the fringe removes that, and gives
    a rotated head or tail painted fur to sit on instead of a hole.
    """
    out = bytearray(rgba)
    for i in range(w * h):
        m = mask[i]
        if harden is not None:
            m = 1.0 if m >= harden else 0.0
        if invert:
            m = 1.0 - m
        out[i * 4 + 3] = int(rgba[i * 4 + 3] * m)
    return out


def inpaint(w, h, body, original, band=46):
    """
    Fill the hole left behind when a part is lifted off the body.

    Without this the body has a literal gap where the head or tail used to be,
    and the moment a joint rotates more than a couple of degrees the player sees
    straight through her. Cutout animation normally solves this by painting the
    occluded area by hand; here we approximate it by diffusing the surrounding
    fur inward, which is invisible in play because it is only ever glimpsed at
    the edge of a joint.

    The body keeps the original silhouette -- only the colours are invented.
    """
    known = bytearray(w * h)          # 1 where we already have colour
    todo = []
    for i in range(w * h):
        oa = original[i * 4 + 3]
        if oa <= 6:
            continue                   # outside the dog entirely
        if body[i * 4 + 3] > 6:
            known[i] = 1
        else:
            todo.append(i)

    if not todo:
        return body

    out = bytearray(body)

    # Breadth-first diffusion inward from the known boundary, but only for a
    # limited band. Filling the whole cavity would restore the entire silhouette
    # of the removed part, so a rotated head would trail a pale ghost of itself.
    # A band a few dozen pixels deep covers everything a joint can expose, and
    # leaves the rest properly transparent.
    pending = set(todo)
    guard = 0
    while pending and guard < band:
        guard += 1
        frontier = []
        for i in pending:
            x, y = i % w, i // w
            acc = [0, 0, 0]
            n = 0
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and known[ny * w + nx]:
                    j = (ny * w + nx) * 4
                    acc[0] += out[j]; acc[1] += out[j + 1]; acc[2] += out[j + 2]
                    n += 1
            if n:
                frontier.append((i, acc[0] // n, acc[1] // n, acc[2] // n))
        if not frontier:
            break
        for i, r, g, b in frontier:
            out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b
            out[i * 4 + 3] = original[i * 4 + 3]
            known[i] = 1
            pending.discard(i)
    return out


def bbox(w, h, rgba, threshold=6):
    x0, y0, x1, y1 = w, h, -1, -1
    for y in range(h):
        row = y * w
        for x in range(w):
            if rgba[(row + x) * 4 + 3] > threshold:
                if x < x0: x0 = x
                if x > x1: x1 = x
                if y < y0: y0 = y
                if y > y1: y1 = y
    return (x0, y0, x1 + 1, y1 + 1) if x1 >= 0 else None


def crop(w, h, rgba, box):
    x0, y0, x1, y1 = box
    cw, chh = x1 - x0, y1 - y0
    out = bytearray(cw * chh * 4)
    for y in range(chh):
        src = ((y + y0) * w + x0) * 4
        out[y * cw * 4:(y + 1) * cw * 4] = rgba[src:src + cw * 4]
    return cw, chh, out


# --- the rig -------------------------------------------------------------
#
# Seams are chosen to follow anatomy: the head cut runs down the neck, the tail
# cut across the rump. Pivots sit at the joint, not the centre of the part, so
# rotation looks like the limb turning rather than the sprite spinning.

def load_parts(path):
    """
    Part definitions from JSON, so a rig can be described per pose rather than
    hard-coded for one sprite. Lines and pivots arrive as lists; make them
    tuples so the geometry helpers can treat them as points.
    """
    spec = json.load(open(path))
    return {
        name: {
            "cuts": [tuple(tuple(pt) for pt in cut) for cut in part["cuts"]],
            "pivot": tuple(part["pivot"]),
            "feather": part.get("feather", 12),
        }
        for name, part in spec.items()
    }



PARTS = {
    # Note both parts need a horizontal bound as well as their anatomical seam:
    # a cut line is infinite, so "everything left of the neck" also swallows the
    # front legs, and "everything right of the rump" swallows the back ones.
    "head": {
        "cuts": [((300, 268), (196, 30)),      # down the neck; head is left of it
                 ((0, 272), (923, 272))],      # ...and above the chest
        "pivot": (272, 232),                   # base of the neck
        "feather": 14,
    },
    "tail": {
        "cuts": [((766, 0), (742, 300)),       # across the rump; tail is right of it
                 ((0, 306), (923, 306))],      # ...and above the hock
        "pivot": (760, 268),                   # where it joins the body
        "feather": 12,
    },
}


def build(src, outdir, parts=None):
    parts = parts or PARTS
    w, h, rgba = load(src)
    os.makedirs(outdir, exist_ok=True)
    manifest = {"source": os.path.basename(src), "width": w, "height": h, "parts": {}}

    body = bytearray(rgba)
    for name, spec in parts.items():
        mask = feathered_mask(w, h, spec["cuts"], spec["feather"])
        part = apply_mask(w, h, rgba, mask)
        box = bbox(w, h, part)
        if not box:
            print(f"  {name}: EMPTY -- check the seam", file=sys.stderr)
            continue
        cw, chh, cropped = crop(w, h, part, box)
        write_rgba(os.path.join(outdir, f"{name}.png"), cw, chh, cropped)
        manifest["parts"][name] = {
            "file": f"{name}.png",
            "offset": [box[0], box[1]],
            "size": [cw, chh],
            "pivot": [spec["pivot"][0] - box[0], spec["pivot"][1] - box[1]],
            "pivotInSprite": list(spec["pivot"]),
        }
        # Remove the part from the body, but leave the feathered fringe behind so
        # small rotations still land on painted pixels rather than a hole.
        body = apply_mask(w, h, body, mask, invert=True, harden=0.92)
        print(f"  {name}: {cw}x{chh} at {box[0]},{box[1]} pivot {spec['pivot']}")

    body = inpaint(w, h, body, rgba)
    write_rgba(os.path.join(outdir, "body.png"), w, h, body)
    manifest["parts"]["body"] = {"file": "body.png", "offset": [0, 0], "size": [w, h]}

    with open(os.path.join(outdir, "rig.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"  body: {w}x{h}\n  wrote {outdir}/rig.json")
    return manifest


def preview(outdir, path, order=None):
    """Composite the parts back together, so a bad seam is visible immediately."""
    man = json.load(open(os.path.join(outdir, "rig.json")))
    w, h = man["width"], man["height"]
    canvas = bytearray(w * h * 4)
    for name in (order or ("body", "tail", "head")):
        p = man["parts"].get(name)
        if not p:
            continue
        pw, ph, prgba = load(os.path.join(outdir, p["file"]))
        ox, oy = p["offset"]
        for y in range(ph):
            for x in range(pw):
                a = prgba[(y * pw + x) * 4 + 3]
                if not a:
                    continue
                dx, dy = x + ox, y + oy
                if not (0 <= dx < w and 0 <= dy < h):
                    continue
                di = (dy * w + dx) * 4
                si = (y * pw + x) * 4
                sa = a / 255
                for c in range(3):
                    canvas[di + c] = int(prgba[si + c] * sa + canvas[di + c] * (1 - sa))
                canvas[di + 3] = min(255, int(a + canvas[di + 3] * (1 - sa)))
    write_rgba(path, w, h, canvas)
    print(f"  preview -> {path}")


if __name__ == "__main__":
    src = sys.argv[1] if len(sys.argv) > 1 else "assets/molly/molly-body-walk.png"
    out = sys.argv[2] if len(sys.argv) > 2 else "assets/molly/rig"
    parts = load_parts(sys.argv[3]) if len(sys.argv) > 3 else None
    print(f"rigging {src}")
    man = build(src, out, parts)
    order = ["body"] + [n for n in man["parts"] if n != "body"]
    preview(out, os.path.join(out, "_preview.png"), order)
