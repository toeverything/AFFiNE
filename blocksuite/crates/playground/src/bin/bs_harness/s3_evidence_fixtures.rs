//! Shared PDF and workspace document fixtures for `s3_evidence` offscreen rendering.

use std::path::Path;

use anyhow::{Context as _, Result};
use blocksuite_playground_doc::schema::{
    BlockSpec, ConnectorEndpointSpec, ParagraphType, SurfaceElementSpec,
};
use playground::{HOME_PAGE_ID, room_client::DocState};
use ui::audit_frame_snapshot;

use super::HeadlessSession;

/// Builds a valid 2-page PDF 1.4 fixture with distinct vector art and labels on each page.
pub(crate) fn build_two_page_pdf_fixture() -> Vec<u8> {
    let mut out = Vec::new();
    out.extend_from_slice(b"%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
    let mut offsets = vec![0usize];
    let mut push_obj = |body: &str| {
        offsets.push(out.len());
        let id = offsets.len() - 1;
        out.extend_from_slice(format!("{id} 0 obj\n{body}\nendobj\n").as_bytes());
    };
    push_obj("<< /Type /Catalog /Pages 2 0 R >>");
    push_obj("<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>");
    push_obj(
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 360 220] \
         /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>",
    );
    push_obj(
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 360 220] \
         /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>",
    );
    push_obj("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    let p1 = "0.12 0.42 0.88 rg 24 148 312 44 re f \
              1 1 1 rg BT /F1 18 Tf 36 164 Td (AFFiNE Mobile Architecture) Tj ET \
              0.92 0.95 0.99 rg 24 28 148 102 re f \
              0.2 0.25 0.35 rg BT /F1 13 Tf 36 106 Td (Page 1: Overview) Tj ET \
              0.2 0.25 0.35 rg BT /F1 11 Tf 36 82 Td (Pure Rust Hayro PDF) Tj ET \
              0.12 0.65 0.42 rg 188 28 148 102 re f \
              1 1 1 rg BT /F1 13 Tf 202 80 Td (Zero JS Runtime) Tj ET";
    push_obj(&format!(
        "<< /Length {} >>\nstream\n{p1}\nendstream",
        p1.len()
    ));
    let p2 = "0.48 0.22 0.84 rg 24 148 312 44 re f \
              1 1 1 rg BT /F1 18 Tf 36 164 Td (Page 2: Performance Budget) Tj ET \
              0.96 0.93 1.0 rg 24 28 312 102 re f \
              0.2 0.15 0.35 rg BT /F1 13 Tf 36 104 Td (Single-Keystroke Relayout = 1 Block) Tj ET \
              0.2 0.15 0.35 rg BT /F1 11 Tf 36 78 Td (10k Blocks Interactive on Mobile) Tj ET";
    push_obj(&format!(
        "<< /Length {} >>\nstream\n{p2}\nendstream",
        p2.len()
    ));
    let xref_pos = out.len();
    out.extend_from_slice(format!("xref\n0 {}\n", offsets.len()).as_bytes());
    out.extend_from_slice(b"0000000000 65535 f \n");
    for offset in offsets.iter().skip(1) {
        out.extend_from_slice(format!("{offset:010} 00000 n \n").as_bytes());
    }
    out.extend_from_slice(
        format!(
            "trailer\n<< /Size {} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n",
            offsets.len()
        )
        .as_bytes(),
    );
    out
}

pub(super) fn save_session_png(session: &HeadlessSession, path: &Path, label: &str) -> Result<()> {
    let snapshot = session.frame()?;
    let violations = audit_frame_snapshot(&snapshot);
    anyhow::ensure!(
        violations.is_empty(),
        "audit violations in {label}: {violations:#?}"
    );
    let image = session.app.update(|cx| {
        session
            .window_handle
            .update(cx, |_, window, _| window.render_to_image())
    })??;
    image
        .save(path)
        .with_context(|| format!("saving {}", path.display()))?;
    println!(
        "saved {} ({}x{})",
        path.display(),
        image.width(),
        image.height()
    );
    Ok(())
}

