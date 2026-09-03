//! End-to-end command tests: drive the compiled `affine-cli` binary as a subprocess against a
//! throwaway `--affine-dir`, asserting on the JSON it prints (and, where it matters, on the
//! on-disk effect via a second invocation or a direct y-octo decode of the stored doc).
//!
//! Cargo exposes the built binary path as `CARGO_BIN_EXE_affine-cli` for integration tests.

use std::path::{Path, PathBuf};
use std::process::Command;

use serde_json::Value;
use y_octo::{Doc, DocOptions};

/// A unique temp base dir per test, removed on drop.
struct TempBase(PathBuf);

impl TempBase {
    fn new(tag: &str) -> Self {
        let mut p = std::env::temp_dir();
        let unique = format!("affine-cli-test-{tag}-{}-{}", std::process::id(), nanoid::nanoid!(8));
        p.push(unique);
        std::fs::create_dir_all(&p).expect("create temp base");
        TempBase(p)
    }
    fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for TempBase {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

/// Run the CLI with the given args under `base`, asserting exit success, and parse stdout JSON.
fn run_ok(base: &Path, args: &[&str]) -> Value {
    let out = run_raw(base, args);
    assert!(
        out.status.success(),
        "expected success for {args:?}, got status {:?}\nstdout: {}\nstderr: {}",
        out.status.code(),
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr),
    );
    let stdout = String::from_utf8_lossy(&out.stdout);
    serde_json::from_str(stdout.trim())
        .unwrap_or_else(|e| panic!("stdout was not JSON for {args:?}: {e}\nstdout: {stdout}"))
}

/// Run the CLI expecting a non-zero exit, returning the parsed error-envelope JSON.
fn run_err(base: &Path, args: &[&str]) -> Value {
    let out = run_raw(base, args);
    assert!(
        !out.status.success(),
        "expected failure for {args:?}, but it succeeded\nstdout: {}",
        String::from_utf8_lossy(&out.stdout),
    );
    let stdout = String::from_utf8_lossy(&out.stdout);
    serde_json::from_str(stdout.trim())
        .unwrap_or_else(|e| panic!("error stdout was not JSON for {args:?}: {e}\nstdout: {stdout}"))
}

fn run_raw(base: &Path, args: &[&str]) -> std::process::Output {
    let bin = env!("CARGO_BIN_EXE_affine-cli");
    let mut cmd = Command::new(bin);
    cmd.arg("--affine-dir").arg(base);
    // nanoid ids can begin with '-', which clap would otherwise parse as a short flag when
    // passed as a separate token. Join `--flag <value>` into `--flag=value` whenever the value
    // starts with '-', mirroring how a real caller would quote/escape such an id.
    let mut i = 0;
    while i < args.len() {
        let a = args[i];
        if a.starts_with("--") && i + 1 < args.len() && args[i + 1].starts_with('-') && !args[i + 1].starts_with("--") {
            cmd.arg(format!("{a}={}", args[i + 1]));
            i += 2;
        } else {
            cmd.arg(a);
            i += 1;
        }
    }
    cmd.output().expect("run affine-cli")
}

/// Create a workspace, returning its id.
fn create_ws(base: &Path, name: &str) -> String {
    let v = run_ok(base, &["workspace", "create", "--name", name]);
    assert_eq!(v["ok"], json_true());
    v["id"].as_str().expect("ws id").to_string()
}

/// Create a doc in a workspace, returning its id.
fn create_doc(base: &Path, ws: &str, title: &str, content: &str) -> String {
    let v = run_ok(
        base,
        &[
            "doc",
            "create",
            "--workspace",
            ws,
            "--title",
            title,
            "--content",
            content,
        ],
    );
    assert_eq!(v["ok"], json_true());
    v["docId"].as_str().expect("doc id").to_string()
}

fn json_true() -> Value {
    Value::Bool(true)
}

/// Decode the stored `db$docProperties` doc for a workspace and return the `primaryMode` value
/// for `doc_id`, if present.
fn read_primary_mode(base: &Path, peer: &str, ws: &str, doc_id: &str) -> Option<String> {
    let db = base.join("workspaces").join(peer).join(ws).join("storage.db");
    assert!(db.exists(), "storage.db should exist at {db:?}");
    // The properties doc is stored under doc_id == "db$docProperties". We can't easily read the
    // sqlite rows from here without the nbstore handle, so instead we round-trip through a fresh
    // `doc read`-like decode by asking the CLI to re-open... but properties are not a "doc". So we
    // decode directly from the doc's merged binary via a tiny SQLite read using the CLI is not
    // possible; instead we rely on the search/set-mode JSON for the happy path and decode the
    // db$docProperties doc here by reading it back through a helper invocation is overkill.
    //
    // We therefore decode by re-merging the raw update blobs stored in the `updates` table.
    let blobs = read_doc_update_blobs(&db, "db$docProperties");
    if blobs.is_empty() {
        return None;
    }
    let mut doc: Doc = DocOptions::new().build();
    for b in &blobs {
        if b.is_empty() || b.as_slice() == [0, 0] {
            continue;
        }
        doc.apply_update_from_binary_v1(b).expect("apply props update");
    }
    let row = doc.get_map(doc_id).ok()?;
    row.get("primaryMode").and_then(|v| v.to_any()).and_then(|a| match a {
        y_octo::Any::String(s) => Some(s),
        _ => None,
    })
}

/// Read all `updates.data` blobs for a doc id directly from the sqlite store (no nbstore handle).
fn read_doc_update_blobs(db: &Path, doc_id: &str) -> Vec<Vec<u8>> {
    // Minimal sqlite read via the `rusqlite`-free path: shell out to `sqlite3`? Not guaranteed.
    // Instead use affine_nbstore through a blocking tokio runtime.
    use affine_nbstore::pool::SqliteDocStoragePool;
    let rt = tokio::runtime::Runtime::new().expect("rt");
    rt.block_on(async {
        let pool = SqliteDocStoragePool::default();
        let uid = "@peer(local);@type(workspace);@id(probe);".to_string();
        pool.connect(uid.clone(), db.to_string_lossy().into_owned())
            .await
            .expect("connect probe");
        let s = pool.get(uid).await.expect("get probe");
        let mut out = Vec::new();
        if let Some(snap) = s.get_doc_snapshot(doc_id.to_string()).await.expect("snapshot") {
            out.push(snap.bin);
        }
        for u in s.get_doc_updates(doc_id.to_string()).await.expect("updates") {
            out.push(u.bin);
        }
        out
    })
}

// ----------------------------------------------------------------------------

#[test]
fn workspace_list_shows_created_workspaces_with_doc_counts() {
    let base = TempBase::new("wslist");
    let _a = create_ws(base.path(), "WS A");
    let b = create_ws(base.path(), "WS B");
    create_doc(base.path(), &b, "Doc One", "# Doc One\n\nbody");

    let list = run_ok(base.path(), &["workspace", "list"]);
    let arr = list.as_array().expect("list is array");
    assert_eq!(arr.len(), 2, "expected 2 workspaces, got {arr:?}");

    let names: Vec<&str> = arr.iter().map(|w| w["name"].as_str().unwrap()).collect();
    assert!(names.contains(&"WS A"));
    assert!(names.contains(&"WS B"));

    let ws_b = arr.iter().find(|w| w["name"] == "WS B").unwrap();
    assert_eq!(ws_b["docCount"], 1, "WS B should have 1 doc");
    let ws_a = arr.iter().find(|w| w["name"] == "WS A").unwrap();
    assert_eq!(ws_a["docCount"], 0, "WS A should have 0 docs");
}

#[test]
fn workspace_list_empty_when_no_dir() {
    let base = TempBase::new("wsempty");
    let list = run_ok(base.path(), &["workspace", "list"]);
    assert_eq!(list.as_array().expect("array").len(), 0);
}

#[test]
fn unknown_workspace_id_errors_without_creating_it() {
    // Regression: a typo'd --workspace id must NOT materialize an empty workspace DB on disk
    // (which `workspace list` would then report as a real workspace).
    let base = TempBase::new("nosuchws");
    let err = run_err(base.path(), &["doc", "list", "--workspace", "no-such-workspace"]);
    assert_eq!(err["error"], "config", "expected config error, got {err:?}");

    let err = run_err(
        base.path(),
        &["doc", "create", "--workspace", "no-such-workspace", "--title", "T"],
    );
    assert_eq!(err["error"], "config", "expected config error, got {err:?}");

    let list = run_ok(base.path(), &["workspace", "list"]);
    assert_eq!(
        list.as_array().expect("array").len(),
        0,
        "failed commands must not create workspaces: {list:?}"
    );
}

#[test]
fn doc_list_shows_created_docs() {
    let base = TempBase::new("doclist");
    let ws = create_ws(base.path(), "WS");
    let d1 = create_doc(base.path(), &ws, "Alpha", "# Alpha\n\na");
    let d2 = create_doc(base.path(), &ws, "Beta", "# Beta\n\nb");

    let list = run_ok(base.path(), &["doc", "list", "--workspace", &ws]);
    let arr = list.as_array().expect("array");
    assert_eq!(arr.len(), 2, "expected 2 pages, got {arr:?}");

    let ids: Vec<&str> = arr.iter().map(|p| p["id"].as_str().unwrap()).collect();
    assert!(ids.contains(&d1.as_str()));
    assert!(ids.contains(&d2.as_str()));

    let titles: Vec<&str> = arr.iter().map(|p| p["title"].as_str().unwrap()).collect();
    assert!(titles.contains(&"Alpha"));
    assert!(titles.contains(&"Beta"));

    // createDate should be present.
    assert!(arr.iter().all(|p| p.get("createDate").is_some()));
}

#[test]
fn doc_read_json_returns_blocks() {
    let base = TempBase::new("readjson");
    let ws = create_ws(base.path(), "WS");
    let doc = create_doc(base.path(), &ws, "Report", "# Report\n\nrevenue grew");

    let v = run_ok(
        base.path(),
        &["doc", "read", "--workspace", &ws, "--doc", &doc, "--format", "json"],
    );
    assert_eq!(v["ok"], json_true());
    assert_eq!(v["title"], "Report");
    let blocks = v["blocks"].as_array().expect("blocks array");
    assert!(!blocks.is_empty(), "expected at least one block");
    // Some block should be a paragraph carrying the body text.
    let has_para = blocks.iter().any(|b| {
        b["flavour"] == "affine:paragraph"
            && b["content"]
                .as_array()
                .map(|c| c.iter().any(|s| s.as_str().unwrap_or("").contains("revenue")))
                .unwrap_or(false)
    });
    assert!(
        has_para,
        "expected a paragraph block with the body text; got {blocks:?}"
    );
}

#[test]
fn doc_read_json_missing_doc_errors() {
    let base = TempBase::new("readmiss");
    let ws = create_ws(base.path(), "WS");
    let err = run_err(
        base.path(),
        &["doc", "read", "--workspace", &ws, "--doc", "nope", "--format", "json"],
    );
    assert_eq!(err["ok"], Value::Bool(false));
}

#[test]
fn doc_update_changes_rendered_markdown() {
    let base = TempBase::new("docupdate");
    let ws = create_ws(base.path(), "WS");
    let doc = create_doc(base.path(), &ws, "T", "# T\n\noriginal body");

    run_ok(
        base.path(),
        &[
            "doc",
            "update",
            "--workspace",
            &ws,
            "--doc",
            &doc,
            "--content",
            "# T\n\nbrand new body",
        ],
    );

    let v = run_ok(
        base.path(),
        &["doc", "read", "--workspace", &ws, "--doc", &doc, "--format", "md"],
    );
    let md = v["markdown"].as_str().unwrap();
    assert!(md.contains("brand new body"), "got md: {md}");
    assert!(!md.contains("original body"), "old body should be gone: {md}");
}

#[test]
fn doc_set_title_updates_doc_and_root_meta() {
    let base = TempBase::new("settitle");
    let ws = create_ws(base.path(), "WS");
    let doc = create_doc(base.path(), &ws, "Old Title", "# Old Title\n\nbody");

    run_ok(
        base.path(),
        &[
            "doc",
            "set-title",
            "--workspace",
            &ws,
            "--doc",
            &doc,
            "--title",
            "New Title",
        ],
    );

    // (a) page doc title.
    let read = run_ok(
        base.path(),
        &["doc", "read", "--workspace", &ws, "--doc", &doc, "--format", "md"],
    );
    assert_eq!(read["title"], "New Title");

    // (b) root meta.pages title (visible through doc list).
    let list = run_ok(base.path(), &["doc", "list", "--workspace", &ws]);
    let page = list
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["id"] == doc.as_str())
        .expect("page in list");
    assert_eq!(page["title"], "New Title");
}

