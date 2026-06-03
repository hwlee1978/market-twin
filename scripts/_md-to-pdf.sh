#!/usr/bin/env bash
# Convert markdown to PDF via pandoc → HTML → Chrome headless.
# Korean-friendly: Chrome on Windows has system CJK fonts available.
#
# Usage: bash scripts/_md-to-pdf.sh <input.md> <output.pdf>

set -e
INPUT="$1"
OUTPUT="$2"
TMP_HTML="${INPUT%.md}.tmp.html"
CSS_FILE="$(dirname "$0")/_md-pdf-style.css"
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"

# 1. pandoc MD → standalone HTML w/ embedded styling
pandoc "$INPUT" \
  --standalone \
  --embed-resources \
  --metadata title="$(basename "${INPUT%.md}")" \
  --css="$CSS_FILE" \
  -f markdown -t html5 \
  -o "$TMP_HTML"

# 2. Chrome headless → PDF
# Use file:// URL with absolute path for Chrome on Windows
ABS_HTML="$(cygpath -w "$(realpath "$TMP_HTML")")"
ABS_PDF="$(cygpath -w "$(realpath -m "$OUTPUT")")"

"$CHROME" \
  --headless \
  --disable-gpu \
  --no-sandbox \
  --no-pdf-header-footer \
  --print-to-pdf="$ABS_PDF" \
  "file:///$ABS_HTML" 2>/dev/null

# 3. cleanup tmp HTML
rm -f "$TMP_HTML"

echo "✓ $OUTPUT"
