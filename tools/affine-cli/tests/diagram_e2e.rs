//! End-to-end Phase 2 (diagram) tests: drive the compiled `affine-cli` binary against a
//! throwaway `--affine-dir`, then decode the stored page doc's `prop:elements.value` map
//! directly with y-octo to assert per-field correctness (Proof A), plus round-trip through
//! the production reader via `doc read --format json` (Proof B).

use std::path::{Path, PathBuf};
use std::process::Command;

use serde_json::Value;
use y_octo::{Any, Doc, DocOptions, Map};

struct TempBase(PathBuf);

impl TempBase {
    fn new(tag: &str) -> Self {
        let mut p = std::env::temp_dir();
        let unique = format!("affine-cli-diag-{tag}-{}-{}", std::process::id(), nanoid::nanoid!(8));
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

fn run_raw(base: &Path, args: &[&str]) -> std::process::Output {
    let bin = env!("CARGO_BIN_EXE_affine-cli");
    let mut cmd = Command::new(bin);
    cmd.arg("--affine-dir").arg(base);
    // nanoid ids can begin with '-'; join `--flag <value>` -> `--flag=value` for such values.
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

fn run_ok(base: &Path, args: &[&str]) -> Value {
    let out = run_raw(base, args);
    assert!(
        out.status.success(),
        "expected success for {args:?}, got {:?}\nstdout: {}\nstderr: {}",
        out.status.code(),
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr),
    );
    let stdout = String::from_utf8_lossy(&out.stdout);
    serde_json::from_str(stdout.trim())
        .unwrap_or_else(|e| panic!("stdout not JSON for {args:?}: {e}\nstdout: {stdout}"))
}

fn run_err(base: &Path, args: &[&str]) -> Value {
    let out = run_raw(base, args);
    assert!(
        !out.status.success(),
        "expected failure for {args:?}, but it succeeded\nstdout: {}",
        String::from_utf8_lossy(&out.stdout)
    );
    let stdout = String::from_utf8_lossy(&out.stdout);
    serde_json::from_str(stdout.trim()).unwrap_or_else(|e| panic!("error stdout not JSON: {e}\n{stdout}"))
}

fn create_ws(base: &Path, name: &str) -> String {
    let v = run_ok(base, &["workspace", "create", "--name", name]);
    v["id"].as_str().expect("ws id").to_string()
}

fn create_doc(base: &Path, ws: &str, title: &str) -> String {
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
            "# x\n\nbody",
        ],
    );
    v["docId"].as_str().expect("doc id").to_string()
}

/// Re-merge the page doc's stored snapshot+updates and return the owning `Doc` plus the surface
/// `prop:elements.value` element map, decoded directly with y-octo (Proof A). The `Doc` MUST be
/// kept alive by the caller: y-octo `Map` handles are weak-backed views into the live `Doc`.
fn decode_surface_value(base: &Path, peer: &str, ws: &str, doc_id: &str) -> (Doc, Map) {
    let db = base.join("workspaces").join(peer).join(ws).join("storage.db");
    assert!(db.exists(), "storage.db should exist at {db:?}");

    use affine_nbstore::pool::SqliteDocStoragePool;
    let rt = tokio::runtime::Runtime::new().expect("rt");
    let blobs = rt.block_on(async {
        let pool = SqliteDocStoragePool::default();
        let uid = "@peer(local);@type(workspace);@id(probe);".to_string();
        pool.connect(uid.clone(), db.to_string_lossy().into_owned())
            .await
            .expect("connect probe");
        let s = pool.get(uid).await.expect("get probe");
        let mut out: Vec<Vec<u8>> = Vec::new();
        if let Some(snap) = s.get_doc_snapshot(doc_id.to_string()).await.expect("snapshot") {
            out.push(snap.bin);
        }
        for u in s.get_doc_updates(doc_id.to_string()).await.expect("updates") {
            out.push(u.bin);
        }
        out
    });

    let mut doc: Doc = DocOptions::new().build();
    for b in &blobs {
        if b.is_empty() || b.as_slice() == [0, 0] {
            continue;
        }
        doc.apply_update_from_binary_v1(b).expect("apply page update");
    }

    let blocks = doc.get_map("blocks").expect("blocks map");
    let surface = blocks
        .iter()
        .find_map(|(_, v)| {
            let m = v.to_map()?;
            match m.get("sys:flavour").and_then(|f| f.to_any()) {
                Some(Any::String(s)) if s == "affine:surface" => Some(m),
                _ => None,
            }
        })
        .expect("surface block present");
    let boxed = surface
        .get("prop:elements")
        .and_then(|v| v.to_map())
        .expect("prop:elements");
    assert_eq!(
        boxed.get("type").and_then(|v| v.to_any()),
        Some(Any::String("$blocksuite:internal:native$".to_string())),
        "Boxed native-type marker must be preserved"
    );
    let vm = boxed.get("value").and_then(|v| v.to_map()).expect("value map");
    (doc, vm)
}

