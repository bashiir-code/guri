#!/usr/bin/env bash
# Render one preview still per scene into out/
set -e
cd "$(dirname "$0")"
mkdir -p out
rm -f out/still-.png
for f in 60 180 330 520 640 790 890; do
  npx remotion still src/index.ts GuriPromo "out/still-$f.png" --frame="$f" --scale=0.5 >/dev/null
  echo "frame $f done"
done
