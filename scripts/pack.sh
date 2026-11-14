#!/bin/sh
# Builds the extension and writes dist/agent-graph-<version>.zip with only the runtime files.
set -eu
cd "$(dirname "$0")/.."

bun run build
bun run check

version=$(node -p "require('./package.json').version")
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT

mkdir -p "$stage/agent-graph/panel" "$stage/agent-graph/service" dist
cp package.json README.md "$stage/agent-graph/"
cp panel/index.html panel/main.js "$stage/agent-graph/panel/"
cp service/main.js "$stage/agent-graph/service/"

out="$PWD/dist/agent-graph-$version.zip"
rm -f "$out"
(cd "$stage" && zip -qr -X "$out" agent-graph)
echo "Wrote $out"
unzip -l "$out"
