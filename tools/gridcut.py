#!/usr/bin/env python3
"""
Cut a multi-row sprite sheet into rows of frames.

spriteforge's cutter splits a sheet by columns only, which is right for one
strip of poses and useless for a sheet holding several animation cycles stacked
as rows. This finds the horizontal bands first, then splits each band into its
own frame count -- so one generation can carry a walk, a trot and a gallop, and
each row can have a different number of frames.

    tools/gridcut.py SHEET OUTDIR walk:4 trot:4 gallop:6
"""
import os, sys

sys.path.insert(0, os.path.expanduser("~/.claude/skills/spriteforge/scripts"))
from cutout import (read_png, to_rgba, write_rgba, strip_background,
                    decontaminate, despeckle, column_occupancy, split_into)
from isolate import isolate

ALPHA = 24


def row_occupancy(w, h, rgba):
    return [sum(1 for x in range(w) if rgba[(y * w + x) * 4 + 3] > ALPHA) for y in range(h)]


def bands(occ, min_gap, min_height):
    """Contiguous runs of occupied rows, separated by at least `min_gap` empty ones."""
    out, start, gap = [], None, 0
    for y, n in enumerate(occ):
        if n > 0:
            if start is None:
                start = y
            gap = 0
        elif start is not None:
            gap += 1
            if gap >= min_gap:
                if y - gap - start >= min_height:
                    out.append((start, y - gap))
                start, gap = None, 0
    if start is not None and len(occ) - start >= min_height:
        out.append((start, len(occ)))
    return out


def crop2d(w, h, rgba, x0, y0, x1, y1):
    cw, chh = x1 - x0, y1 - y0
    out = bytearray(cw * chh * 4)
    for y in range(chh):
        src = ((y + y0) * w + x0) * 4
        out[y * cw * 4:(y + 1) * cw * 4] = rgba[src:src + cw * 4]
    return cw, chh, out


def trim(w, h, rgba):
    """Tighten to the opaque bounding box."""
    xs = [x for x in range(w) if any(rgba[(y * w + x) * 4 + 3] > ALPHA for y in range(0, h, 2))]
    ys = [y for y in range(h) if any(rgba[(y * w + x) * 4 + 3] > ALPHA for x in range(0, w, 2))]
    if not xs or not ys:
        return None
    return crop2d(w, h, rgba, xs[0], ys[0], xs[-1] + 1, ys[-1] + 1)


def gridcut(sheet, outdir, rows, threshold=212, spread=42):
    w, h, ch, px = read_png(sheet)
    rgba = bytearray(to_rgba(w, h, ch, px))
    strip_background(w, h, rgba, threshold, spread)
    decontaminate(w, h, rgba, 2, (255, 255, 255))
    despeckle(w, h, rgba, 400)

    found = bands(row_occupancy(w, h, rgba), min_gap=max(8, h // 90), min_height=h // 20)
    print(f"  {os.path.basename(sheet)}: {w}x{h}, {len(found)} row band(s)")
    if len(found) != len(rows):
        print(f"  WARNING: expected {len(rows)} rows, found {len(found)}", file=sys.stderr)

    os.makedirs(outdir, exist_ok=True)
    written = []
    for (name, count), (y0, y1) in zip(rows, found):
        bw, bh, band = crop2d(w, h, rgba, 0, y0, w, y1)
        cuts = split_into(column_occupancy(bw, bh, band), count)
        edges = [0] + list(cuts) + [bw]
        print(f"  {name}: rows {y0}-{y1}, {len(edges) - 1} cell(s)")
        for i in range(len(edges) - 1):
            cw, chh, cell = crop2d(bw, bh, band, edges[i], 0, edges[i + 1], bh)
            t = trim(cw, chh, cell)
            if not t:
                print(f"    {name}-{i + 1}: empty", file=sys.stderr)
                continue
            tw, th, timg = t
            path = os.path.join(outdir, f"{name}-{i + 1}.png")
            write_rgba(path, tw, th, timg)
            # A column split cuts at the thinnest gap, so a tail reaching across
            # it leaves part of the neighbour inside this frame -- which shows up
            # in play as a fragment appearing from nowhere. Always isolate.
            isolate(path, verbose=False)
            written.append(path)
            print(f"    {name}-{i + 1}: {tw}x{th}")
    return written


if __name__ == "__main__":
    sheet, outdir = sys.argv[1], sys.argv[2]
    rows = [(a.split(":")[0], int(a.split(":")[1])) for a in sys.argv[3:]]
    gridcut(sheet, outdir, rows)
