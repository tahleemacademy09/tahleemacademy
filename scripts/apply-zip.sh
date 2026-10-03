#!/bin/bash
set -e
cd "$(git rev-parse --show-toplevel)"

echo "⬇️  Pulling latest from GitHub..."
git pull --rebase --autostash origin main

shopt -s nullglob
zips=(*.zip)
if [ ${#zips[@]} -eq 0 ]; then
  echo "No zip found in the project root. Drag one into Explorer (or push one to GitHub) and run again."
  exit 0
fi

for z in "${zips[@]}"; do
  tmp="/tmp/apply-${z%.zip}"
  rm -rf "$tmp"; mkdir -p "$tmp"
  unzip -oq "$z" -d "$tmp"

  # Step into a single wrapper folder, but never into real project folders like src/
  top=("$tmp"/*)
  if [ ${#top[@]} -eq 1 ] && [ -d "${top[0]}" ] && [ ! -d "./$(basename "${top[0]}")" ]; then
    src="${top[0]}"
  else
    src="$tmp"
  fi

  cp -r "$src"/. .
  rm -rf "$tmp" "$z"
  echo "✅ Applied: $z"
done

git add -A
git commit -m "Apply: ${zips[*]}" || true
gh auth setup-git >/dev/null 2>&1 || true
git push origin main
git status -s
echo "Done."