fn any_str(el: &Map, key: &str) -> Option<String> {
    match el.get(key).and_then(|v| v.to_any()) {
        Some(Any::String(s)) => Some(s),
        _ => None,
    }
}

// ----------------------------------------------------------------------------

#[test]
fn add_shape_persists_element_with_fields() {
    let base = TempBase::new("shape");
    let ws = create_ws(base.path(), "WS");
    let doc = create_doc(base.path(), &ws, "Diagram");

    let v = run_ok(
        base.path(),
        &[
            "diagram",
            "add-shape",
            "--workspace",
            &ws,
            "--doc",
            &doc,
            "--xywh",
            "[100,100,200,100]",
            "--shape-type",
            "rect",
            "--text",
            "Hello",
        ],
    );
    assert_eq!(v["ok"], Value::Bool(true));
    assert_eq!(v["type"], "shape");
    let element_id = v["elementId"].as_str().expect("elementId").to_string();

    let (_doc, value) = decode_surface_value(base.path(), "local", &ws, &doc);
    assert_eq!(value.len(), 1, "exactly one element");
    let el = value.get(&element_id).and_then(|x| x.to_map()).expect("element");
    assert_eq!(
        any_str(&el, "id").as_deref(),
        Some(element_id.as_str()),
        "key == id field"
    );
    assert_eq!(any_str(&el, "type").as_deref(), Some("shape"));
    assert_eq!(any_str(&el, "shapeType").as_deref(), Some("rect"));
    assert_eq!(any_str(&el, "xywh").as_deref(), Some("[100,100,200,100]"));
    assert_eq!(any_str(&el, "index").as_deref(), Some("a0"));
    assert!(el.get("seed").and_then(|x| x.to_any()).is_some(), "seed present");
    let text = el.get("text").and_then(|x| x.to_text()).expect("Y.Text");
    assert_eq!(text.to_string(), "Hello");
}

#[test]
fn add_shape_sets_doc_edgeless() {
    let base = TempBase::new("edgeless");
    let ws = create_ws(base.path(), "WS");
    let doc = create_doc(base.path(), &ws, "D");
    run_ok(
        base.path(),
        &["diagram", "add-shape", "--workspace", &ws, "--doc", &doc],
    );
    // doc list still works, and the surface element exists -> doc became edgeless silently.
    // We assert edgeless by reading the db$docProperties row via the surface decode helper's db.
    let (_doc, value) = decode_surface_value(base.path(), "local", &ws, &doc);
    assert_eq!(value.len(), 1);
}

