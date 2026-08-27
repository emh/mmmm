#!/usr/bin/env python3
"""
Punch out background trapped inside a cutout.

Stripping a background floods in from the edges, so it can only reach what the
outside can reach. Anything the subject encloses -- the gap between a dog's
legs, the loop of a tail -- survives as an island of background in the middle
of the sprite. It is invisible while you are checking cutouts against a pale
page and glaring the moment the sprite sits on dark ground.

Only near-white, near-grey pixels are taken. Cream and buff fur is warm --
noticeably more saturated than the paper the generator leaves behind -- so the
test is deliberately strict on both lightness AND neutrality, and it reports
the mean colour of what it removed so a bad threshold shows up as a warm
average rather than silently eating a marking.

  python3 tools/holes.py FILE [FILE ...]

Writes full RGBA, which drops the palette these sprites ship with -- the two
frames this was first run on doubled in size. Always re-quantise afterwards:

  python3 ~/.claude/skills/spriteforge/scripts/quantize.py FILE [FILE ...]
"""
import os, sys

sys.path.insert(0, os.path.expanduser("~/.claude/skills/spriteforge/scripts"))
from cutout import read_png, to_rgba, write_rgba

CORE_MIN, CORE_SAT = 232, 14      # certainly background
FRINGE_MIN, FRINGE_SAT = 198, 30  # the anti-aliased rim around it
GROW = 3


def light(d, i, mn, sat):
    r, g, b = d[i], d[i + 1], d[i + 2]
    return min(r, g, b) >= mn and (max(r, g, b) - min(r, g, b)) <= sat


def fill(path):
    w, h, ch, px = read_png(path)
    d = bytearray(to_rgba(w, h, ch, px))
    mask = bytearray(w * h)

    for p in range(w * h):
        if d[p * 4 + 3] >= 32 and light(d, p * 4, CORE_MIN, CORE_SAT):
            mask[p] = 1

    # Grow into the halo. The rim is a blend of white and fur, so it is lighter
    # than fur but not white; left behind it reads as an outline round the hole.
    for _ in range(GROW):
        add = []
        for y in range(h):
            for x in range(w):
                p = y * w + x
                if mask[p] or d[p * 4 + 3] < 32:
                    continue
                if not light(d, p * 4, FRINGE_MIN, FRINGE_SAT):
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and mask[ny * w + nx]:
                        add.append(p)
                        break
        for p in add:
            mask[p] = 1

    n = sum(mask)
    if not n:
        return 0, None

    tot = [0, 0, 0]
    for p in range(w * h):
        if not mask[p]:
            continue
        for c in range(3):
            tot[c] += d[p * 4 + c]
        d[p * 4 + 3] = 0

    # Feather what is left at the boundary, so the hole has no hard edge.
    soften = []
    for y in range(h):
        for x in range(w):
            p = y * w + x
            if mask[p] or d[p * 4 + 3] < 32:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and mask[ny * w + nx]:
                    soften.append(p)
                    break
    for p in soften:
        d[p * 4 + 3] = int(d[p * 4 + 3] * 0.55)

    write_rgba(path, w, h, d)
    return n, tuple(v // n for v in tot)


if __name__ == "__main__":
    for path in sys.argv[1:]:
        n, mean = fill(path)
        name = os.path.basename(path)
        if n:
            print(f"  {name:24} removed {n:5} px   mean colour rgb{mean}")
        else:
            print(f"  {name:24} nothing trapped")
