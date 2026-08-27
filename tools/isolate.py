#!/usr/bin/env python3
"""
Remove pieces of neighbouring frames from a cut sprite.

Splitting a sheet into columns cuts at the thinnest gaps, which is the best a
column-wise splitter can do -- but when a tail or a paw reaches across the gap,
part of the neighbour lands inside the frame. It then shows up in the animation
as a fragment appearing from nowhere, which is exactly the sort of thing that
reads as a rendering bug rather than an art bug.

The fix: a frame should be ONE animal. Keep the largest connected component,
and drop any other blob that touches the left or right edge -- because that is
what a piece sliced off a neighbour looks like. Interior detail that happens to
be detached (a paw clear of the ground, a speck of highlight) is kept.

    tools/isolate.py FRAME.png [FRAME.png ...]
"""
import os, sys

sys.path.insert(0, os.path.expanduser("~/.claude/skills/spriteforge/scripts"))
from cutout import read_png, to_rgba, write_rgba

ALPHA = 40


def components(w, h, rgba):
    seen = bytearray(w * h)
    out = []
    for start in range(w * h):
        if seen[start] or rgba[start * 4 + 3] <= ALPHA:
            continue
        stack, pixels = [start], []
        seen[start] = 1
        touches_side = False
        while stack:
            i = stack.pop()
            pixels.append(i)
            x, y = i % w, i // w
            if x == 0 or x == w - 1:
                touches_side = True
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h:
                    j = ny * w + nx
                    if not seen[j] and rgba[j * 4 + 3] > ALPHA:
                        seen[j] = 1
                        stack.append(j)
        out.append({"pixels": pixels, "n": len(pixels), "side": touches_side})
    return out


def isolate(path, verbose=True):
    w, h, ch, px = read_png(path)
    rgba = bytearray(to_rgba(w, h, ch, px))
    comps = components(w, h, rgba)
    if not comps:
        return False
    comps.sort(key=lambda c: c["n"], reverse=True)
    keep = comps[0]

    dropped = 0
    for c in comps[1:]:
        # A blob touching a side edge is a slice of the neighbouring frame.
        # Anything else small is anti-aliasing and harmless either way.
        if c["side"] or c["n"] < 12:
            for i in c["pixels"]:
                rgba[i * 4 + 3] = 0
            dropped += c["n"]

    if not dropped:
        return False

    # Re-tighten: removing a stray usually leaves dead margin behind.
    xs = [x for x in range(w) if any(rgba[(y * w + x) * 4 + 3] > ALPHA for y in range(h))]
    ys = [y for y in range(h) if any(rgba[(y * w + x) * 4 + 3] > ALPHA for x in range(w))]
    x0, x1, y0, y1 = xs[0], xs[-1] + 1, ys[0], ys[-1] + 1
    cw, chh = x1 - x0, y1 - y0
    out = bytearray(cw * chh * 4)
    for y in range(chh):
        src = ((y + y0) * w + x0) * 4
        out[y * cw * 4:(y + 1) * cw * 4] = rgba[src:src + cw * 4]

    write_rgba(path, cw, chh, out)
    if verbose:
        print(f"  {os.path.basename(path):16} dropped {dropped:6} px, {w}x{h} -> {cw}x{chh}")
    return True


if __name__ == "__main__":
    changed = sum(bool(isolate(p)) for p in sys.argv[1:])
    print(f"  cleaned {changed} of {len(sys.argv) - 1} frame(s)")
