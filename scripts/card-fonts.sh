#!/bin/sh
# Writes the Geist files the share card draws with: the @fontsource Latin
# subset without kerning. satori measures text one grapheme at a time without
# kerning but draws whole words with it, so a kerned word ends short of its box
# and leaves a wide gap after it. Run it after a Geist upgrade.
set -eu
cd "$(dirname "$0")/.."
for weight in 400 600; do
  uvx --from fonttools pyftsubset \
    "node_modules/@fontsource/geist/files/geist-latin-$weight-normal.woff" \
    --unicodes='*' --layout-features='*' --drop-tables+=GPOS,kern \
    --flavor=woff \
    --output-file="src/worker/fonts/geist-$weight.woff"
done