#[test]
fn doc_set_mode_writes_primary_mode_edgeless() {
    let base = TempBase::new("setmode");
    let ws = create_ws(base.path(), "WS");
    let doc = create_doc(base.path(), &ws, "Diagram", "# Diagram\n\nbody");

    let v = run_ok(
        base.path(),
        &[
            "doc",
            "set-mode",
            "--workspace",
            &ws,
            "--doc",
            &doc,
            "--mode",
            "edgeless",
        ],
    );
    assert_eq!(v["mode"], "edgeless");

    let mode = read_primary_mode(base.path(), "local", &ws, &doc);
    assert_eq!(
        mode.as_deref(),
        Some("edgeless"),
        "db$docProperties row primaryMode should be edgeless"
    );

    // Flip back to page; the row should now read "page".
    run_ok(
        base.path(),
        &["doc", "set-mode", "--workspace", &ws, "--doc", &doc, "--mode", "page"],
    );
    let mode = read_primary_mode(base.path(), "local", &ws, &doc);
    assert_eq!(mode.as_deref(), Some("page"));
}

#[test]
fn doc_set_mode_rejects_bad_mode() {
    let base = TempBase::new("badmode");
    let ws = create_ws(base.path(), "WS");
    let doc = create_doc(base.path(), &ws, "D", "# D\n\nx");
    let err = run_err(
        base.path(),
        &[
            "doc",
            "set-mode",
            "--workspace",
            &ws,
            "--doc",
            &doc,
            "--mode",
            "sideways",
        ],
    );
    assert_eq!(err["error"], "config");
}

