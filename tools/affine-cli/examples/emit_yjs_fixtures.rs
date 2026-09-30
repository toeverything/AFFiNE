//! Emit binary fixtures covering every CLI write path, for the REAL-yjs decode check
//! (`yjs-compat/check.mjs`, wired into CI by `.github/workflows/affine-cli-yjs-compat.yml`).
//!
//! Why this exists: y-octo's own reader cannot detect encodings that the real browser yjs
//! library decodes differently - the labelXYWH incident (a bare top-level `Any::Array` decoding
//! to its LAST element in yjs, poisoning the whole edgeless surface; see
//! docs/affine-cli-edgeless-render-postmortem.md) was invisible to every Rust round-trip test.
//! So the authoritative check has to cross the language seam: this example writes binaries with
//! the exact library code the CLI ships, and the node script applies them to a `Y.Doc` with the
//! SAME yjs version the app pins, asserting the decoded shapes.
//!
//! Two fixture families are emitted:
//!
//! 1. Full-state binaries (`page_doc.bin`, `diagram_doc.bin`, `root_doc.bin`, `props_doc.bin`):
//!    the original shape-level checks (labelXYWH, Boxed wrapper, latex, root meta, ...).
//! 2. Delta SEQUENCES (`seq/<name>/<i>.bin`): the exact per-row bytes the CLI pushes through
//!    nbstore `push_update`, one file per row, in push order. The app never sees a merged
//!    full state - it decodes these rows one by one - and every deletion-bearing path
//!    (`doc update` structural diff, `diagram create --replace`, `remove_doc_from_root`, table
//!    row removal, key overwrites) produces a delta carrying a delete set. Each row also gets
//!    `<i>.expected.json`: a generic projection of the Y.Doc as y-octo reads it after that row,
//!    plus whatever the CLI's own reader produces, so the node side can compare real yjs's view
//!    against y-octo's view row by row.
//!
//! Usage: cargo run -p affine-cli --example emit_yjs_fixtures -- <outdir>

use affine_cli::engine::{self, ConnectorParams, DiagramEdgeParams, Endpoint, ShapeParams, TextParams};
use serde_json::{Map as JsonMap, Value as Json, json};
use y_octo::{Any, Doc, DocOptions, Map, Value};

// ----------------------------------------------------------------------------
// Generic Y.Doc -> JSON projection (mirrored by `project()` in check.mjs)
// ----------------------------------------------------------------------------

fn any_to_json(a: &Any) -> Json {
    match a {
        Any::Undefined | Any::Null => Json::Null,
        Any::Integer(i) => json!(i),
        Any::Float32(f) => json!(f.into_inner() as f64),
        Any::Float64(f) => json!(f.into_inner()),
        Any::BigInt64(i) => json!(i),
        Any::False => json!(false),
        Any::True => json!(true),
        Any::String(s) => json!(s),
        Any::Object(m) => {
            let mut out = JsonMap::new();
            let mut keys: Vec<&String> = m.keys().collect();
            keys.sort();
            for k in keys {
                out.insert(k.clone(), any_to_json(&m[k]));
            }
            Json::Object(out)
        }
        Any::Array(v) => Json::Array(v.iter().map(any_to_json).collect()),
        Any::Binary(b) => json!({ "$binary": b.len() }),
    }
}

fn value_to_json(v: &Value) -> Json {
    match v {
        Value::Any(a) => any_to_json(a),
        Value::Text(t) => json!({ "$text": t.to_string() }),
        Value::Array(arr) => Json::Array(arr.iter().map(|x| value_to_json(&x)).collect()),
        Value::Map(m) => map_to_json(m),
        other => json!({ "$unsupported": format!("{other:?}") }),
    }
}

fn map_to_json(m: &Map) -> Json {
    let mut entries: Vec<(String, Json)> = m.iter().map(|(k, v)| (k.to_string(), value_to_json(&v))).collect();
    entries.sort_by(|a, b| a.0.cmp(&b.0));
    Json::Object(entries.into_iter().collect())
}

