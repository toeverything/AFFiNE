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

echo "==> Enumerating client Cargo workspace members via cargo metadata"
WORKSPACE_JSON=$(CARGO_ENCODED_RUSTFLAGS="" cargo metadata --manifest-path "$ROOT/Cargo.toml" --locked --no-deps --format-version 1)

MEMBER_LINES=$(
  WORKSPACE_JSON="$WORKSPACE_JSON" REPO_ROOT="$REPO_ROOT" python3 - <<'PY'
import json
import os
from pathlib import Path

meta = json.loads(os.environ["WORKSPACE_JSON"])
repo_root = Path(os.environ["REPO_ROOT"]).resolve()
ws_ids = set(meta["workspace_members"])
members = {}
for pkg in meta["packages"]:
    if pkg["id"] in ws_ids:
        manifest = Path(pkg["manifest_path"]).resolve()
        members[pkg["name"]] = manifest.parent

if len(members) < 3:
    raise SystemExit(f"Expected at least 3 client workspace members, found {len(members)}: {members}")

expected_core = {
    "ui": (repo_root / "packages/ui/ui").resolve(),
    "blocksuite-playground-doc": (repo_root / "blocksuite/crates/doc").resolve(),
    "playground": (repo_root / "blocksuite/crates/playground").resolve(),
}
for name, expected_dir in expected_core.items():
    actual_dir = members.get(name)
    if actual_dir != expected_dir:
        raise SystemExit(
            f"Expected core client member {name} at {expected_dir}, found {actual_dir}"
        )

for name in sorted(members):
    print(f"{name}\t{members[name]}")
PY
)

echo "Client workspace members:"
echo "$MEMBER_LINES"

echo "==> Checking four-domain toolchain, rustfmt, and AGENTS.md alignment and legacy guards"
CLIENT_TREES=(
  "$REPO_ROOT/packages/frontend"
  "$REPO_ROOT/packages/ui"
  "$REPO_ROOT/blocksuite/crates"
  "$REPO_ROOT/packages/common/store"
)

for tree in "${CLIENT_TREES[@]}"; do
  [ -d "$tree" ] || fail "Missing client domain directory $tree"
  [ -f "$tree/rust-toolchain.toml" ] || fail "Missing $tree/rust-toolchain.toml"
  [ -f "$tree/rustfmt.toml" ] || fail "Missing $tree/rustfmt.toml"
  [ -f "$tree/AGENTS.md" ] || fail "Missing $tree/AGENTS.md"
  [ -f "$tree/CLAUDE.md" ] || fail "Missing $tree/CLAUDE.md"
  cmp -s "$ROOT/rust-toolchain.toml" "$tree/rust-toolchain.toml" \
    || fail "$tree/rust-toolchain.toml differs from packages/frontend/rust-toolchain.toml"
  cmp -s "$ROOT/rustfmt.toml" "$tree/rustfmt.toml" \
    || fail "$tree/rustfmt.toml differs from packages/frontend/rustfmt.toml"
done

for legacy_dir in \
  "$REPO_ROOT/packages/frontend/native" \
  "$REPO_ROOT/packages/frontend/mobile-native" \
  "$REPO_ROOT/packages/frontend/apps"; do
  [ -f "$legacy_dir/rust-toolchain.toml" ] || fail "Missing legacy guard $legacy_dir/rust-toolchain.toml"
  cmp -s "$REPO_ROOT/rust-toolchain.toml" "$legacy_dir/rust-toolchain.toml" \
    || fail "$legacy_dir/rust-toolchain.toml must match root rust-toolchain.toml"
done

for legacy_fmt_dir in \
  "$REPO_ROOT/packages/frontend/native" \
  "$REPO_ROOT/packages/frontend/mobile-native"; do
  [ -f "$legacy_fmt_dir/rustfmt.toml" ] || fail "Missing legacy guard $legacy_fmt_dir/rustfmt.toml"
  cmp -s "$REPO_ROOT/rustfmt.toml" "$legacy_fmt_dir/rustfmt.toml" \
    || fail "$legacy_fmt_dir/rustfmt.toml must match root rustfmt.toml"
