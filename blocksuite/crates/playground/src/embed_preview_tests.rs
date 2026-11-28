//! Integration tests for 28-flavour zero-writeback reading, external embed pointer shield,
//! HTML sandbox isolation, synced-doc cycle guard, surface-ref Group thumbnails, code block
//! toolbar (language/wrap/preview), TOC/DocInfo panel, and table row/column undo boundaries.

#[cfg(test)]
mod cases {
    use blocksuite_playground_doc::{
        read::{BlockContent, ExternalEmbedKind},
        schema::{BlockSpec, DatabaseSpec, ListType, ParagraphType, SurfaceElementSpec},
    };
    use ui::{
        AppContext as _, Application, Bounds, EntityInputHandler, HeadlessPlatform, WindowBounds,
        WindowOptions, audit_frame_snapshot, point, px, size,
    };
    use y_octo::{Any, SessionValue, TypePath, TypeTarget};

    use crate::{
        DocPanelTab, HOME_PAGE_ID, PlaygroundMode, PlaygroundOptions, PlaygroundTheme,
        PlaygroundView, compute_doc_stats, extract_toc_headings, overlays::OverlayEvent,
        register_bundled_fonts, room_client::DocState,
    };

    struct TestSession {
        platform: std::rc::Rc<HeadlessPlatform>,
        app: ui::ApplicationHandle,
        window: ui::WindowHandle<PlaygroundView>,
        hw: ui::HeadlessWindow,
    }

    impl TestSession {
        fn open(width: u32, height: u32, theme: PlaygroundTheme) -> Self {
            Self::open_with_options(
                width,
                height,
                PlaygroundOptions {
                    theme,
                    ..Default::default()
                },
            )
        }

