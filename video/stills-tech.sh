#!/usr/bin/env bash
# Render preview stills of GuriTechReel into out/ (pass frames as args)
set -e
cd "$(dirname "$0")"
mkdir -p out
rm -f out/tech-v2-.png
frames=("$@")
[ ${#frames[@]} -eq 0 ] && frames=(70 220 400 610 830 1070 1250 1430 1600)
for f in "${frames[@]}"; do
  npx remotion still src/index.ts GuriTechReel "out/tech-$f.png" --frame="$f" --scale=0.5 >/dev/null 2>&1
  echo "frame $f done"
done
