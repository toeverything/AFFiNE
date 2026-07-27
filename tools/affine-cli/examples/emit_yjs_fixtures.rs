//! Emit binary fixtures covering every CLI write path, for the REAL-yjs decode check
//! (`yjs-compat/check.mjs`, wired into CI by `.github/workflows/affine-cli-yjs-compat.yml`).
//!
//! Why this exists: y-octo's own reader cannot detect encodings that the real browser yjs
//! library decodes differently — the labelXYWH incident (a bare top-level `Any::Array` decoding
//! to its LAST element in yjs, poisoning the whole edgeless surface; see
//! docs/affine-cli-edgeless-render-postmortem.md) was invisible to every Rust round-trip test.
//! So the authoritative check has to cross the language seam: this example writes full-state
//! binaries with the exact library code the CLI ships, and the node script applies them to a
//! fresh `Y.Doc` with the SAME yjs version the app pins, asserting the decoded shapes.
//!
//! Usage: cargo run -p affine-cli --example emit_yjs_fixtures -- <outdir>
//! Writes: page_doc.bin, root_doc.bin, props_doc.bin, manifest.json

use affine_cli::engine::{self, ConnectorParams, DiagramEdgeParams, Endpoint, ShapeParams, TextParams};

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
    // plain [x,y,w,h] array — the exact regression from the postmortem.
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
    });
    std::fs::write(
        format!("{outdir}/manifest.json"),
        serde_json::to_vec_pretty(&manifest).unwrap(),
    )
    .expect("write manifest");
    eprintln!("wrote {outdir}/manifest.json");
}
