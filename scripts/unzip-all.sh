#!/bin/bash
set -e
cd "$(git rev-parse --show-toplevel)"
git pull --rebase origin main || true
shopt -s nullglob
zips=(*.zip)
[ ${#zips[@]} -eq 0 ] && { echo "No zip files found."; exit 0; }
for z in "${zips[@]}"; do
  tmp="/tmp/unzip-${z%.zip}"
  rm -rf "$tmp"; mkdir -p "$tmp"
  unzip -oq "$z" -d "$tmp"
  top=("$tmp"/*)
  if [ ${#top[@]} -eq 1 ] && [ -d "${top[0]}" ]; then src="${top[0]}"; else src="$tmp"; fi
  cp -r "$src"/. .
  rm -rf "$tmp" "$z"
  echo "Extracted: $z"
done
git add -A
git commit -m "Unzip: ${zips[*]}" || true
git push origin main
git status -s
echo "Done."
