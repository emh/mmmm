#!/usr/bin/env python3
"""
Make a texture tile vertically, by mirroring.

The trail runs away from the camera, so the ground only has to repeat in Y.

Cross-fading the seam is the obvious approach and it does not actually
guarantee a wrap -- it just makes the discontinuity smaller (measured ~20/255
on this texture, which crawls visibly when the plane scrolls). Stacking the
image above a vertically flipped copy is exact: the first and last rows are the
same row, so the join is perfect by construction.

The cost is mirror symmetry, which on a noisy dirt texture seen at a shallow
angle is not detectable.
"""
import os, sys

sys.path.insert(0, os.path.expanduser("~/.claude/skills/spriteforge/scripts"))
from cutout import read_png, to_rgba, write_rgba


def tile_y(src, dst):
    w, h, ch, px = read_png(src)
    rgba = to_rgba(w, h, ch, px)
    row = w * 4

    out = bytearray(w * h * 2 * 4)
    out[0:h * row] = rgba                                   # original
    for j in range(h):                                      # flipped below it
        src_row = (h - 1 - j) * row
        out[(h + j) * row:(h + j + 1) * row] = rgba[src_row:src_row + row]

    write_rgba(dst, w, h * 2, out)

    top = out[0:row]
    bot = out[(h * 2 - 1) * row:(h * 2) * row]
    delta = sum(abs(a - b) for a, b in zip(top, bot)) / len(top)
    print(f"  {os.path.basename(dst)}  {w}x{h * 2}  seam delta {delta:.2f}")


if __name__ == "__main__":
    tile_y(sys.argv[1], sys.argv[2])
