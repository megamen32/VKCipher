#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
npm --prefix "$ROOT" run build
node "$ROOT/scripts/build-safari-source.mjs"

SOURCE_ROOT="$ROOT/dist/safari/source"
PROJECT_ROOT="$ROOT/dist/safari/xcode"

if command -v xcrun >/dev/null 2>&1 && xcrun --find safari-web-extension-converter >/dev/null 2>&1; then
    rm -rf "$PROJECT_ROOT"
    xcrun safari-web-extension-converter "$SOURCE_ROOT" \
        --project-location "$PROJECT_ROOT" \
        --app-name VKEncrypt \
        --bundle-identifier com.megamen32.vkencrypt \
        --force
    echo "Built Safari Xcode project: $PROJECT_ROOT"
else
    echo "Safari converter unavailable; source is ready at: $SOURCE_ROOT"
fi
