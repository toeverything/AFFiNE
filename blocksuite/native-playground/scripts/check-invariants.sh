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
  grep -rnE '#\[cfg\((any\(test|feature\s*=\s*"harness")' crates/playground/src 2>/dev/null \
    | grep -Ev '^crates/playground/src/(bin/|rich_text/mod\.rs:)' \
    || true
)
if [ -n "$TESTER_CFG_HITS" ]; then
  echo "$TESTER_CFG_HITS" >&2
  fail "Inline harness/test cfg branches are forbidden in shipping crates/playground/src modules"
fi

echo "==> Checking Rust module structure, visibility, orphaned files, and per-file LOC"
python3 - <<'PY'
import re
import sys
from pathlib import Path

errors = []
roots = [Path("crates/doc/src"), Path("crates/playground/src")]

def strip_cfg_test_mods(src: str) -> str:
    """Remove `#[cfg(test)] mod <name> { ... }` blocks while preserving line numbers."""
    lines = src.splitlines()
    out = []
    i = 0
    n = len(lines)
    while i < n:
        s = lines[i].strip()
        if s == "#[cfg(test)]" and i + 1 < n and re.match(r"^(pub(\([^)]*\))?\s+)?mod\s+\w+\s*\{", lines[i + 1].strip()):
            depth = 0
            started = False
            out.append("<TEST>")
            i += 1
            while i < n:
                line = lines[i]
                if "{" in line:
                    started = True
                depth += line.count("{") - line.count("}")
                out.append("<TEST>")
                i += 1
                if started and depth <= 0:
                    break
            continue
        out.append(lines[i])
        i += 1
    return "\n".join(out)

for src_root in roots:
    rs_files = sorted(src_root.rglob("*.rs"))
    declared_modules = set()
    # Root entry points are always live.
    for entry in ("lib.rs", "main.rs"):
        if (src_root / entry).exists():
            declared_modules.add((src_root / entry).resolve())
    for bin_file in (src_root / "bin").glob("*.rs") if (src_root / "bin").exists() else []:
        declared_modules.add(bin_file.resolve())
    for bin_main in (src_root / "bin").glob("*/main.rs") if (src_root / "bin").exists() else []:
        declared_modules.add(bin_main.resolve())

    mod_decl_re = re.compile(r"^\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+([A-Za-z_][A-Za-z0-9_]*)\s*;")
    for p in rs_files:
        text = p.read_text(encoding="utf-8")
        parent = p.parent
        # Track declared child modules for orphan detection.
        for line in text.splitlines():
            m = mod_decl_re.match(line)
            if m:
                mod_name = m.group(1)
                base_dir = parent if p.name in ("lib.rs", "main.rs", "mod.rs") else parent / p.stem
                cand_file = base_dir / f"{mod_name}.rs"
                cand_mod = base_dir / mod_name / "mod.rs"
                if cand_file.exists():
                    declared_modules.add(cand_file.resolve())
                if cand_mod.exists():
                    declared_modules.add(cand_mod.resolve())

        # Rule (g): no `<mod_name>.rs` coexisting beside `<mod_name>/`.
        if p.name not in ("lib.rs", "main.rs", "mod.rs") and (parent / p.stem).is_dir():
            errors.append(f"{p}: coexists beside directory {parent / p.stem}/; move into {parent / p.stem}/mod.rs")

        non_test = strip_cfg_test_mods(text)
        non_test_lines = non_test.splitlines()

        # Rule (c): no `super::super::` outside `mod tests`.
        for lineno, line in enumerate(non_test_lines, 1):
            if "super::super::" in line:
                errors.append(f"{p}:{lineno}: forbidden `super::super::` outside `mod tests`")

        # Rules (b, c): sibling `src/<mod>/<child>.rs` must not import via `crate::<mod>::`.
        rel = p.relative_to(src_root)
        if len(rel.parts) >= 2 and p.name != "mod.rs" and rel.parts[0] != "bin":
            parent_mod = rel.parts[0]
            pat = f"crate::{parent_mod}::"
            for lineno, line in enumerate(non_test_lines, 1):
                if pat in line:
                    errors.append(f"{p}:{lineno}: use `super::` instead of `{pat}` inside submodule")

        # Rule (g): <= 800 non-test lines on every `.rs` file in `crates/doc/src` and `crates/playground/src`.
        actual_non_test = len([1 for orig, stripped in zip(text.splitlines(), non_test_lines) if orig == stripped])
        if actual_non_test > 800:
            errors.append(f"{p}: {actual_non_test} non-test lines exceeds ceiling of 800")

    # Orphaned .rs file check.
    for p in rs_files:
        if p.resolve() not in declared_modules:
            errors.append(f"{p}: orphaned .rs file not declared by any `mod <name>;`")

if errors:
    for e in errors:
        print(f"ERROR: {e}", file=sys.stderr)
    sys.exit(1)
print("Rust module structure & LOC checks passed.")
PY

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
