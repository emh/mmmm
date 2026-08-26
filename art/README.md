# Asset pipeline

Style decided 2026-08-26: **naturalist field guide** (PRD §16). All new Molly Mae art goes
through `art/naturalist/`.

```bash
SF=~/.claude/skills/spriteforge/scripts
cd art/naturalist
python3 $SF/art.py make portrait molly \
  --desc "$(cat ../MOLLY-DESC.txt)" \
  --subject "Molly Mae, a straight-haired copper labradoodle" \
  --quality high
```

- `MOLLY-DESC.txt` — the single source of truth for how Molly looks. Edit here, not in the
  configs. Passed as `--desc` on every call.
- `naturalist/art.json` — live config. Outputs to `assets/molly/`.
- `painted/art.json` — retained as the record of the rejected candidate. Not used.
- `sheets/` — raw model output, gitignored, regenerable.

## Rules learned the hard way

Every one of these came from a real failure during the bake-off. They are already encoded in
`art.json`, but re-state them in any hand-written prompt:

1. **Straight coat, never curly.** Say *straight-haired, not curly* explicitly. Models
   default to a curly apricot doodle, which is off-model.
2. **Ears hang down in every frame** — including `alert`. Any hint that an ear may "lift"
   produces pricked terrier ears and a different dog.
3. **No accessories.** No collar, harness, leash or tags. The model adds them unprompted.
4. **`alert` needs posture, not a face.** Craned neck, off-frame stare. Otherwise it is
   indistinguishable from `neutral` at phone size.
5. **Don't share a prefix between frame names.** `art.py` derives the output stem from the
   common prefix, so `side`/`sit` produced `molly-body-si-*`. Hence `walk`/`sit`.
6. **Fix a bad cut by re-cutting, not regenerating.** `portrait` carries
   `"cutout": {"threshold": 210}` because the default left a 2.2% rim on `alert`.

## Checking

`make` and `cut` run QA automatically. Clean output is `rim 0.0%` and `ok`. A fur silhouette
under ~2% is acceptable; anything higher, adjust `threshold` before spending on a regenerate.
