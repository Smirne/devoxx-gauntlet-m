#!/usr/bin/env bash
# Build the playable bundle from the COMMITTED state, never the working tree.
#
# Gauntlet rounds run builder and critic agents in parallel, so the working tree is
# usually mid-write; building from it would publish a half-edited game. This checks
# out HEAD (or $1) into a throwaway worktree, builds there, and prints the dist path.
#
# Usage:  tools/publish-build.sh [commit-ish]
# Then publish that dist/index.html to the artifact named in GAUNTLET.md.
set -euo pipefail

REV="${1:-HEAD}"
REPO="$(git rev-parse --show-toplevel)"
SHA="$(git -C "$REPO" rev-parse --short "$REV")"
OUT="${TMPDIR:-/tmp}/after-dark-build-$SHA"

rm -rf "$OUT"
git -C "$REPO" worktree prune
git -C "$REPO" worktree add -f --detach "$OUT" "$REV" >/dev/null

# Reuse the main checkout's install rather than paying for another one.
ln -s "$REPO/node_modules" "$OUT/node_modules"

( cd "$OUT" && npx vite build >/dev/null 2>&1 )

# The source map is a third of the payload and nothing reads it in a published build.
rm -f "$OUT"/dist/assets/*.map

echo "commit:   $SHA"
echo "dist:     $OUT/dist"
echo "page:     $OUT/dist/index.html"
echo "assets:   $(cd "$OUT/dist" && ls assets | tr '\n' ' ')"
echo "size:     $(du -sh "$OUT/dist" | cut -f1)"