done

echo "==> Checking Cargo workspace_root resolution for client and legacy crates"
EXPECTED_CLIENT_ROOT="$(cd "$ROOT" && pwd -P)"
EXPECTED_REPO_ROOT="$(cd "$REPO_ROOT" && pwd -P)"

while IFS=$'\t' read -r pkg_name member_dir; do
  resolved_root=$(
    cd "$member_dir" && CARGO_ENCODED_RUSTFLAGS="" cargo metadata --locked --no-deps --format-version 1 \
      | python3 -c "import json, os, sys; print(os.path.realpath(json.load(sys.stdin)['workspace_root']))"
  )
  if [ "$resolved_root" != "$EXPECTED_CLIENT_ROOT" ]; then
    fail "Client crate $pkg_name ($member_dir) resolved workspace_root=$resolved_root, expected $EXPECTED_CLIENT_ROOT"
  fi
done <<< "$MEMBER_LINES"

for legacy_crate in \
  "$REPO_ROOT" \
  "$REPO_ROOT/packages/frontend/native" \
  "$REPO_ROOT/packages/frontend/mobile-native" \
  "$REPO_ROOT/packages/frontend/native/nbstore" \
  "$REPO_ROOT/packages/frontend/native/schema" \
  "$REPO_ROOT/packages/frontend/native/sqlite_v1"; do
  resolved_root=$(
    cd "$legacy_crate" && CARGO_ENCODED_RUSTFLAGS="" cargo metadata --locked --no-deps --format-version 1 \
      | python3 -c "import json, os, sys; print(os.path.realpath(json.load(sys.stdin)['workspace_root']))"
  )
  if [ "$resolved_root" != "$EXPECTED_REPO_ROOT" ]; then
    fail "Legacy crate ($legacy_crate) resolved workspace_root=$resolved_root, expected $EXPECTED_REPO_ROOT"
  fi
done

echo "==> Checking four-domain acyclic dependency rules (default-deny DAG)"
WORKSPACE_JSON="$WORKSPACE_JSON" REPO_ROOT="$REPO_ROOT" python3 - <<'PY'
import json
import os
from pathlib import Path

UI_ALL = {"packages/ui/tokens", "packages/ui/ui", "packages/ui/kit"}
BS_LOWER = {"blocksuite/crates/doc", "blocksuite/crates/preview", "blocksuite/crates/editor"}

ALLOWED_DEPS = {
    "packages/ui/tokens": set(),
    "packages/ui/ui": {"packages/ui/tokens"},
    "packages/ui/kit": {"packages/ui/tokens", "packages/ui/ui"},
    "blocksuite/crates/doc": set(),
    "blocksuite/crates/preview": {"packages/ui/tokens", "packages/ui/ui", "blocksuite/crates/doc"},
    "blocksuite/crates/editor": UI_ALL | {"blocksuite/crates/doc", "blocksuite/crates/preview"},
    "blocksuite/crates/playground": UI_ALL | BS_LOWER,
    "blocksuite/crates/oracle": UI_ALL | BS_LOWER,
    "packages/common/store": {"blocksuite/crates/doc"},
    "packages/frontend/legacy-import": {"blocksuite/crates/doc", "packages/common/store"},
    "packages/frontend/client": UI_ALL | BS_LOWER | {
        "packages/common/store",
        "packages/frontend/legacy-import",
    },
    "packages/frontend/mobile": UI_ALL | BS_LOWER | {
        "blocksuite/crates/playground",
        "packages/common/store",
        "packages/frontend/legacy-import",
        "packages/frontend/client",
    },
    "packages/frontend/desktop": UI_ALL | BS_LOWER | {
        "packages/common/store",
        "packages/frontend/legacy-import",
        "packages/frontend/client",
    },
}