#[test]
fn doc_delete_removes_meta_pages_entry() {
    let base = TempBase::new("docdelete");
    let ws = create_ws(base.path(), "WS");
    let keep = create_doc(base.path(), &ws, "Keep", "# Keep\n\nk");
    let drop = create_doc(base.path(), &ws, "Drop", "# Drop\n\nd");

    // Both present.
    let before = run_ok(base.path(), &["doc", "list", "--workspace", &ws]);
    assert_eq!(before.as_array().unwrap().len(), 2);

    run_ok(base.path(), &["doc", "delete", "--workspace", &ws, "--doc", &drop]);

    let after = run_ok(base.path(), &["doc", "list", "--workspace", &ws]);
    let ids: Vec<&str> = after
        .as_array()
        .unwrap()
        .iter()
        .map(|p| p["id"].as_str().unwrap())
        .collect();
    assert!(ids.contains(&keep.as_str()), "kept doc should remain");
    assert!(!ids.contains(&drop.as_str()), "deleted doc should be gone");

    // Reading the deleted doc should now fail.
    let err = run_err(
        base.path(),
        &["doc", "read", "--workspace", &ws, "--doc", &drop, "--format", "md"],
    );
    assert_eq!(err["ok"], Value::Bool(false));
}

#[test]
fn blob_put_get_round_trips_bytes() {
    let base = TempBase::new("blob");
    let ws = create_ws(base.path(), "WS");

    // Write a source file.
    let src = base.path().join("payload.txt");
    std::fs::write(&src, b"hello blob world").unwrap();

    let put = run_ok(
        base.path(),
        &[
            "blob",
            "put",
            "--workspace",
            &ws,
            "--file",
            src.to_str().unwrap(),
            "--key",
            "K1",
            "--mime",
            "text/plain",
        ],
    );
    assert_eq!(put["key"], "K1");
    assert_eq!(put["mime"], "text/plain");
    assert_eq!(put["size"], 16);

    // Get to a file and compare bytes.
    let out = base.path().join("out.txt");
    let got = run_ok(
        base.path(),
        &[
            "blob",
            "get",
            "--workspace",
            &ws,
            "--key",
            "K1",
            "--out",
            out.to_str().unwrap(),
        ],
    );
    assert_eq!(got["key"], "K1");
    assert_eq!(got["mime"], "text/plain");
    let bytes = std::fs::read(&out).unwrap();
    assert_eq!(bytes, b"hello blob world");

    // Get without --out returns base64.
    let got_b64 = run_ok(base.path(), &["blob", "get", "--workspace", &ws, "--key", "K1"]);
    let b64 = got_b64["dataBase64"].as_str().unwrap();
    let decoded = base64_simd::STANDARD.decode_to_vec(b64).unwrap();
    assert_eq!(decoded, b"hello blob world");
}

