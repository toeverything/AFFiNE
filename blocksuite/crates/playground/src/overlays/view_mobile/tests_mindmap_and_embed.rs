//! Regression tests for live `embed-synced-doc` deep-block invalidation, Mindmap laid-out
//! `SurfaceRef` thumbnails + desktop Edgeless hit-testing, Mindmap-only first-frame camera fit,
//! historical cross-DST local timestamp formatting on `embed-linked-doc`, and `0.27.5` Mindmap
//! `StrokeColorShortMap` medium palette colors.

use std::{collections::BTreeMap, rc::Rc};

use blocksuite_editor::{
    WorkspaceDocDirectory as _,
    surface::{WorldBounds, mindmap_connectors},
};
use blocksuite_playground_doc::{
    read::{ColorValue, MindmapLayoutType, MindmapNodeDetail, MindmapStyle, SurfaceMindmap},
    schema::{BlockSpec, MindmapNodeSpec, ParagraphType, SurfaceElementSpec},
};
use ui::{
    AppContext as _, Application, Bounds, HeadlessPlatform, WindowBounds, WindowOptions,
    audit_frame_snapshot, point, px, size,
};

use crate::{
    DocState, HOME_PAGE_ID, PlaygroundMode, PlaygroundOptions, PlaygroundTheme, PlaygroundView,
    register_bundled_fonts,
};

use super::tests::MobileSession;

#[test]
fn synced_doc_eighth_paragraph_updates_live_when_title_and_first_two_blocks_stay_unchanged() {
    let s = MobileSession::open(800, 900, PlaygroundTheme::Light);
    let mut state = DocState::new("synced-8th-live", 61).unwrap();
    state
        .workspace
        .create_page("doc:child", "Shared Spec", 1_795_731_000_000)
        .unwrap();
    {
        let child = state.workspace.ensure_page("doc:child").unwrap();
        child
            .add_block(
                "c-root",
                BlockSpec::Page {
                    title: "Shared Spec".into(),
                },
                None,
                None,
                1,
            )
            .unwrap();
        child
            .add_block(
                "c-note",
                BlockSpec::Note { xywh: None },
                Some("c-root"),
                None,
                2,
            )
            .unwrap();
        for i in 1..=8 {
            child
                .add_block(
                    format!("c-p{i}"),
                    BlockSpec::Paragraph {
                        paragraph_type: ParagraphType::Text,
                        text: format!("Paragraph {i}: initial version"),
                    },
                    Some("c-note"),
                    None,
                    10 + i as u64,
                )
                .unwrap();
        }
    }
    state
        .workspace
        .create_page(HOME_PAGE_ID, "Parent Doc", 1_795_731_000_000)
        .unwrap();
    {
        let home = state.workspace.ensure_page(HOME_PAGE_ID).unwrap();
        home.add_block(
            "h-root",
            BlockSpec::Page {
                title: "Parent Doc".into(),
            },
            None,
            None,
            100,
        )
        .unwrap();
        home.add_block(
            "h-note",
            BlockSpec::Note { xywh: None },
            Some("h-root"),
            None,
            101,
        )
        .unwrap();
        home.add_block(
            "b-synced",
            BlockSpec::EmbedSyncedDoc {
                page_id: "doc:child".into(),
                caption: String::new(),
            },
            Some("h-note"),
            None,
            102,
        )
        .unwrap();
    }

    s.app.update(|cx| {
        s.window
            .update(cx, |v, _, cx| v.set_document(state, cx))
            .unwrap();
    });
    let snap_before = s.frame();
    assert!(audit_frame_snapshot(&snap_before).is_empty());
    let img_before = s.app.update(|cx| {
        s.window
            .update(cx, |_, window, _| window.render_to_image().unwrap())
            .unwrap()
    });
    let rev_before = s.view(|v| {
        v.default_doc_directory
            .doc_preview(&"doc:child".into())
            .unwrap()
            .revision
    });

    // Simulate a remote peer editing ONLY the 8th paragraph of `doc:child`, leaving title,
    // paragraphs 1..=7, and `PageMeta` timestamps untouched.
    let mut peer = DocState::new("synced-8th-live", 62).unwrap();
    let child_sv = peer
        .workspace
        .ensure_page("doc:child")
        .unwrap()
        .encode_state_vector_v1()
        .unwrap();
    let full_update = s.view(|v| {
        v.document()
            .workspace
            .page("doc:child")
            .unwrap()
            .encode_diff_v1(&child_sv)
            .unwrap()
    });
    peer.workspace
        .ensure_page("doc:child")
        .unwrap()
        .apply_remote_update_v1(&full_update)
        .unwrap();
    let local_sv = s.view(|v| {
        v.document()
            .workspace
            .page("doc:child")
            .unwrap()
            .encode_state_vector_v1()
            .unwrap()
    });
    {
        let peer_child = peer.workspace.ensure_page("doc:child").unwrap();
        peer_child
            .insert_text(
                "c-p8",
                "prop:text",
                28,
                " — UPDATED BY PEER WITH EXTRA CONTENT ON LINE TWO FOR PIXEL DIFF",
                200,
            )
            .unwrap();
    }
    let delta_update = peer
        .workspace
        .page("doc:child")
        .unwrap()
        .encode_diff_v1(&local_sv)
        .unwrap();

    s.app.update(|cx| {
        s.window
            .update(cx, |v, _, cx| {
                v.edit_document(cx, |st| {
                    st.workspace
                        .ensure_page("doc:child")
                        .unwrap()
                        .apply_remote_update_v1(&delta_update)
                        .unwrap();
                });
            })
            .unwrap();
    });
    let snap_after = s.frame();
    assert!(audit_frame_snapshot(&snap_after).is_empty());
    let rev_after = s.view(|v| {
        v.default_doc_directory
            .doc_preview(&"doc:child".into())
            .unwrap()
            .revision
    });
    assert!(
        rev_after > rev_before,
        "preview revision must advance when paragraph 8 changes ({rev_before} -> {rev_after})"
    );
    let img_after = s.app.update(|cx| {
        s.window
            .update(cx, |_, window, _| window.render_to_image().unwrap())
            .unwrap()
    });
    assert_ne!(
        img_before.as_raw(),
        img_after.as_raw(),
        "open parent page must repaint paragraph 8 of embed-synced-doc after remote update"
    );
}

