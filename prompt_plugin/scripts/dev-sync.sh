#!/usr/bin/env bash
# Sync the canonical workspace plugin into .dev/live, the directory the running
# Harness watches through the HMR `root` override in the staged bundle patch.
#
# The staged package identity is `dsh-prompt-gallery-dev<N>` so the very first
# install imports a module specifier the process has never cached; after that,
# edits to .dev/live/** hot-reload the Host plugin and the Client bundle in
# place. Pass a new identity when a guaranteed fresh import is needed.
#
# IMPORTANT: never delete or replace the watched directory itself; only
# overwrite file contents in place. `.dev/live2` is the currently watched copy.
#
# Usage: scripts/dev-sync.sh [identity]      (default: dsh-prompt-gallery-dev2)
set -euo pipefail
cd "$(dirname "$0")/.."
identity="${1:-dsh-prompt-gallery-dev3}"
out=".dev/live2"
mkdir -p "$out/host" "$out/locale"
cp package.json icon.svg client.js "$out"/
cp host/*.js "$out/host/"
cp locale/*.json "$out/locale/"
python3 - "$out" "$identity" <<'PY'
import json, sys
out, identity = sys.argv[1], sys.argv[2]
manifest_path = f"{out}/package.json"
manifest = json.load(open(manifest_path))
manifest["name"] = identity
json.dump(manifest, open(manifest_path, "w"), ensure_ascii=False, indent=2)
open(manifest_path, "a").write("\n")
client_path = f"{out}/client.js"
client = open(client_path).read()
client = client.replace("id: '@local/dsh-prompt-gallery',", f"id: '{identity}',", 1)
open(client_path, "w").write(client)
PY
# The staged bundle patch also points the HMR module watcher at .dev/live, so
# edits there reload the Host plugin in place. The shipped workspace patch stays
# clean; this dev-only override disappears when the final bundle is installed.
cat > "$out/cordis.patch.yml" <<PATCH
# dsh-prompt-gallery bundle patch (development staging).
- insert:
    - id: prompt-gallery
      name: ${identity}
- id: hmr
  config:
    base: $(pwd)/${out}
    root:
      - "."
    debounce: 120
PATCH
node --check "$out/host/index.js" >/dev/null
node --check "$out/client.js" >/dev/null
echo "$(pwd)/$out"