#[test]
fn blob_put_default_mime_and_list() {
    let base = TempBase::new("bloblist");
    let ws = create_ws(base.path(), "WS");

    let src = base.path().join("a.bin");
    std::fs::write(&src, b"\x00\x01\x02").unwrap();
    let put = run_ok(
        base.path(),
        &[
            "blob",
            "put",
            "--workspace",
            &ws,
            "--file",
            src.to_str().unwrap(),
            "--key",
            "A",
        ],
    );
    assert_eq!(put["mime"], "application/octet-stream");

    let src2 = base.path().join("b.bin");
    std::fs::write(&src2, b"xyz").unwrap();
    run_ok(
        base.path(),
        &[
            "blob",
            "put",
            "--workspace",
            &ws,
            "--file",
            src2.to_str().unwrap(),
            "--key",
            "B",
        ],
    );

    let list = run_ok(base.path(), &["blob", "list", "--workspace", &ws]);
    let arr = list.as_array().unwrap();
    assert_eq!(arr.len(), 2);
    let keys: Vec<&str> = arr.iter().map(|b| b["key"].as_str().unwrap()).collect();
    assert!(keys.contains(&"A"));
    assert!(keys.contains(&"B"));
    assert!(arr.iter().all(|b| b.get("createdAt").is_some()));
}

#[test]
fn blob_get_missing_errors() {
    let base = TempBase::new("blobmiss");
    let ws = create_ws(base.path(), "WS");
    let err = run_err(
        base.path(),
        &["blob", "get", "--workspace", &ws, "--key", "nonexistent"],
    );
    assert_eq!(err["ok"], Value::Bool(false));
}

#[test]
fn search_finds_doc_by_body_term() {
    let base = TempBase::new("search");
    let ws = create_ws(base.path(), "WS");
    let doc = create_doc(
        base.path(),
        &ws,
        "Quarterly Report",
        "# Quarterly Report\n\nrevenue grew in Q3",
    );

    let v = run_ok(base.path(), &["search", "--workspace", &ws, "--query", "revenue"]);
    let arr = v.as_array().expect("search array");
    assert!(
        arr.iter().any(|h| h["docId"] == doc.as_str()),
        "search for 'revenue' should hit the created doc; got {arr:?}"
    );
}

#[test]
fn search_finds_doc_by_title_term() {
    let base = TempBase::new("searchtitle");
    let ws = create_ws(base.path(), "WS");
    let doc = create_doc(base.path(), &ws, "Quarterly Report", "# Quarterly Report\n\nsome body");

    let v = run_ok(base.path(), &["search", "--workspace", &ws, "--query", "quarterly"]);
    let arr = v.as_array().unwrap();
    assert!(
        arr.iter().any(|h| h["docId"] == doc.as_str()),
        "title term search should hit; got {arr:?}"
    );
}

