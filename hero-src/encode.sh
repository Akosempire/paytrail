#!/usr/bin/env bash
# encode.sh FRAMES_DIR OUT_DIR NAME   (e.g. desktop-light)
# H.264 MP4 (universal) + VP9 WebM (smaller), BT.709, no audio, plus posters.
set -euo pipefail
in=$1; out=$2; name=$3
mkdir -p "$out"
vf="scale=trunc(iw/2)*2:trunc(ih/2)*2:out_color_matrix=bt709:out_range=tv,format=yuv420p"
tags="-colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv"
ffmpeg -loglevel error -y -framerate 24 -i "$in/%04d.png" -vf "$vf" -c:v libx264 -preset slow -crf ${CRF264:-24} -profile:v high -tune film $tags -movflags +faststart -an "$out/$name.mp4"
ffmpeg -loglevel error -y -framerate 24 -i "$in/%04d.png" -vf "$vf" -c:v libvpx-vp9 -crf ${CRFVP9:-36} -b:v 0 -row-mt 1 -deadline good -cpu-used 2 $tags -an "$out/$name.webm"
python3 - "$in" "$out" "$name" <<'EOF'
import sys
from PIL import Image
src, out, name = sys.argv[1:]
Image.open(f"{src}/0001.png").save(f"{out}/{name}-start.webp", quality=84, method=6)
Image.open(f"{src}/0192.png").save(f"{out}/{name}-end.webp", quality=84, method=6)
EOF
ls -la "$out" | grep "$name"