#[test]
fn mindmap_laid_out_child_renders_in_unmembered_frame_thumbnail_and_hits_by_visible_center() {
    let s = MobileSession::open(900, 800, PlaygroundTheme::Light);
    let mut state = DocState::new("mm-frame-hit", 63).unwrap();
    state
        .workspace
        .create_page(HOME_PAGE_ID, "Mindmap Frame Parity", 1_795_731_000_000)
        .unwrap();
    {
        let page = state.workspace.ensure_page(HOME_PAGE_ID).unwrap();
        page.add_block(
            "root",
            BlockSpec::Page {
                title: "Mindmap Frame Parity".into(),
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
        let surface_id = "surf-mm";
        page.add_block(surface_id, BlockSpec::Surface, Some("root"), None, 3)
            .unwrap();
        // Both nodes share raw `[0, 0, 100, 40]`; Right layout places `mm-child` at `[300, 0, 100, 40]`.
        for (id, label, idx) in [("mm-root", "Root", "a0"), ("mm-child", "Right Child", "a1")] {
            page.add_surface_element(
                surface_id,
                id,
                idx,
                SurfaceElementSpec::Shape {
                    shape_type: "rect".into(),
                    xywh: "[0,0,100,40]".into(),
                    seed: 1,
                    filled: true,
                    text: Some(label.into()),
                },
                4,
            )
            .unwrap();
            page.set_surface_element_field(
                surface_id,
                id,
                "fillColor",
                y_octo::SessionValue::Any(y_octo::Any::String("#facc15".into())),
                4,
            )
            .unwrap();
        }
        page.add_surface_element(
            surface_id,
            "mm-tree",
            "a2",
            SurfaceElementSpec::Mindmap {
                seed: 7,
                layout_type: 0,
                style: 1,
                children: vec![
                    (
                        "mm-root".into(),
                        MindmapNodeSpec {
                            index: "a0".into(),
                            parent: None,
                            collapsed: false,
                        },
                    ),
                    (
                        "mm-child".into(),
                        MindmapNodeSpec {
                            index: "a0".into(),
                            parent: Some("mm-root".into()),
                            collapsed: false,
                        },
                    ),
                ],
            },
            5,
        )
        .unwrap();
        // Unmembered Frame placed over `[280, -30, 160, 100]` (covers laid-out `mm-child` at x=300..400,
        // does NOT intersect raw `[0, 0, 100, 40]`).
        page.add_block(
            "frame-child",
            BlockSpec::Frame {
                title: "Right Node Frame".into(),
                xywh: Some("[280,-30,160,100]".into()),
                presentation_index: Some("a0".into()),
            },
            Some(surface_id),
            None,
            6,
        )
        .unwrap();
        page.add_block(
            "b-sref",
            BlockSpec::SurfaceRef {
                reference: "frame-child".into(),
                ref_flavour: "affine:frame".into(),
                caption: String::new(),
            },
            Some("note"),
            None,
            7,
        )
        .unwrap();
    }

    s.app.update(|cx| {
        s.window
            .update(cx, |v, _, cx| v.set_document(state, cx))
            .unwrap();
    });
    let page_snap = s.frame();
    assert!(audit_frame_snapshot(&page_snap).is_empty());
    let sref_bounds = page_snap.elements["page.block.b-sref"].bounds;
    let img = s.app.update(|cx| {
        s.window
            .update(cx, |_, window, _| window.render_to_image().unwrap())
            .unwrap()
    });
    // Sample inside the SurfaceRef thumbnail interior for yellow `#facc15` (`R > 220, G > 180, B < 80`).
    let mut yellow_pixels = 0usize;
    let x0 = (sref_bounds.x as u32).saturating_add(16);
    let x1 = ((sref_bounds.x + sref_bounds.width) as u32)
        .saturating_sub(16)
        .min(img.width());
    let y0 = (sref_bounds.y as u32).saturating_add(16);
    let y1 = ((sref_bounds.y + sref_bounds.height) as u32)
        .saturating_sub(36)
        .min(img.height());
    for y in y0..y1 {
        for x in x0..x1 {
            let p = img.get_pixel(x, y).0;
            if p[0] > 220 && p[1] > 180 && p[2] < 80 {
                yellow_pixels += 1;
            }
        }
    }
    assert!(
        yellow_pixels >= 100,
        "SurfaceRef thumbnail over x=300 must render laid-out mindmap child shape ({yellow_pixels} px)"
    );

    // Switch to desktop Edgeless mode and verify world hit-testing at visible center `(350, 20)`.
    s.app.update(|cx| {
        s.window
            .update(cx, |v, window, cx| {
                v.set_mode(PlaygroundMode::Edgeless, window, cx)
            })
            .unwrap();
    });
    let _ = s.frame();
    let (hit_child, hit_root) = s.view(|v| {
        (
            v.edgeless
                .authoring
                .hit_test_world(350.0, 20.0, 1.0)
                .map(|i| i.id.clone()),
            v.edgeless
                .authoring
                .hit_test_world(50.0, 20.0, 1.0)
                .map(|i| i.id.clone()),
        )
    });
    assert_eq!(hit_child.as_deref(), Some("mm-child"));
    assert_eq!(hit_root.as_deref(), Some("mm-root"));
}

#[test]
fn mindmap_only_whiteboard_at_5000_5000_auto_fits_visible_nodes_on_first_frame() {
    let mut state = DocState::new("mm-5000-autofit", 64).unwrap();
    state
        .workspace
        .create_page(HOME_PAGE_ID, "Far Mindmap", 1_795_731_000_000)
        .unwrap();
    {
        let page = state.workspace.ensure_page(HOME_PAGE_ID).unwrap();
        page.add_block(
            "root",
            BlockSpec::Page {
                title: "Far Mindmap".into(),
            },
            None,
            None,
            1,
        )
        .unwrap();
        let surface_id = "surf-far";
        page.add_block(surface_id, BlockSpec::Surface, Some("root"), None, 2)
            .unwrap();
        for (id, label, idx) in [
            ("far-root", "Far Root", "a0"),
            ("far-leaf", "Far Leaf", "a1"),
        ] {
            page.add_surface_element(
                surface_id,
                id,
                idx,
                SurfaceElementSpec::Shape {
                    shape_type: "rect".into(),
                    xywh: "[5000,5000,120,44]".into(),
                    seed: 2,
                    filled: true,
                    text: Some(label.into()),
                },
                3,
            )
            .unwrap();
            page.set_surface_element_field(
                surface_id,
                id,
                "fillColor",
                y_octo::SessionValue::Any(y_octo::Any::String("#facc15".into())),
                3,
            )
            .unwrap();
        }
        page.add_surface_element(
            surface_id,
            "far-mm",
            "a2",
            SurfaceElementSpec::Mindmap {
                seed: 3,
                layout_type: 0,
                style: 1,
                children: vec![
                    (
                        "far-root".into(),
                        MindmapNodeSpec {
                            index: "a0".into(),
                            parent: None,
                            collapsed: false,
                        },
                    ),
                    (
                        "far-leaf".into(),
                        MindmapNodeSpec {
                            index: "a0".into(),
                            parent: Some("far-root".into()),
                            collapsed: false,
                        },
                    ),
                ],
            },
            4,
        )
        .unwrap();
    }

    let platform = HeadlessPlatform::new(1000, 700, 1.0);
    let app = Application::with_platform(platform.clone()).run_embedded(|cx| {
        register_bundled_fonts(cx).unwrap();
    });
    let window = app
        .update(|cx| {
            cx.open_window(
                WindowOptions {
                    window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                        point(px(0.0), px(0.0)),
                        size(px(1000.0), px(700.0)),
                    ))),
                    ..Default::default()
                },
                |_, cx| {
                    cx.new(|cx| {
                        let mut v = PlaygroundView::with_options(
                            PlaygroundOptions {
                                mode: PlaygroundMode::Edgeless,
                                theme: PlaygroundTheme::Light,
                                ..Default::default()
                            },
                            cx,
                        );
                        v.set_document(state, cx);
                        v
                    })
                },
            )
        })
        .unwrap();
    let headless = platform.windows().into_iter().next().unwrap();
    headless.request_frame();
    platform.run_until_parked();

    let (vis, img) = app.update(|cx| {
        window
            .update(cx, |v, win, _| {
                let vis = v
                    .edgeless
                    .camera
                    .visible_world_bounds(size(px(1000.0), px(652.0)));
                (vis, win.render_to_image().unwrap())
            })
            .unwrap()
    });
    assert!(
        vis.x <= 5000.0 && vis.right() >= 5440.0 && vis.y <= 5000.0 && vis.bottom() >= 5044.0,
        "first Edgeless frame must auto-fit mindmap around (5000, 5000), got visible={vis:?}"
    );
    let yellow_px = img
        .pixels()
        .filter(|p| p.0[0] > 220 && p.0[1] > 180 && p.0[2] < 80)
        .count();
    assert!(
        yellow_px >= 200,
        "first Edgeless frame must paint mindmap without manual camera setup ({yellow_px} px)"
    );
}

