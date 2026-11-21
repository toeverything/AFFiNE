#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$ROOT/../.." && pwd)"
cd "$ROOT"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

echo "==> Checking zero internal proc-macro crates"
if grep -rn 'proc-macro\s*=\s*true' crates/ Cargo.toml 2>/dev/null; then
  fail "Internal proc-macro crates are forbidden in blocksuite/native-playground"
fi

echo "==> Checking crates/ui domain isolation (no blocksuite/affine words)"
if grep -rniE '\b(blocksuite|affine)\b' crates/ui/src crates/ui/Cargo.toml 2>/dev/null; then
  fail "crates/ui must not reference BlockSuite or AFFiNE domain terms"
fi

echo "==> Checking crates/doc GUI isolation and forbid(unsafe_code)"
if grep -rnE '^\s*(ui|wgpu|objc2|web-sys)\b' crates/doc/Cargo.toml 2>/dev/null; then
  fail "crates/doc must not depend on GUI/platform crates (ui, wgpu, objc2, web-sys)"
fi
if ! grep -q '#!\[forbid(unsafe_code)\]' crates/doc/src/lib.rs; then
  fail "crates/doc/src/lib.rs must declare #![forbid(unsafe_code)]"
fi

echo "==> Checking no Instant::now / SystemTime::now outside crates/ui/src/platform"
WALL_CLOCK_HITS=$(
  grep -rnE '(Instant::now|SystemTime::now)\s*\(' crates/ \
    --include='*.rs' \
    | grep -v '^crates/ui/src/platform/' \
    || true
)
if [ -n "$WALL_CLOCK_HITS" ]; then
  echo "$WALL_CLOCK_HITS" >&2
  fail "Instant::now() / SystemTime::now() is forbidden outside crates/ui/src/platform/"
fi

echo "==> Checking zero tester branches inside crates/playground/src layout/view code"
if grep -rn 'is_headless' crates/playground/src 2>/dev/null; then
  fail "is_headless branches are forbidden in crates/playground/src"
fi
TESTER_CFG_HITS=$(
  grep -rnE '#\[cfg\((any\(test|feature\s*=\s*"harness")' crates/playground/src/lib.rs crates/playground/src/main.rs 2>/dev/null || true
)
if [ -n "$TESTER_CFG_HITS" ]; then
  echo "$TESTER_CFG_HITS" >&2
  fail "Inline harness/test cfg branches are forbidden in crates/playground/src/lib.rs and main.rs"
fi

echo "==> Checking crates/ui LOC ceiling"
UI_LOC_CEILING=95000
UI_LOC=$(find crates/ui/src -name '*.rs' -print0 | xargs -0 cat | wc -l | tr -d ' ')
echo "crates/ui/src total LOC: $UI_LOC (ceiling: $UI_LOC_CEILING)"
if [ "$UI_LOC" -gt "$UI_LOC_CEILING" ]; then
  fail "crates/ui/src LOC ($UI_LOC) exceeds ceiling ($UI_LOC_CEILING)"
fi

echo "==> Checking workflow YAML validity"
if [ -f "$REPO_ROOT/.github/workflows/native-playground.yml" ] && [ -f "$REPO_ROOT/.github/workflows/build-test.yml" ]; then
  if python3 -c "import yaml" 2>/dev/null; then
    python3 -c "
import yaml, sys
for p in sys.argv[1:]:
    with open(p) as f:
        yaml.safe_load(f)
    print('YAML OK:', p)
" "$REPO_ROOT/.github/workflows/build-test.yml" "$REPO_ROOT/.github/workflows/native-playground.yml"
  elif command -v ruby >/dev/null 2>&1; then
    ruby -ryaml -e 'ARGV.each { |p| YAML.load_file(p); puts "YAML OK: #{p}" }' \
      "$REPO_ROOT/.github/workflows/build-test.yml" "$REPO_ROOT/.github/workflows/native-playground.yml"
  else
    echo "Skipping YAML parse check (neither python3-yaml nor ruby installed)"
  fi
fi

echo "==> Checking CARGO_ENCODED_RUSTFLAGS isolation (no leaked root NAPI linker flags)"
if ! LINK_LOG=$(CARGO_ENCODED_RUSTFLAGS="" cargo rustc -p playground --bin bs-harness --features harness -- -C metadata="linkcheck-$$" --print link-args 2>&1); then
  echo "$LINK_LOG" >&2
  fail "cargo rustc link-args check failed"
fi
if ! echo "$LINK_LOG" | grep -qE '(cc|clang|gcc|ld|lld|"[^"]*bs_harness|bs_harness)'; then
  echo "$LINK_LOG" >&2
  fail "cargo rustc did not emit a linker invocation (cache bypass failed)"
fi
if echo "$LINK_LOG" | grep -E '(-all_load|-undefined[ ,]+dynamic_lookup|-z[ ,]+nodelete)' >/dev/null 2>&1; then
  echo "$LINK_LOG" >&2
  fail "Detected leaked root NAPI linker flags in rustc invocation"
fi

echo "All static invariants passed."
