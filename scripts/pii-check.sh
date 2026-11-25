#!/usr/bin/env bash
# pii-check.sh — fail if any real family name, phone or address ends up in the repo.
# The deny-list lives OUTSIDE the repo (it is the private data), one entry per line:
#   PARIBAR_DENYLIST=~/family-data/pii-denylist.txt scripts/pii-check.sh
# Binary files (images, fonts) are skipped: compressed bytes can match short names by chance.
# Check every image by eye before adding it.
# Phone entries are matched on digits only, so "+91 98300-12345" and "9830012345" both hit.
# Optional allow-list (also outside the repo) for entries that are meant to be public, such as
# the author's GitHub handle:  PARIBAR_ALLOWLIST=~/family-data/pii-allowlist.txt
set -euo pipefail
LIST="${PARIBAR_DENYLIST:-$HOME/.paribar-denylist}"
[ -f "$LIST" ] || { echo "No deny-list at $LIST (set PARIBAR_DENYLIST). Nothing to check."; exit 0; }
cd "$(git rev-parse --show-toplevel)"
FILES=$(git ls-files --cached --others --exclude-standard | grep -v -E '^(vendor|icons)/')
ALLOW="${PARIBAR_ALLOWLIST:-$(dirname "$LIST")/pii-allowlist.txt}"
words=$(grep -v -E '^[0-9]+$' "$LIST" | grep -v '^$' || true)
if [ -f "$ALLOW" ] && [ -n "$words" ]; then words=$(echo "$words" | grep -v -i -x -F -f <(grep -v '^$' "$ALLOW") || true); fi
digits=$(grep -E '^[0-9]+$' "$LIST" || true)
hits=0
if [ -n "$words" ]; then
  if echo "$FILES" | xargs grep -I -n -i -w -F -f <(echo "$words"); then hits=1; fi
fi
if [ -n "$digits" ]; then
  for f in $FILES; do
    flat=$(tr -cd '0-9\n' < "$f" 2>/dev/null || true)
    while read -r d; do [ -n "$d" ] && echo "$flat" | grep -q "$d" && { echo "$f: phone digits ${d:0:3}…"; hits=1; }; done <<< "$digits"
  done
fi
[ $hits = 0 ] && echo "PII check: clean ($(echo "$FILES" | wc -l) files)" || { echo "PII check: FOUND real data above"; exit 1; }
