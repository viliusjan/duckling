#!/bin/sh
# Re-renders the committed PNG icons from the SVGs in assets/.
# Needs ImageMagick 7 (`magick`). Only run after editing the SVGs; the PNGs are
# committed so building the extension doesn't need ImageMagick.
set -eu
cd "$(dirname "$0")/.."
mkdir -p public/icon public/toolbar
for s in 16 32 48 96 128; do
  magick -background none -density 600 assets/icon.svg -resize "${s}x${s}" -strip "public/icon/$s.png"
done
for v in on-light on-dark; do
  for s in 16 32; do
    magick -background none -density $((72 * s / 2)) "assets/toolbar-$v.svg" -resize "${s}x${s}" -strip "public/toolbar/$v-$s.png"
  done
done
echo "icons rendered"
