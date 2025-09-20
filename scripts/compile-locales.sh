#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"

shopt -s nullglob
for po in "$root_dir"/locale/*/LC_MESSAGES/*.po; do
  lang_dir="$(dirname "$po")"
  base="$(basename "$po" .po)"
  mo="$lang_dir/$base.mo"
  echo "[msgfmt] $po -> $mo"
  msgfmt -o "$mo" "$po"
done
echo "All locales compiled."
