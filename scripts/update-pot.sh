#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
cd "$root_dir"

out="locale/gentoo-updates-indicator.pot"
tmp_js="$(mktemp)"; tmp_xml="$(mktemp)"
cleanup(){ rm -f "$tmp_js" "$tmp_xml"; }
trap cleanup EXIT

if command -v xgettext >/dev/null 2>&1; then
  echo "[xgettext] extracting from JS"
  xgettext \
    --language=JavaScript \
    --from-code=UTF-8 \
    --keyword=_ \
    --keyword=__\:1,2 \
    -o "$tmp_js" \
    extension.js
else
  echo "xgettext not found; skipping JS extraction."
  echo -n > "$tmp_js"
fi

if command -v itstool >/dev/null 2>&1; then
  echo "[itstool] extracting from XML"
  itstool -o "$tmp_xml" prefs.xml
else
  echo "itstool not found; skipping XML extraction."
  echo -n > "$tmp_xml"
fi

if command -v msgcat >/dev/null 2>&1; then
  echo "[msgcat] merging JS and XML into $out"
  msgcat -o "$out" "$tmp_js" "$tmp_xml"
else
  echo "msgcat not found; copying JS pot to $out"
  cp "$tmp_js" "$out"
fi

echo "Updated $out"
