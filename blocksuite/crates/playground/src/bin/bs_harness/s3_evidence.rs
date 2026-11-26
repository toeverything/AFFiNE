//! Offscreen PNG evidence renderer for `S3-PageEditor` visual verification.

use std::path::Path;

use anyhow::{Context as _, Result};
use blocksuite_playground_doc::schema::{BlockSpec, ParagraphType};
use playground::{
    HOME_PAGE_ID, PlaygroundOptions, PlaygroundTheme,
    directory::{EditorDocId, EditorDocMode, EditorDocSummary, InMemoryDocDirectory},
    overlays::{ActiveSelection, OverlayEvent},
};
use ui::{EntityInputHandler, point, px};
use y_octo::{Any, TextAttributes, TextDeltaOp, TextInsert};

pub(crate) use super::s3_evidence_fixtures::build_two_page_pdf_fixture;
use super::{
    element_center,
    s3_evidence_fixtures::{new_doc_state, save_session_png},
    start_headless_session,
};

pub(super) fn render_s3_evidence(out_dir: &Path) -> Result<()> {
    std::fs::create_dir_all(out_dir)?;

    // 1. Rich blocks panorama (Light 1280x960): Callout, Table, RaTeX Block + Inline Math,
    //    EmbedLinkedDoc, EmbedSyncedDoc, SurfaceRef.
    {
        let mut state = new_doc_state("Rich Blocks Panorama")?;
        {
            let page = state.workspace.page_mut(HOME_PAGE_ID).unwrap();
            page.add_block(
                "b-callout",
                BlockSpec::Callout {
                    icon: "\u{1F4A1}".into(),
                    background_color: Some("blue".into()),
                },
                Some("p-note"),
                None,
                10,
            )?;
            page.add_block(
                "b-callout-text",
                BlockSpec::Paragraph {
                    paragraph_type: ParagraphType::Text,
                    text: "Nested rich paragraph inside an affine:callout block with zero CRDT writeback."
                        .into(),
                },
                Some("b-callout"),
                None,
                11,
            )?;
            page.add_block(
                "b-inline-math",
                BlockSpec::Paragraph {
                    paragraph_type: ParagraphType::Text,
                    text: String::new(),
                },
                Some("p-note"),
                None,
                12,
            )?;
            page.apply_text_delta(
                "b-inline-math",
                "prop:text",
                &[
                    TextDeltaOp::Insert {
                        insert: TextInsert::Text("Euler identity ".into()),
                        format: None,
                    },
                    TextDeltaOp::Insert {
                        insert: TextInsert::Text(" ".into()),
                        format: Some(TextAttributes::from([(
                            "latex".into(),
                            Any::String(r"e^{i\pi} + 1 = 0".into()),
                        )])),
                    },
                    TextDeltaOp::Insert {
                        insert: TextInsert::Text(
                            " rendered inline via pure-Rust RaTeX outlines.".into(),
                        ),
                        format: None,
                    },
                ],
                13,
            )?;
            page.add_block(
                "b-latex",
                BlockSpec::Latex {
                    latex: r"\int_{0}^{\infty} e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}".into(),
                },
                Some("p-note"),
                None,
                14,
            )?;
            page.add_block(
                "b-table",
                BlockSpec::Table {
                    rows: vec![
                        vec!["Module".into(), "Engine".into(), "Target".into()],
                        vec![
                            "Math".into(),
                            "RaTeX Outlines".into(),
                            "iOS / Android / Web".into(),
                        ],
                        vec!["PDF".into(), "Hayro Pure Rust".into(), "Zero C/C++".into()],
                    ],
                },
                Some("p-note"),
                None,
                15,
            )?;
            page.add_block(
                "b-embed-link",
                BlockSpec::EmbedLinkedDoc {
                    page_id: "doc:roadmap".into(),
                    style: "horizontal".into(),
                    caption: String::new(),
                },
                Some("p-note"),
                None,
                16,
            )?;
            page.add_block(
                "b-embed-sync",
                BlockSpec::EmbedSyncedDoc {
                    page_id: "doc:synced-spec".into(),
                    caption: String::new(),
                },
                Some("p-note"),
                None,
                17,
            )?;
            page.add_block(
                "b-surface-ref",
                BlockSpec::SurfaceRef {
                    reference: "frame-overview".into(),
                    ref_flavour: "affine:frame".into(),
                    caption: "Architecture Canvas Frame".into(),
                },
                Some("p-note"),
                None,
                18,
            )?;
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
        session.settle(200);
        save_session_png(
            &session,
            &out_dir.join("01-rich-blocks-panorama.png"),
            "01-rich-blocks-panorama",
        )?;
    }

    // 2. Code block syntax highlighting (Dark 1280x800): Rust + TypeScript + colored LaTeX editor.
    {
        let mut state = new_doc_state("Syntax Highlighting (Dark)")?;
        {
            let page = state.workspace.page_mut(HOME_PAGE_ID).unwrap();
            page.add_block(
                "b-code-rs",
                BlockSpec::Code {
                    language: Some("rust".into()),
                    text: concat!(
                        "/* Multi-line block comment\n",
                        "   carried across lines by LineState */\n",
                        "#[derive(Debug, Clone)]\n",
                        "pub fn highlight_line(lang: LanguageId, line: &str) -> usize {\n",
                        "    let tokens = lex_line(lang, line, LineState::Normal);\n",
                        "    println!(\"lexed {} spans\", tokens.spans.len());\n",
                        "    tokens.spans.len() + 42\n",
                        "}"
                    )
                    .into(),
                    caption: "Rust line-state-machine lexer".into(),
                },
                Some("p-note"),
                None,
                20,
            )?;
            page.add_block(
                "b-code-ts",
                BlockSpec::Code {
                    language: Some("typescript".into()),
                    text: concat!(
                        "export interface DocSummary {\n",
                        "  readonly id: string;\n",
                        "  score: number;\n",
                        "}\n",
                        "// Exact case-insensitive substring matcher\n",
                        "export const searchDocs = (query: string): boolean => query.length > 0;"
                    )
                    .into(),
                    caption: "TypeScript highlighting".into(),
                },
                Some("p-note"),
                None,
                21,
            )?;
        }
        let session = start_headless_session(
            1280,
            800,
            PlaygroundOptions {
                theme: PlaygroundTheme::Dark,
                ..Default::default()
            },
        )?;
        session.view(|v, cx| v.set_document(state, cx))?;
        session.settle(200);
        save_session_png(
            &session,
            &out_dir.join("02-syntax-highlight-dark.png"),
            "02-syntax-highlight-dark",
        )?;
    }

    // 3. Embedded PDF attachment preview (Light 1280x800): Page 1/2 -> click Next -> Page 2/2.
    {
        let mut state = new_doc_state("PDF Attachment Preview")?;
        state
            .blobs
            .insert("blob-spec-pdf".into(), build_two_page_pdf_fixture().into());
        {
            let page = state.workspace.page_mut(HOME_PAGE_ID).unwrap();
            page.add_block(
                "b-pdf",
                BlockSpec::Attachment {
                    name: "AFFiNE-Mobile-Architecture.pdf".into(),
                    size: 184_320,
                    mime_type: "application/pdf".into(),
                    source_id: "blob-spec-pdf".into(),
                    caption: "Quarterly architecture specification".into(),
                    embed: true,
                },
                Some("p-note"),
                None,
                30,
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
        session.view(|v, cx| v.set_document(state, cx))?;
        session.settle(200);
        let snap_p1 = session.frame()?;
        save_session_png(
            &session,
            &out_dir.join("03a-pdf-page-1.png"),
            "03a-pdf-page-1",
        )?;
        let (nx, ny) = element_center(&snap_p1, "page.block.b-pdf.pdf_next")
            .context("expected live Hayro PDF page controls on native")?;
        session.headless_win.simulate_click(point(px(nx), px(ny)));
        session.settle(200);
        let page_idx = session.view(|v, _| v.attachment_pdf_page_index("b-pdf"))?;
        anyhow::ensure!(
            page_idx == Some(1),
            "expected PDF page index 1, got {page_idx:?}"
        );
        save_session_png(
            &session,
            &out_dir.join("03-pdf-attachment-page-2.png"),
            "03-pdf-attachment-page-2",
        )?;
    }

    // 4. Mobile 390x844 narrow viewport: KeyboardToolbar (44x44pt) + @ exact-substring
    //    highlighted candidate panel + LTR paragraph with mixed Arabic/Hebrew.
    {
        let mut state = new_doc_state("Mobile Editor")?;
        {
            let page = state.workspace.page_mut(HOME_PAGE_ID).unwrap();
            page.add_block(
                "b-bidi",
                BlockSpec::Paragraph {
                    paragraph_type: ParagraphType::Text,
                    text: "Hello \u{05E9}\u{05DC}\u{05D5}\u{05DD} \u{0645}\u{0631}\u{062D}\u{0628}\u{0627} world".into(),
                },
                Some("p-note"),
                None,
                40,
            )?;
            page.add_block(
                "b-mention",
                BlockSpec::Paragraph {
                    paragraph_type: ParagraphType::Text,
                    text: "See ".into(),
                },
                Some("p-note"),
                None,
                41,
            )?;
        }
        let session = start_headless_session(
            390,
            844,
            PlaygroundOptions {
                theme: PlaygroundTheme::Light,
                ..Default::default()
            },
        )?;
        session.view(|v, cx| {
            v.set_document(state, cx);
            v.set_doc_directory(Box::new(InMemoryDocDirectory::with_docs([
                EditorDocSummary {
                    id: EditorDocId::from("doc:plan"),
                    title: "Q4 Launch Plan".into(),
                    mode: EditorDocMode::Page,
                    updated_at_ms: 300,
                },
                EditorDocSummary {
                    id: EditorDocId::from("doc:plan-cn"),
                    title: "Mobile Plan Review".into(),
                    mode: EditorDocMode::Page,
                    updated_at_ms: 200,
                },
                EditorDocSummary {
                    id: EditorDocId::from("doc:canvas"),
                    title: "Edgeless Plan Canvas".into(),
                    mode: EditorDocMode::Edgeless,
                    updated_at_ms: 100,
                },
            ])));
        })?;
        session.frame()?;
        // Place caret at end of "See " and type "@plan" to trigger exact-substring picker.
        session.overlay(OverlayEvent::SetSelection(Some(ActiveSelection {
            block_id: "b-mention".into(),
            start_utf16: 4,
            end_utf16: 4,
        })))?;
        session.overlay(OverlayEvent::SetKeyboardToolbarVisible(true))?;
        for ch in "@plan".chars() {
            session.update(|v, w, cx| {
                v.replace_text_in_range(None, &ch.to_string(), w, cx);
            })?;
        }
        session.settle(250);
        save_session_png(
            &session,
            &out_dir.join("04-mobile-keyboard-mention-bidi.png"),
            "04-mobile-keyboard-mention-bidi",
        )?;
    }

    // 5 & 6. In-place live Y.Text table cell editing with RichParagraph marks (Light & Dark 1280x800).
    for (theme, filename, label) in [
        (
            PlaygroundTheme::Light,
            "05-table-cell-inline-edit-light.png",
            "05-table-cell-inline-edit-light",
        ),
        (
            PlaygroundTheme::Dark,
            "06-table-cell-inline-edit-dark.png",
            "06-table-cell-inline-edit-dark",
        ),
    ] {
        let mut state = new_doc_state("In-Place Rich Table Editing")?;
        {
            let page = state.workspace.page_mut(HOME_PAGE_ID).unwrap();
            page.add_block(
                "b-table",
                BlockSpec::Table {
                    rows: vec![
                        vec!["Feature".into(), "Rich Formatting".into(), "Link".into()],
                        vec!["CRDT Cell".into(), String::new(), String::new()],
                    ],
                },
                Some("p-note"),
                None,
                50,
            )?;
            page.apply_text_delta(
                "b-table",
                "prop:cells.row-1:col-1.text",
                &[
                    TextDeltaOp::Insert {
                        insert: TextInsert::Text("Live ".into()),
                        format: None,
                    },
                    TextDeltaOp::Insert {
                        insert: TextInsert::Text("bold".into()),
                        format: Some(TextAttributes::from([("bold".into(), Any::True)])),
                    },
                    TextDeltaOp::Insert {
                        insert: TextInsert::Text(" and ".into()),
                        format: None,
                    },
                    TextDeltaOp::Insert {
                        insert: TextInsert::Text("Y.Text".into()),
                        format: Some(TextAttributes::from([("code".into(), Any::True)])),
                    },
                ],
                51,
            )?;
            page.apply_text_delta(
                "b-table",
                "prop:cells.row-1:col-2.text",
                &[TextDeltaOp::Insert {
                    insert: TextInsert::Text("affine.pro".into()),
                    format: Some(TextAttributes::from([(
                        "link".into(),
                        Any::String("https://affine.pro".into()),
                    )])),
                }],
                52,
            )?;
        }
        let session = start_headless_session(
            1280,
            800,
            PlaygroundOptions {
                theme,
                ..Default::default()
            },
        )?;
        session.view(|v, cx| v.set_document(state, cx))?;
        session.frame()?;
        session.overlay(OverlayEvent::FocusTableCell {
            block_id: "b-table".into(),
            row_id: "row-1".into(),
            column_id: "col-1".into(),
            screen_pos: None,
        })?;
        session.update(|v, w, cx| {
            v.replace_text_in_range(None, " sync", w, cx);
            v.set_selected_text_range(5..9, w, cx);
        })?;
        session.settle(200);
        save_session_png(&session, &out_dir.join(filename), label)?;
    }

    // 7. LaTeX equation editor popover with real syntax highlighting (Dark 1280x800).
    {
        let mut state = new_doc_state("LaTeX Equation Syntax Highlight")?;
        {
            let page = state.workspace.page_mut(HOME_PAGE_ID).unwrap();
            page.add_block(
                "b-latex",
                BlockSpec::Latex {
                    latex: r"\frac{-b \pm \sqrt{b^2 - 4ac}}{2a}".into(),
                },
                Some("p-note"),
                None,
                60,
            )?;
        }
        let session = start_headless_session(
            1280,
            800,
            PlaygroundOptions {
                theme: PlaygroundTheme::Dark,
                ..Default::default()
            },
        )?;
        session.view(|v, cx| v.set_document(state, cx))?;
        session.frame()?;
        session.overlay(OverlayEvent::OpenEquationEditor {
            target: playground::overlays::EquationTarget::Block {
                block_id: "b-latex".into(),
            },
            initial: r"\frac{-b \pm \sqrt{b^2 - 4ac}}{2a}".into(),
        })?;
        session.settle(250);
        save_session_png(
            &session,
            &out_dir.join("07-latex-equation-syntax-highlight.png"),
            "07-latex-equation-syntax-highlight",
        )?;
    }

    // 8a & 8b. Same-size (1280x800) table cell IME preedit comparison verifying zero pixel
    // changes on existing bold + code + link text left of caret during composition.
    {
        let mut state = new_doc_state("Table Cell IME Preedit Parity")?;
        {
            let page = state.workspace.page_mut(HOME_PAGE_ID).unwrap();
            page.add_block(
                "b-table",
                BlockSpec::Table {
                    rows: vec![
                        vec!["Task".into(), "Owner".into()],
                        vec![String::new(), "Ann".into()],
                    ],
                },
                Some("p-note"),
                None,
                70,
            )?;
            page.apply_text_delta(
                "b-table",
                "prop:cells.row-1:col-0.text",
                &[
                    TextDeltaOp::Insert {
                        insert: TextInsert::Text("Plan".into()),
                        format: Some(TextAttributes::from([("bold".into(), Any::True)])),
                    },
                    TextDeltaOp::Insert {
                        insert: TextInsert::Text(" for ".into()),
                        format: None,
                    },
                    TextDeltaOp::Insert {
                        insert: TextInsert::Text("Y.Text".into()),
                        format: Some(TextAttributes::from([("code".into(), Any::True)])),
                    },
                    TextDeltaOp::Insert {
                        insert: TextInsert::Text(" ".into()),
                        format: None,
                    },
                    TextDeltaOp::Insert {
                        insert: TextInsert::Text("launch".into()),
                        format: Some(TextAttributes::from([(
                            "link".into(),
                            Any::String("https://affine.pro".into()),
                        )])),
                    },
                    TextDeltaOp::Insert {
                        insert: TextInsert::Text(" review ".into()),
                        format: None,
                    },
                ],
                71,
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
        session.view(|v, cx| v.set_document(state, cx))?;
        session.frame()?;
        session.overlay(OverlayEvent::FocusTableCell {
            block_id: "b-table".into(),
            row_id: "row-1".into(),
            column_id: "col-0".into(),
            screen_pos: None,
        })?;
        session.settle(100);
        save_session_png(
            &session,
            &out_dir.join("08a-table-cell-preedit-before.png"),
            "08a-table-cell-preedit-before",
        )?;
        session.update(|v, w, cx| {
            v.replace_and_mark_text_in_range(None, "ni", None, w, cx);
        })?;
        session.settle(100);
        save_session_png(
            &session,
            &out_dir.join("08b-table-cell-preedit-composing.png"),
            "08b-table-cell-preedit-composing",
        )?;
    }

    // 9. Mobile viewport (390x844) in-place table cell focus with KeyboardToolbar body-selection
    // mark buttons disabled (opacity 0.35) while Undo, Redo, and Dismiss remain enabled.
    {
        let mut state = new_doc_state("Mobile Table Cell")?;
        {
            let page = state.workspace.page_mut(HOME_PAGE_ID).unwrap();
            page.add_block(
                "b-table",
                BlockSpec::Table {
                    rows: vec![
                        vec!["Task".into(), "Status".into()],
                        vec!["CRDT sync".into(), "Ready".into()],
                    ],
                },
                Some("p-note"),
                None,
                80,
            )?;
        }
        let session = start_headless_session(
            390,
            844,
            PlaygroundOptions {
                theme: PlaygroundTheme::Light,
                ..Default::default()
            },
        )?;
        session.view(|v, cx| v.set_document(state, cx))?;
        session.frame()?;
        session.overlay(OverlayEvent::FocusTableCell {
            block_id: "b-table".into(),
            row_id: "row-1".into(),
            column_id: "col-0".into(),
            screen_pos: None,
        })?;
        session.overlay(OverlayEvent::SetKeyboardToolbarVisible(true))?;
        session.settle(200);
        save_session_png(
            &session,
            &out_dir.join("09-mobile-table-cell-keyboard-toolbar.png"),
            "09-mobile-table-cell-keyboard-toolbar",
        )?;
    }

    Ok(())
}