#[test]
fn search_no_match_returns_empty_array() {
    let base = TempBase::new("searchnone");
    let ws = create_ws(base.path(), "WS");
    create_doc(base.path(), &ws, "Doc", "# Doc\n\nhello");

    let v = run_ok(base.path(), &["search", "--workspace", &ws, "--query", "zzzznomatch"]);
    assert_eq!(v.as_array().unwrap().len(), 0);
}

#[test]
fn search_persists_snapshots_for_second_process() {
    let base = TempBase::new("searchpersist");
    let ws = create_ws(base.path(), "WS");
    let doc = create_doc(base.path(), &ws, "Persisted", "# Persisted\n\nturnover figures");

    // First search builds + flushes the index.
    let _ = run_ok(base.path(), &["search", "--workspace", &ws, "--query", "turnover"]);

    // idx_snapshots should now have a row for doc:title.
    let db = base
        .path()
        .join("workspaces")
        .join("local")
        .join(&ws)
        .join("storage.db");
    assert!(db.exists());

    // Second invocation (fresh process) still finds it.
    let v = run_ok(base.path(), &["search", "--workspace", &ws, "--query", "turnover"]);
    assert!(
        v.as_array().unwrap().iter().any(|h| h["docId"] == doc.as_str()),
        "second-process search should still hit"
    );
}

#[test]
fn pretty_flag_emits_multiline_json() {
    let base = TempBase::new("pretty");
    create_ws(base.path(), "WS");
    let out = run_raw(base.path(), &["--pretty", "workspace", "list"]);
    assert!(out.status.success());
    let s = String::from_utf8_lossy(&out.stdout);
    assert!(s.contains('\n'), "pretty output should be multi-line: {s}");
}

// ----------------------------------------------------------------------------
// Runtime guards
// ----------------------------------------------------------------------------

#[test]
fn mutating_commands_refuse_reserved_doc_ids() {
    let base = TempBase::new("reserved-ids");
    let ws = create_ws(base.path(), "Guard");
    let _doc = create_doc(base.path(), &ws, "Doc", "# t\n\nbody");

    // The workspace's root doc (doc id == workspace id) is the page registry - deleting it
    // would destroy the workspace. Must be rejected before anything is written.
    let v = run_err(base.path(), &["doc", "delete", "--workspace", &ws, "--doc", &ws]);
    assert_eq!(v["error"], "config", "root-doc delete must be rejected: {v}");

    // Internal database docs must be rejected on every mutating path.
    let v = run_err(
        base.path(),
        &[
            "doc",
            "update",
            "--workspace",
            &ws,
            "--doc",
            "db$docProperties",
            "--content",
            "# nope",
        ],
    );
    assert_eq!(v["error"], "config", "db$ update must be rejected: {v}");
    let v = run_err(
        base.path(),
        &["doc", "set-title", "--workspace", &ws, "--doc", &ws, "--title", "X"],
    );
    assert_eq!(v["error"], "config", "root-doc set-title must be rejected: {v}");

    // Nothing was destroyed: the workspace still lists its one doc.
    let v = run_ok(base.path(), &["doc", "list", "--workspace", &ws]);
    assert_eq!(v.as_array().unwrap().len(), 1, "doc survives the rejected mutations");
}

#[test]
fn writes_refused_while_db_open_elsewhere_and_force_overrides() {
    let base = TempBase::new("locked");
    let ws = create_ws(base.path(), "Locked");

    // Hold a real WAL connection to the workspace DB from THIS process. The CLI subprocess
    // must detect SQLite's dead-man-switch lock on the -shm file and refuse to write.
    let db = base
        .path()
        .join("workspaces")
        .join("local")
        .join(&ws)
        .join("storage.db");
    use affine_nbstore::pool::SqliteDocStoragePool;
    let rt = tokio::runtime::Runtime::new().expect("rt");
    let pool = SqliteDocStoragePool::default();
    rt.block_on(async {
        let uid = "@peer(local);@type(workspace);@id(holder);".to_string();
        pool.connect(uid.clone(), db.to_string_lossy().into_owned())
            .await
            .expect("connect holder");
        let s = pool.get(uid).await.expect("get holder");
        // The pool connects lazily - run a real query so a connection (and its WAL DMS lock)
        // actually exists, and stays checked into the pool (idle timeout is minutes).
        let _ = s.get_doc_snapshot("warmup".to_string()).await.expect("warmup query");
    });

    let v = run_err(
        base.path(),
        &["doc", "create", "--workspace", &ws, "--title", "T", "--content", "# c"],
    );
    assert_eq!(v["error"], "locked", "write while DB held elsewhere must refuse: {v}");

    // --force bypasses the guard.
    let v = run_ok(
        base.path(),
        &[
            "--force",
            "doc",
            "create",
            "--workspace",
            &ws,
            "--title",
            "T",
            "--content",
            "# c",
        ],
    );
    assert_eq!(v["ok"], json_true());

    // Read-only commands are not guarded even while the DB is held open.
    let v = run_ok(base.path(), &["doc", "list", "--workspace", &ws]);
    assert_eq!(v.as_array().unwrap().len(), 1);

    drop(pool);
    drop(rt);
}