HOST_ALLOWED = UI_ALL | BS_LOWER | {
    "blocksuite/crates/playground",
    "packages/common/store",
    "packages/frontend/legacy-import",
    "packages/frontend/client",
    "packages/frontend/mobile",
    "packages/frontend/desktop",
}


def is_allowed_edge(src_rel: str, dep_rel: str) -> bool:
    if src_rel == dep_rel:
        return True
    if src_rel.startswith("packages/frontend/hosts/"):
        parts = src_rel.split("/")
        if len(parts) == 4 and parts[3]:
            return dep_rel in HOST_ALLOWED
        return False
    allowed = ALLOWED_DEPS.get(src_rel)
    if allowed is None:
        return False
    return dep_rel in allowed


POSITIVE_FIXTURES = [
    ("packages/ui/kit", "packages/ui/ui"),
    ("blocksuite/crates/editor", "blocksuite/crates/preview"),
    ("blocksuite/crates/playground", "blocksuite/crates/doc"),
    ("packages/common/store", "blocksuite/crates/doc"),
    ("packages/frontend/mobile", "packages/frontend/client"),
    ("packages/frontend/hosts/ios", "packages/frontend/mobile"),
]
NEGATIVE_FIXTURES = [
    ("packages/ui/ui", "packages/ui/kit"),
    ("packages/ui/kit", "blocksuite/crates/doc"),
    ("blocksuite/crates/doc", "blocksuite/crates/preview"),
    ("blocksuite/crates/preview", "blocksuite/crates/editor"),
    ("packages/common/store", "blocksuite/crates/editor"),
    ("packages/common/store", "packages/ui/ui"),
    ("packages/frontend/client", "packages/frontend/mobile"),
    ("packages/frontend/mobile", "packages/frontend/hosts/ios"),
    ("packages/frontend/mobile", "packages/frontend/desktop"),
    ("packages/frontend/hosts/ios", "packages/frontend/hosts/android"),
    ("packages/frontend/unregistered", "packages/ui/ui"),
]

for s_rel, d_rel in POSITIVE_FIXTURES:
    if not is_allowed_edge(s_rel, d_rel):
        raise SystemExit(f"DAG self-test failed: expected {s_rel} -> {d_rel} to be allowed")
for s_rel, d_rel in NEGATIVE_FIXTURES:
    if is_allowed_edge(s_rel, d_rel):
        raise SystemExit(f"DAG self-test failed: expected {s_rel} -> {d_rel} to be rejected")

meta = json.loads(os.environ["WORKSPACE_JSON"])
repo_root = Path(os.environ["REPO_ROOT"]).resolve()
ws_ids = set(meta["workspace_members"])

pkg_rel = {}
for pkg in meta["packages"]:
    if pkg["id"] in ws_ids:
        rel_dir = Path(pkg["manifest_path"]).resolve().parent.relative_to(repo_root).as_posix()
        pkg_rel[pkg["name"]] = rel_dir

errors = []
for pkg in meta["packages"]:
    if pkg["id"] not in ws_ids:
        continue
    src_name = pkg["name"]
    src_rel = pkg_rel[src_name]
    if src_rel not in ALLOWED_DEPS and not (
        src_rel.startswith("packages/frontend/hosts/") and len(src_rel.split("/")) == 4
    ):
        errors.append(
            f"{src_name} ({src_rel}) is not registered in check-invariants.sh ALLOWED_DEPS"
        )
        continue
    for dep in pkg.get("dependencies", []):
        dep_name = dep["name"]
        if dep_name not in pkg_rel:
            continue
        dep_rel = pkg_rel[dep_name]
        if not is_allowed_edge(src_rel, dep_rel):
            errors.append(f"{src_name} ({src_rel}) must not depend on {dep_name} ({dep_rel})")

if errors:
    for e in errors:
        print(f"ERROR: {e}")
    raise SystemExit(1)
print("Four-domain default-deny dependency DAG check (with self-tests) passed.")
PY

