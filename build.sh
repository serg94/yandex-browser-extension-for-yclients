#!/usr/bin/env bash
#
# Rebuild yc-tools.zip - the extension package uploaded to the Chrome Web Store.
# Only the zip is regenerated; the signed .crx is built separately.
#
set -euo pipefail

cd "$(dirname "$0")"

OUT=yc-tools.zip

# Everything that ships in the extension. Add new runtime files here.
# build.sh, media/ and the signing key are deliberately excluded.
FILES=(manifest.json content.js README.md icons)

python3 -m json.tool manifest.json >/dev/null \
  || { echo "error: manifest.json is not valid JSON" >&2; exit 1; }
version=$(python3 -c "import json; print(json.load(open('manifest.json'))['version'])")

rm -f "$OUT"
zip -r -X "$OUT" "${FILES[@]}" -x '*.DS_Store' -x '__MACOSX/*' >/dev/null

echo "Built $OUT (v$version)"
unzip -l "$OUT"
