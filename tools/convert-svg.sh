#!/bin/sh
# Converts SVG piece images to PNGs.
set -xe

cd $(dirname $0)/../assets/img/src
mogrify -format png -size 124x124 -background none *.svg
pngcrush -d ../ *.png
rm *.png