#[test]
fn connector_source_target_decode_as_objects() {
    let base = TempBase::new("conn");
    let ws = create_ws(base.path(), "WS");
    let doc = create_doc(base.path(), &ws, "Flow");

    let a = run_ok(
        base.path(),
        &[
            "diagram",
            "add-shape",
            "--workspace",
            &ws,
            "--doc",
            &doc,
            "--shape-type",
            "rect",
        ],
    );
    let a_id = a["elementId"].as_str().unwrap().to_string();
    let b = run_ok(
        base.path(),
        &[
            "diagram",
            "add-shape",
            "--workspace",
            &ws,
            "--doc",
            &doc,
            "--shape-type",
            "ellipse",
        ],
    );
    let b_id = b["elementId"].as_str().unwrap().to_string();

    let c = run_ok(
        base.path(),
        &[
            "diagram",
            "add-connector",
            "--workspace",
            &ws,
            "--doc",
            &doc,
            "--from",
            &a_id,
            "--to",
            &b_id,
            "--mode",
            "elbow",
            "--label",
            "yes",
        ],
    );
    let c_id = c["elementId"].as_str().unwrap().to_string();

    let (_doc, value) = decode_surface_value(base.path(), "local", &ws, &doc);
    assert_eq!(value.len(), 3, "two shapes + one connector");
    let el = value.get(&c_id).and_then(|x| x.to_map()).expect("connector");
    assert_eq!(any_str(&el, "type").as_deref(), Some("connector"));
    assert_eq!(any_str(&el, "xywh").as_deref(), Some("[0,0,0,0]"));
    assert_eq!(el.get("mode").and_then(|x| x.to_any()), Some(Any::Integer(1)));

    match el.get("source").and_then(|x| x.to_any()) {
        Some(Any::Object(m)) => assert_eq!(m.get("id"), Some(&Any::String(a_id.clone()))),
        other => panic!("source should be Any::Object{{id}}, got {other:?}"),
    }
    match el.get("target").and_then(|x| x.to_any()) {
        Some(Any::Object(m)) => assert_eq!(m.get("id"), Some(&Any::String(b_id.clone()))),
        other => panic!("target should be Any::Object{{id}}, got {other:?}"),
    }
    // connector label round-trips.
    let label = el.get("text").and_then(|x| x.to_text()).expect("label Y.Text");
    assert_eq!(label.to_string(), "yes");
}

#[test]
fn two_elements_get_ordered_fractional_indices() {
    let base = TempBase::new("idx");
    let ws = create_ws(base.path(), "WS");
    let doc = create_doc(base.path(), &ws, "Idx");

    run_ok(
        base.path(),
        &["diagram", "add-shape", "--workspace", &ws, "--doc", &doc],
    );
    run_ok(
        base.path(),
        &["diagram", "add-shape", "--workspace", &ws, "--doc", &doc],
    );

    let (_doc, value) = decode_surface_value(base.path(), "local", &ws, &doc);
    let mut indices: Vec<String> = value
        .values()
        .filter_map(|v| v.to_map())
        .filter_map(|el| any_str(&el, "index"))
        .collect();
    indices.sort();
    assert_eq!(indices.len(), 2);
    assert_eq!(indices[0], "a0", "first element gets the initial index");
    assert!(indices[0] < indices[1], "indices strictly ascending: {indices:?}");
}

#[test]
fn add_text_element_round_trips_through_reader() {
    let base = TempBase::new("text");
    let ws = create_ws(base.path(), "WS");
    let doc = create_doc(base.path(), &ws, "T");

    let v = run_ok(
        base.path(),
        &[
            "diagram",
            "add-text",
            "--workspace",
            &ws,
            "--doc",
            &doc,
            "--text",
            "Standalone",
            "--xywh",
            "[10,10,120,30]",
        ],
    );
    assert_eq!(v["type"], "text");

    // Proof B: production reader surfaces the element text.
    let read = run_ok(
        base.path(),
        &["doc", "read", "--workspace", &ws, "--doc", &doc, "--format", "json"],
    );
    let surface = read["blocks"]
        .as_array()
        .unwrap()
        .iter()
        .find(|b| b["flavour"] == "affine:surface")
        .expect("surface block in reader output");
    let content = surface["content"].as_array().expect("content array");
    assert!(
        content.iter().any(|s| s.as_str() == Some("Standalone")),
        "reader content should include the text element; got {content:?}"
    );
}

