#!/bin/sh
# Generate an animation cycle from a holistic prompt, then cut and normalise it.
#
#   tools/gen-cycle.sh art/prompts/run-cycle-away.txt cycle-run-v3 4
#
# Describe the animation ONCE and list what must not change. Do not describe
# frames individually -- see art/README.md, "Prompting an animation cycle".
set -e
cd "$(dirname "$0")/.."
SF=~/.claude/skills/spriteforge/scripts
PROMPT="$1"; NAME="${2:-cycle-out}"; N="${3:-4}"

python3 $SF/imagegen.py --prompt "$(cat "$PROMPT")" \
  --out "art/sheets/naturalist/$NAME.png" --size 1536x1024 --quality high

python3 $SF/cutout.py "art/sheets/naturalist/$NAME.png" "assets/molly/raw/$NAME" \
  --split-into "$N" --threshold 212

printf '{\n' > /tmp/cycle-specs.json
i=1
while [ "$i" -le "$N" ]; do
  sep=","; [ "$i" -eq "$N" ] && sep=""
  printf '  "%s-%d": {"src": "assets/molly/raw/%s-%d.png"}%s\n' "$NAME" "$i" "$NAME" "$i" "$sep" >> /tmp/cycle-specs.json
  i=$((i+1))
done
printf '}\n' >> /tmp/cycle-specs.json

echo "--- consistency (want scale and feet spreads under ~6%) ---"
python3 tools/normalize.py /tmp/cycle-specs.json "assets/molly/cycles/$NAME"
