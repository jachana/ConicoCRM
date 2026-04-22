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

INCLUDE_SMOKE=false
EXTRA_ARGS=()

for arg in "$@"; do
  if [[ "$arg" == "--smoke" ]]; then
    INCLUDE_SMOKE=true
  else
    EXTRA_ARGS+=("$arg")
  fi
done

echo "Running tests..."
echo "Report: $HTML_REPORT"
echo ""

cd "$SCRIPT_DIR"

PYTEST_ARGS=(tests/ --html="$HTML_REPORT" --self-contained-html -v)

if [[ "$INCLUDE_SMOKE" == false ]]; then
  PYTEST_ARGS+=(-m "not smoke")
fi

if [[ ${#EXTRA_ARGS[@]} -gt 0 ]]; then
  PYTEST_ARGS+=("${EXTRA_ARGS[@]}")
fi

set +e
python -m pytest "${PYTEST_ARGS[@]}"
EXIT_CODE=$?
set -e

cp "$HTML_REPORT" "$LATEST_REPORT"

echo ""
echo "Report saved: $HTML_REPORT"
echo "Latest:       $LATEST_REPORT"

exit $EXIT_CODE
