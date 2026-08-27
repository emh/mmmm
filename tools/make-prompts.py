#!/usr/bin/env python3
"""
Build cycle and transition prompts from one place.

A *cycle* loops; a *transition* plays once from a known start pose to a known
end pose. They need different language, but both follow the same rule that made
cycles work: describe the movement ONCE, then list what must not change.
Describing frames individually is what makes the model re-imagine the animal
between them.
"""
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STYLE = json.load(open(os.path.join(ROOT, "art/naturalist/art.json")))["style"]
MOLLY = open(os.path.join(ROOT, "art/MOLLY-DESC.txt")).read().strip()

INVARIANTS = """CONSTANT IN EVERY FRAME -- these must not vary at all:
- her overall size; she is exactly the same distance from the viewer throughout
- her identity: coat colour and texture, floppy ears, shaggy beard, leg length,
  tail shape, body proportions
- the ground line she stands on
- the lighting, from the upper left"""

NEGATIVES = """Plain flat pure-white background, with a clear empty gap between frames.
No cell borders, no grid lines, no labels, no text, no numbers, no scenery, no
props, no extra animals, no overlapping frames, no cast shadows between frames."""


def transition(name, count, movement, ends, turns=False):
    view = ("Frame 1 is the standing pose seen from DIRECTLY BEHIND. As she turns, the "
            "view of her changes naturally with her body -- that rotation is the point of "
            "the movement.") if turns else \
           ("She is seen from DIRECTLY BEHIND throughout. No part of her face is visible "
            "in any frame.")
    return f"""A {count}-frame sprite sheet showing ONE continuous movement, read left to right.

THE MOVEMENT: {movement}

Frame 1 is her standing squarely and still. The final frame is {ends}. The frames
between them are that single movement, spaced evenly in time, so that playing them
in order reads as one smooth action.

This is NOT a looping cycle. It plays once, from standing to the final pose, and
stops there.

THE DOG: {MOLLY}

VIEW: {view}

{INVARIANTS}

LAYOUT: {count} drawings of the same dog in one evenly spaced row, all at the same
scale, all standing on the same invisible ground line.

STYLE: {STYLE} A polished, readable silhouette suitable for a game sprite.

{NEGATIVES}"""


def standing():
    return f"""A single game sprite of one dog standing still, seen from DIRECTLY BEHIND.

She stands squarely and alert on all four legs, weight even, tail held in a relaxed
raised curve, head level and facing away down a trail. We see her back, her rump,
her tail and the back of her head. NO part of her face, muzzle or eyes is visible.

This is her canonical resting pose -- the one every animation starts from and
returns to. It should read as settled and neutral, neither tense nor slouched.

THE DOG: {MOLLY}

One dog, centred, full body, paws resting on an invisible ground line at the very
bottom of the figure.

STYLE: {STYLE} A polished, readable silhouette suitable for a game sprite.

{NEGATIVES}"""


TRANSITIONS = {
    "sit": dict(count=5, turns=False,
        movement="she lowers her hindquarters and sits down, folding her hind legs "
                 "beneath her while her front legs stay straight and planted",
        ends="her sitting upright on her haunches, front legs straight, tail curled "
             "round beside her"),
    "lie": dict(count=6, turns=False,
        movement="she sinks from standing all the way down to lying on the ground, "
                 "first folding her hindquarters, then sliding her front legs forward "
                 "until her chest and belly rest on the earth",
        ends="her lying down with her legs folded and her chest on the ground"),
    "turn90": dict(count=5, turns=True,
        movement="she pivots a quarter turn to her own left, stepping her front feet "
                 "round while her hindquarters follow",
        ends="her standing in full side profile, facing to the viewer's left"),
    "turn180": dict(count=6, turns=True,
        movement="she turns all the way around to face the viewer, swinging her "
                 "hindquarters round as her front feet step through the turn",
        ends="her standing squarely facing the viewer head-on, looking straight at us"),
    "glance": dict(count=4, turns=False,
        movement="without moving her body or her feet, she turns her head back over "
                 "her shoulder to look at the viewer",
        ends="her still standing away from us with her head turned right back, looking "
             "directly at the viewer over her shoulder"),
}


if __name__ == "__main__":
    out = os.path.join(ROOT, "art/prompts/transitions")
    os.makedirs(out, exist_ok=True)
    open(os.path.join(ROOT, "art/prompts/stand-away.txt"), "w").write(standing() + "\n")
    print("  stand-away.txt")
    for name, spec in TRANSITIONS.items():
        open(os.path.join(out, f"{name}.txt"), "w").write(transition(name, **spec) + "\n")
        print(f"  transitions/{name}.txt  ({spec['count']} frames)")