/// Project every root map of a full-state binary. All AFFiNE roots are Y.Maps (`blocks`,
/// `meta`, `spaces`, the `db$docProperties` rows keyed by doc id), so the node side can call
/// `doc.getMap(name)` for each name listed here.
fn project_roots(full: &[u8]) -> Json {
    let mut doc: Doc = DocOptions::new().build();
    doc.apply_update_from_binary_v1(full)
        .expect("apply full state for projection");
    let mut names = doc.keys();
    names.sort();
    let mut out = JsonMap::new();
    for name in names {
        let m = doc.get_map(&name).expect("root is a map");
        out.insert(name, map_to_json(&m));
    }
    Json::Object(out)
}

#[derive(Clone, Copy)]
enum DocKind {
    Page,
    Root,
    Props,
}

impl DocKind {
    fn as_str(self) -> &'static str {
        match self {
            DocKind::Page => "page",
            DocKind::Root => "root",
            DocKind::Props => "props",
        }
    }
}

/// The CLI's own reader output for a full state, so the harness can tie the yjs view back to
/// what `doc read` / `doc list` would print.
fn reader_view(kind: DocKind, full: &[u8], doc_id: &str) -> Json {
    match kind {
        DocKind::Page => {
            let crawl = engine::parse_doc_from_binary(full.to_vec(), doc_id).expect("parse_doc_from_binary");
            let md = engine::parse_doc_to_markdown(full.to_vec(), doc_id).expect("parse_doc_to_markdown");
            json!({
                "title": crawl.title,
                "blocks": crawl.blocks,
                "markdown": md.markdown,
            })
        }
        DocKind::Root => {
            let (name, pages) = engine::read_root_meta(full.to_vec()).expect("read_root_meta");
            json!({ "name": name, "pages": pages })
        }
        DocKind::Props => Json::Null,
    }
}

/// One push sequence: rows are appended in order, `state` is the merged full state after the
/// rows so far (what the NEXT delta is computed against, exactly like `commands::merge_target`).
struct Sequence {
    name: &'static str,
    kind: DocKind,
    doc_id: String,
    description: &'static str,
    rows: Vec<Vec<u8>>,
    state: Vec<u8>,
}

impl Sequence {
    fn new(name: &'static str, kind: DocKind, doc_id: &str, description: &'static str) -> Self {
        Self {
            name,
            kind,
            doc_id: doc_id.to_string(),
            description,
            rows: Vec::new(),
            state: Vec::new(),
        }
    }

    /// Record one pushed row and advance the merged state.
    fn push(&mut self, row: Vec<u8>) {
        let snapshot = if self.state.is_empty() {
            None
        } else {
            Some(self.state.as_slice())
        };
        self.state = engine::merge_doc(snapshot, std::slice::from_ref(&row)).expect("merge row");
        self.rows.push(row);
    }

    fn write(&self, outdir: &str) -> Json {
        let dir = format!("{outdir}/seq/{}", self.name);
        std::fs::create_dir_all(&dir).expect("create seq dir");
        let mut row_files = Vec::new();
        let mut expected_files = Vec::new();
        // Replay so each row's expected projection reflects the state right after that row.
        let mut state: Vec<u8> = Vec::new();
        for (i, row) in self.rows.iter().enumerate() {
            let snapshot = if state.is_empty() { None } else { Some(state.as_slice()) };
            state = engine::merge_doc(snapshot, std::slice::from_ref(row)).expect("merge row");
            let row_file = format!("seq/{}/{i}.bin", self.name);
            std::fs::write(format!("{outdir}/{row_file}"), row).expect("write row");
            let expected = json!({
                "roots": project_roots(&state),
                "reader": reader_view(self.kind, &state, &self.doc_id),
            });
            let expected_file = format!("seq/{}/{i}.expected.json", self.name);
            std::fs::write(
                format!("{outdir}/{expected_file}"),
                serde_json::to_vec_pretty(&expected).unwrap(),
            )
            .expect("write expected");
            row_files.push(row_file);
            expected_files.push(expected_file);
        }
        eprintln!("wrote seq/{} ({} rows)", self.name, self.rows.len());
        json!({
            "name": self.name,
            "kind": self.kind.as_str(),
            "docId": self.doc_id,
            "description": self.description,
            "rows": row_files,
            "expected": expected_files,
        })
    }
}

fn shape(xywh: &str, kind: &str, text: &str, seed: i32) -> ShapeParams {
    ShapeParams {
        xywh: xywh.to_string(),
        shape_type: kind.to_string(),
        fill: None,
        stroke: None,
        text: Some(text.to_string()),
        seed: Some(seed),
    }
}

