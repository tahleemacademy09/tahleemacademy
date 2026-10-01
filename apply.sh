#!/usr/bin/env bash
# Applies the Tahleem Academy launcher + notification icons safely.
# Run from the project root:  bash icon-pack/apply.sh
set -euo pipefail
PACK="$(cd "$(dirname "$0")" && pwd)"
RES="android/app/src/main/res"
[ -d "$RES" ] || { echo "ERROR: $RES not found. Run this from the project root (folder that contains android/)."; exit 1; }

BK="android/icon-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BK"
# 1) back up everything this pack will touch
for d in "$RES"/mipmap-* "$RES"/drawable-*dpi "$RES"/values; do
  [ -d "$d" ] && mkdir -p "$BK/$(basename "$d")" && cp -r "$d"/. "$BK/$(basename "$d")"/ || true
done
[ -f "$RES/drawable/ic_stat_icon.xml" ] && { mkdir -p "$BK/drawable"; cp "$RES/drawable/ic_stat_icon.xml" "$BK/drawable/"; }

# 2) the old vector notification icon would sit next to the new PNGs; remove it
rm -f "$RES/drawable/ic_stat_icon.xml"

# 3) copy the new icons in
cp -r "$PACK/res/." "$RES/"

# 4) verify
echo "--- notification icons (must be RGBA) ---"
file "$RES"/drawable-*dpi/ic_stat_icon.png
echo "--- launcher icons ---"
file "$RES"/mipmap-*/ic_launcher*.png | sed 's/, [0-9]-bit.*//'
echo
echo "OK. Backup of the previous icons: $BK"
echo "To undo:  cp -r $BK/mipmap-*  $RES/  &&  cp $BK/drawable/ic_stat_icon.xml $RES/drawable/  &&  rm $RES/drawable-*dpi/ic_stat_icon.png"
