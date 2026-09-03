//! Schema drift guard.
//!
//! affine-cli hardcodes BlockSuite conventions (block flavour strings, `sys:version` integers,
//! `sys:*` / `prop:*` keys) with no compile-time link to the TypeScript sources that define
//! them. This test reads the schema definitions from the monorepo checkout
//! (`blocksuite/affine/model/src/blocks/**`, `blocksuite/affine/blocks/**`) and asserts:
//!
//! 1. the set of block flavours BlockSuite declares, with their schema versions, equals the
//!    snapshot below - so ADDING, renaming, or re-versioning a block schema upstream fails this
//!    test and forces a review of the CLI's conventions (the snapshot is then updated
//!    deliberately, together with whatever the CLI needs);
//! 2. every flavour the CLI writes exists upstream with the same version the CLI stamps
//!    (`doc_parser::written_block_schemas`).
//!
//! The scan is deliberately narrow: only files containing `defineBlockSchema(` or
//! `createEmbedBlockSchema(` under the two schema roots, reading the `flavour:` / `name:` and
//! first `version:` fields of that call. When the monorepo sources are not present (the crate
//! built outside the AFFiNE checkout) the test is skipped with a message.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

/// Snapshot of `flavour -> version` declared by BlockSuite in this checkout. Update it on
/// purpose when upstream changes, after checking whether the CLI must follow.
const UPSTREAM_BLOCK_SCHEMAS: &[(&str, i32)] = &[
    ("affine:attachment", 1),
    ("affine:bookmark", 1),
    ("affine:callout", 1),
    ("affine:code", 1),
    ("affine:data-view", 1),
    ("affine:database", 3),
    ("affine:divider", 1),
    ("affine:edgeless-text", 1),
    ("affine:embed-figma", 1),
    ("affine:embed-github", 1),
    ("affine:embed-html", 1),
    ("affine:embed-iframe", 1),
    ("affine:embed-linked-doc", 1),
    ("affine:embed-loom", 1),
    ("affine:embed-synced-doc", 1),
    ("affine:embed-youtube", 1),
    ("affine:frame", 1),
    ("affine:image", 1),
    ("affine:latex", 1),
    ("affine:list", 1),
    ("affine:note", 1),
    ("affine:page", 2),
    ("affine:paragraph", 1),
    ("affine:surface", 5),
    ("affine:surface-ref", 1),
    ("affine:table", 1),
];

const SCHEMA_ROOTS: &[&str] = &["blocksuite/affine/model/src/blocks", "blocksuite/affine/blocks"];

fn repo_root() -> Option<PathBuf> {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let root = root.canonicalize().ok()?;
    SCHEMA_ROOTS.iter().all(|r| root.join(r).is_dir()).then_some(root)
}

fn walk_ts(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if path.is_dir() {
            if matches!(name.as_str(), "__tests__" | "node_modules" | "dist") {
                continue;
            }
            walk_ts(&path, out);
        } else if name.ends_with(".ts") && !name.ends_with(".spec.ts") && !name.ends_with(".test.ts") {
            out.push(path);
        }
    }
}

/// Value of `<key>:` after `from` in `src`: a quoted string literal, or an identifier resolved
/// through a `const <ident> = '<literal>'` declaration in the same file.
fn field_after(src: &str, from: usize, key: &str) -> Option<String> {
    let hay = &src[from..];
    let mut search = 0;
    while let Some(rel) = hay[search..].find(key) {
        let at = search + rel;
        let preceded_ok = at == 0 || hay[..at].ends_with(['\n', ' ', '\t', '{', ',']);
        let rest = hay[at + key.len()..].trim_start();
        if preceded_ok && let Some(rest) = rest.strip_prefix(':') {
            let rest = rest.trim_start();
            if let Some(q) = rest.chars().next()
                && (q == '\'' || q == '"')
            {
                let body = &rest[1..];
                return body.find(q).map(|end| body[..end].to_string());
            }
            let ident: String = rest
                .chars()
                .take_while(|c| c.is_ascii_alphanumeric() || *c == '_')
                .collect();
            if !ident.is_empty() {
                return resolve_const(src, &ident);
            }
            return None;
        }
        search = at + key.len();
    }
    None
}