fn main() {
    let outdir = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "/tmp/affine-cli-yjs-fixtures".to_string());
    std::fs::create_dir_all(&outdir).expect("create outdir");
    let out = |name: &str, bytes: &[u8]| {
        let p = format!("{outdir}/{name}");
        std::fs::write(&p, bytes).expect("write fixture");
        eprintln!("wrote {p} ({} bytes)", bytes.len());
    };

    // ---- page doc: markdown (incl. inline + block math), surface elements, latex block ----
    let md = "# Fixture\n\nInline math $E = mc^2$ in a paragraph.\n\n$$\n\\int_0^1 x^2 dx\n$$\n\nplain tail";
    let base = engine::build_full_doc("Fixture", md, "fixture-doc").expect("build_full_doc");

    let (d_shape, shape_id) = engine::add_shape(
        &base,
        &ShapeParams {
            xywh: "[0,0,160,80]".to_string(),
            shape_type: "rect".to_string(),
            fill: Some("#ffe838".to_string()),
            stroke: None,
            text: Some("Box A".to_string()),
            seed: Some(11),
        },
    )
    .expect("add_shape");
    let full = engine::merge_doc(Some(&base), &[d_shape]).expect("merge shape");

    let (d_text, text_id) = engine::add_text(
        &full,
        &TextParams {
            xywh: "[200,0,120,30]".to_string(),
            text: "Standalone".to_string(),
            color: None, // theme-adaptive {light,dark} object
            seed: Some(12),
        },
    )
    .expect("add_text");
    let full = engine::merge_doc(Some(&full), &[d_text]).expect("merge text");

    // The critical fixture: a LABELED connector. Its labelXYWH must decode in real yjs as a
    // plain [x,y,w,h] array - the exact regression from the postmortem.
    let (d_conn, connector_id) = engine::add_connector(
        &full,
        &ConnectorParams {
            source: Endpoint {
                id: Some(shape_id.clone()),
                position: None,
            },
            target: Endpoint {
                id: None,
                position: Some((300.0, 200.0)),
            },
            mode: 1,
            label: Some("edge label".to_string()),
            label_xywh: Some([10.0, 20.0, 30.0, 40.0]),
            seed: Some(13),
        },
    )
    .expect("add_connector");
    let full = engine::merge_doc(Some(&full), &[d_conn]).expect("merge connector");

    let (d_latex, latex_block_id) = engine::add_latex_block(&full, "a^2 + b^2 = c^2").expect("add_latex_block");
    let full = engine::merge_doc(Some(&full), &[d_latex]).expect("merge latex");

    // Exercise the single-delta diagram path too (replace=false on a separate doc so the
    // hand-placed fixtures above stay byte-stable).
    let diagram_base = engine::build_full_doc("Diagram", "# Diagram", "fixture-diagram").expect("diagram doc");
    let diagram = engine::create_diagram(
        &diagram_base,
        false,
        &[
            ShapeParams {
                xywh: "[0,0,120,64]".to_string(),
                shape_type: "rect".to_string(),
                fill: None,
                stroke: None,
                text: Some("n1".to_string()),
                seed: Some(21),
            },
            ShapeParams {
                xywh: "[260,0,120,64]".to_string(),
                shape_type: "ellipse".to_string(),
                fill: Some("#E8F0FE".to_string()),
                stroke: None,
                text: Some("n2".to_string()),
                seed: Some(22),
            },
        ],
        &[DiagramEdgeParams {
            from: 0,
            to: 1,
            mode: 1,
            label: Some("goes".to_string()),
            label_xywh: Some([150.0, 20.0, 56.0, 24.0]),
        }],
    )
    .expect("create_diagram");
    let diagram_full =
        engine::merge_doc(Some(&diagram_base), std::slice::from_ref(&diagram.delta)).expect("merge diagram");

    // ---- root (workspace) doc ----
    let root = engine::build_root_doc("fixture-ws", "Fixture WS").expect("build_root_doc");
    let d_root = engine::add_doc_to_root(root.clone(), "fixture-doc", Some("Fixture")).expect("add_doc_to_root");
    let root_full = engine::merge_doc(Some(&root), &[d_root]).expect("merge root");

    // ---- db$docProperties doc ----
    let props = engine::set_doc_primary_mode(Vec::new(), "fixture-doc", "edgeless").expect("set_doc_primary_mode");

    out("page_doc.bin", &full);
    out("diagram_doc.bin", &diagram_full);
    out("root_doc.bin", &root_full);
    out("props_doc.bin", &props);

    // ------------------------------------------------------------------------
    // Delta sequences: the raw per-row bytes each CLI command pushes, in order.
    // ------------------------------------------------------------------------
    let mut sequences: Vec<Json> = Vec::new();

    // `doc create`: one row, the full build_full_doc binary pushed as-is (commands::doc_create).
    {
        let mut s = Sequence::new(
            "create_doc",
            DocKind::Page,
            "seq-create",
            "doc create: the build_full_doc binary pushed as a single row",
        );
        s.push(engine::build_full_doc("Create", "# Create\n\nAlpha\n\nBeta\n\n- one\n- two", "seq-create").unwrap());
        sequences.push(s.write(&outdir));
    }

    // `doc update` structural diff: remove a block, move another, drop a list item. The delta
    // carries block-map deletions, a replaced `sys:children` array, and its delete set.
    {
        let doc_id = "seq-structural";
        let mut s = Sequence::new(
            "update_structural",
            DocKind::Page,
            doc_id,
            "doc update removing block B, moving D before A, and dropping list item two (delete set)",
        );
        s.push(
            engine::build_full_doc(
                "Structural",
                "# Structural\n\nA\n\nB\n\nC\n\nD\n\n- one\n- two\n- three",
                doc_id,
            )
            .unwrap(),
        );
        let delta = engine::update_doc(&s.state, "# Structural\n\nD\n\nA\n\nC\n\n- one\n- three", doc_id).unwrap();
        s.push(delta);
        sequences.push(s.write(&outdir));
    }

    // `doc update` text edit inside one block: the CLI replaces `prop:text` with a new Y.Text
    // (a map-key overwrite, so the old Y.Text and its content land in the delete set).
    {
        let doc_id = "seq-text";
        let mut s = Sequence::new(
            "update_text",
            DocKind::Page,
            doc_id,
            "doc update editing the text of one paragraph; other blocks untouched",
        );
        s.push(engine::build_full_doc("Text", "# Text\n\nHello world\n\nSecond paragraph", doc_id).unwrap());
        let delta =
            engine::update_doc(&s.state, "# Text\n\nHello brave new world\n\nSecond paragraph", doc_id).unwrap();
        s.push(delta);
        sequences.push(s.write(&outdir));
    }

    // A chain of updates, each computed against the merged state of everything before it:
    // structural edit, then a text edit, then re-adding a removed block. Exercises deltas whose
    // delete sets reference items created by earlier deltas (not by the create row).
    {
        let doc_id = "seq-chain";
        let mut s = Sequence::new(
            "update_chain",
            DocKind::Page,
            doc_id,
            "three doc updates in a row: structural, then text, then re-insert; each delta computed on the merged prior rows",
        );
        s.push(engine::build_full_doc("Chain", "# Chain\n\nOne\n\nTwo\n\nThree", doc_id).unwrap());
        s.push(engine::update_doc(&s.state, "# Chain\n\nThree\n\nOne", doc_id).unwrap());
        s.push(engine::update_doc(&s.state, "# Chain\n\nThree (edited)\n\nOne", doc_id).unwrap());
        s.push(engine::update_doc(&s.state, "# Chain\n\nThree (edited)\n\nTwo\n\nOne", doc_id).unwrap());
        sequences.push(s.write(&outdir));
    }

    // `diagram create` then `diagram create --replace`: the second delta deletes every surface
    // element key the first one inserted and adds a fresh graph in the same update.
    {
        let doc_id = "seq-diagram";
        let mut s = Sequence::new(
            "diagram_replace",
            DocKind::Page,
            doc_id,
            "diagram create (2 shapes + labeled connector), then diagram create --replace (1 shape): element deletions on the surface",
        );
        s.push(engine::build_full_doc("Diagram seq", "# Diagram seq", doc_id).unwrap());
        let first = engine::create_diagram(
            &s.state,
            false,
            &[
                shape("[0,0,120,64]", "rect", "n1", 31),
                shape("[260,0,120,64]", "ellipse", "n2", 32),
            ],
            &[DiagramEdgeParams {
                from: 0,
                to: 1,
                mode: 1,
                label: Some("goes".to_string()),
                label_xywh: Some([150.0, 20.0, 56.0, 24.0]),
            }],
        )
        .unwrap();
        s.push(first.delta);
        let second =
            engine::create_diagram(&s.state, true, &[shape("[40,40,100,50]", "rect", "only", 33)], &[]).unwrap();
        s.push(second.delta);
        sequences.push(s.write(&outdir));
    }

    // Root doc lifecycle: workspace create (full binary as one row), two `doc create` root
    // rows, a `doc set-title` root row (key overwrite inside a page entry), and `doc delete`
    // (`remove_doc_from_root`: an in-place Y.Array removal from meta.pages).
    {
        let ws = "seq-ws";
        let mut s = Sequence::new(
            "root_remove",
            DocKind::Root,
            ws,
            "workspace create, add docs a and b, retitle b, remove a from meta.pages",
        );
        s.push(engine::build_root_doc(ws, "Seq WS").unwrap());
        s.push(engine::add_doc_to_root(s.state.clone(), "doc-a", Some("Doc A")).unwrap());
        s.push(engine::add_doc_to_root(s.state.clone(), "doc-b", Some("Doc B")).unwrap());
        s.push(engine::update_root_doc_meta_title(&s.state, "doc-b", "Doc B (renamed)").unwrap());
        s.push(engine::remove_doc_from_root(s.state.clone(), "doc-a").unwrap());
        sequences.push(s.write(&outdir));
    }

    // Table edit that removes a row (and changes a cell): stale `prop:rows.*` / `prop:cells.*`
    // keys of the dropped row are deleted from the table block map.
    {
        let doc_id = "seq-table";
        let mut s = Sequence::new(
            "table_remove_row",
            DocKind::Page,
            doc_id,
            "doc update shrinking a 3-row table to 2 rows and editing a retained cell",
        );
        s.push(
            engine::build_full_doc(
                "Table",
                "# Table\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |\n| 5 | 6 |",
                doc_id,
            )
            .unwrap(),
        );
        let delta = engine::update_doc(
            &s.state,
            "# Table\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 9 |",
            doc_id,
        )
        .unwrap();
        s.push(delta);
        sequences.push(s.write(&outdir));
    }

    // `doc set-title`: page-doc side of the title change (prop:title overwrite on the page block).
    {
        let doc_id = "seq-title";
        let mut s = Sequence::new(
            "set_title",
            DocKind::Page,
            doc_id,
            "doc set-title: prop:title Y.Text replaced on the page block",
        );
        s.push(engine::build_full_doc("Old title", "# Old title\n\nBody", doc_id).unwrap());
        s.push(engine::update_doc_title(&s.state, doc_id, "New title").unwrap());
        sequences.push(s.write(&outdir));
    }

    // `doc set-mode` twice: the second row overwrites `primaryMode` in the db$docProperties row.
    {
        let mut s = Sequence::new(
            "props_mode_flip",
            DocKind::Props,
            "db$docProperties",
            "doc set-mode edgeless, then doc set-mode page (scalar key overwrite)",
        );
        s.push(engine::set_doc_primary_mode(Vec::new(), "seq-mode-doc", "edgeless").unwrap());
        s.push(engine::set_doc_primary_mode(s.state.clone(), "seq-mode-doc", "page").unwrap());
        sequences.push(s.write(&outdir));
    }

    let manifest = serde_json::json!({
        "shapeId": shape_id,
        "textId": text_id,
        "connectorId": connector_id,
        "latexBlockId": latex_block_id,
        "diagramShapeIds": diagram.shape_ids,
        "diagramConnectorIds": diagram.connector_ids,
        "inlineMath": "E = mc^2",
        "blockMath": "\\int_0^1 x^2 dx",
        "latexBlockTex": "a^2 + b^2 = c^2",
        "workspaceName": "Fixture WS",
        "docId": "fixture-doc",
        "docTitle": "Fixture",
        "sequences": sequences,
    });
    std::fs::write(
        format!("{outdir}/manifest.json"),
        serde_json::to_vec_pretty(&manifest).unwrap(),
    )
    .expect("write manifest");
    eprintln!("wrote {outdir}/manifest.json");
}
