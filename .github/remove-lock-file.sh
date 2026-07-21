#!/bin/bash
# This script removes package-lock.json from Git history
# Run locally on your machine to clean up the repository

echo "Removing package-lock.json from Git tracking..."
git rm --cached package-lock.json
echo "Committing removal..."
git commit -m "chore: remove package-lock.json from git tracking to improve performance"
echo "Running git gc to optimize repository..."
git gc --aggressive
echo "Done! Your commits should now be faster."
