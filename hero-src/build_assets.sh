#!/usr/bin/env bash
# build_assets.sh RENDER_DIR OUT_DIR  -> desktop/mobile x light/dark videos + posters
set -euo pipefail
r=$(realpath "$1"); out=$(realpath -m "$2"); work=$(mktemp -d); cd "$(dirname "$0")"
for theme in light dark; do
  bg=$([ $theme = light ] && echo "#f4f1ea" || echo "#131210")
  python3 assemble.py "$r" "$work/desktop-$theme" "$bg"
  python3 assemble.py "$r" "$work/mobile-$theme" "$bg" "0.07,0,0.93,0.9"
  bash encode.sh "$work/desktop-$theme" "$out" "desktop-$theme"
  bash encode.sh "$work/mobile-$theme" "$out" "mobile-$theme"
done
rm -rf "$work"
