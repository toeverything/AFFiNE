#!/usr/bin/env bash
#
# Thin CLI around the debug-only remote-eval bridge
# (packages/backend/server/src/core/mobile-debug-eval) into a live mobile
# PWA session. Built because hand-rolling curl + inline node JSON parsing
# for every single query, repeatedly, across a long live-debugging session,
# was its own source of mistakes (stale IDs, mismatched quoting, silent
# timing misses) -- this collapses that into one command.
#
# Requires AFFINE_MOBILE_DEBUG_EVAL_ENABLED=true and
# AFFINE_MOBILE_DEBUG_EVAL_TOKEN=<token> on the target backend, and the
# PWA's own poll loop (mobile-debug-eval.ts) actively running in a
# foregrounded tab -- see that module's doc comment for why background
# tabs silently stop polling (iOS Safari throttles backgrounded timers).
#
# Usage:
#   mobile-debug-eval.sh run '<js code>' [timeout_seconds]
#     Submit `code` as the body of an async function (so plain expressions,
#     multi-statement snippets, and `await` all just work -- see the
#     client's runSnippet()), poll for the result, print it, exit 0 on
#     success / 1 on timeout or a JS-side error.
#
#   mobile-debug-eval.sh run-file <path-to-js-file> [timeout_seconds]
#     Same as `run`, but reads the code from a file -- use this for
#     anything long enough that shell quoting becomes its own hazard.
#
# Env:
#   DEBUG_EVAL_URL     Base URL of the target backend (default: http://localhost:3010)
#   DEBUG_EVAL_TOKEN   Shared secret -- defaults to reading /tmp/debug-eval-token.txt
#                      (where this session has been stashing it), override to
#                      point at a different deployment's token.

set -Eeuo pipefail

BASE_URL="${DEBUG_EVAL_URL:-http://localhost:3010}"
TOKEN="${DEBUG_EVAL_TOKEN:-}"
if [[ -z "$TOKEN" && -f /tmp/debug-eval-token.txt ]]; then
  TOKEN=$(cat /tmp/debug-eval-token.txt)
fi

usage() {
  cat <<'EOF'
Usage:
  mobile-debug-eval.sh run '<js code>' [timeout_seconds]
  mobile-debug-eval.sh run-file <path> [timeout_seconds]

Env:
  DEBUG_EVAL_URL    default http://localhost:3010
  DEBUG_EVAL_TOKEN  default: contents of /tmp/debug-eval-token.txt
EOF
}

submit() {
  local code="$1"
  node -e '
    const code = require("fs").readFileSync(0, "utf8");
    process.stdout.write(JSON.stringify({ code }));
  ' <<<"$code"
}

poll_result() {
  local id="$1" timeout_s="$2"
  local attempts=$(( (timeout_s + 1) / 2 ))
  local i res pending
  for ((i = 0; i < attempts; i++)); do
    res=$(curl -s "$BASE_URL/api/mobile-debug-eval/result/$id" -H "x-debug-eval-token: $TOKEN")
    pending=$(node -e '
      try {
        const d = JSON.parse(require("fs").readFileSync(0, "utf8"));
        process.stdout.write(d.pending === true ? "yes" : "no");
      } catch { process.stdout.write("no"); }
    ' <<<"$res")
    if [[ "$pending" == "yes" ]]; then
      sleep 2
      continue
    fi
    echo "$res"
    return 0
  done
  echo '{"error":"timeout","pending":true}' >&2
  return 1
}

run_code() {
  local code="$1" timeout_s="${2:-30}"

  if [[ -z "$TOKEN" ]]; then
    echo "error: no token (set DEBUG_EVAL_TOKEN or /tmp/debug-eval-token.txt)" >&2
    exit 2
  fi

  local payload submit_res id
  payload=$(submit "$code")
  submit_res=$(curl -s -X POST "$BASE_URL/api/mobile-debug-eval/submit" \
    -H "content-type: application/json" \
    -H "x-debug-eval-token: $TOKEN" \
    -d "$payload")
  id=$(node -e '
    try {
      const d = JSON.parse(require("fs").readFileSync(0, "utf8"));
      if (!d.id) { process.stderr.write(JSON.stringify(d) + "\n"); process.exit(1); }
      process.stdout.write(d.id);
    } catch (e) { process.stderr.write(String(e) + "\n"); process.exit(1); }
  ' <<<"$submit_res") || { echo "submit failed: $submit_res" >&2; exit 1; }

  poll_result "$id" "$timeout_s"
}

case "${1:-}" in
  run)
    [[ $# -ge 2 ]] || { usage >&2; exit 2; }
    run_code "$2" "${3:-30}"
    ;;
  run-file)
    [[ $# -ge 2 ]] || { usage >&2; exit 2; }
    [[ -f "$2" ]] || { echo "no such file: $2" >&2; exit 2; }
    run_code "$(cat "$2")" "${3:-30}"
    ;;
  *)
    usage
    exit 2
    ;;
esac