#[test]
fn embed_linked_doc_formats_summer_update_with_edt_offset_when_viewed_in_new_york_winter() {
    // 2026-07-01 04:30:00 UTC -> in America/New_York (EDT, UTC-4 = -240 min) = 2026-07-01 00:30.
    // Under Winter EST (UTC-5 = -300 min), it would wrongly format as 2026-06-30 23:30.
    const JULY_01_0430_UTC_MS: i64 = 1_782_880_200_000;
    const JAN_15_1200_UTC_MS: i64 = 1_768_478_400_000;

    let build_doc = || {
        let mut state = DocState::new("dst-linked-card", 65).unwrap();
        state
            .workspace
            .create_page("doc:july", "Summer Release", JULY_01_0430_UTC_MS)
            .unwrap();
        {
            let p = state.workspace.ensure_page("doc:july").unwrap();
            p.add_block(
                "j-root",
                BlockSpec::Page {
                    title: "Summer Release".into(),
                },
                None,
                None,
                1,
            )
            .unwrap();
        }
        state
            .workspace
            .create_page(HOME_PAGE_ID, "Index", JAN_15_1200_UTC_MS)
            .unwrap();
        {
            let home = state.workspace.ensure_page(HOME_PAGE_ID).unwrap();
            home.add_block(
                "i-root",
                BlockSpec::Page {
                    title: "Index".into(),
                },
                None,
                None,
                10,
            )
            .unwrap();
            home.add_block(
                "i-note",
                BlockSpec::Note { xywh: None },
                Some("i-root"),
                None,
                11,
            )
            .unwrap();
            home.add_block(
                "b-link-july",
                BlockSpec::EmbedLinkedDoc {
                    page_id: "doc:july".into(),
                    style: "horizontal".into(),
                    caption: String::new(),
                },
                Some("i-note"),
                None,
                12,
            )
            .unwrap();
        }
        state
    };

    // Session A: Viewer in America/New_York during Winter (`calendar_clock` = Jan 15, EST -300),
    // with IANA timezone `"America/New_York"`.
    let s_ny = MobileSession::open(720, 480, PlaygroundTheme::Light);
    s_ny.app.update(|cx| {
        s_ny.window
            .update(cx, |v, _, cx| {
                v.calendar_clock = Some(Rc::new(|| (JAN_15_1200_UTC_MS, -300)));
                v.set_calendar_timezone_iana("America/New_York", cx)
                    .unwrap();
                v.set_document(build_doc(), cx);
            })
            .unwrap();
    });
    let _ = s_ny.frame();
    let (july_off, jan_off) = s_ny.view(|v| {
        let f = v.utc_offset_resolver();
        (f(JULY_01_0430_UTC_MS), f(JAN_15_1200_UTC_MS))
    });
    assert_eq!(
        july_off, -240,
        "July timestamp in NY must resolve to EDT (-240)"
    );
    assert_eq!(
        jan_off, -300,
        "January timestamp in NY must resolve to EST (-300)"
    );
    let img_ny = s_ny.app.update(|cx| {
        s_ny.window
            .update(cx, |_, win, _| win.render_to_image().unwrap())
            .unwrap()
    });

    // Session B: Reference fixed `-240` (`Updated 2026-07-01 00:30`).
    let s_edt_ref = MobileSession::open(720, 480, PlaygroundTheme::Light);
    s_edt_ref.app.update(|cx| {
        s_edt_ref
            .window
            .update(cx, |v, _, cx| {
                v.calendar_clock = Some(Rc::new(|| (JAN_15_1200_UTC_MS, -240)));
                v.set_document(build_doc(), cx);
            })
            .unwrap();
    });
    let _ = s_edt_ref.frame();
    let img_edt_ref = s_edt_ref.app.update(|cx| {
        s_edt_ref
            .window
            .update(cx, |_, win, _| win.render_to_image().unwrap())
            .unwrap()
    });

    // Session C: Buggy fixed `-300` (`Updated 2026-06-30 23:30`).
    let s_est_bug = MobileSession::open(720, 480, PlaygroundTheme::Light);
    s_est_bug.app.update(|cx| {
        s_est_bug
            .window
            .update(cx, |v, _, cx| {
                v.calendar_clock = Some(Rc::new(|| (JAN_15_1200_UTC_MS, -300)));
                v.set_document(build_doc(), cx);
            })
            .unwrap();
    });
    let _ = s_est_bug.frame();
    let img_est_bug = s_est_bug.app.update(|cx| {
        s_est_bug
            .window
            .update(cx, |_, win, _| win.render_to_image().unwrap())
            .unwrap()
    });

    assert_eq!(
        img_ny.as_raw(),
        img_edt_ref.as_raw(),
        "NY winter viewer must render July card identical to EDT (-240: 2026-07-01 00:30)"
    );
    assert_ne!(
        img_ny.as_raw(),
        img_est_bug.as_raw(),
        "NY winter viewer must NOT render July card with winter EST offset (-300: 2026-06-30 23:30)"
    );
}