echo "==> Checking active rustup toolchain for legacy (1.97.1) and client (1.98.1) directories"
command -v rustup >/dev/null 2>&1 || fail "rustup is required to verify active toolchains"
ROOT_CHANNEL=$(awk -F'"' '/^channel[[:space:]]*=/{print $2; exit}' "$REPO_ROOT/rust-toolchain.toml")
CLIENT_CHANNEL=$(awk -F'"' '/^channel[[:space:]]*=/{print $2; exit}' "$ROOT/rust-toolchain.toml")
for legacy_tc_dir in \
  "$REPO_ROOT/packages/frontend/native" \
  "$REPO_ROOT/packages/frontend/mobile-native" \
  "$REPO_ROOT/packages/frontend/apps/ios/App" \
  "$REPO_ROOT/packages/frontend/apps/android/App"; do
  active_tc=$(cd "$legacy_tc_dir" && env -u RUSTUP_TOOLCHAIN rustup show active-toolchain) \
    || fail "rustup show active-toolchain failed in $legacy_tc_dir"
  if [[ "$active_tc" != *"$ROOT_CHANNEL"* ]]; then
    fail "Expected active rustup toolchain in $legacy_tc_dir to match $ROOT_CHANNEL, got: $active_tc"
  fi
done
for client_tc_dir in "${CLIENT_TREES[@]}"; do
  active_tc=$(cd "$client_tc_dir" && env -u RUSTUP_TOOLCHAIN rustup show active-toolchain) \
    || fail "rustup show active-toolchain failed in $client_tc_dir"
  if [[ "$active_tc" != *"$CLIENT_CHANNEL"* ]]; then
    fail "Expected active rustup toolchain in $client_tc_dir to match $CLIENT_CHANNEL, got: $active_tc"
  fi
done

echo "==> Checking zero internal proc-macro crates"
if grep -rn 'proc-macro\s*=\s*true' "$ROOT/Cargo.toml" 2>/dev/null; then
  fail "Internal proc-macro crates are forbidden in the client workspace"
fi
while IFS=$'\t' read -r pkg_name member_dir; do
  if grep -rn 'proc-macro\s*=\s*true' "$member_dir/Cargo.toml" 2>/dev/null; then
    fail "Internal proc-macro crates are forbidden ($pkg_name)"
  fi
done <<< "$MEMBER_LINES"

UI_DIR="$REPO_ROOT/packages/ui/ui"
UI_KIT_DIR="$REPO_ROOT/packages/ui/kit"
UI_TOKENS_DIR="$REPO_ROOT/packages/ui/tokens"
DOC_DIR="$REPO_ROOT/blocksuite/crates/doc"
EDITOR_DIR="$REPO_ROOT/blocksuite/crates/editor"
PLAYGROUND_DIR="$REPO_ROOT/blocksuite/crates/playground"

echo "==> Checking packages/ui/tokens self-contained isolation (no frontend/ or blocksuite)"
if grep -rniE 'frontend/|blocksuite' "$UI_TOKENS_DIR/src" 2>/dev/null; then
  fail "packages/ui/tokens/src must stay self-contained without frontend/ or blocksuite references"
fi
LEGACY_FONTS_DIR="$REPO_ROOT/packages/frontend/component/src/fonts"
if [ -d "$LEGACY_FONTS_DIR" ]; then
  for rel in \
    "inter/Inter-VariableFont_slnt,wght.ttf" \
    "ibm-plex-mono/IBMPlexMono-Regular.ttf" \
    "ibm-plex-mono/IBMPlexMono-Bold.ttf" \
    "ibm-plex-mono/IBMPlexMono-Italic.ttf" \
    "ibm-plex-mono/IBMPlexMono-BoldItalic.ttf"; do
    if [ -f "$LEGACY_FONTS_DIR/$rel" ]; then
      cmp -s "$UI_TOKENS_DIR/fonts/$rel" "$LEGACY_FONTS_DIR/$rel" \
        || fail "packages/ui/tokens/fonts/$rel drifted from $LEGACY_FONTS_DIR/$rel"
    fi
  done
fi

