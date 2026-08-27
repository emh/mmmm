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


def level_rows(w, h, rgba, strength=0.85):
    """
    Flatten the vertical brightness gradient before mirroring.

    Mirroring guarantees the first and last rows match, so there is never a
    discontinuity -- but it also creates an axis of symmetry, and any
    top-to-bottom gradient in the source gets folded into a bright or dark band
    right across the texture at that axis. On a ground plane that reads as a
    hard horizontal seam.

    Correcting each row toward the image mean removes the gradient without
    touching local detail, so the fold becomes invisible.
    """
    out = bytearray(rgba)
    row_mean = []
    for y in range(h):
        base = y * w * 4
        total = 0
        for x in range(0, w, 4):
            i = base + x * 4
            total += (out[i] * 299 + out[i + 1] * 587 + out[i + 2] * 114) // 1000
        row_mean.append(total / max(1, len(range(0, w, 4))))

    overall = sum(row_mean) / len(row_mean)
    for y in range(h):
        if row_mean[y] <= 0:
            continue
        gain = overall / row_mean[y]
        # Correct the trend, not every wobble: a strong per-row gain would
        # scrub out real variation like a band of needles.
        gain = 1 + (gain - 1) * strength
        if abs(gain - 1) < 0.002:
            continue
        base = y * w * 4
        for x in range(w):
            i = base + x * 4
            for c in range(3):
                out[i + c] = min(255, max(0, int(out[i + c] * gain)))
    return out


def tile_y(src, dst, level=True):
    w, h, ch, px = read_png(src)
    rgba = to_rgba(w, h, ch, px)
    if level:
        rgba = level_rows(w, h, rgba)
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
