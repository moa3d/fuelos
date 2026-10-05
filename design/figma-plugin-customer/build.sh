#!/bin/bash
# Builds dist/ for the FuelOS Customer Builder Figma plugin.
# Reuses the engine (layout, components, icons, sections) of ../figma-plugin/src.
set -e
cd "$(dirname "$0")"
mkdir -p dist
S=../figma-plugin/src
cat $S/00-core.js $S/10-setup.js src/05-c-setup.js $S/20-components.js src/21-c-components.js \
    $S/25-helpers.js $S/30-ds.js $S/50-screens-common.js $S/59-screens-main.js \
    src/60-c-screens.js src/99-c-main.js > dist/code.src.js
tsc --allowJs --target ES2017 --lib ES2019,DOM --outFile dist/code.js --ignoreDeprecations 6.0 --removeComments false --noEmitOnError false dist/code.src.js 2>&1 | grep -v "TS2304\|TS2580\|TS2552" | head -20 || true
rm -f dist/code.src.js
cp src/ui.html dist/ui.html
cat > dist/manifest.json <<'M'
{
  "name": "FuelOS Customer Builder",
  "id": "fuelos-customer-builder-local",
  "api": "1.0.0",
  "main": "code.js",
  "ui": "ui.html",
  "editorType": ["figma"],
  "documentAccess": "dynamic-page",
  "networkAccess": { "allowedDomains": ["none"] }
}
M
echo "built: $(wc -c < dist/code.js) bytes"