echo "==> Checking packages/ui/ui domain isolation (no blocksuite/affine words)"
if grep -rniE '\b(blocksuite|affine)\b' "$UI_DIR/src" "$UI_DIR/Cargo.toml" 2>/dev/null; then
  fail "packages/ui/ui must not reference BlockSuite or AFFiNE domain terms"
fi

echo "==> Checking packages/ui/kit domain isolation and logical-geometry guard"
if grep -rniE '\b(blocksuite|affine)\b' "$UI_KIT_DIR/src" "$UI_KIT_DIR/Cargo.toml" 2>/dev/null; then
  fail "packages/ui/kit must not reference BlockSuite or AFFiNE domain terms"
fi
if grep -rnE '\.(left|right|pl|pr|ml|mr|border_l|border_r)(_[0-9a-z_]+)?\s*\(' "$UI_KIT_DIR/src" --include='*.rs' 2>/dev/null; then
  fail "packages/ui/kit/src must use logical inline geometry instead of physical left/right layout helpers"
fi

echo "==> Checking blocksuite/crates/doc GUI isolation and forbid(unsafe_code)"
if grep -rnE '^\s*(ui|wgpu|objc2|web-sys)\b' "$DOC_DIR/Cargo.toml" 2>/dev/null; then
  fail "blocksuite/crates/doc must not depend on GUI/platform crates (ui, wgpu, objc2, web-sys)"
fi
if ! grep -q '#!\[forbid(unsafe_code)\]' "$DOC_DIR/src/lib.rs"; then
  fail "blocksuite/crates/doc/src/lib.rs must declare #![forbid(unsafe_code)]"
fi

echo "==> Checking blocksuite/crates/preview zero host-font scanning"
if grep -rn 'load_system_fonts' "$REPO_ROOT/blocksuite/crates/preview/src" 2>/dev/null; then
  fail "load_system_fonts is forbidden in blocksuite/crates/preview/src"
fi

echo "==> Checking no wall-clock calls outside packages/ui/ui/src/platform"
WALL_CLOCK_HITS=""
while IFS=$'\t' read -r _pkg_name member_dir; do
  if [ -d "$member_dir/src" ]; then
    hits=$(
      grep -rnE '(Instant::now|SystemTime::now|Zoned::now|Timestamp::now)\s*\(' "$member_dir/src" \
        --include='*.rs' \
        | grep -v "^$UI_DIR/src/platform/" \
        || true
    )
    if [ -n "$hits" ]; then
      WALL_CLOCK_HITS="${WALL_CLOCK_HITS}${hits}"$'\n'
    fi
  fi
done <<< "$MEMBER_LINES"
if [ -n "$WALL_CLOCK_HITS" ]; then
  echo "$WALL_CLOCK_HITS" >&2
  fail "Instant::now() / SystemTime::now() / Zoned::now() / Timestamp::now() is forbidden outside packages/ui/ui/src/platform/"
fi

echo "==> Checking zero tester branches inside shipping editor and playground view modules"
for view_dir in "$EDITOR_DIR" "$PLAYGROUND_DIR"; do
  if grep -rn 'is_headless' "$view_dir/src" 2>/dev/null; then
    fail "is_headless branches are forbidden in $view_dir/src"
  fi
  TESTER_CFG_HITS=$(
    grep -rnE '#\[cfg\((any\(test|feature\s*=\s*"harness")' "$view_dir/src" 2>/dev/null \
      | grep -Ev "^$view_dir/src/(bin/|rich_text/mod\.rs:)" \
      || true
  )
  if [ -n "$TESTER_CFG_HITS" ]; then
    echo "$TESTER_CFG_HITS" >&2
    fail "Inline harness/test cfg branches are forbidden in shipping $view_dir/src modules"
  fi
done

echo "==> Checking Rust module structure, visibility, orphaned files, and per-file LOC"
MEMBER_LINES="$MEMBER_LINES" python3 - <<'PY'
import os
import re
import sys
from pathlib import Path

