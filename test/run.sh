#!/bin/sh
# Phase 1 acceptance: the two scenarios the PRD says prove the design.
#   §32 -- memory becomes visible behaviour
#   §3  -- fear persists and confidence rebuilds, with no frightened face
set -e
cd "$(dirname "$0")/.."
seeds="1 3 7 11 42 99 101 500 999 2024 20260826 31337"
fail=0; n=0

for s in $seeds; do
  n=$((n+1))
  node test/scenario.mjs "$s" >/tmp/mm_s_$s.txt 2>&1 || { echo "FAIL scenario seed $s"; tail -4 /tmp/mm_s_$s.txt; fail=$((fail+1)); }
  node test/crossing.mjs "$s" >/tmp/mm_c_$s.txt 2>&1 || { echo "FAIL crossing seed $s"; tail -8 /tmp/mm_c_$s.txt; fail=$((fail+1)); }
done

# The gestures must actually reach her, and do what they say.
node test/responsive.mjs || fail=$((fail+1))
node test/posture.mjs >/tmp/mm_posture.txt 2>&1 || { echo "FAIL posture"; tail -4 /tmp/mm_posture.txt; fail=$((fail+1)); }
tail -1 /tmp/mm_posture.txt
node test/junction.mjs >/tmp/mm_junction.txt 2>&1 || { echo "FAIL junction"; tail -4 /tmp/mm_junction.txt; fail=$((fail+1)); }
tail -1 /tmp/mm_junction.txt
node test/sound.mjs >/tmp/mm_sound.txt 2>&1 || { echo "FAIL sound"; tail -6 /tmp/mm_sound.txt; fail=$((fail+1)); }
tail -1 /tmp/mm_sound.txt

found=$(grep -l "ANTLER FOUND" /tmp/mm_s_*.txt 2>/dev/null | wc -l | tr -d ' ')
echo "scenario: $n seeds, antler found in $found of them (discovery is meant to be uncertain)"
echo "crossing: $n seeds"
[ "$fail" -eq 0 ] && echo "ALL PASS ($((n*2)) runs)" || echo "$fail FAILED"
exit $fail
