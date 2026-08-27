#!/usr/bin/env python3
"""
Extract the worn path from a trail texture as a transparent overlay.

A trail texture cannot simply *be* the ground. The ground plane is far wider
than the visible scene, so a path occupying a third of the texture ends up
occupying the whole screen. The path has to be a narrow band laid over an
ordinary forest-floor surface, which also means the two can be scaled
independently.

Keeps the central band, fades to transparent at its edges so it blends into
whatever it is laid on, and preserves the full canvas height so it still tiles.

    tools/trailmask.py SRC DST [band_fraction] [feather_fraction]
"""
import os, sys

sys.path.insert(0, os.path.expanduser("~/.claude/skills/spriteforge/scripts"))
from cutout import read_png, to_rgba, write_rgba


def mask(src, dst, band=0.42, feather=0.13):
    w, h, ch, px = read_png(src)
    rgba = bytearray(to_rgba(w, h, ch, px))

    half = band * w / 2
    fade = max(1.0, feather * w)
    cx = w / 2

    for x in range(w):
        d = abs(x - cx)
        if d <= half:
            a = 1.0
        elif d >= half + fade:
            a = 0.0
        else:
            t = (d - half) / fade
            a = 1 - (t * t * (3 - 2 * t))          # smoothstep out
        if a >= 1.0:
            continue
        byte = int(a * 255)
        for y in range(h):
            i = (y * w + x) * 4 + 3
            rgba[i] = rgba[i] * byte // 255

    write_rgba(dst, w, h, rgba)
    print(f"  {os.path.basename(dst)}  {w}x{h}  band={band:.2f} feather={feather:.2f}")


if __name__ == "__main__":
    b = float(sys.argv[3]) if len(sys.argv) > 3 else 0.42
    f = float(sys.argv[4]) if len(sys.argv) > 4 else 0.13
    mask(sys.argv[1], sys.argv[2], b, f)