errors = []
roots = []
for line in os.environ["MEMBER_LINES"].splitlines():
    if not line.strip():
        continue
    name, dir_path = line.split("\t", 1)
    if name == "ui":
        continue
    src_dir = Path(dir_path) / "src"
    if src_dir.is_dir():
        roots.append(src_dir)

if len(roots) < 2:
    print(f"ERROR: Expected at least 2 non-vendored client crate src roots, found {roots}", file=sys.stderr)
    sys.exit(1)

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

        if p.name not in ("lib.rs", "main.rs", "mod.rs") and (parent / p.stem).is_dir():
            errors.append(f"{p}: coexists beside directory {parent / p.stem}/; move into {parent / p.stem}/mod.rs")

        non_test = strip_cfg_test_mods(text)
        non_test_lines = non_test.splitlines()

        for lineno, line in enumerate(non_test_lines, 1):
            if "super::super::" in line:
                errors.append(f"{p}:{lineno}: forbidden `super::super::` outside `mod tests`")

        rel = p.relative_to(src_root)
        if len(rel.parts) >= 2 and p.name != "mod.rs" and rel.parts[0] != "bin":
            parent_mod = rel.parts[0]
            pat = f"crate::{parent_mod}::"
            for lineno, line in enumerate(non_test_lines, 1):
                if pat in line:
                    errors.append(f"{p}:{lineno}: use `super::` instead of `{pat}` inside submodule")

        actual_non_test = len([1 for orig, stripped in zip(text.splitlines(), non_test_lines) if orig == stripped])
        if actual_non_test > 800:
            errors.append(f"{p}: {actual_non_test} non-test lines exceeds ceiling of 800")

    for p in rs_files:
        if p.resolve() not in declared_modules:
            errors.append(f"{p}: orphaned .rs file not declared by any `mod <name>;`")

if errors:
    for e in errors:
        print(f"ERROR: {e}", file=sys.stderr)
    sys.exit(1)
print("Rust module structure & LOC checks passed.")
PY

echo "==> Checking packages/ui/ui SLOC ceiling"
UI_SLOC_CEILING=74268
read -r UI_RAW_LOC UI_SLOC < <(UI_DIR="$UI_DIR" python3 - <<'PY'
import os
from pathlib import Path
raw = sloc = 0
for p in Path(os.environ["UI_DIR"], "src").rglob("*.rs"):
    for line in p.read_text(encoding="utf-8", errors="replace").splitlines():
        raw += 1
        s = line.strip()
        if s and not s.startswith("//"):
            sloc += 1
print(f"{raw} {sloc}")
PY
)
echo "packages/ui/ui/src raw lines: $UI_RAW_LOC, code lines (non-blank, non-comment): $UI_SLOC (ceiling: $UI_SLOC_CEILING)"
if [ "$UI_SLOC" -gt "$UI_SLOC_CEILING" ]; then
  fail "packages/ui/ui/src SLOC ($UI_SLOC) exceeds ceiling ($UI_SLOC_CEILING)"
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
    fail "Neither python3-yaml nor ruby is available to validate workflow YAML files"
  fi
fi

echo "==> Checking CARGO_ENCODED_RUSTFLAGS isolation (no leaked root NAPI linker flags)"
if ! LINK_LOG=$(CARGO_ENCODED_RUSTFLAGS="" cargo rustc -p playground --bin bs-harness --features harness -- -C metadata="linkcheck-$$" --print link-args 2>&1); then
  echo "$LINK_LOG" >&2
  fail "cargo rustc link-args check failed"
fi
if ! grep -qE '(cc|clang|gcc|ld|lld|"[^"]*bs_harness|bs_harness)' <<<"$LINK_LOG"; then
  echo "$LINK_LOG" >&2
  fail "cargo rustc did not emit a linker invocation (cache bypass failed)"
fi
if grep -qE '(-all_load|-undefined[ ,]+dynamic_lookup|-z[ ,]+nodelete)' <<<"$LINK_LOG"; then
  echo "$LINK_LOG" >&2
  fail "Detected leaked root NAPI linker flags in rustc invocation"
fi

echo "All static invariants passed."