#[test]
fn workspace_list_survives_a_corrupt_workspace_db() {
    let base = TempBase::new("corrupt-ws");
    let ws = create_ws(base.path(), "Good");
    let _doc = create_doc(base.path(), &ws, "Doc", "# ok");

    // Fabricate a sibling workspace whose storage.db is garbage.
    let bad_dir = base.path().join("workspaces").join("local").join("corrupt-ws-id");
    std::fs::create_dir_all(&bad_dir).unwrap();
    std::fs::write(bad_dir.join("storage.db"), b"this is not a sqlite database").unwrap();

    let v = run_ok(base.path(), &["workspace", "list"]);
    let list = v.as_array().expect("list array");
    assert_eq!(list.len(), 2, "both workspaces appear: {v}");
    let good = list.iter().find(|w| w["id"] == ws.as_str()).expect("good ws listed");
    assert_eq!(good["docCount"], 1);
    let bad = list.iter().find(|w| w["id"] == "corrupt-ws-id").expect("bad ws listed");
    assert!(
        bad["error"].as_str().is_some_and(|e| !e.is_empty()),
        "corrupt workspace reports an error field: {bad}"
    );
}

// ----------------------------------------------------------------------------
// JSON contract for command-line usage errors
// ----------------------------------------------------------------------------

#[test]
fn unknown_subcommand_emits_json_usage_error_with_exit_2() {
    let base = TempBase::new("usage-unknown");
    let out = run_raw(base.path(), &["bogus"]);
    assert_eq!(out.status.code(), Some(2), "usage errors keep clap's exit code 2");
    let stdout = String::from_utf8_lossy(&out.stdout);
    let v: Value = serde_json::from_str(stdout.trim())
        .unwrap_or_else(|e| panic!("usage error stdout was not JSON: {e}\nstdout: {stdout}"));
    assert_eq!(v["ok"], Value::Bool(false));
    assert_eq!(v["error"], "usage");
    assert!(
        v["message"].as_str().is_some_and(|m| m.contains("bogus")),
        "message names the offending token: {v}"
    );
    assert!(
        out.stderr.is_empty(),
        "nothing on stderr: {}",
        String::from_utf8_lossy(&out.stderr)
    );
}

#[test]
fn missing_required_flag_emits_json_usage_error_with_exit_2() {
    let base = TempBase::new("usage-missing");
    // `doc read` requires --doc; also exercise --pretty from argv on the failure path.
    let out = run_raw(base.path(), &["doc", "read", "--workspace", "w", "--pretty"]);
    assert_eq!(out.status.code(), Some(2));
    let stdout = String::from_utf8_lossy(&out.stdout);
    let v: Value = serde_json::from_str(stdout.trim()).expect("JSON on stdout");
    assert_eq!(v["error"], "usage");
    assert!(v["message"].as_str().is_some_and(|m| m.contains("--doc")), "{v}");
    assert!(
        stdout.trim().contains('\n'),
        "--pretty honored for usage errors: {stdout}"
    );
}

#[test]
fn help_and_version_keep_plain_text_and_exit_0() {
    let base = TempBase::new("usage-help");
    for flag in ["--help", "--version"] {
        let out = run_raw(base.path(), &[flag]);
        assert_eq!(out.status.code(), Some(0), "{flag} exits 0");
        let stdout = String::from_utf8_lossy(&out.stdout);
        assert!(
            !stdout.trim_start().starts_with('{'),
            "{flag} prints plain text, not JSON: {stdout}"
        );
        assert!(!stdout.trim().is_empty(), "{flag} prints something");
    }
    let out = run_raw(base.path(), &["--help"]);
    assert!(String::from_utf8_lossy(&out.stdout).contains("Usage"));
}

// ----------------------------------------------------------------------------
// Schema check: refuse to migrate an existing workspace DB implicitly
// ----------------------------------------------------------------------------

/// Run raw SQL against a workspace DB file through sqlx (the same driver nbstore uses), then
/// close the connection so the WAL is checkpointed before the CLI reopens the file.
fn sql_exec(db: &Path, sql: &str) {
    use sqlx::ConnectOptions;
    use sqlx::Connection;
    let rt = tokio::runtime::Runtime::new().expect("rt");
    rt.block_on(async {
        let mut conn = sqlx::sqlite::SqliteConnectOptions::new()
            .filename(db)
            .connect()
            .await
            .expect("open db");
        sqlx::raw_sql(sql).execute(&mut conn).await.expect("exec sql");
        conn.close().await.expect("close db");
    });
}

