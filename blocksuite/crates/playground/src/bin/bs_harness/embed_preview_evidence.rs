//! Offscreen PNG evidence renderer for math contrast, embeds/diagrams, TOC/DocInfo, and table toolbar.

use std::path::Path;

use anyhow::Result;
use blocksuite_playground_doc::{
    read::ExternalEmbedKind,
    schema::{BlockSpec, ParagraphType, SurfaceElementSpec},
};
use playground::{
    DocPanelTab, HOME_PAGE_ID, PlaygroundOptions, PlaygroundTheme, overlays::OverlayEvent,
};

use super::{
    s3_evidence_fixtures::{new_doc_state, save_session_png},
    start_headless_session,
};

pub(super) fn render_embed_preview_evidence(out_dir: &Path) -> Result<()> {
    std::fs::create_dir_all(out_dir)?;

    // 1. Dark-theme RaTeX fraction + radical overbar (>= 1px crispness).
    {
        let mut state = new_doc_state("Dark Theme Math Calibration")?;
        {
            let page = state.workspace.page_mut(HOME_PAGE_ID).unwrap();
            page.add_block(
                "m1",
                BlockSpec::Latex {
                    latex: r"\int_{0}^{\infty} e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}".into(),
                },
                Some("p-note"),
                None,
                10,
            )?;
            page.add_block(
                "m2",
                BlockSpec::Latex {
                    latex: r"\sqrt{x^2 + y^2} = \frac{a + b}{c + d}".into(),
                },
                Some("p-note"),
                None,
                11,
            )?;
            page.add_block(
                "m3",
                BlockSpec::Latex {
                    latex: r"x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}".into(),
                },
                Some("p-note"),
                None,
                12,
            )?;
        }
        let session = start_headless_session(
            1280,
            720,
            PlaygroundOptions {
                theme: PlaygroundTheme::Dark,
                ..Default::default()
            },
        )?;
        session.view(|v, cx| v.set_document(state, cx))?;
        session.settle(200);
        save_session_png(
            &session,
            &out_dir.join("after-latex-dark.png"),
            "after-latex-dark",
        )?;
    }

    // 2. Embeds, synced-doc cycle guard, surface-ref Group, Mermaid preview, and Code Wrap toolbar.
    {
        let mut state = new_doc_state("Embeds & Live Code Previews")?;
        {
            let page = state.workspace.page_mut(HOME_PAGE_ID).unwrap();
            page.add_surface_element(
                "p-surface",
                "grp-node",
                "b0",
                SurfaceElementSpec::Shape {
                    shape_type: "rect".into(),
                    xywh: "[20,20,160,72]".into(),
                    seed: 3,
                    filled: true,
                    text: Some("Renderer".into()),
                },
                20,
            )?;
            page.add_surface_element(
                "p-surface",
                "grp-arch",
                "b1",
                SurfaceElementSpec::Group {
                    title: "Preview Pipeline Group".into(),
                    children: vec!["grp-node".into()],
                    seed: 7,
                },
                21,
            )?;
            page.add_block(
                "b-mermaid",
                BlockSpec::Code {
                    language: Some("mermaid".into()),
                    text:
                        "flowchart LR\n  A[CRDT Doc] --> B[Preview Kernel]\n  B --> C[GPU Canvas]"
                            .into(),
                    caption: "Native Merman Mermaid diagram preview".into(),
                },
                Some("p-note"),
                None,
                22,
            )?;
            page.add_block(
                "b-code-wrap",
                BlockSpec::Code {
                    language: Some("rust".into()),
                    text: "pub fn render_embed_card(kind: ExternalEmbedKind) -> BlockBody { /* wrap toolbar */ }".into(),
                    caption: String::new(),
                },
                Some("p-note"),
                None,
                23,
            )?;
            page.add_block(
                "b-cycle",
                BlockSpec::EmbedSyncedDoc {
                    page_id: HOME_PAGE_ID.into(),
                    caption: String::new(),
                },
                Some("p-note"),
                None,
                24,
            )?;
            page.add_block(
                "b-sref-grp",
                BlockSpec::SurfaceRef {
                    reference: "grp-arch".into(),
                    ref_flavour: "affine:surface".into(),
                    caption: String::new(),
                },
                Some("p-note"),
                None,
                25,
            )?;
            page.add_block(
                "b-ext-yt",
                BlockSpec::ExternalEmbed {
                    kind: ExternalEmbedKind::Youtube,
                    url: "https://youtube.com/watch?v=affine".into(),
                    title: Some("AFFiNE Native Renderer Demo".into()),
                    description: Some(
                        "External embed card with block selection and Open action".into(),
                    ),
                    html: None,
                    caption: String::new(),
                },
                Some("p-note"),
                None,
                26,
            )?;
            if let Ok(update) = page.encode_update_v1() {
                let _ = std::fs::write(out_dir.join("embed-evidence-doc.yjs"), update);
            }
        }
        let session = start_headless_session(
            1280,
            960,
            PlaygroundOptions {
                theme: PlaygroundTheme::Light,
                ..Default::default()
            },
        )?;
        session.view(|v, cx| v.set_document(state, cx))?;
        let _ = session.frame()?;
        session.overlay(OverlayEvent::ToggleCodePreview("b-mermaid".into()))?;
        session.overlay(OverlayEvent::ToggleCodeWrap("b-code-wrap".into()))?;
        session.overlay(OverlayEvent::ExternalEmbedInteract {
            block_id: "b-ext-yt".into(),
            activate: false,
        })?;
        session.select("b-code-wrap", 0)?;
        let _ = session.frame()?;
        playground::block_flow::flush_native_code_previews();
        session.view(|_, cx| cx.notify())?;
        session.settle(200);
        save_session_png(
            &session,
            &out_dir.join("after-embeds-mermaid-code.png"),
            "after-embeds-mermaid-code",
        )?;
    }

    // 3. TOC Outline / DocInfo panel + focused Table row/column toolbar.
    {
        let mut state = new_doc_state("TOC & Table Operations")?;
        {
            let page = state.workspace.page_mut(HOME_PAGE_ID).unwrap();
            page.add_block(
                "h1",
                BlockSpec::Paragraph {
                    paragraph_type: ParagraphType::H1,
                    text: "1. Architecture Overview".into(),
                },
                Some("p-note"),
                None,
                30,
            )?;
            page.add_block(
                "h2",
                BlockSpec::Paragraph {
                    paragraph_type: ParagraphType::H2,
                    text: "1.1 Native Preview Kernel".into(),
                },
                Some("p-note"),
                None,
                31,
            )?;
            page.add_block(
                "tbl",
                BlockSpec::Table {
                    rows: vec![
                        vec!["Feature".into(), "Status".into(), "Undo".into()],
                        vec!["Table Rows".into(), "Atomic".into(), "1-step".into()],
                        vec!["Table Cols".into(), "Atomic".into(), "1-step".into()],
                    ],
                },
                Some("p-note"),
                None,
                32,
            )?;
            page.add_block(
                "h3",
                BlockSpec::Paragraph {
                    paragraph_type: ParagraphType::H2,
                    text: "1.2 External Embed Shield".into(),
                },
                Some("p-note"),
                None,
                33,
            )?;
        }
        let session = start_headless_session(
            1280,
            800,
            PlaygroundOptions {
                theme: PlaygroundTheme::Light,
                ..Default::default()
            },
        )?;
        session.view(|v, cx| {
            v.set_document(state, cx);
            v.set_doc_panel_tab(Some(DocPanelTab::Outline), cx);
        })?;
        let _ = session.frame()?;
        session.overlay(OverlayEvent::FocusTableCell {
            block_id: "tbl".into(),
            row_id: "row-1".into(),
            column_id: "col-0".into(),
            screen_pos: None,
        })?;
        session.settle(200);
        save_session_png(
            &session,
            &out_dir.join("after-toc-table.png"),
            "after-toc-table",
        )?;

        session.view(|v, cx| v.set_doc_panel_tab(Some(DocPanelTab::Info), cx))?;
        session.settle(100);
        save_session_png(
            &session,
            &out_dir.join("after-docinfo-table.png"),
            "after-docinfo-table",
        )?;
    }

    // 4. Narrow phone viewport: wide table sandwiched between two paragraphs with focused cell
    //    toolbar — assert zero vertical overlap with BOTH preceding and following paragraphs.
    {
        let mut state = new_doc_state("Mobile Table Toolbar Clearance")?;
        {
            let page = state.workspace.page_mut(HOME_PAGE_ID).unwrap();
            page.add_block(
                "p-above",
                BlockSpec::Paragraph {
                    paragraph_type: ParagraphType::Text,
                    text: "Preceding paragraph: the final line above this wide table must stay 100% unobstructed.".into(),
                },
                Some("p-note"),
                None,
                40,
            )?;
            page.add_block(
                "tbl-wide",
                BlockSpec::Table {
                    rows: vec![
                        vec![
                            "Col A".into(),
                            "Col B".into(),
                            "Col C".into(),
                            "Col D".into(),
                        ],
                        vec![
                            "Alpha".into(),
                            "Beta".into(),
                            "Gamma".into(),
                            "Delta".into(),
                        ],
                    ],
                },
                Some("p-note"),
                None,
                41,
            )?;
            page.add_block(
                "p-below",
                BlockSpec::Paragraph {
                    paragraph_type: ParagraphType::Text,
                    text: "Between the tables: the first line below this wide table must stay 100% unobstructed.".into(),
                },
                Some("p-note"),
                None,
                42,
            )?;
        }
        let session = start_headless_session(
            390,
            844,
            PlaygroundOptions {
                theme: PlaygroundTheme::Light,
                form_factor: playground::FormFactor::Phone,
                ..Default::default()
            },
        )?;
        session.view(|v, cx| v.set_document(state, cx))?;
        let _ = session.frame()?;
        session.overlay(OverlayEvent::FocusTableCell {
            block_id: "tbl-wide".into(),
            row_id: "row-0".into(),
            column_id: "col-0".into(),
            screen_pos: None,
        })?;
        session.settle(150);
        let snap = session.frame()?;
        let bar = snap
            .elements
            .get("overlay.table_toolbar")
            .ok_or_else(|| anyhow::anyhow!("missing overlay.table_toolbar on phone viewport"))?;
        let above = snap
            .elements
            .get("page.block.p-above")
            .ok_or_else(|| anyhow::anyhow!("missing page.block.p-above"))?;
        let below = snap
            .elements
            .get("page.block.p-below")
            .ok_or_else(|| anyhow::anyhow!("missing page.block.p-below"))?;
        let above_bottom = above.bounds.y + above.bounds.height;
        let bar_top = bar.bounds.y;
        let bar_bottom = bar.bounds.y + bar.bounds.height;
        let below_top = below.bounds.y;
        anyhow::ensure!(
            bar_top >= above_bottom,
            "table toolbar top ({bar_top}) overlaps preceding paragraph bottom ({above_bottom})"
        );
        anyhow::ensure!(
            bar_bottom <= below_top,
            "table toolbar bottom ({bar_bottom}) overlaps following paragraph top ({below_top})"
        );
        println!(
            "mobile-narrow-table clearance OK: above_bottom={above_bottom:.1} bar=[{bar_top:.1}..{bar_bottom:.1}] below_top={below_top:.1}"
        );
        save_session_png(
            &session,
            &out_dir.join("after-mobile-narrow-table.png"),
            "after-mobile-narrow-table",
        )?;
    }

    Ok(())
}
