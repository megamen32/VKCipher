#!/usr/bin/env bash
# Сборка единого install-файла из небольших исходных секций.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$SCRIPT_DIR/src"
INSTALL_FILE="$SCRIPT_DIR/vkencrypt.user.js"
DIST_DIR="$SCRIPT_DIR/dist"

if [[ ! -d "$SOURCE_DIR" ]]; then
    echo "Не найдены исходники userscript: $SOURCE_DIR" >&2
    exit 1
fi

mkdir -p "$DIST_DIR"

PARTS=("$SOURCE_DIR"/*.js)
if [[ ! -e "${PARTS[0]}" ]]; then
    echo "В $SOURCE_DIR нет исходных секций" >&2
    exit 1
fi

for part in "${PARTS[@]}"; do
    lines=$(wc -l < "$part")
    if (( lines > 800 )); then
        echo "Секция превышает 800 строк: $part ($lines)" >&2
        exit 1
    fi
done

TEMP_FILE=$(mktemp "$SCRIPT_DIR/.vkencrypt.user.js.XXXXXX")
trap 'rm -f "$TEMP_FILE"' EXIT
cat "${PARTS[@]}" > "$TEMP_FILE"
chmod 644 "$TEMP_FILE"
mv -f "$TEMP_FILE" "$INSTALL_FILE"
trap - EXIT

OUT_NAME="vkencrypt_userscript_$(date +%Y%m%d_%H%M%S).js"
OUT_PATH="$DIST_DIR/$OUT_NAME"

cp -f "$INSTALL_FILE" "$OUT_PATH"
chmod 644 "$OUT_PATH"
echo "✅ Собран: $OUT_PATH"
echo "📌 Стабильный install-файл: $INSTALL_FILE"
echo "   Используй эту ссылку для установки и автообновления:"
echo "   https://raw.githubusercontent.com/megamen32/VKCipher/main/extension/vkencrypt.user.js"