/// Applied migration versions recorded in `_sqlx_migrations`.
fn applied_migrations(db: &Path) -> Vec<i64> {
    use sqlx::ConnectOptions;
    use sqlx::Connection;
    use sqlx::Row;
    let rt = tokio::runtime::Runtime::new().expect("rt");
    rt.block_on(async {
        let mut conn = sqlx::sqlite::SqliteConnectOptions::new()
            .filename(db)
            .read_only(true)
            .connect()
            .await
            .expect("open db");
        let rows = sqlx::query("SELECT version FROM _sqlx_migrations ORDER BY version")
            .fetch_all(&mut conn)
            .await
            .expect("select");
        conn.close().await.expect("close db");
        rows.iter().map(|r| r.get::<i64, _>("version")).collect()
    })
}

fn ws_db(base: &Path, ws: &str) -> PathBuf {
    base.join("workspaces").join("local").join(ws).join("storage.db")
}

/// Roll the DB back one migration: drop the last migration's row AND the table it created, so
/// re-applying it under `--allow-migrate` succeeds. Pinned to the current tail of the nbstore
/// migration list; the assertion makes a list change fail here loudly rather than mysteriously.
fn roll_back_last_migration(db: &Path) -> i64 {
    let migrator = affine_schema::get_migrator();
    let last = migrator
        .iter()
        .rfind(|m| m.migration_type != sqlx::migrate::MigrationType::ReversibleDown)
        .expect("at least one migration");
    assert_eq!(
        last.description.as_ref(),
        "add_indexer_sync",
        "nbstore's last migration changed; update roll_back_last_migration's DROP statement"
    );
    sql_exec(
        db,
        &format!(
            "DELETE FROM _sqlx_migrations WHERE version = {}; DROP TABLE indexer_sync;",
            last.version
        ),
    );
    last.version
}

#[test]
fn doc_read_on_current_schema_succeeds_without_warnings() {
    let base = TempBase::new("schema-current");
    let ws = create_ws(base.path(), "Schema");
    let doc = create_doc(base.path(), &ws, "Doc", "# hi");
    let v = run_ok(base.path(), &["doc", "read", "--workspace", &ws, "--doc", &doc]);
    assert_eq!(v["ok"], json_true());
    assert!(v.get("warnings").is_none(), "no warnings on a current-schema DB: {v}");
}

#[test]
fn doc_read_refuses_db_behind_schema_unless_allow_migrate() {
    let base = TempBase::new("schema-behind");
    let ws = create_ws(base.path(), "Schema");
    let doc = create_doc(base.path(), &ws, "Doc", "# hi");
    let db = ws_db(base.path(), &ws);

    let last = roll_back_last_migration(&db);
    let before = applied_migrations(&db);
    assert!(!before.contains(&last));

    // Read-only command on a behind-schema DB: refused, and nothing was migrated.
    let out = run_raw(base.path(), &["doc", "read", "--workspace", &ws, "--doc", &doc]);
    assert_eq!(out.status.code(), Some(1));
    let v: Value = serde_json::from_str(String::from_utf8_lossy(&out.stdout).trim()).expect("JSON");
    assert_eq!(v["ok"], Value::Bool(false));
    assert_eq!(v["error"], "migration_required", "{v}");
    assert!(
        v["message"].as_str().is_some_and(|m| m.contains("--allow-migrate")),
        "{v}"
    );
    assert_eq!(
        applied_migrations(&db),
        before,
        "refusal must not touch _sqlx_migrations"
    );

    // Mutating commands are refused the same way (the check runs before nbstore opens the file).
    let v = run_err(
        base.path(),
        &["doc", "update", "--workspace", &ws, "--doc", &doc, "--content", "x"],
    );
    assert_eq!(v["error"], "migration_required", "{v}");
    assert_eq!(applied_migrations(&db), before);

    // `workspace list` degrades to a per-entry error instead of failing wholesale.
    let v = run_ok(base.path(), &["workspace", "list"]);
    let entry = v
        .as_array()
        .unwrap()
        .iter()
        .find(|w| w["id"] == ws.as_str())
        .expect("listed");
    assert!(entry["error"].as_str().is_some_and(|e| e.contains("behind")), "{entry}");

    // Opt in: the CLI migrates, says so in `warnings`, and the DB is current afterwards.
    let v = run_ok(
        base.path(),
        &["doc", "read", "--workspace", &ws, "--doc", &doc, "--allow-migrate"],
    );
    assert_eq!(v["ok"], json_true());
    let warnings = v["warnings"].as_array().expect("warnings array present");
    assert!(
        warnings
            .iter()
            .any(|w| w.as_str().is_some_and(|s| s.contains("--allow-migrate"))),
        "{v}"
    );
    assert!(applied_migrations(&db).contains(&last));

    let v = run_ok(base.path(), &["doc", "read", "--workspace", &ws, "--doc", &doc]);
    assert_eq!(v["ok"], json_true());
    assert!(v.get("warnings").is_none(), "{v}");
}