pub(super) fn new_doc_state(title: &str) -> Result<DocState> {
    let mut state = DocState::new("s3-evidence", 77)?;
    state.workspace.create_page(HOME_PAGE_ID, title, 1)?;
    state
        .workspace
        .create_page("doc:roadmap", "Mobile Rust Roadmap 2026", 1_795_703_400_000)?;
    {
        let roadmap = state.workspace.ensure_page("doc:roadmap")?;
        roadmap.add_block(
            "rm-root",
            BlockSpec::Page {
                title: "Mobile Rust Roadmap 2026".into(),
            },
            None,
            None,
            1,
        )?;
        roadmap.add_block(
            "rm-note",
            BlockSpec::Note { xywh: None },
            Some("rm-root"),
            None,
            2,
        )?;
        roadmap.add_block(
            "rm-p1",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: "Pure-Rust cross-platform BlockSuite editor targeting iOS, Android, and Web with 1:1 visual parity.".into(),
            },
            Some("rm-note"),
            None,
            3,
        )?;
    }
    state
        .workspace
        .create_page("doc:synced-spec", "Synced Design Tokens", 3)?;
    {
        let synced = state.workspace.ensure_page("doc:synced-spec")?;
        synced.add_block(
            "sy-root",
            BlockSpec::Page {
                title: "Synced Design Tokens".into(),
            },
            None,
            None,
            1,
        )?;
        synced.add_block(
            "sy-note",
            BlockSpec::Note { xywh: None },
            Some("sy-root"),
            None,
            2,
        )?;
        synced.add_block(
            "sy-p1",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: "Semantic tokens are generated from packages/ui/tokens and shared across Light and Dark themes.".into(),
            },
            Some("sy-note"),
            None,
            3,
        )?;
    }
    let page = state.workspace.ensure_page(HOME_PAGE_ID)?;
    page.add_block(
        "p-root",
        BlockSpec::Page {
            title: title.into(),
        },
        None,
        None,
        1,
    )?;
    page.add_block("p-surface", BlockSpec::Surface, Some("p-root"), None, 2)?;
    page.add_block(
        "frame-overview",
        BlockSpec::Frame {
            title: "Architecture Canvas Frame".into(),
            xywh: Some("[0,0,660,220]".into()),
            presentation_index: None,
        },
        Some("p-surface"),
        None,
        3,
    )?;
    page.add_surface_element(
        "p-surface",
        "shape-store",
        "a0",
        SurfaceElementSpec::Shape {
            shape_type: "rect".into(),
            xywh: "[28,56,172,108]".into(),
            seed: 11,
            filled: true,
            text: Some("CRDT Store".into()),
        },
        4,
    )?;
    page.add_surface_element(
        "p-surface",
        "shape-editor",
        "a1",
        SurfaceElementSpec::Shape {
            shape_type: "rect".into(),
            xywh: "[240,56,176,108]".into(),
            seed: 22,
            filled: true,
            text: Some("BlockFlow GPU".into()),
        },
        5,
    )?;
    page.add_surface_element(
        "p-surface",
        "shape-preview",
        "a2",
        SurfaceElementSpec::Shape {
            shape_type: "ellipse".into(),
            xywh: "[456,56,176,108]".into(),
            seed: 33,
            filled: true,
            text: Some("RaTeX + Hayro".into()),
        },
        6,
    )?;
    page.add_surface_element(
        "p-surface",
        "conn-1",
        "a3",
        SurfaceElementSpec::Connector {
            mode: 1,
            seed: 44,
            source: ConnectorEndpointSpec::element("shape-store", Some([1.0, 0.5])),
            target: ConnectorEndpointSpec::element("shape-editor", Some([0.0, 0.5])),
            text: None,
            label_xywh: None,
        },
        7,
    )?;
    page.add_surface_element(
        "p-surface",
        "conn-2",
        "a4",
        SurfaceElementSpec::Connector {
            mode: 1,
            seed: 55,
            source: ConnectorEndpointSpec::element("shape-editor", Some([1.0, 0.5])),
            target: ConnectorEndpointSpec::element("shape-preview", Some([0.0, 0.5])),
            text: None,
            label_xywh: None,
        },
        8,
    )?;
    page.add_block(
        "p-note",
        BlockSpec::Note { xywh: None },
        Some("p-root"),
        None,
        9,
    )?;
    Ok(state)
}
