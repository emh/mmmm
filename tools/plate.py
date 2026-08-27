#!/usr/bin/env python3
"""
Turn a generated foreground plate into a transparent overlay.

Different job from cutting a sprite. A sprite is found, cropped to its bounding
box and centred; a plate must keep its exact canvas, because it is registered
against the other plates of the same location -- crop it and the parallax no
longer lines up. So: strip the background, clean the edge, keep every pixel of
the frame.
"""
import os, sys

sys.path.insert(0, os.path.expanduser("~/.claude/skills/spriteforge/scripts"))
from cutout import read_png, to_rgba, write_rgba, strip_background, decontaminate, despeckle


def build(src, dst, threshold=205, spread=42, rings=2, despeckle_px=900):
    w, h, ch, px = read_png(src)
    rgba = bytearray(to_rgba(w, h, ch, px))

    # All three of these mutate `rgba` in place and return counts, not buffers.
    bg = (255, 255, 255)
    cleared = strip_background(w, h, rgba, threshold, spread)
    decontaminate(w, h, rgba, rings, bg)
    if despeckle_px:
        despeckle(w, h, rgba, despeckle_px)

    opaque = sum(1 for i in range(w * h) if rgba[i * 4 + 3] > 200)
    write_rgba(dst, w, h, rgba)
    print(f"  {os.path.basename(dst)}  {w}x{h}  {opaque * 100 // (w * h)}% opaque -> {dst}")
    return w, h


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("usage: plate.py SRC DST [threshold]", file=sys.stderr)
        sys.exit(2)
    t = int(sys.argv[3]) if len(sys.argv) > 3 else 205
    build(sys.argv[1], sys.argv[2], threshold=t)