#[test]
fn diagram_create_spec_builds_nodes_and_edges() {
    let base = TempBase::new("spec");
    let ws = create_ws(base.path(), "WS");
    let doc = create_doc(base.path(), &ws, "Flowchart");

    let spec = r##"{
        "nodes": [
            {"id":"a","label":"Start","shape":"ellipse"},
            {"id":"b","label":"Decide","shape":"diamond","fill":"#ffe838"},
            {"id":"c","label":"End","shape":"ellipse"}
        ],
        "edges": [
            {"from":"a","to":"b"},
            {"from":"b","to":"c","label":"yes","mode":"elbow"}
        ]
    }"##;
    let spec_path = base.path().join("spec.json");
    std::fs::write(&spec_path, spec).unwrap();

    let v = run_ok(
        base.path(),
        &[
            "diagram",
            "create",
            "--workspace",
            &ws,
            "--doc",
            &doc,
            "--spec",
            spec_path.to_str().unwrap(),
        ],
    );
    assert_eq!(v["ok"], Value::Bool(true));
    assert_eq!(v["nodeCount"], 3);
    assert_eq!(v["edgeCount"], 2);

    // node id -> elementId mapping present.
    let nodes = v["nodes"].as_array().unwrap();
    assert_eq!(nodes.len(), 3);
    let a_eid = nodes
        .iter()
        .find(|n| n["id"] == "a")
        .and_then(|n| n["elementId"].as_str())
        .expect("node a elementId")
        .to_string();

    // Proof A: 3 shapes + 2 connectors persisted.
    let (_doc, value) = decode_surface_value(base.path(), "local", &ws, &doc);
    assert_eq!(value.len(), 5, "3 nodes + 2 edges = 5 elements");

    let mut shapes = 0;
    let mut connectors = 0;
    for v in value.values() {
        if let Some(el) = v.to_map() {
            match any_str(&el, "type").as_deref() {
                Some("shape") => shapes += 1,
                Some("connector") => connectors += 1,
                _ => {}
            }
        }
    }
    assert_eq!(shapes, 3);
    assert_eq!(connectors, 2);

    // The diamond node 'b' carries fill -> fillColor + filled:true.
    let b_eid = nodes
        .iter()
        .find(|n| n["id"] == "b")
        .and_then(|n| n["elementId"].as_str())
        .unwrap();
    let b_el = value.get(b_eid).and_then(|x| x.to_map()).unwrap();
    assert_eq!(any_str(&b_el, "shapeType").as_deref(), Some("diamond"));
    assert_eq!(any_str(&b_el, "fillColor").as_deref(), Some("#ffe838"));
    assert_eq!(b_el.get("filled").and_then(|x| x.to_any()), Some(Any::True));

    // An edge connector anchors to node a's elementId.
    let anchored = value.values().filter_map(|v| v.to_map()).any(|el| {
        any_str(&el, "type").as_deref() == Some("connector")
            && matches!(
                el.get("source").and_then(|x| x.to_any()),
                Some(Any::Object(ref m)) if m.get("id") == Some(&Any::String(a_eid.clone()))
            )
    });
    assert!(anchored, "a connector should anchor to node a's elementId");

    // Proof B: production reader surfaces all node + edge labels (sorted).
    let read = run_ok(
        base.path(),
        &["doc", "read", "--workspace", &ws, "--doc", &doc, "--format", "json"],
    );
    let surface = read["blocks"]
        .as_array()
        .unwrap()
        .iter()
        .find(|b| b["flavour"] == "affine:surface")
        .expect("surface block");
    let content: Vec<String> = surface["content"]
        .as_array()
        .unwrap()
        .iter()
        .map(|s| s.as_str().unwrap().to_string())
        .collect();
    for expected in ["Start", "Decide", "End", "yes"] {
        assert!(
            content.contains(&expected.to_string()),
            "reader content should include {expected:?}; got {content:?}"
        );
    }
}

#[test]
fn add_shape_missing_doc_errors() {
    let base = TempBase::new("miss");
    let ws = create_ws(base.path(), "WS");
    let err = run_err(
        base.path(),
        &["diagram", "add-shape", "--workspace", &ws, "--doc", "no-such-doc"],
    );
    assert_eq!(err["ok"], Value::Bool(false));
}