#[test]
fn doc_read_refuses_db_newer_than_cli() {
    let base = TempBase::new("schema-newer");
    let ws = create_ws(base.path(), "Schema");
    let doc = create_doc(base.path(), &ws, "Doc", "# hi");
    let db = ws_db(base.path(), &ws);

    sql_exec(
        &db,
        "INSERT INTO _sqlx_migrations (version, description, success, checksum, execution_time) \
         VALUES (999, 'from_the_future', 1, X'00', 0);",
    );
    let before = applied_migrations(&db);

    for extra in [&[][..], &["--allow-migrate"][..]] {
        let mut args = vec!["doc", "read", "--workspace", &ws, "--doc", &doc];
        args.extend_from_slice(extra);
        let v = run_err(base.path(), &args);
        assert_eq!(v["error"], "db_newer", "{v}");
        assert!(v["message"].as_str().is_some_and(|m| m.contains("999")), "{v}");
    }
    assert_eq!(
        applied_migrations(&db),
        before,
        "refusal must not touch _sqlx_migrations"
    );
}

// ----------------------------------------------------------------------------
// Workspace client id + write lease (src/lease.rs)
// ----------------------------------------------------------------------------

/// `<base>/workspaces/local/<ws>/affine-cli.client`.
fn ws_client_file(base: &Path, ws: &str) -> PathBuf {
    base.join("workspaces")
        .join("local")
        .join(ws)
        .join(affine_cli::lease::CLIENT_FILE)
}

/// Every y-octo client that has an item in the stored doc, read back from the update blobs.
fn stored_doc_clients(base: &Path, ws: &str, doc_id: &str) -> Vec<u64> {
    let mut doc: Doc = DocOptions::new().build();
    for b in read_doc_update_blobs(&ws_db(base, ws), doc_id) {
        if b.is_empty() || b.as_slice() == [0, 0] {
            continue;
        }
        doc.apply_update_from_binary_v1(&b).expect("apply stored update");
    }
    let mut clients = doc.clients();
    clients.sort_unstable();
    clients
}

#[test]
fn repeated_writes_reuse_one_client_id() {
    // Regression: every invocation used to mint a fresh y-octo client id, so an agent editing a
    // doc N times left N dead entries in that doc's state vector forever.
    let base = TempBase::new("client-reuse");
    let ws = create_ws(base.path(), "Reuse");
    let doc = create_doc(base.path(), &ws, "Doc", "# Doc\n\nv0");

    for i in 1..=5 {
        let v = run_ok(
            base.path(),
            &[
                "doc",
                "update",
                "--workspace",
                &ws,
                "--doc",
                &doc,
                "--content",
                &format!("# Doc\n\nv{i}"),
            ],
        );
        assert_eq!(v["ok"], json_true());
    }

    let persisted: u64 = std::fs::read_to_string(ws_client_file(base.path(), &ws))
        .expect("client id file")
        .trim()
        .parse()
        .expect("client id is a u64");

    for target in [doc.as_str(), ws.as_str()] {
        assert_eq!(
            stored_doc_clients(base.path(), &ws, target),
            vec![persisted],
            "doc {target} should carry exactly the workspace's one CLI client"
        );
    }
}

#[test]
fn write_while_lease_is_held_reports_busy() {
    let base = TempBase::new("lease-busy");
    let ws = create_ws(base.path(), "Busy");
    let doc = create_doc(base.path(), &ws, "Doc", "# Doc\n\nbody");

    // Hold the lease from this process; `flock` is per open file description, so the CLI's own
    // open of the same path conflicts.
    let held = affine_cli::lease::WriteLease::acquire(&ws_client_file(base.path(), &ws)).expect("hold lease");

    let v = run_err(
        base.path(),
        &["doc", "update", "--workspace", &ws, "--doc", &doc, "--content", "# x"],
    );
    assert_eq!(v["error"], "busy", "{v}");

    // Read-only commands never take the lease, so they still work while it is held.
    let read = run_ok(base.path(), &["doc", "read", "--workspace", &ws, "--doc", &doc]);
    assert_eq!(read["ok"], json_true());

    drop(held);
    let v = run_ok(
        base.path(),
        &["doc", "update", "--workspace", &ws, "--doc", &doc, "--content", "# x"],
    );
    assert_eq!(v["ok"], json_true(), "the write must succeed once the lease is free");
}

#[test]
fn malformed_client_id_file_is_regenerated_with_a_warning() {
    let base = TempBase::new("client-malformed");
    let ws = create_ws(base.path(), "Malformed");
    let doc = create_doc(base.path(), &ws, "Doc", "# Doc\n\nbody");

    let client_file = ws_client_file(base.path(), &ws);
    std::fs::write(&client_file, "not-a-client-id\n").expect("corrupt the client id file");

    let v = run_ok(
        base.path(),
        &["doc", "update", "--workspace", &ws, "--doc", &doc, "--content", "# x"],
    );
    let warnings = v["warnings"].as_array().cloned().unwrap_or_default();
    assert!(
        warnings
            .iter()
            .any(|w| w.as_str().is_some_and(|s| s.contains("client id file"))),
        "expected a regeneration warning, got {v}"
    );

    let regenerated: u64 = std::fs::read_to_string(&client_file)
        .expect("client id file")
        .trim()
        .parse()
        .expect("client id is a u64 again");
    assert_ne!(regenerated, 0);
}
