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

# Two responsiveness checks: the gestures must actually reach her.
node test/responsive.mjs || fail=$((fail+1))
node test/settle.mjs >/tmp/mm_settle.txt 2>&1 || { echo "FAIL settle"; tail -2 /tmp/mm_settle.txt; fail=$((fail+1)); }
tail -1 /tmp/mm_settle.txt

found=$(grep -l "ANTLER FOUND" /tmp/mm_s_*.txt 2>/dev/null | wc -l | tr -d ' ')
echo "scenario: $n seeds, antler found in $found of them (discovery is meant to be uncertain)"
echo "crossing: $n seeds"
[ "$fail" -eq 0 ] && echo "ALL PASS ($((n*2)) runs)" || echo "$fail FAILED"
exit $fail