#[test]
fn diagram_create_unknown_edge_node_errors() {
    let base = TempBase::new("badedge");
    let ws = create_ws(base.path(), "WS");
    let doc = create_doc(base.path(), &ws, "D");
    let spec = r#"{"nodes":[{"id":"a"}],"edges":[{"from":"a","to":"ghost"}]}"#;
    let spec_path = base.path().join("spec.json");
    std::fs::write(&spec_path, spec).unwrap();
    let err = run_err(
        base.path(),
        &[
            "diagram",
            "create",
            "--workspace",
            &ws,
            "--doc",
            &doc,
            "--spec",
            spec_path.to_str().unwrap(),
        ],
    );
    assert_eq!(err["ok"], Value::Bool(false));
    assert_eq!(err["error"], "config");
}

#[test]
fn add_shape_rejects_malformed_xywh() {
    let base = TempBase::new("bad-xywh");
    let ws = create_ws(base.path(), "Geom");
    let doc = create_doc(base.path(), &ws, "D");
    // A malformed xywh string written into the doc would throw inside the app's renderer and
    // poison the whole edgeless surface (the labelXYWH postmortem class) — must be rejected.
    for bad in [
        "garbage",
        "[1,2,3]",
        "[a,b,c,d]",
        "[0,0,-5,10]",
        "[0,0,0,10]",
        "[0,0,NaN,10]",
    ] {
        let err = run_err(
            base.path(),
            &["diagram", "add-shape", "--workspace", &ws, "--doc", &doc, "--xywh", bad],
        );
        assert_eq!(err["error"], "config", "xywh '{bad}' must be rejected: {err}");
    }
    // The canonical form still works.
    let ok = run_ok(
        base.path(),
        &[
            "diagram",
            "add-shape",
            "--workspace",
            &ws,
            "--doc",
            &doc,
            "--xywh",
            "[ 10, 20, 30, 40 ]",
        ],
    );
    assert_eq!(ok["ok"], Value::Bool(true));
}

#[test]
fn diagram_create_rejects_duplicate_node_ids() {
    let base = TempBase::new("dup-nodes");
    let ws = create_ws(base.path(), "WS");
    let doc = create_doc(base.path(), &ws, "D");
    let spec = r#"{"nodes":[{"id":"a","label":"one"},{"id":"a","label":"two"}],"edges":[]}"#;
    let spec_path = base.path().join("spec.json");
    std::fs::write(&spec_path, spec).unwrap();
    let err = run_err(
        base.path(),
        &[
            "diagram",
            "create",
            "--workspace",
            &ws,
            "--doc",
            &doc,
            "--spec",
            spec_path.to_str().unwrap(),
        ],
    );
    assert_eq!(err["error"], "config", "duplicate node ids must be rejected: {err}");
}

#[test]
fn diagram_create_replace_is_atomic_single_update() {
    let base = TempBase::new("atomic-create");
    let ws = create_ws(base.path(), "WS");
    let doc = create_doc(base.path(), &ws, "D");

    let spec =
        r#"{"nodes":[{"id":"a","label":"A"},{"id":"b","label":"B"}],"edges":[{"from":"a","to":"b","label":"goes"}]}"#;
    let spec_path = base.path().join("spec.json");
    std::fs::write(&spec_path, spec).unwrap();
    let v1 = run_ok(
        base.path(),
        &[
            "diagram",
            "create",
            "--workspace",
            &ws,
            "--doc",
            &doc,
            "--spec",
            spec_path.to_str().unwrap(),
        ],
    );
    assert_eq!(v1["nodeCount"], 2);

    // Re-run with --replace: the surface holds exactly the new graph, never a stacked copy.
    let v2 = run_ok(
        base.path(),
        &[
            "diagram",
            "create",
            "--workspace",
            &ws,
            "--doc",
            &doc,
            "--spec",
            spec_path.to_str().unwrap(),
            "--replace",
        ],
    );
    assert_eq!(v2["replaced"], Value::Bool(true));

    let (_doc_handle, value) = decode_surface_value(base.path(), "local", &ws, &doc);
    assert_eq!(value.len(), 3, "exactly 2 shapes + 1 connector after --replace re-run");
}