fn resolve_const(src: &str, ident: &str) -> Option<String> {
    let needle = format!("const {ident} =");
    let at = src.find(&needle)?;
    let rest = src[at + needle.len()..].trim_start();
    let q = rest.chars().next()?;
    if q != '\'' && q != '"' {
        return None;
    }
    let body = &rest[1..];
    body.find(q).map(|end| body[..end].to_string())
}

fn version_after(src: &str, from: usize) -> Option<i32> {
    let hay = &src[from..];
    let at = hay.find("version:")?;
    let digits: String = hay[at + "version:".len()..]
        .trim_start()
        .chars()
        .take_while(|c| c.is_ascii_digit())
        .collect();
    digits.parse().ok()
}

fn scan_upstream(root: &Path) -> BTreeMap<String, i32> {
    let mut files = Vec::new();
    for r in SCHEMA_ROOTS {
        walk_ts(&root.join(r), &mut files);
    }
    let mut out = BTreeMap::new();
    for file in files {
        let Ok(src) = fs::read_to_string(&file) else { continue };
        for (i, _) in src.match_indices("defineBlockSchema(") {
            let flavour = field_after(&src, i, "flavour")
                .unwrap_or_else(|| panic!("{}: defineBlockSchema without a resolvable flavour", file.display()));
            let version = version_after(&src, i)
                .unwrap_or_else(|| panic!("{}: defineBlockSchema without a version", file.display()));
            out.insert(flavour, version);
        }
        for (i, _) in src.match_indices("createEmbedBlockSchema(") {
            // Skip the helper's own definition (`function createEmbedBlockSchema(`).
            if src[..i].ends_with("function ") {
                continue;
            }
            let name = field_after(&src, i, "name")
                .unwrap_or_else(|| panic!("{}: createEmbedBlockSchema without a name", file.display()));
            let version = version_after(&src, i)
                .unwrap_or_else(|| panic!("{}: createEmbedBlockSchema without a version", file.display()));
            out.insert(format!("affine:embed-{name}"), version);
        }
    }
    out
}

#[test]
fn blocksuite_block_schemas_match_snapshot_and_cli_conventions() {
    let Some(root) = repo_root() else {
        eprintln!("schema_drift: BlockSuite sources not found next to the crate; skipping");
        return;
    };
    let upstream = scan_upstream(&root);
    assert!(
        !upstream.is_empty(),
        "schema scan found no block schemas under {SCHEMA_ROOTS:?}"
    );

    // 1. Upstream registry equals the snapshot (additions/renames/version bumps surface here).
    let snapshot: BTreeMap<String, i32> = UPSTREAM_BLOCK_SCHEMAS
        .iter()
        .map(|(f, v)| (f.to_string(), *v))
        .collect();
    let mut drift = Vec::new();
    for (f, v) in &upstream {
        match snapshot.get(f) {
            None => drift.push(format!("added upstream: {f} (version {v})")),
            Some(sv) if sv != v => drift.push(format!("version changed upstream: {f} {sv} -> {v}")),
            _ => {}
        }
    }
    for f in snapshot.keys() {
        if !upstream.contains_key(f) {
            drift.push(format!("removed or renamed upstream: {f}"));
        }
    }
    assert!(
        drift.is_empty(),
        "BlockSuite block schema registry drifted from the snapshot in tests/schema_drift.rs:\n  {}\n\
         Review the CLI's hardcoded conventions (src/doc_parser/block_spec.rs, \
         src/doc_parser/write/builder.rs block_version, src/doc_parser/blocksuite.rs) and then \
         update UPSTREAM_BLOCK_SCHEMAS on purpose.",
        drift.join("\n  ")
    );

    // 2. Every flavour the CLI writes exists upstream with the version the CLI stamps.
    let mut mismatches = Vec::new();
    for (flavour, cli_version) in affine_cli::doc_parser::written_block_schemas() {
        match upstream.get(flavour) {
            None => mismatches.push(format!("CLI writes {flavour}, which BlockSuite no longer declares")),
            Some(v) if *v != cli_version => mismatches.push(format!(
                "CLI stamps sys:version {cli_version} on {flavour}, BlockSuite declares {v}"
            )),
            _ => {}
        }
    }
    assert!(
        mismatches.is_empty(),
        "CLI block conventions disagree with BlockSuite:\n  {}",
        mismatches.join("\n  ")
    );
}