        fn open_with_options(width: u32, height: u32, options: PlaygroundOptions) -> Self {
            let platform = HeadlessPlatform::new(width, height, 1.0);
            let app = Application::with_platform(platform.clone()).run_embedded(|cx| {
                register_bundled_fonts(cx).unwrap();
            });
            let window = app.update(|cx| {
                cx.open_window(
                    WindowOptions {
                        window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                            point(px(0.0), px(0.0)),
                            size(px(width as f32), px(height as f32)),
                        ))),
                        ..Default::default()
                    },
                    |_, cx| cx.new(|cx| PlaygroundView::with_options(options, cx)),
                )
                .unwrap()
            });
            let hw = platform.windows().into_iter().next().unwrap();
            Self {
                platform,
                app,
                window,
                hw,
            }
        }

        fn overlay(&self, event: OverlayEvent) {
            self.app.update(|cx| {
                self.window
                    .update(cx, |v, win, cx| v.dispatch_overlay(event, win, cx))
                    .unwrap();
            });
        }

        fn set_doc(&self, state: DocState) {
            self.app.update(|cx| {
                self.window
                    .update(cx, |v, _, cx| v.set_document(state, cx))
                    .unwrap();
            });
        }

        fn frame(&self) -> ui::FrameSnapshot {
            self.platform.run_until_parked();
            self.hw.request_frame();
            self.platform.run_until_parked();
            self.app.update(|cx| {
                self.window
                    .update(cx, |_, win, _| win.frame_snapshot().clone())
                    .unwrap()
            })
        }
    }

    #[test]
    fn all_28_blocksuite_flavours_render_with_zero_writeback_and_preserve_unknown_props() {
        let mut state = DocState::new("all-28-flavours", 701).unwrap();
        state
            .workspace
            .create_page(HOME_PAGE_ID, "All 28 Flavours", 1_795_700_000_000)
            .unwrap();
        {
            let page = state.workspace.ensure_page(HOME_PAGE_ID).unwrap();
            page.add_block(
                "b-page",
                BlockSpec::Page {
                    title: "All 28 Flavours".into(),
                },
                None,
                None,
                1,
            )
            .unwrap();
            page.add_block("b-surface", BlockSpec::Surface, Some("b-page"), None, 2)
                .unwrap();
            page.add_block(
                "b-note",
                BlockSpec::Note { xywh: None },
                Some("b-page"),
                None,
                3,
            )
            .unwrap();
            page.add_block(
                "b-frame",
                BlockSpec::Frame {
                    title: "Frame 1".into(),
                    xywh: Some("[0,0,240,160]".into()),
                    presentation_index: Some("a0".into()),
                },
                Some("b-surface"),
                None,
                4,
            )
            .unwrap();
            page.add_block(
                "b-edgeless-text",
                BlockSpec::EdgelessText {
                    xywh: Some("[20,20,160,40]".into()),
                },
                Some("b-surface"),
                None,
                5,
            )
            .unwrap();

            let note_specs: Vec<(&str, BlockSpec)> = vec![
                (
                    "b-para",
                    BlockSpec::Paragraph {
                        paragraph_type: ParagraphType::H1,
                        text: "Heading 1".into(),
                    },
                ),
                (
                    "b-list",
                    BlockSpec::List {
                        list_type: ListType::Todo,
                        text: "Task item".into(),
                        checked: false,
                        order: None,
                    },
                ),
                (
                    "b-code",
                    BlockSpec::Code {
                        language: Some("rust".into()),
                        text: "fn main() {}".into(),
                        caption: String::new(),
                    },
                ),
                ("b-divider", BlockSpec::Divider),
                (
                    "b-image",
                    BlockSpec::Image {
                        source_id: "img-1".into(),
                        caption: "Photo".into(),
                        width: 200.0,
                        height: 120.0,
                        xywh: None,
                    },
                ),
                (
                    "b-bookmark",
                    BlockSpec::Bookmark {
                        url: "https://affine.pro".into(),
                        title: Some("AFFiNE".into()),
                        description: Some("Workspace".into()),
                    },
                ),
                (
                    "b-attachment",
                    BlockSpec::Attachment {
                        name: "report.pdf".into(),
                        size: 1024,
                        mime_type: "application/pdf".into(),
                        source_id: "pdf-1".into(),
                        caption: String::new(),
                        embed: true,
                    },
                ),
                (
                    "b-latex",
                    BlockSpec::Latex {
                        latex: r"\frac{\sqrt{\pi}}{2}".into(),
                    },
                ),
                (
                    "b-callout",
                    BlockSpec::Callout {
                        icon: "\u{1F4A1}".into(),
                        background_color: Some("blue".into()),
                    },
                ),
                (
                    "b-table",
                    BlockSpec::Table {
                        rows: vec![vec!["A".into(), "B".into()]],
                    },
                ),
                ("b-database", BlockSpec::Database(DatabaseSpec::default())),
                (
                    "b-surface-ref",
                    BlockSpec::SurfaceRef {
                        reference: "b-frame".into(),
                        ref_flavour: "affine:frame".into(),
                        caption: String::new(),
                    },
                ),
                (
                    "b-embed-linked",
                    BlockSpec::EmbedLinkedDoc {
                        page_id: "doc:other".into(),
                        style: "horizontal".into(),
                        caption: String::new(),
                    },
                ),
                (
                    "b-embed-synced",
                    BlockSpec::EmbedSyncedDoc {
                        page_id: HOME_PAGE_ID.into(),
                        caption: String::new(),
                    },
                ),
                (
                    "b-embed-yt",
                    BlockSpec::ExternalEmbed {
                        kind: ExternalEmbedKind::Youtube,
                        url: "https://youtube.com/watch?v=123".into(),
                        title: Some("Demo Video".into()),
                        description: None,
                        html: None,
                        caption: String::new(),
                    },
                ),
                (
                    "b-embed-figma",
                    BlockSpec::ExternalEmbed {
                        kind: ExternalEmbedKind::Figma,
                        url: "https://figma.com/file/abc".into(),
                        title: Some("Design Spec".into()),
                        description: None,
                        html: None,
                        caption: String::new(),
                    },
                ),
                (
                    "b-embed-gh",
                    BlockSpec::ExternalEmbed {
                        kind: ExternalEmbedKind::Github,
                        url: "https://github.com/toeverything/AFFiNE".into(),
                        title: Some("AFFiNE Repo".into()),
                        description: None,
                        html: None,
                        caption: String::new(),
                    },
                ),
                (
                    "b-embed-loom",
                    BlockSpec::ExternalEmbed {
                        kind: ExternalEmbedKind::Loom,
                        url: "https://loom.com/share/xyz".into(),
                        title: Some("Walkthrough".into()),
                        description: None,
                        html: None,
                        caption: String::new(),
                    },
                ),
                (
                    "b-embed-html",
                    BlockSpec::ExternalEmbed {
                        kind: ExternalEmbedKind::Html,
                        url: String::new(),
                        title: Some("HTML Widget".into()),
                        description: None,
                        html: Some("<div>Hello</div>".into()),
                        caption: String::new(),
                    },
                ),
                (
                    "b-embed-iframe",
                    BlockSpec::ExternalEmbed {
                        kind: ExternalEmbedKind::Iframe,
                        url: "https://example.com/embed".into(),
                        title: Some("Iframe Embed".into()),
                        description: None,
                        html: None,
                        caption: String::new(),
                    },
                ),
                (
                    "b-embed-web",
                    BlockSpec::ExternalEmbed {
                        kind: ExternalEmbedKind::Web,
                        url: "https://example.org".into(),
                        title: Some("Web Embed".into()),
                        description: None,
                        html: None,
                        caption: String::new(),
                    },
                ),
            ];

            for (i, (id, spec)) in note_specs.into_iter().enumerate() {
                page.add_block(id, spec, Some("b-note"), None, 10 + i as u64)
                    .unwrap();
            }
            // Add 2 additional raw BlockSuite flavours (`affine:data-view` and `affine:transcription`)
            // plus unknown custom property to reach 28 distinct flavours total.
            for (id, flavour) in [
                ("b-data-view", "affine:data-view"),
                ("b-transcription", "affine:transcription"),
            ] {
                let entries = vec![
                    (
                        "sys:id".to_string(),
                        SessionValue::Any(Any::String(id.into())),
                    ),
                    (
                        "sys:flavour".to_string(),
                        SessionValue::Any(Any::String(flavour.into())),
                    ),
                    (
                        "sys:version".to_string(),
                        SessionValue::Any(Any::Integer(1)),
                    ),
                    ("sys:children".to_string(), SessionValue::Array(Vec::new())),
                    (
                        "prop:customPreserve".to_string(),
                        SessionValue::Any(Any::String("lossless-ok".into())),
                    ),
                ];
                page.inner_mut()
                    .map_set(
                        &TypeTarget::Path(TypePath::root("blocks")),
                        id.to_string(),
                        SessionValue::Map(entries),
                    )
                    .unwrap();
                let children_target =
                    TypeTarget::Path(TypePath::root("blocks").key("b-note").key("sys:children"));
                let len = page.inner().read_array(&children_target).unwrap().len() as u64;
                page.inner_mut()
                    .array_insert(
                        &children_target,
                        len,
                        vec![SessionValue::Any(Any::String(id.into()))],
                    )
                    .unwrap();
            }
            page.set_block_prop(
                "b-embed-yt",
                "prop:customUnknownMeta",
                SessionValue::Any(Any::String("preserve-me".into())),
                99,
            )
            .unwrap();
        }

        // Replicate into a clean reader session so we can assert strictly 0 local writebacks.
        let v1_bytes = state
            .workspace
            .page(HOME_PAGE_ID)
            .unwrap()
            .encode_update_v1()
            .unwrap();
        let mut reader_state = DocState::new("all-28-reader", 702).unwrap();
        reader_state
            .workspace
            .create_page(HOME_PAGE_ID, "All 28 Flavours", 1_795_700_000_000)
            .unwrap();
        reader_state
            .workspace
            .ensure_page(HOME_PAGE_ID)
            .unwrap()
            .apply_remote_update_v1(&v1_bytes)
            .unwrap();

        let sv_before = reader_state
            .workspace
            .page(HOME_PAGE_ID)
            .unwrap()
            .encode_state_vector_v1()
            .unwrap();
        let update_before = reader_state
            .workspace
            .page(HOME_PAGE_ID)
            .unwrap()
            .encode_update_v1()
            .unwrap();

        let s = TestSession::open(1280, 900, PlaygroundTheme::Dark);
        s.set_doc(reader_state);
        for _ in 0..3 {
            let snap = s.frame();
            assert!(audit_frame_snapshot(&snap).is_empty());
        }

        let (sv_after, update_after, distinct_flavours, preserved_unknown, preserved_custom) =
            s.app.update(|cx| {
                s.window
                    .update(cx, |v, _, _| {
                        let page = v.document().workspace.page(HOME_PAGE_ID).unwrap();
                        let snap = v.page_snapshot().unwrap();
                        let flavours: std::collections::BTreeSet<String> = snap
                            .root
                            .as_ref()
                            .unwrap()
                            .walk()
                            .map(|n| n.flavour.clone())
                            .collect();
                        let yt_prop = snap
                            .block("b-embed-yt")
                            .and_then(|b| b.props.get("prop:customUnknownMeta"))
                            .and_then(|v| v.as_str())
                            .map(str::to_string);
                        let tx_prop = snap
                            .block("b-transcription")
                            .and_then(|b| b.props.get("prop:customPreserve"))
                            .and_then(|v| v.as_str())
                            .map(str::to_string);
                        (
                            page.encode_state_vector_v1().unwrap(),
                            page.encode_update_v1().unwrap(),
                            flavours.len(),
                            yt_prop,
                            tx_prop,
                        )
                    })
                    .unwrap()
            });

        assert_eq!(distinct_flavours, 28, "expected all 28 BlockSuite flavours");
        assert_eq!(
            sv_before, sv_after,
            "rendering 28 flavours must cause 0 writeback"
        );
        assert_eq!(
            update_before, update_after,
            "CRDT V1 snapshot must be byte-identical"
        );
        assert_eq!(preserved_unknown.as_deref(), Some("preserve-me"));
        assert_eq!(preserved_custom.as_deref(), Some("lossless-ok"));
    }

    #[test]
    fn external_embed_pointer_shield_and_overlay_occlusion_and_no_same_origin_sandbox() {
        // Verify static Web scripts never put allow-same-origin on user HTML iframes.
        let preview_js = include_str!("../web/preview-workers.js");
        assert!(
            preview_js.contains("iframe.setAttribute('sandbox', 'allow-scripts')"),
            "preview-workers.js must sandbox user HTML iframes with allow-scripts only"
        );
        assert!(
            !preview_js.contains("'allow-scripts allow-same-origin'")
                && !preview_js.contains("\"allow-scripts allow-same-origin\""),
            "preview-workers.js must never enable allow-same-origin"
        );

        let mut state = DocState::new("embed-shield", 703).unwrap();
        state
            .workspace
            .create_page(HOME_PAGE_ID, "Embed Shield", 1)
            .unwrap();
        {
            let page = state.workspace.ensure_page(HOME_PAGE_ID).unwrap();
            page.add_block(
                "root",
                BlockSpec::Page {
                    title: "Embed Shield".into(),
                },
                None,
                None,
                1,
            )
            .unwrap();
            page.add_block(
                "note",
                BlockSpec::Note { xywh: None },
                Some("root"),
                None,
                2,
            )
            .unwrap();
            page.add_block(
                "yt1",
                BlockSpec::ExternalEmbed {
                    kind: ExternalEmbedKind::Youtube,
                    url: "https://youtube.com/watch?v=abc".into(),
                    title: Some("Video".into()),
                    description: None,
                    html: None,
                    caption: String::new(),
                },
                Some("note"),
                None,
                3,
            )
            .unwrap();
        }
        let s = TestSession::open(1280, 800, PlaygroundTheme::Light);
        s.set_doc(state);
        let _ = s.frame();

        // Click selects real block (`block_selection`), Open invokes `open_url`, DocPanel shields.
        s.app.update(|cx| {
            s.window
                .update(cx, |v, win, cx| {
                    v.dispatch_overlay(
                        OverlayEvent::ExternalEmbedInteract {
                            block_id: "yt1".into(),
                            activate: false,
                        },
                        win,
                        cx,
                    );
                    assert_eq!(v.editor.block_selection, vec!["yt1".to_string()]);
                    assert!(v.editor.selection.is_none());
                    v.dispatch_overlay(
                        OverlayEvent::ExternalEmbedInteract {
                            block_id: "yt1".into(),
                            activate: true,
                        },
                        win,
                        cx,
                    );
                    assert_eq!(
                        v.last_opened_link_url.as_deref(),
                        Some("https://youtube.com/watch?v=abc")
                    );
                    v.set_doc_panel_tab(Some(DocPanelTab::Outline), cx);
                })
                .unwrap();
        });
        let _ = s.frame();
        let shielded = s.app.update(|cx| {
            s.window
                .update(cx, |v, _, _| v.flow.embeds_shielded)
                .unwrap()
        });
        assert!(
            shielded,
            "opening DocPanel must shield active external embeds"
        );
    }

    #[test]
    fn code_toolbar_toc_docinfo_surface_ref_group_and_table_undo_boundaries() {
        let mut state = DocState::new("embed-preview-features", 704).unwrap();
        state
            .workspace
            .create_page(HOME_PAGE_ID, "Workspace Guide", 1)
            .unwrap();
        {
            let page = state.workspace.ensure_page(HOME_PAGE_ID).unwrap();
            page.add_block(
                "root",
                BlockSpec::Page {
                    title: "Workspace Guide".into(),
                },
                None,
                None,
                1,
            )
            .unwrap();
            page.add_block("surf", BlockSpec::Surface, Some("root"), None, 2)
                .unwrap();
            page.add_surface_element(
                "surf",
                "sh-1",
                "a0",
                SurfaceElementSpec::Shape {
                    shape_type: "rect".into(),
                    xywh: "[10,10,120,60]".into(),
                    seed: 1,
                    filled: true,
                    text: Some("Node".into()),
                },
                3,
            )
            .unwrap();
            page.add_surface_element(
                "surf",
                "grp-1",
                "a1",
                SurfaceElementSpec::Group {
                    title: "Architecture Group".into(),
                    children: vec!["sh-1".into()],
                    seed: 7,
                },
                4,
            )
            .unwrap();
            page.add_block(
                "note",
                BlockSpec::Note { xywh: None },
                Some("root"),
                None,
                5,
            )
            .unwrap();
            page.add_block(
                "h1",
                BlockSpec::Paragraph {
                    paragraph_type: ParagraphType::H1,
                    text: "Overview".into(),
                },
                Some("note"),
                None,
                6,
            )
            .unwrap();
            page.add_block(
                "h2",
                BlockSpec::Paragraph {
                    paragraph_type: ParagraphType::H2,
                    text: "Diagrams".into(),
                },
                Some("note"),
                None,
                7,
            )
            .unwrap();
            page.add_block(
                "mmd",
                BlockSpec::Code {
                    language: Some("mermaid".into()),
                    text: "flowchart LR\n  A[Edit] --> B[Preview]".into(),
                    caption: String::new(),
                },
                Some("note"),
                None,
                8,
            )
            .unwrap();
            page.add_block(
                "sref-grp",
                BlockSpec::SurfaceRef {
                    reference: "grp-1".into(),
                    ref_flavour: "affine:surface".into(),
                    caption: String::new(),
                },
                Some("note"),
                None,
                9,
            )
            .unwrap();
            page.add_block(
                "tbl",
                BlockSpec::Table {
                    rows: vec![
                        vec!["R0C0".into(), "R0C1".into()],
                        vec!["R1C0".into(), "R1C1".into()],
                    ],
                },
                Some("note"),
                None,
                10,
            )
            .unwrap();
        }

        let s = TestSession::open(1280, 900, PlaygroundTheme::Light);
        s.set_doc(state);
        let _ = s.frame();

        // 1. TOC & DocInfo extraction
        s.app.update(|cx| {
            s.window
                .update(cx, |v, _, cx| {
                    let snap = v.page_snapshot().unwrap();
                    let headings = extract_toc_headings(&snap);
                    assert_eq!(headings.len(), 2);
                    assert_eq!(headings[0].text, "Overview");
                    assert_eq!(headings[1].level, 2);
                    let stats = compute_doc_stats(&snap, &v.page_titles);
                    assert_eq!(stats.headings, 2);
                    assert!(stats.words >= 4);
                    v.set_doc_panel_tab(Some(DocPanelTab::Info), cx);
                })
                .unwrap();
        });
        let info_snap = s.frame();
        assert!(info_snap.elements.contains_key("overlay.doc_panel"));
        assert!(
            info_snap
                .elements
                .contains_key("overlay.doc_panel.stat.headings")
        );

        // 2. Code block Wrap toggle (1 undo) + Preview toggle (0 writeback) + SurfaceRef Group title
        s.app.update(|cx| {
            s.window
                .update(cx, |v, win, cx| {
                    let layout = v.flow_layout().unwrap();
                    assert_eq!(
                        layout.block("sref-grp").unwrap().body.plain,
                        "Architecture Group"
                    );

                    v.dispatch_overlay(OverlayEvent::ToggleCodeWrap("mmd".into()), win, cx);
                    let wrap_after = match &v.page_snapshot().unwrap().block("mmd").unwrap().content
                    {
                        BlockContent::Code { wrap, .. } => *wrap,
                        _ => false,
                    };
                    assert!(wrap_after, "ToggleCodeWrap must set prop:wrap = true");
                    v.history(false, win, cx).unwrap();
                    let wrap_undone =
                        match &v.page_snapshot().unwrap().block("mmd").unwrap().content {
                            BlockContent::Code { wrap, .. } => *wrap,
                            _ => true,
                        };
                    assert!(!wrap_undone, "single undo must revert prop:wrap");

                    let sv_before = v
                        .document()
                        .workspace
                        .page(HOME_PAGE_ID)
                        .unwrap()
                        .encode_state_vector_v1()
                        .unwrap();
                    v.dispatch_overlay(OverlayEvent::ToggleCodePreview("mmd".into()), win, cx);
                    assert!(v.flow.code_preview_blocks.contains("mmd"));
                    let sv_after = v
                        .document()
                        .workspace
                        .page(HOME_PAGE_ID)
                        .unwrap()
                        .encode_state_vector_v1()
                        .unwrap();
                    assert_eq!(
                        sv_before, sv_after,
                        "Preview toggle must cause 0 CRDT writeback"
                    );
                })
                .unwrap();
        });

        // 3. Table row/column insert & delete (1 atomic undo) + same-cell click stop_capturing boundary
        s.app.update(|cx| {
        s.window
            .update(cx, |v, win, cx| {
                v.focus_table_cell("tbl".into(), "row-0".into(), "col-0".into(), None, win, cx);
                assert!(v.table_insert_row_after(win, cx));
                let rows_after_add = match &v.page_snapshot().unwrap().block("tbl").unwrap().content {
                    BlockContent::Table(t) => t.rows.len(),
                    _ => 0,
                };
                assert_eq!(rows_after_add, 3);
                v.history(false, win, cx).unwrap();
                let rows_after_undo = match &v.page_snapshot().unwrap().block("tbl").unwrap().content {
                    BlockContent::Table(t) => t.rows.len(),
                    _ => 0,
                };
                assert_eq!(rows_after_undo, 2);

                assert!(v.table_insert_column_after(win, cx));
                let cols_after_add = match &v.page_snapshot().unwrap().block("tbl").unwrap().content {
                    BlockContent::Table(t) => t.columns.len(),
                    _ => 0,
                };
                assert_eq!(cols_after_add, 3);
                v.history(false, win, cx).unwrap();

                // Same-cell click between two edits within 500ms must split undo steps.
                v.focus_table_cell("tbl".into(), "row-0".into(), "col-0".into(), None, win, cx);
                v.replace_text_in_range(None, "A", win, cx);
                v.focus_table_cell("tbl".into(), "row-0".into(), "col-0".into(), None, win, cx);
                v.replace_text_in_range(None, "B", win, cx);
                v.history(false, win, cx).unwrap();
                let text_after_one_undo = match &v.page_snapshot().unwrap().block("tbl").unwrap().content {
                    BlockContent::Table(t) => t.cells[&("row-0".into(), "col-0".into())].text.plain.clone(),
                    _ => String::new(),
                };
                assert!(
                    text_after_one_undo.contains('A') && !text_after_one_undo.contains('B'),
                    "same-cell cursor jump must call stop_capturing so undo reverts only 'B', got {text_after_one_undo:?}"
                );
            })
            .unwrap();
    });

        // 4. Edgeless mindmap clipboard paste (remaps IDs & parent links, 1-step atomic undo)
        s.app.update(|cx| {
            s.window
                .update(cx, |v, win, cx| {
                    v.set_mode(PlaygroundMode::Edgeless, win, cx);
                    let paste_json = serde_json::json!({
                        "surfaceElements": [
                            {
                                "id": "src-root",
                                "type": "shape",
                                "shapeType": "rect",
                                "xywh": "[100,100,140,48]",
                                "seed": 11,
                                "filled": true,
                                "text": { "delta": [{ "insert": "Root Topic" }] }
                            },
                            {
                                "id": "src-child",
                                "type": "shape",
                                "shapeType": "rect",
                                "xywh": "[300,100,140,48]",
                                "seed": 12,
                                "filled": true,
                                "text": { "delta": [{ "insert": "Branch A" }] }
                            },
                            {
                                "id": "src-mm",
                                "type": "mindmap",
                                "layoutType": 0,
                                "style": 1,
                                "children": {
                                    "type": "$blocksuite:internal:native$",
                                    "value": {
                                        "src-root": { "index": "a0" },
                                        "src-child": { "index": "a1", "parent": "src-root" }
                                    }
                                }
                            }
                        ]
                    });
                    let surface_len = |view: &PlaygroundView| -> usize {
                        view.page_snapshot()
                            .unwrap()
                            .root
                            .as_ref()
                            .unwrap()
                            .children
                            .iter()
                            .find_map(|c| match &c.content {
                                BlockContent::Surface { elements, .. } => Some(elements.len()),
                                _ => None,
                            })
                            .unwrap_or(0)
                    };
                    let before_elems = surface_len(v);
                    v.paste(
                        ui::ClipboardItem::new_string(paste_json.to_string()),
                        win,
                        cx,
                    );
                    assert_eq!(
                        surface_len(v),
                        before_elems + 3,
                        "pasting mindmap + 2 shapes must add 3 surface elements"
                    );
                    let after_snap = v.page_snapshot().unwrap();
                    let pasted_mm = after_snap
                        .root
                        .as_ref()
                        .unwrap()
                        .children
                        .iter()
                        .find_map(|c| match &c.content {
                            BlockContent::Surface { elements, .. } => elements.iter().find(|e| {
                                matches!(
                                    e.kind,
                                    blocksuite_playground_doc::read::SurfaceElementKind::Mindmap(_)
                                )
                            }),
                            _ => None,
                        })
                        .expect("pasted mindmap present");
                    if let blocksuite_playground_doc::read::SurfaceElementKind::Mindmap(mm) =
                        &pasted_mm.kind
                    {
                        assert_eq!(mm.nodes.len(), 2);
                        assert!(
                            !mm.nodes.contains_key("src-root"),
                            "pasted mindmap node ids must be remapped"
                        );
                        assert!(
                            mm.nodes.values().any(|n| n.parent.is_some()),
                            "child parent reference must be preserved after remapping"
                        );
                    }
                    // Single undo reverts the entire pasted mindmap + child shapes atomically.
                    v.history(false, win, cx).unwrap();
                    assert_eq!(surface_len(v), before_elems);
                })
                .unwrap();
        });
        let _ = s.frame();
    }

    #[test]
    fn native_shipping_view_installs_providers_and_narrow_320px_topbar_never_overlaps() {
        let _provider_lock = crate::GLOBAL_PREVIEW_PROVIDER_TEST_LOCK
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        let s = TestSession::open(320, 640, PlaygroundTheme::Dark);
        assert!(crate::block_flow::has_math_preview_provider());
        assert!(crate::block_flow::has_pdf_page_provider());
        assert!(
            crate::block_flow::code_preview_supported(crate::block_flow::CodePreviewKind::Mermaid),
            "native shipping view must install real Merman Mermaid provider"
        );
        assert!(
            crate::block_flow::code_preview_supported(crate::block_flow::CodePreviewKind::Typst),
            "native shipping view must install real Typst provider"
        );
        assert!(
            !crate::block_flow::code_preview_supported(crate::block_flow::CodePreviewKind::Html),
            "native without a browser host must honestly report HTML preview unsupported"
        );
        // NativeCodePreviewProvider is async: cache miss returns Pending immediately (0 ms UI block),
        // then deterministic flush completes Mermaid (ASCII, CJK, Emoji) and Typst (Math, CJK+Latin).
        let cases: &[(crate::block_flow::CodePreviewKind, &str, PlaygroundTheme)] = &[
            (
                crate::block_flow::CodePreviewKind::Mermaid,
                "flowchart LR\n  A[Start] --> B[End]",
                PlaygroundTheme::Light,
            ),
            (
                crate::block_flow::CodePreviewKind::Mermaid,
                "graph LR\n  A[开始] --> B[结束]",
                PlaygroundTheme::Light,
            ),
            (
                crate::block_flow::CodePreviewKind::Mermaid,
                "graph LR\n  A[Done ✅] --> B[OK]",
                PlaygroundTheme::Light,
            ),
            (
                crate::block_flow::CodePreviewKind::Typst,
                "= Hello Typst\n$ x^2 + y^2 = z^2 $",
                PlaygroundTheme::Dark,
            ),
            (
                crate::block_flow::CodePreviewKind::Typst,
                "中文正文 and Latin.",
                PlaygroundTheme::Light,
            ),
        ];
        for &(kind, src, theme) in cases {
            let _ = crate::block_flow::query_code_preview_provider(kind, src, theme, 2.0);
        }
        crate::block_flow::flush_native_code_previews();
        for &(kind, src, theme) in cases {
            let res = crate::block_flow::query_code_preview_provider(kind, src, theme, 2.0);
            match res {
                Some(crate::block_flow::CodePreviewResult::Ready(slot)) => {
                    assert!(
                        slot.width_pt > 1.0 && slot.height_pt > 1.0,
                        "expected non-empty rasterized preview for {kind:?}: {src}"
                    );
                }
                Some(crate::block_flow::CodePreviewResult::Error(e)) => {
                    panic!("expected Ready preview for {kind:?} ({src}), got Error({e})");
                }
                _ => panic!("expected Ready preview for {kind:?} ({src}) after flush"),
            }
        }

        let snap = s.frame();
        assert!(
            audit_frame_snapshot(&snap).is_empty(),
            "320px narrow topbar must have 0 audit violations: {:?}",
            audit_frame_snapshot(&snap)
        );
        let outline = snap.elements["chrome.doc_panel_toggle"].bounds;
        let switcher = snap.elements["chrome.mode_switcher"].bounds;
        assert!(
            outline.right() <= switcher.x,
            "320px compact Outline button ({outline:?}) must not overlap mode switcher ({switcher:?})"
        );
    }

    #[test]
    fn nested_table_row_col_mutations_preserve_legacy_rows_and_converge_to_replica() {
        let mut s1 = DocState::new("nested-tbl-1", 101).unwrap();
        s1.workspace.initialize_meta().unwrap();
        s1.workspace
            .create_page(HOME_PAGE_ID, "Nested Table", 1)
            .unwrap();
        let page = s1.workspace.page_mut(HOME_PAGE_ID).unwrap();
        let init_update = {
            page.add_block(
                "root",
                BlockSpec::Page {
                    title: "Nested Table".into(),
                },
                None,
                None,
                1,
            )
            .unwrap();
            page.add_block(
                "note",
                BlockSpec::Note { xywh: None },
                Some("root"),
                None,
                2,
            )
            .unwrap();
            page.add_raw_block(
                "tbl-legacy",
                "affine:table",
                1,
                vec![
                    (
                        "prop:rows".into(),
                        SessionValue::Map(vec![(
                            "r0".into(),
                            SessionValue::Map(vec![
                                ("rowId".into(), SessionValue::Any(Any::String("r0".into()))),
                                ("order".into(), SessionValue::Any(Any::String("a0".into()))),
                            ]),
                        )]),
                    ),
                    (
                        "prop:columns".into(),
                        SessionValue::Map(vec![(
                            "c0".into(),
                            SessionValue::Map(vec![
                                (
                                    "columnId".into(),
                                    SessionValue::Any(Any::String("c0".into())),
                                ),
                                ("order".into(), SessionValue::Any(Any::String("a0".into()))),
                            ]),
                        )]),
                    ),
                    (
                        "prop:cells".into(),
                        SessionValue::Map(vec![(
                            "r0:c0".into(),
                            SessionValue::Map(vec![(
                                "text".into(),
                                SessionValue::Text(vec![y_octo::TextDeltaOp::Insert {
                                    insert: y_octo::TextInsert::Text("old".into()),
                                    format: None,
                                }]),
                            )]),
                        )]),
                    ),
                    // Hybrid flat cell metadata must NOT misclassify nested `prop:cells` as flat.
                    (
                        "prop:cells.r0:c0.backgroundColor".into(),
                        SessionValue::Any(Any::String("#ffeecc".into())),
                    ),
                ],
                Some("note"),
                None,
                3,
            )
            .unwrap();
            page.encode_update_v1().unwrap()
        };

        let mut replica =
            blocksuite_playground_doc::session::PageDocSession::new(HOME_PAGE_ID, 202).unwrap();
        replica.apply_remote_update_v1(&init_update).unwrap();

        let page = s1.workspace.page_mut(HOME_PAGE_ID).unwrap();
        let c1 = page
            .insert_table_row("tbl-legacy", Some("r0"), "r1", 10)
            .unwrap()
            .expect("insert row commit");
        replica.apply_remote_update_v1(&c1.update).unwrap();

        for snap in [
            page.read_page_snapshot().unwrap(),
            replica.read_page_snapshot().unwrap(),
        ] {
            let BlockContent::Table(t) = &snap.block("tbl-legacy").unwrap().content else {
                panic!("expected table");
            };
            let rids: Vec<&str> = t.rows.iter().map(|r| r.row_id.as_str()).collect();
            assert_eq!(rids, vec!["r0", "r1"]);
            assert_eq!(t.cells[&("r0".into(), "c0".into())].text.plain, "old");
        }

        let c2 = page
            .insert_table_column("tbl-legacy", Some("c0"), "c1", 20)
            .unwrap()
            .expect("insert col commit");
        replica.apply_remote_update_v1(&c2.update).unwrap();
        let c3 = page
            .delete_table_row("tbl-legacy", "r1", 30)
            .unwrap()
            .expect("delete row commit");
        replica.apply_remote_update_v1(&c3.update).unwrap();
        let c4 = page
            .delete_table_column("tbl-legacy", "c1", 40)
            .unwrap()
            .expect("delete col commit");
        replica.apply_remote_update_v1(&c4.update).unwrap();

        for snap in [
            page.read_page_snapshot().unwrap(),
            replica.read_page_snapshot().unwrap(),
        ] {
            let BlockContent::Table(t) = &snap.block("tbl-legacy").unwrap().content else {
                panic!("expected table");
            };
            assert_eq!(t.rows.len(), 1);
            assert_eq!(t.columns.len(), 1);
            assert_eq!(t.cells[&("r0".into(), "c0".into())].text.plain, "old");
        }
    }

    #[test]
    fn readonly_table_hides_toolbar_and_blocks_all_row_col_mutations() {
        let platform = HeadlessPlatform::new(1024, 720, 1.0);
        let app = Application::with_platform(platform.clone()).run_embedded(|cx| {
            register_bundled_fonts(cx).unwrap();
        });
        let window = app.update(|cx| {
            cx.open_window(
                WindowOptions {
                    window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                        point(px(0.0), px(0.0)),
                        size(px(1024.0), px(720.0)),
                    ))),
                    ..WindowOptions::default()
                },
                |_, cx| {
                    cx.new(|cx| {
                        PlaygroundView::with_options(
                            PlaygroundOptions {
                                page_readonly: true,
                                ..PlaygroundOptions::default()
                            },
                            cx,
                        )
                    })
                },
            )
            .unwrap()
        });
        let hw = platform.windows().into_iter().next().unwrap();

        let mut state = DocState::new("ro-tbl", 303).unwrap();
        state.workspace.initialize_meta().unwrap();
        state
            .workspace
            .create_page(HOME_PAGE_ID, "RO Table", 1)
            .unwrap();
        let page = state.workspace.page_mut(HOME_PAGE_ID).unwrap();
        page.add_block(
            "root",
            BlockSpec::Page {
                title: "RO Table".into(),
            },
            None,
            None,
            1,
        )
        .unwrap();
        page.add_block(
            "note",
            BlockSpec::Note { xywh: None },
            Some("root"),
            None,
            2,
        )
        .unwrap();
        page.add_block(
            "tbl",
            BlockSpec::Table {
                rows: vec![vec!["A".into(), "B".into()], vec!["C".into(), "D".into()]],
            },
            Some("note"),
            None,
            3,
        )
        .unwrap();

        app.update(|cx| {
            window
                .update(cx, |v, win, cx| {
                    v.set_document(state, cx);
                    v.focus_table_cell("tbl".into(), "row-0".into(), "col-0".into(), None, win, cx);
                    assert!(!v.table_insert_row_after(win, cx));
                    assert!(!v.table_delete_focused_row(win, cx));
                    assert!(!v.table_insert_column_after(win, cx));
                    assert!(!v.table_delete_focused_column(win, cx));
                })
                .unwrap();
        });
        hw.request_frame();
        platform.run_until_parked();
        let snap = app.update(|cx| {
            window
                .update(cx, |_, win, _| win.frame_snapshot().clone())
                .unwrap()
        });
        assert!(
            !snap.elements.contains_key("overlay.table_toolbar"),
            "readonly table must not render floating row/col toolbar"
        );
    }

    #[test]
    fn edgeless_web_lz_double_encoded_paste_same_ms_dedup_and_single_undo() {
        let s = TestSession::open(1024, 720, PlaygroundTheme::Light);
        let mut state = DocState::new("edg-web-paste", 404).unwrap();
        state.workspace.initialize_meta().unwrap();
        state
            .workspace
            .create_page(HOME_PAGE_ID, "Canvas", 1)
            .unwrap();
        let page = state.workspace.page_mut(HOME_PAGE_ID).unwrap();
        page.add_block(
            "root",
            BlockSpec::Page {
                title: "Canvas".into(),
            },
            None,
            None,
            1,
        )
        .unwrap();
        page.add_block("surf", BlockSpec::Surface, Some("root"), None, 2)
            .unwrap();

        let inner_surface_json = serde_json::json!({
            "elements": {
                "w-root": {
                    "id": "w-root",
                    "type": "shape",
                    "shapeType": "rect",
                    "xywh": "[50,50,120,44]",
                    "seed": 1,
                    "filled": true,
                    "text": { "delta": [{ "insert": "Web Root", "attributes": { "bold": true } }] }
                },
                "w-child": {
                    "id": "w-child",
                    "type": "shape",
                    "shapeType": "rect",
                    "xywh": "[240,50,120,44]",
                    "seed": 2,
                    "filled": true,
                    "text": { "delta": [{ "insert": "Web Child" }] }
                },
                "w-mm": {
                    "id": "w-mm",
                    "type": "mindmap",
                    "layoutType": 0,
                    "style": 2,
                    "children": {
                        "w-root": { "index": "a0" },
                        "w-child": { "index": "a1", "parent": "w-root" }
                    }
                },
                "w-grp": {
                    "id": "w-grp",
                    "type": "group",
                    "title": { "delta": [{ "insert": "Pasted Group" }] },
                    "children": {
                        "type": "$blocksuite:internal:native$",
                        "value": { "w-root": true, "w-note": true }
                    }
                },
                "w-conn": {
                    "id": "w-conn",
                    "type": "connector",
                    "source": { "id": "w-root" },
                    "target": { "id": "w-note" }
                }
            },
            "blocks": [
                {
                    "id": "w-note",
                    "flavour": "affine:note",
                    "props": { "xywh": "[80,220,400,120]" },
                    "children": [
                        {
                            "id": "w-h2",
                            "flavour": "affine:paragraph",
                            "props": {
                                "type": "h2",
                                "text": { "delta": [{ "insert": "Heading Bold", "attributes": { "bold": true } }] }
                            }
                        },
                        {
                            "id": "w-todo",
                            "flavour": "affine:list",
                            "props": {
                                "type": "todo",
                                "checked": true,
                                "text": { "delta": [{ "insert": "Ship Release" }] }
                            },
                            "children": [
                                {
                                    "id": "w-nested",
                                    "flavour": "affine:paragraph",
                                    "props": { "type": "text", "text": { "delta": [{ "insert": "Nested detail" }] } }
                                }
                            ]
                        },
                        {
                            "id": "w-code",
                            "flavour": "affine:code",
                            "props": { "language": "rust", "text": { "delta": [{ "insert": "fn main() {}" }] } }
                        },
                        {
                            "id": "w-div",
                            "flavour": "affine:divider",
                            "props": {}
                        }
                    ]
                }
            ]
        })
        .to_string();
        let outer_mime = serde_json::json!({
            "blocksuite/surface": inner_surface_json
        })
        .to_string();
        let lz_attr = crate::clipboard::encode_html_snapshot(&outer_mime);
        let web_html = format!("<div data-blocksuite-snapshot=\"{lz_attr}\"></div>");
        let clip_item = ui::ClipboardItem::new_string_with_json_metadata(
            String::new(),
            serde_json::json!({ "text/html": web_html }),
        );

        s.app.update(|cx| {
            s.window
                .update(cx, |v, win, cx| {
                    v.set_document(state, cx);
                    v.set_mode(PlaygroundMode::Edgeless, win, cx);

                    let count_items = |view: &PlaygroundView| -> (usize, usize) {
                        let snap = view.page_snapshot().unwrap();
                        let root = snap.root.as_ref().unwrap();
                        let surf = root
                            .children
                            .iter()
                            .find_map(|c| match &c.content {
                                BlockContent::Surface { elements, .. } => Some(elements.len()),
                                _ => None,
                            })
                            .unwrap_or(0);
                        let notes = root
                            .children
                            .iter()
                            .filter(|c| matches!(c.content, BlockContent::Note { .. }))
                            .count();
                        (surf, notes)
                    };

                    assert_eq!(count_items(v), (0, 0));
                    // Unrelated or schema-invalid JSON payloads must result in 0 writes.
                    for bad in [
                        r#"{"total":2,"elements":[{"name":"left-pad"}]}"#,
                        r#"{"surfaceElements":[{"type":"button","xywh":"[0,0,10,10]"}]}"#,
                        r#"{"surfaceElements":[{"type":"shape","xywh":[0,0,10,10]}]}"#,
                    ] {
                        v.paste(ui::ClipboardItem::new_string(bad.to_string()), win, cx);
                        assert_eq!(
                            count_items(v),
                            (0, 0),
                            "invalid or non-BlockSuite JSON must write 0 elements: {bad}"
                        );
                    }

                    // Two consecutive pastes at the exact same scheduler timestamp must never collide.
                    v.paste(clip_item.clone(), win, cx);
                    assert_eq!(count_items(v), (5, 1));
                    if let Ok(dump_path) = std::env::var("BS_DUMP_PASTE_YJS")
                        && let Ok(bytes) = v.document().workspace.page(HOME_PAGE_ID).unwrap().encode_update_v1()
                    {
                        let _ = std::fs::write(dump_path, bytes);
                    }

                    // Verify Note subtree fidelity (H2+bold, checked Todo+nested child, code, divider)
                    // AND Connector target.id remapped to the new Note ID (never stale "w-note").
                    {
                        let snap = v.page_snapshot().unwrap();
                        let root = snap.root.as_ref().unwrap();
                        let note = root
                            .children
                            .iter()
                            .find(|c| matches!(c.content, BlockContent::Note { .. }))
                            .expect("pasted note");
                        assert_ne!(note.id, "w-note");
                        assert_eq!(note.children.len(), 4);
                        assert!(matches!(
                            &note.children[0].content,
                            BlockContent::Paragraph { kind: ParagraphType::H2, text, .. }
                                if text.plain == "Heading Bold"
                                    && text.delta.iter().any(|op| matches!(op, y_octo::TextDeltaOp::Insert { format: Some(f), .. } if f.contains_key("bold")))
                        ));
                        assert!(matches!(
                            &note.children[1].content,
                            BlockContent::List { kind: ListType::Todo, checked: true, text, .. }
                                if text.plain == "Ship Release"
                        ));
                        assert_eq!(note.children[1].children.len(), 1);
                        assert!(matches!(
                            &note.children[2].content,
                            BlockContent::Code { language, text, .. }
                                if language == "rust" && text == "fn main() {}"
                        ));
                        assert!(matches!(note.children[3].content, BlockContent::Divider));

                        let conn_target_id = root
                            .children
                            .iter()
                            .find_map(|c| match &c.content {
                                BlockContent::Surface { elements, .. } => {
                                    elements.iter().find_map(|e| match &e.kind {
                                        blocksuite_playground_doc::read::SurfaceElementKind::Connector(conn) => {
                                            conn.target.id.clone()
                                        }
                                        _ => None,
                                    })
                                }
                                _ => None,
                            });
                        assert_eq!(
                            conn_target_id.as_deref(),
                            Some(note.id.as_str()),
                            "connector target.id must remap to the newly allocated affine:note ID"
                        );
                    }

                    v.paste(clip_item.clone(), win, cx);
                    assert_eq!(count_items(v), (10, 2));

                    // One single Undo reverts the entire second paste (5 surface elements + 1 note).
                    v.history(false, win, cx).unwrap();
                    assert_eq!(count_items(v), (5, 1));
                    // Second Undo reverts the first paste completely.
                    v.history(false, win, cx).unwrap();
                    assert_eq!(count_items(v), (0, 0));
                })
                .unwrap();
        });
    }

    #[test]
    fn async_code_preview_wakes_view_automatically_without_manual_flush() {
        use std::sync::{
            Arc, Condvar, Mutex,
            atomic::{AtomicUsize, Ordering},
        };

        let _provider_lock = crate::GLOBAL_PREVIEW_PROVIDER_TEST_LOCK
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        let mmd_src = "flowchart LR\n  AutoWakeOrigin --> AutoWakeReady";
        let mut state = DocState::new("async-wakeup-doc", 991).unwrap();
        state
            .workspace
            .create_page(HOME_PAGE_ID, "Async Wakeup", 1)
            .unwrap();
        {
            let page = state.workspace.page_mut(HOME_PAGE_ID).unwrap();
            page.add_block(
                "root",
                BlockSpec::Page {
                    title: "Async Wakeup".into(),
                },
                None,
                None,
                1,
            )
            .unwrap();
            page.add_block(
                "note",
                BlockSpec::Note { xywh: None },
                Some("root"),
                None,
                2,
            )
            .unwrap();
            page.add_block(
                "mmd-auto",
                BlockSpec::Code {
                    text: mmd_src.into(),
                    language: Some("mermaid".into()),
                    caption: String::new(),
                },
                Some("note"),
                None,
                3,
            )
            .unwrap();
        }

        let s = TestSession::open(800, 600, PlaygroundTheme::Light);
        s.set_doc(state);

        let notify_count = Arc::new(AtomicUsize::new(0));
        let notify_clone = Arc::clone(&notify_count);
        let _obs = s.app.update(|cx| {
            let entity = s.window.entity(cx).unwrap();
            cx.observe(&entity, move |_, _| {
                notify_clone.fetch_add(1, Ordering::SeqCst);
            })
        });

        let rev_before = crate::block_flow::code_preview_revision(
            crate::block_flow::CodePreviewKind::Mermaid,
            mmd_src,
        );
        let pair = Arc::new((Mutex::new(false), Condvar::new()));
        let pair_bg = Arc::clone(&pair);
        let _sub = crate::block_flow::subscribe_preview_wakeup(Arc::new(move || {
            if crate::block_flow::code_preview_revision(
                crate::block_flow::CodePreviewKind::Mermaid,
                mmd_src,
            ) > rev_before
            {
                let (lock, cv) = &*pair_bg;
                *lock.lock().unwrap() = true;
                cv.notify_all();
            }
        }));

        // Initial render in Code mode, then click Preview toggle to arm async Mermaid preview.
        let _ = s.frame();
        s.app.update(|cx| {
            s.window
                .update(cx, |v, win, cx| {
                    v.dispatch_overlay(OverlayEvent::ToggleCodePreview("mmd-auto".into()), win, cx);
                })
                .unwrap();
        });
        s.platform.run_until_parked();
        notify_count.store(0, Ordering::SeqCst);

        // Render the Pending frame so `query_code_preview_provider` dispatches to the worker.
        let _ = s.frame();

        // Wait on the real background worker wakeup (strictly NO `flush_native_code_previews()`).
        {
            let (lock, cv) = &*pair;
            let mut woke = lock.lock().unwrap();
            while !*woke {
                let (next, timeout) = cv
                    .wait_timeout(woke, std::time::Duration::from_secs(10))
                    .unwrap();
                woke = next;
                assert!(!timeout.timed_out(), "background preview worker timed out");
            }
        }

        // Drain foreground tasks scheduled by `PlaygroundView`'s wakeup task and verify `cx.notify()` ran.
        s.platform.run_until_parked();
        assert!(
            notify_count.load(Ordering::SeqCst) >= 1,
            "PlaygroundView must invoke cx.notify() automatically when async preview completes"
        );
        let ready = crate::block_flow::query_code_preview_provider(
            crate::block_flow::CodePreviewKind::Mermaid,
            mmd_src,
            PlaygroundTheme::Light,
            1.0,
        );
        assert!(matches!(
            ready,
            Some(crate::block_flow::CodePreviewResult::Ready(_))
        ));
    }

    #[test]
    fn edgeless_paste_note_with_database_remaps_row_cells_and_handles_empty_or_single_views() {
        use blocksuite_playground_doc::read::DatabaseCellValue;
        use serde_json::json;

        let mut state = DocState::new("edgeless-db-paste", 992).unwrap();
        state
            .workspace
            .create_page(HOME_PAGE_ID, "Edgeless DB Paste", 1)
            .unwrap();
        {
            let page = state.workspace.page_mut(HOME_PAGE_ID).unwrap();
            page.add_block(
                "root",
                BlockSpec::Page {
                    title: "Edgeless DB Paste".into(),
                },
                None,
                None,
                1,
            )
            .unwrap();
        }

        let s = TestSession::open(1280, 800, PlaygroundTheme::Light);
        s.set_doc(state);
        s.app.update(|cx| {
            s.window
                .update(cx, |v, win, cx| {
                    v.set_mode(PlaygroundMode::Edgeless, win, cx);

                    // Case A: Note containing `affine:database` with 1 Table view, 1 checkbox column,
                    // and 1 checked child row `old-row` ("Task").
                    let db_note_payload = json!({
                        "type": "block",
                        "id": "old-note",
                        "flavour": "affine:note",
                        "version": 1,
                        "props": {
                            "xywh": "[100,100,448,260]",
                            "displayMode": "both"
                        },
                        "children": [{
                            "type": "block",
                            "id": "old-db",
                            "flavour": "affine:database",
                            "version": 3,
                            "props": {
                                "title": { "delta": [{ "insert": "Sprint Tasks" }] },
                                "views": [{
                                    "id": "view-1",
                                    "name": "Table View",
                                    "mode": "table",
                                    "columns": [{ "id": "col-done", "width": 120 }]
                                }],
                                "columns": [{
                                    "id": "col-done",
                                    "type": "checkbox",
                                    "name": "Done",
                                    "data": {}
                                }],
                                "cells": {
                                    "old-row": {
                                        "col-done": {
                                            "columnId": "col-done",
                                            "value": true
                                        }
                                    }
                                }
                            },
                            "children": [{
                                "type": "block",
                                "id": "old-row",
                                "flavour": "affine:paragraph",
                                "version": 1,
                                "props": {
                                    "type": "text",
                                    "text": { "delta": [{ "insert": "Task" }] }
                                },
                                "children": []
                            }]
                        }]
                    });
                    let clip_a = ui::ClipboardItem::new_string_with_json_metadata(
                        String::new(),
                        json!({
                            "BLOCKSUITE/SNAPSHOT": db_note_payload.to_string()
                        }),
                    );
                    v.paste(clip_a, win, cx);

                    let snap = v.page_snapshot().unwrap();
                    let root = snap.root.as_ref().unwrap();
                    let pasted_note = root
                        .children
                        .iter()
                        .find(|c| matches!(c.content, BlockContent::Note { .. }))
                        .expect("pasted database note");
                    assert_ne!(pasted_note.id, "old-note");
                    assert_eq!(pasted_note.children.len(), 1);
                    let db_node = &pasted_note.children[0];
                    assert_ne!(db_node.id, "old-db");
                    let BlockContent::Database(db) = &db_node.content else {
                        panic!("expected Database block content");
                    };
                    assert_eq!(db.title.plain, "Sprint Tasks");
                    assert_eq!(db.views.len(), 1, "single-item views array must stay Y.Array");
                    assert_eq!(db.columns.len(), 1, "single-item columns array must stay Y.Array");
                    assert_eq!(db.rows.len(), 1);
                    let new_row_id = &db.rows[0].row_id;
                    assert_ne!(new_row_id, "old-row");
                    assert_eq!(db.rows[0].title.plain, "Task");
                    assert_eq!(
                        db.cells.get(&(new_row_id.clone(), "col-done".to_string())),
                        Some(&DatabaseCellValue::Bool(true)),
                        "prop:cells must migrate old-row key to newly allocated row block ID"
                    );
                    assert!(
                        !db.cells.contains_key(&("old-row".to_string(), "col-done".to_string())),
                        "stale old-row key must not remain in prop:cells"
                    );

                    // Case B: 5 surface elements + 1 Note containing `affine:database` with empty `views: []`
                    // via both LZ-compressed HTML and direct MIME (must never fail with `zero-length struct`).
                    let empty_views_payload = json!({
                        "surfaceElements": [
                            { "id": "e-s1", "type": "shape", "shapeType": "rect", "xywh": "[0,0,80,40]", "index": "a0", "points": [] },
                            { "id": "e-s2", "type": "shape", "shapeType": "rect", "xywh": "[120,0,80,40]", "index": "a1" },
                            { "id": "e-mm", "type": "mindmap", "index": "a2", "style": 1, "layoutType": 0, "children": { "e-s1": { "index": "a0" }, "e-s2": { "index": "a1", "parent": "e-s1" } } },
                            { "id": "e-grp", "type": "group", "index": "a3", "children": { "$blocksuite:internal:native$": true, "value": { "e-s1": true, "e-s2": true } } },
                            { "id": "e-con", "type": "connector", "index": "a4", "mode": 1, "source": { "id": "e-s2" }, "target": { "id": "e-note" } }
                        ],
                        "blocks": [{
                            "type": "block",
                            "id": "e-note",
                            "flavour": "affine:note",
                            "props": { "xywh": "[240,0,400,200]", "displayMode": "both" },
                            "children": [{
                                "type": "block",
                                "id": "e-db",
                                "flavour": "affine:database",
                                "version": 3,
                                "props": {
                                    "title": "Empty Views DB",
                                    "views": [],
                                    "columns": [],
                                    "cells": {}
                                },
                                "children": []
                            }]
                        }]
                    });
                    let lz_attr =
                        crate::clipboard::encode_html_snapshot(&empty_views_payload.to_string());
                    let html = format!("<div data-blocksuite-snapshot=\"{lz_attr}\"></div>");
                    let clip_b = ui::ClipboardItem::new_string_with_json_metadata(
                        String::new(),
                        json!({ "text/html": html }),
                    );
                    v.paste(clip_b, win, cx);

                    let snap2 = v.page_snapshot().unwrap();
                    let root2 = snap2.root.as_ref().unwrap();
                    let surf_count = root2
                        .children
                        .iter()
                        .find_map(|c| match &c.content {
                            BlockContent::Surface { elements, .. } => Some(elements.len()),
                            _ => None,
                        })
                        .unwrap_or(0);
                    let note_count = root2
                        .children
                        .iter()
                        .filter(|c| matches!(c.content, BlockContent::Note { .. }))
                        .count();
                    assert_eq!(surf_count, 5, "all 5 surface elements must commit with empty views DB");
                    assert_eq!(note_count, 2, "second note with empty-views database must commit cleanly");
                    // Also verify V1 roundtrip decode succeeds with zero `IncompleteDocument` error.
                    let v1_bytes = v
                        .document()
                        .workspace
                        .page(HOME_PAGE_ID)
                        .unwrap()
                        .encode_update_v1()
                        .expect("encode V1");
                    let mut replica =
                        blocksuite_playground_doc::session::PageDocSession::new(HOME_PAGE_ID, 77)
                            .unwrap();
                    replica
                        .apply_remote_update_v1(&v1_bytes)
                        .expect("V1 decode must succeed without zero-length struct");
                })
                .unwrap();
        });
    }

    #[test]
    fn edgeless_note_paste_rejects_invalid_flavours_and_encodes_safe_js_numbers() {
        use blocksuite_playground_doc::read::{BlockContent, DatabaseCellValue};
        use serde_json::json;

        let mut state = DocState::new("edgeless-paste-guard", 912).unwrap();
        state
            .workspace
            .create_page(HOME_PAGE_ID, "Guarded Root Title", 1)
            .unwrap();
        {
            let page = state.workspace.page_mut(HOME_PAGE_ID).unwrap();
            page.add_block(
                "root",
                BlockSpec::Page {
                    title: "Guarded Root Title".into(),
                },
                None,
                None,
                1,
            )
            .unwrap();
            page.add_block("surface-0", BlockSpec::Surface, Some("root"), None, 2)
                .unwrap();
            page.add_block(
                "keep-note",
                BlockSpec::Note {
                    xywh: Some("[0,0,400,120]".into()),
                },
                Some("root"),
                None,
                3,
            )
            .unwrap();
        }

        let s = TestSession::open_with_options(
            1000,
            700,
            PlaygroundOptions {
                theme: PlaygroundTheme::Light,
                mode: PlaygroundMode::Edgeless,
                ..Default::default()
            },
        );
        s.set_doc(state);
        let _ = s.frame();

        s.app.update(|cx| {
            s.window
                .update(cx, |v, win, cx| {
                    let invalid_cases = [
                        (
                            "unknown flavour",
                            json!({
                                "flavour": "affine:note",
                                "props": { "xywh": "[10,10,300,100]" },
                                "children": [{
                                    "id": "bad-1",
                                    "flavour": "affine:made-up-block",
                                    "props": {},
                                    "children": []
                                }]
                            }),
                        ),
                        (
                            "nested affine:page inside note",
                            json!({
                                "flavour": "affine:note",
                                "props": { "xywh": "[10,10,300,100]" },
                                "children": [{
                                    "id": "hijack-page",
                                    "flavour": "affine:page",
                                    "props": { "title": "Hijacked" },
                                    "children": []
                                }]
                            }),
                        ),
                        (
                            "nested affine:note inside note",
                            json!({
                                "flavour": "affine:note",
                                "props": { "xywh": "[10,10,300,100]" },
                                "children": [{
                                    "id": "nested-note",
                                    "flavour": "affine:note",
                                    "props": { "xywh": "[0,0,100,100]" },
                                    "children": []
                                }]
                            }),
                        ),
                        (
                            "missing flavour field",
                            json!({
                                "flavour": "affine:note",
                                "props": { "xywh": "[10,10,300,100]" },
                                "children": [{
                                    "id": "no-flavour",
                                    "props": { "text": "Sneaky" },
                                    "children": []
                                }]
                            }),
                        ),
                        (
                            "leaf block with children",
                            json!({
                                "flavour": "affine:note",
                                "props": { "xywh": "[10,10,300,100]" },
                                "children": [{
                                    "id": "bad-div",
                                    "flavour": "affine:divider",
                                    "props": {},
                                    "children": [{
                                        "id": "illegal-child",
                                        "flavour": "affine:paragraph",
                                        "props": { "text": "x" },
                                        "children": []
                                    }]
                                }]
                            }),
                        ),
                    ];

                    for (label, payload) in invalid_cases {
                        let clip = ui::ClipboardItem::new_string_with_json_metadata(
                            String::new(),
                            json!({ crate::clipboard::SNAPSHOT_MIME: payload }),
                        );
                        assert!(
                            !v.paste_edgeless_clipboard_item(&clip, win, cx),
                            "{label} must be rejected before mutating CRDT"
                        );
                        let snap = v.page_snapshot().unwrap();
                        let root = snap.root.as_ref().expect("root must survive");
                        assert_eq!(root.id, "root", "{label}: root block ID must stay intact");
                        let note_count = root
                            .children
                            .iter()
                            .filter(|c| matches!(c.content, BlockContent::Note { .. }))
                            .count();
                        assert_eq!(note_count, 1, "{label}: no invalid note may be inserted");
                    }

                    // Valid Note with 3 GB attachment + date-column database must preserve columns/views
                    // and encode >i32 integers as IEEE-754 Float64 (never Yjs lib0 tag 122 BigInt64).
                    let valid_note = json!({
                        "flavour": "affine:note",
                        "id": "src-note-valid",
                        "props": { "xywh": "[40,40,448,260]", "displayMode": "both" },
                        "children": [
                            {
                                "id": "src-att-3gb",
                                "flavour": "affine:attachment",
                                "props": {
                                    "name": "archive.tar",
                                    "size": 3_000_000_000_i64,
                                    "type": "application/x-tar",
                                    "sourceId": "blob-3gb"
                                },
                                "children": []
                            },
                            {
                                "id": "src-db-date",
                                "flavour": "affine:database",
                                "version": 3,
                                "props": {
                                    "title": "Schedule",
                                    "columns": [
                                        { "id": "col-due", "name": "Due", "type": "date", "data": {} }
                                    ],
                                    "views": [
                                        { "id": "v-tbl", "name": "Table View", "mode": "table", "columns": [{ "id": "col-due", "width": 180 }] }
                                    ],
                                    "cells": {
                                        "src-row-date": {
                                            "col-due": { "columnId": "col-due", "value": 1_795_800_000_000_i64 }
                                        }
                                    }
                                },
                                "children": [
                                    {
                                        "id": "src-row-date",
                                        "flavour": "affine:paragraph",
                                        "props": { "type": "text", "text": "Milestone" },
                                        "children": []
                                    }
                                ]
                            }
                        ]
                    });
                    let clip_ok = ui::ClipboardItem::new_string_with_json_metadata(
                        String::new(),
                        json!({ crate::clipboard::SNAPSHOT_MIME: valid_note }),
                    );
                    assert!(v.paste_edgeless_clipboard_item(&clip_ok, win, cx));

                    let snap = v.page_snapshot().unwrap();
                    let pasted = snap
                        .root
                        .as_ref()
                        .unwrap()
                        .children
                        .iter()
                        .find(|c| c.id != "surface-0" && c.id != "keep-note")
                        .expect("pasted valid note");
                    let BlockContent::Attachment { size: att_size, .. } =
                        &pasted.children[0].content
                    else {
                        panic!("expected Attachment block");
                    };
                    assert_eq!(*att_size, 3_000_000_000);
                    let BlockContent::Database(db) = &pasted.children[1].content else {
                        panic!("expected Database block");
                    };
                    assert_eq!(db.columns.len(), 1, "date column must survive paste");
                    assert_eq!(db.views.len(), 1, "table view must survive paste");
                    let new_row_id = &pasted.children[1].children[0].id;
                    assert_eq!(
                        db.cells.get(&(new_row_id.clone(), "col-due".to_string())),
                        Some(&DatabaseCellValue::Number(1_795_800_000_000.0)),
                        "date cell timestamp >i32 must encode as Float64 JS Number rather than BigInt64"
                    );
                })
                .unwrap();
        });
    }

    #[test]
    fn code_preview_empty_source_tall_logical_width_and_steady_multi_diagram_reuse() {
        use crate::block_flow::{
            CodePreviewKind, CodePreviewResult, ensure_native_preview_providers_installed,
            flush_native_code_previews, query_code_preview_provider,
        };

        let _provider_lock = crate::GLOBAL_PREVIEW_PROVIDER_TEST_LOCK
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        ensure_native_preview_providers_installed();

        // 1. Empty source returns immediate Error instead of spinning Pending forever.
        assert!(matches!(
            query_code_preview_provider(
                CodePreviewKind::Mermaid,
                "   \n\t ",
                PlaygroundTheme::Light,
                2.0
            ),
            Some(CodePreviewResult::Error(_))
        ));

        // 2. Tall 18-node vertical flowchart retains full 1x logical width (never shrunk to sliver).
        let mut tall_mmd = String::from("flowchart TD\n");
        for idx in 0..18 {
            tall_mmd.push_str(&format!(
                "  Step{idx}[\"Pipeline Stage {idx}: Validation & Verification Gate\"] --> Step{}\n",
                idx + 1
            ));
        }
        let _ = query_code_preview_provider(
            CodePreviewKind::Mermaid,
            &tall_mmd,
            PlaygroundTheme::Light,
            3.0,
        );
        flush_native_code_previews();
        match query_code_preview_provider(
            CodePreviewKind::Mermaid,
            &tall_mmd,
            PlaygroundTheme::Light,
            3.0,
        ) {
            Some(CodePreviewResult::Ready(slot)) => {
                assert!(
                    slot.width_pt >= 160.0,
                    "tall flowchart must preserve readable 1x logical width, got {}",
                    slot.width_pt
                );
            }
            _ => panic!("expected Ready slot for tall flowchart"),
        }

        // 3. 32 distinct multi-node previews on one page all converge to Ready without manual
        //    re-toggle and reuse 100% of BlockBodies (`laid_out == 0`) on subsequent frames.
        const PREVIEW_COUNT: usize = 32;
        let mut state = DocState::new("multi-preview-steady", 913).unwrap();
        state
            .workspace
            .create_page(HOME_PAGE_ID, "Multi Preview", 1)
            .unwrap();
        {
            let page = state.workspace.page_mut(HOME_PAGE_ID).unwrap();
            page.add_block(
                "root",
                BlockSpec::Page {
                    title: "Multi Preview".into(),
                },
                None,
                None,
                1,
            )
            .unwrap();
            page.add_block(
                "note",
                BlockSpec::Note { xywh: None },
                Some("root"),
                None,
                2,
            )
            .unwrap();
            for i in 0..PREVIEW_COUNT {
                page.add_block(
                    &format!("m-{i}"),
                    BlockSpec::Code {
                        text: format!(
                            "flowchart TB\n  subgraph G{i}[\"Cluster {i}\"]\n    A{i}[Alpha {i}] --> B{i}[Beta {i}] --> C{i}[Gamma {i}] --> D{i}[Delta {i}]\n  end"
                        ),
                        language: Some("mermaid".into()),
                        caption: String::new(),
                    },
                    Some("note"),
                    None,
                    3 + i as u64,
                )
                .unwrap();
            }
        }
        let s = TestSession::open(900, 18_000, PlaygroundTheme::Light);
        s.set_doc(state);
        s.app.update(|cx| {
            s.window
                .update(cx, |v, win, cx| {
                    for i in 0..PREVIEW_COUNT {
                        v.dispatch_overlay(
                            OverlayEvent::ToggleCodePreview(format!("m-{i}")),
                            win,
                            cx,
                        );
                    }
                })
                .unwrap();
        });
        let _ = s.frame();
        flush_native_code_previews();
        let settled = s.frame();
        for i in 0..PREVIEW_COUNT {
            let el = settled
                .elements
                .get(&format!("page.block.m-{i}"))
                .unwrap_or_else(|| panic!("missing page.block.m-{i}"));
            assert!(
                el.bounds.height > 110.0,
                "preview m-{i} must settle to Ready diagram height (>110px), got {}",
                el.bounds.height
            );
        }
        // Subsequent frames when an unrelated preview revision bumps must reuse all 32 Ready
        // previews with 0 relayout, and even a full env_rev pass must hit O(1) cache/live_weak.
        s.app.update(|cx| {
            s.window
                .update(cx, |_, _, cx| {
                    crate::block_flow::bump_preview_revision();
                    cx.notify();
                })
                .unwrap();
        });
        let _ = s.frame();
        s.app.update(|cx| {
            s.window
                .update(cx, |v, _, _| {
                    let layout = v.flow_layout().unwrap();
                    assert_eq!(
                        layout.stats.laid_out, 0,
                        "all 32 open previews must stay cached with 0 relayout"
                    );
                })
                .unwrap();
        });
    }

    #[test]
    fn table_toolbar_reserves_zero_unfocused_space_and_docks_cleanly_on_tall_tables() {
        let mut state = DocState::new("table-toolbar-cases", 914).unwrap();
        state
            .workspace
            .create_page(HOME_PAGE_ID, "Table Cases", 1)
            .unwrap();
        {
            let page = state.workspace.page_mut(HOME_PAGE_ID).unwrap();
            page.add_block(
                "root",
                BlockSpec::Page {
                    title: "Table Cases".into(),
                },
                None,
                None,
                1,
            )
            .unwrap();
            page.add_block(
                "note",
                BlockSpec::Note { xywh: None },
                Some("root"),
                None,
                2,
            )
            .unwrap();
            page.add_block(
                "p-above",
                BlockSpec::Paragraph {
                    paragraph_type: ParagraphType::Text,
                    text: "Paragraph above the wide table must never be overlapped.".into(),
                },
                Some("note"),
                None,
                3,
            )
            .unwrap();
            let rows: Vec<Vec<String>> = (0..28)
                .map(|r| {
                    vec![
                        format!("R{r}A"),
                        format!("R{r}B"),
                        format!("R{r}C"),
                        format!("R{r}D"),
                    ]
                })
                .collect();
            page.add_block("tbl-tall", BlockSpec::Table { rows }, Some("note"), None, 4)
                .unwrap();
            page.add_block(
                "p-below",
                BlockSpec::Paragraph {
                    paragraph_type: ParagraphType::Text,
                    text: "Paragraph below the wide table.".into(),
                },
                Some("note"),
                None,
                5,
            )
            .unwrap();
        }

        let s = TestSession::open_with_options(
            390,
            844,
            PlaygroundOptions {
                theme: PlaygroundTheme::Light,
                form_factor: crate::FormFactor::Phone,
                ..Default::default()
            },
        );
        s.set_doc(state);
        let _ = s.frame();

        // 1. Unfocused table has zero 52px bottom toolbar reserve.
        let unfocused_h = s.app.update(|cx| {
            s.window
                .update(cx, |v, _, _| {
                    v.flow_layout()
                        .unwrap()
                        .block("tbl-tall")
                        .unwrap()
                        .body
                        .height
                })
                .unwrap()
        });

        // 2. Focusing row-0 expands focused bottom slot by +52px AND docks toolbar without overlapping p-above.
        s.overlay(OverlayEvent::FocusTableCell {
            block_id: "tbl-tall".into(),
            row_id: "row-0".into(),
            column_id: "col-0".into(),
            screen_pos: None,
        });
        let focused_snap = s.frame();
        let focused_h = s.app.update(|cx| {
            s.window
                .update(cx, |v, _, _| {
                    v.flow_layout()
                        .unwrap()
                        .block("tbl-tall")
                        .unwrap()
                        .body
                        .height
                })
                .unwrap()
        });
        assert!(
            (focused_h - unfocused_h - 52.0).abs() < 0.5,
            "only focused wide table should reserve 52px slot (unfocused={unfocused_h}, focused={focused_h})"
        );
        let above = focused_snap.elements.get("page.block.p-above").unwrap();
        let bar = focused_snap
            .elements
            .get("overlay.table_toolbar")
            .expect("focused tall table must show toolbar");
        assert!(
            bar.bounds.y >= above.bounds.y + above.bounds.height,
            "tall table toolbar top ({}) must never overlap preceding paragraph bottom ({})",
            bar.bounds.y,
            above.bounds.y + above.bounds.height
        );

        // 3. Read-only mode collapses the 52px reserve back to unfocused height and hides toolbar.
        s.app.update(|cx| {
            s.window
                .update(cx, |v, _, cx| v.set_page_readonly(true, cx))
                .unwrap();
        });
        let ro_snap = s.frame();
        assert!(!ro_snap.elements.contains_key("overlay.table_toolbar"));
        let ro_h = s.app.update(|cx| {
            s.window
                .update(cx, |v, _, _| {
                    v.flow_layout()
                        .unwrap()
                        .block("tbl-tall")
                        .unwrap()
                        .body
                        .height
                })
                .unwrap()
        });
        assert!(
            (ro_h - unfocused_h).abs() < 0.5,
            "readonly wide table must have 0px toolbar reserve (ro={ro_h}, unfocused={unfocused_h})"
        );
    }
}
