#!/usr/bin/env python3
"""
Make the runtime assets web-sized.

Generated art arrives at whatever resolution the model produced -- typically
1024-1536px -- and the game draws most of it at a fraction of that. A 1536px
backdrop shown 500px wide is not sharper, it is just slower, and a photographic
ground texture stored as PNG is roughly twenty times bigger than it needs to be.

Two rules:

  opaque plates  -> JPEG, resized to about twice their on-screen size
  sprites        -> PNG (alpha is required), resized, then colour-quantised

"About twice" leaves headroom for high-density screens without paying for
detail nobody can see.
"""
import os, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SF = os.path.expanduser("~/.claude/skills/spriteforge/scripts")

# name -> (max width in px, quality) for opaque plates that become JPEG.
PLATES = {
    "scene/cedar-far":       1100,
    "scene/creek-far":       1100,
    "scene/ground-trail":     760,
    "scene/ground-gravel":    760,
    "scene/ground-boardwalk": 760,
    "scene/ground-creekbed":  760,
}

# Sprites that are drawn far smaller than they are stored.
SHRINK = {
    "scene/scatter/signpost":   340,
    "scene/scatter/w-boulder":  320,
    "scene/scatter/w-sedge":    300,
    "scene/scatter/w-driftwood":320,
    "scene/scatter/w-railpost": 260,
    "scene/cedar-near":         900,
}

JPEG_QUALITY = "70"


def run(*args):
    subprocess.run(args, check=True, capture_output=True)


def kb(path):
    return os.path.getsize(path) / 1024 if os.path.exists(path) else 0


def to_jpeg(rel, width):
    src = os.path.join(ROOT, "assets", rel + ".png")
    dst = os.path.join(ROOT, "assets", rel + ".jpg")
    if not os.path.exists(src):
        return None
    before = kb(src)
    run("sips", "--resampleWidth", str(width), "-s", "format", "jpeg",
        "-s", "formatOptions", JPEG_QUALITY, src, "--out", dst)
    print(f"  {rel:28} {before:8.0f} KB -> {kb(dst):7.0f} KB  (jpeg {width}px)")
    return dst


def shrink_sprite(rel, width):
    path = os.path.join(ROOT, "assets", rel + ".png")
    if not os.path.exists(path):
        return
    before = kb(path)
    run("sips", "--resampleWidth", str(width), path, "--out", path)
    print(f"  {rel:28} {before:8.0f} KB -> {kb(path):7.0f} KB  (png {width}px)")


def quantize(path):
    """PNG-8 with alpha. Sprite art has few distinct colours; 24-bit is waste."""
    before = kb(path)
    try:
        run(sys.executable, os.path.join(SF, "quantize.py"), path)
    except subprocess.CalledProcessError:
        return 0
    return before - kb(path)


if __name__ == "__main__":
    print("plates -> jpeg")
    for rel, w in PLATES.items():
        to_jpeg(rel, w)

    print("\noversized sprites -> resized")
    for rel, w in SHRINK.items():
        shrink_sprite(rel, w)

    print("\nsprites -> quantised")
    saved = 0
    for sub in ("molly/cycles/gaits", "molly/transitions", "scene/scatter"):
        d = os.path.join(ROOT, "assets", sub)
        if not os.path.isdir(d):
            continue
        for f in sorted(os.listdir(d)):
            if f.endswith(".png"):
                saved += quantize(os.path.join(d, f))
    print(f"  saved {saved / 1024:.1f} MB across sprites")