#[test]
fn mindmap_styles_resolve_exact_0275_v2_medium_palette_colors_and_paint_under_nodes() {
    let mut nodes: BTreeMap<String, MindmapNodeDetail> = BTreeMap::new();
    nodes.insert(
        "root".into(),
        MindmapNodeDetail {
            index: "a0".into(),
            parent: None,
            collapsed: false,
        },
    );
    for (i, id) in ["c0", "c1", "c2", "c3", "c4", "c5"].into_iter().enumerate() {
        nodes.insert(
            id.into(),
            MindmapNodeDetail {
                index: format!("a{}", i + 1),
                parent: Some("root".into()),
                collapsed: false,
            },
        );
    }
    let bounds: BTreeMap<String, WorldBounds> = nodes
        .keys()
        .map(|k| {
            (
                k.clone(),
                WorldBounds {
                    xywh: [0.0, 0.0, 100.0, 40.0],
                    rotate: 0.0,
                },
            )
        })
        .collect();

    let to_hex = |c: &ColorValue, theme: PlaygroundTheme| -> String {
        let raw = match c {
            ColorValue::Single(s) => s.as_str(),
            ColorValue::Themed { light, dark } => {
                if theme == PlaygroundTheme::Light {
                    light.as_str()
                } else {
                    dark.as_str()
                }
            }
        };
        let hsla = theme
            .css_color(raw)
            .or_else(|| theme.css_var(raw))
            .expect("palette token must resolve");
        blocksuite_editor::block_flow::hsla_to_css_hex(hsla)
    };

    // StyleFour cycles [purpleMedium..blueMedium] on branches c0..c5 and emits reversed paint order
    let mm4 = SurfaceMindmap {
        layout_type: MindmapLayoutType::Right,
        style: MindmapStyle::Four,
        nodes: nodes.clone(),
    };
    let hexes4: Vec<String> = mindmap_connectors(&mm4, &bounds)
        .iter()
        .map(|c| to_hex(&c.stroke, PlaygroundTheme::Light))
        .collect();
    assert_eq!(
        hexes4,
        vec![
            "#84cfff", // c5: blueMedium
            "#3cbc36", // c4: greenMedium
            "#fcd34d", // c3: yellowMedium
            "#ff8c38", // c2: orangeMedium
            "#e96cab", // c1: magentaMedium
            "#6e52df", // c0: purpleMedium
        ]
    );

    // StyleTwo resolves `#000000` in Light and `#ffffff` in Dark with Orthogonal connectors
    let mm2 = SurfaceMindmap {
        layout_type: MindmapLayoutType::Right,
        style: MindmapStyle::Two,
        nodes,
    };
    let conns2 = mindmap_connectors(&mm2, &bounds);
    assert_eq!(to_hex(&conns2[0].stroke, PlaygroundTheme::Light), "#000000");
    assert_eq!(to_hex(&conns2[0].stroke, PlaygroundTheme::Dark), "#ffffff");
}
