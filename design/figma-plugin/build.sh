#!/bin/bash
set -e
cd "$(dirname "$0")"
mkdir -p dist
cat src/[0-9]*.js > dist/code.src.js
tsc --allowJs --target ES2017 --lib ES2019,DOM --outFile dist/code.js --ignoreDeprecations 6.0 --removeComments false --noEmitOnError false dist/code.src.js 2>&1 | grep -v "TS2304\|TS2580\|TS2552" | head -20 || true
cp src/ui.html dist/ui.html
cat > dist/manifest.json <<'M'
{
  "name": "FuelOS Design Builder",
  "id": "fuelos-design-builder-local",
  "api": "1.0.0",
  "main": "code.js",
  "ui": "ui.html",
  "editorType": ["figma"],
  "documentAccess": "dynamic-page",
  "networkAccess": { "allowedDomains": ["none"] }
}
M
echo "built: $(wc -c < dist/code.js) bytes"
