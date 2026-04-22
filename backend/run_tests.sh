#!/usr/bin/env bash
# Run unit/integration tests (excludes smoke tests that require a running server).
# Usage:
#   ./run_tests.sh              # run all non-smoke tests
#   ./run_tests.sh -k clientes  # filter by keyword
#   ./run_tests.sh --smoke      # include smoke tests (requires docker compose up)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPORT_DIR="$SCRIPT_DIR/test-reports"
mkdir -p "$REPORT_DIR"

TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
HTML_REPORT="$REPORT_DIR/report_$TIMESTAMP.html"
LATEST_REPORT="$REPORT_DIR/report_latest.html"

MARKER_FILTER="-m 'not smoke'"
EXTRA_ARGS=()

for arg in "$@"; do
  if [[ "$arg" == "--smoke" ]]; then
    MARKER_FILTER=""
  else
    EXTRA_ARGS+=("$arg")
  fi
done

echo "Running tests..."
echo "Report: $HTML_REPORT"
echo ""

cd "$SCRIPT_DIR"

set +e
python -m pytest tests/ \
  ${MARKER_FILTER:+$MARKER_FILTER} \
  --html="$HTML_REPORT" \
  --self-contained-html \
  -v \
  "${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}"

EXIT_CODE=$?
set -e

cp "$HTML_REPORT" "$LATEST_REPORT"

echo ""
echo "Report saved: $HTML_REPORT"
echo "Latest:       $LATEST_REPORT"

exit $EXIT_CODE
