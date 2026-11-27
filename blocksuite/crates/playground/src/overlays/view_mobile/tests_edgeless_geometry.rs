//! Regression tests for rotated surface element hit-testing, first-frame camera fit with
//! bound relative-port connectors on remote mindmaps, and hierarchical z-order consistency
//! between Edgeless whiteboard and `SurfaceRef` Frame thumbnails.

use blocksuite_playground_doc::schema::{
    BlockSpec, ConnectorEndpointSpec, MindmapNodeSpec, ParagraphType, SurfaceElementSpec,
};
use ui::{audit_frame_snapshot, point, px};
use y_octo::{Any, SessionValue};

use crate::{DocState, HOME_PAGE_ID, PlaygroundMode, PlaygroundTheme, TOPBAR_HEIGHT};

use super::tests::MobileSession;

#[test]
fn rotated_90_deg_shape_and_surface_text_hit_test_inside_and_miss_outside() {
    let s = MobileSession::open(800, 600, PlaygroundTheme::Light);
    let mut state = DocState::new("rot-hit-test", 71).unwrap();
    state
        .workspace
        .create_page(HOME_PAGE_ID, "Rotated Hit Test", 1_795_731_000_000)
        .unwrap();
    {
        let page = state.workspace.ensure_page(HOME_PAGE_ID).unwrap();
        page.add_block(
            "root",
            BlockSpec::Page {
                title: "Rotated Hit Test".into(),
            },
            None,
            None,
            1,
        )
        .unwrap();
        page.add_block("surface", BlockSpec::Surface, Some("root"), None, 2)
            .unwrap();
        // 100x20 shape centered at (150, 200), rotated 90 deg -> occupies x=140..160, y=150..250.
        page.add_surface_element(
            "surface",
            "rot-shape",
            "a0",
            SurfaceElementSpec::Shape {
                shape_type: "rect".into(),
                xywh: "[100,190,100,20]".into(),
                seed: 1,
                filled: true,
                text: None,
            },
            3,
        )
        .unwrap();
        page.set_surface_element_field(
            "surface",
            "rot-shape",
            "rotate",
            SessionValue::Any(Any::Float64(90.0.into())),
            3,
        )
        .unwrap();

        // 100x20 surface text centered at (350, 200), rotated 90 deg -> occupies x=340..360, y=150..250.
        page.add_surface_element(
            "surface",
            "rot-text",
            "a1",
            SurfaceElementSpec::Text {
                seed: 2,
                text: "Vertical label".into(),
                xywh: "[300,190,100,20]".into(),
            },
            4,
        )
        .unwrap();
        page.set_surface_element_field(
            "surface",
            "rot-text",
            "rotate",
            SessionValue::Any(Any::Float64(90.0.into())),
            4,
        )
        .unwrap();
    }

    s.app.update(|cx| {
        s.window
            .update(cx, |v, window, cx| {
                v.set_document(state, cx);
                v.set_mode(PlaygroundMode::Edgeless, window, cx);
            })
            .unwrap();
    });
    let _ = s.frame();

    let (shape_inside, shape_outside, text_inside, text_outside) = s.view(|v| {
        (
            v.edgeless
                .authoring
                .hit_test_world(150.0, 235.0, 1.0)
                .map(|i| i.id.clone()),
            v.edgeless
                .authoring
                .hit_test_world(185.0, 200.0, 1.0)
                .map(|i| i.id.clone()),
            v.edgeless
                .authoring
                .hit_test_world(350.0, 235.0, 1.0)
                .map(|i| i.id.clone()),
            v.edgeless
                .authoring
                .hit_test_world(385.0, 200.0, 1.0)
                .map(|i| i.id.clone()),
        )
    });
    assert_eq!(
        shape_inside.as_deref(),
        Some("rot-shape"),
        "relative (0, 35) must hit 90-deg 100x20 shape"
    );
    assert_eq!(
        shape_outside, None,
        "relative (35, 0) must miss 90-deg 100x20 shape"
    );
    assert_eq!(
        text_inside.as_deref(),
        Some("rot-text"),
        "relative (0, 35) must hit 90-deg 100x20 surface text"
    );
    assert_eq!(
        text_outside, None,
        "relative (35, 0) must miss 90-deg 100x20 surface text"
    );
}

#[test]
fn mindmap_at_5000_with_bound_relative_connector_auto_fits_on_390px_first_frame() {
    let s = MobileSession::open(390, 844, PlaygroundTheme::Light);
    let mut state = DocState::new("mm-5000-bound-conn", 72).unwrap();
    state
        .workspace
        .create_page(
            HOME_PAGE_ID,
            "Remote Mindmap Bound Connector",
            1_795_731_000_000,
        )
        .unwrap();
    {
        let page = state.workspace.ensure_page(HOME_PAGE_ID).unwrap();
        page.add_block(
            "root",
            BlockSpec::Page {
                title: "Remote Mindmap Bound Connector".into(),
            },
            None,
            None,
            1,
        )
        .unwrap();
        page.add_block("surface", BlockSpec::Surface, Some("root"), None, 2)
            .unwrap();
        for (id, idx, xywh, label) in [
            ("mm-root", "a0", "[5000,5000,120,44]", "Root"),
            ("mm-c0", "a1", "[5320,5000,120,44]", "Branch"),
        ] {
            page.add_surface_element(
                "surface",
                id,
                idx,
                SurfaceElementSpec::Shape {
                    shape_type: "rect".into(),
                    xywh: xywh.into(),
                    seed: 1,
                    filled: true,
                    text: Some(label.into()),
                },
                3,
            )
            .unwrap();
            page.set_surface_element_field(
                "surface",
                id,
                "fillColor",
                SessionValue::Any(Any::String("#f5be18".into())),
                3,
            )
            .unwrap();
        }
        page.add_surface_element(
            "surface",
            "mm-tree",
            "a2",
            SurfaceElementSpec::Mindmap {
                seed: 5,
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
                        "mm-c0".into(),
                        MindmapNodeSpec {
                            index: "a0".into(),
                            parent: Some("mm-root".into()),
                            collapsed: false,
                        },
                    ),
                ],
            },
            4,
        )
        .unwrap();
        // Bound connector using normalized port positions [1, 0.5] -> [0, 0.5] near (0, 0) numerically.
        page.add_surface_element(
            "surface",
            "bound-conn",
            "a3",
            SurfaceElementSpec::Connector {
                mode: 1,
                seed: 6,
                source: ConnectorEndpointSpec::element("mm-root", Some([1.0, 0.5])),
                target: ConnectorEndpointSpec::element("mm-c0", Some([0.0, 0.5])),
                text: None,
                label_xywh: None,
            },
            5,
        )
        .unwrap();
    }

    s.app.update(|cx| {
        s.window
            .update(cx, |v, window, cx| {
                v.set_document(state, cx);
                v.set_mode(PlaygroundMode::Edgeless, window, cx);
            })
            .unwrap();
    });
    let snap = s.frame();
    assert!(audit_frame_snapshot(&snap).is_empty());

    let zoom = s.view(|v| v.edgeless.camera.zoom);
    assert!(
        zoom > 0.35,
        "bound relative connector ports [1,0.5]/[0,0.5] must not drag cold-start fit to origin (zoom={zoom})"
    );

    let img = s.app.update(|cx| {
        s.window
            .update(cx, |_, window, _| window.render_to_image().unwrap())
            .unwrap()
    });
    let mut yellow_px = 0usize;
    for y in 120..720 {
        for x in 10..380 {
            let p = img.get_pixel(x, y).0;
            if p[0] > 210 && p[1] > 160 && p[2] < 80 {
                yellow_px += 1;
            }
        }
    }
    assert!(
        yellow_px >= 200,
        "remote mindmap at x=5000..5440 must be visible on Frame 1 at 390px ({yellow_px} yellow px)"
    );
}

#[test]
fn frame_thumbnail_matches_whiteboard_z_order_when_higher_mindmap_branch_crosses_lower_shape() {
    let s = MobileSession::open(800, 700, PlaygroundTheme::Light);
    let mut state = DocState::new("mm-z-order-crossing", 73).unwrap();
    state
        .workspace
        .create_page(HOME_PAGE_ID, "Z-Order Parity", 1_795_731_000_000)
        .unwrap();
    {
        let page = state.workspace.ensure_page(HOME_PAGE_ID).unwrap();
        page.add_block(
            "root",
            BlockSpec::Page {
                title: "Z-Order Parity".into(),
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
            "p1",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: "Crossing z-order check".into(),
            },
            Some("note"),
            None,
            3,
        )
        .unwrap();
        page.add_block("surface", BlockSpec::Surface, Some("root"), None, 4)
            .unwrap();

        // Lower-layer opaque pure-red rectangle ("a1") placed between mindmap root and child!
        // Root at [20, 80, 100, 40] -> laid-out child at [320, 80, 100, 40]; horizontal branch at y=100, x=120..320.
        // Red rectangle sits at [170, 50, 100, 100] (covers crossing point (220, 100)).
        page.add_surface_element(
            "surface",
            "bg-rect",
            "a1",
            SurfaceElementSpec::Shape {
                shape_type: "rect".into(),
                xywh: "[170,50,100,100]".into(),
                seed: 1,
                filled: true,
                text: None,
            },
            5,
        )
        .unwrap();
        for (k, v) in [
            (
                "fillColor",
                SessionValue::Any(Any::String("#ff0000".into())),
            ),
            ("strokeWidth", SessionValue::Any(Any::Float64(0.0.into()))),
        ] {
            page.set_surface_element_field("surface", "bg-rect", k, v, 5)
                .unwrap();
        }

        for (id, idx, xywh) in [
            ("mm-root", "a0", "[20,80,100,40]"),
            ("mm-c0", "a0", "[320,80,100,40]"),
        ] {
            page.add_surface_element(
                "surface",
                id,
                idx,
                SurfaceElementSpec::Shape {
                    shape_type: "rect".into(),
                    xywh: xywh.into(),
                    seed: 2,
                    filled: true,
                    text: None,
                },
                6,
            )
            .unwrap();
            for (k, v) in [
                (
                    "fillColor",
                    SessionValue::Any(Any::String("#00cc44".into())),
                ),
                ("strokeWidth", SessionValue::Any(Any::Float64(0.0.into()))),
            ] {
                page.set_surface_element_field("surface", id, k, v, 6)
                    .unwrap();
            }
        }

        // Higher-layer Mindmap ("a2"), Style::Two (#000000 black branch line in Light theme).
        page.add_surface_element(
            "surface",
            "mm-high",
            "a2",
            SurfaceElementSpec::Mindmap {
                seed: 3,
                layout_type: 0,
                style: 2,
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
                        "mm-c0".into(),
                        MindmapNodeSpec {
                            index: "a0".into(),
                            parent: Some("mm-root".into()),
                            collapsed: false,
                        },
                    ),
                ],
            },
            7,
        )
        .unwrap();

        page.add_block(
            "frame-z",
            BlockSpec::Frame {
                title: "Crossing Frame".into(),
                xywh: Some("[0,0,460,200]".into()),
                presentation_index: Some("a0".into()),
            },
            Some("surface"),
            None,
            8,
        )
        .unwrap();
        page.add_block(
            "sref-z",
            BlockSpec::SurfaceRef {
                reference: "frame-z".into(),
                ref_flavour: "affine:frame".into(),
                caption: String::new(),
            },
            Some("note"),
            None,
            9,
        )
        .unwrap();
    }

    s.app.update(|cx| {
        s.window
            .update(cx, |v, _, cx| v.set_document(state, cx))
            .unwrap();
    });
    let page_snap = s.frame();
    let sref_b = page_snap.elements["page.block.sref-z"].bounds;
    let page_img = s.app.update(|cx| {
        s.window
            .update(cx, |_, window, _| window.render_to_image().unwrap())
            .unwrap()
    });

    // Inside the SurfaceRef thumbnail, scan horizontal center band inside the red rectangle's X span
    // for dark branch pixels (`R < 90, G < 90, B < 90`), proving the higher-layer mindmap branch paints ABOVE `bg-rect`.
    let mut thumb_dark_branch_in_red_span = 0usize;
    let mut thumb_green_node_px = 0usize;
    let rx0 = (sref_b.x + sref_b.width * (185.0 / 460.0)) as u32;
    let rx1 = (sref_b.x + sref_b.width * (255.0 / 460.0)) as u32;
    let ry0 = (sref_b.y + 16.0) as u32;
    let ry1 = (sref_b.y + sref_b.height - 32.0).max(sref_b.y + 20.0) as u32;
    for y in ry0..ry1.min(page_img.height()) {
        for x in rx0..rx1.min(page_img.width()) {
            let p = page_img.get_pixel(x, y).0;
            if p[0] < 120 && p[1] < 80 && p[2] < 80 {
                thumb_dark_branch_in_red_span += 1;
            }
        }
    }
    for y in ry0..ry1.min(page_img.height()) {
        for x in (sref_b.x as u32 + 8)..((sref_b.x + sref_b.width) as u32).saturating_sub(8) {
            let p = page_img.get_pixel(x, y).0;
            if p[0] < 40 && p[1] > 160 && p[2] < 100 {
                thumb_green_node_px += 1;
            }
        }
    }
    assert!(
        thumb_dark_branch_in_red_span >= 10,
        "SurfaceRef thumbnail must paint higher-z mindmap branch (#000000) ABOVE lower-z red shape (#ff0000), dark_px={thumb_dark_branch_in_red_span}"
    );
    assert!(
        thumb_green_node_px >= 80,
        "Mindmap child shapes must still paint ABOVE their own branch lines ({thumb_green_node_px} green px)"
    );

    // Switch to Edgeless whiteboard at 1:1 camera and verify exact crossing point `(220, 100)` is ALSO dark,
    // while node boundary `(118, 100)` inside `mm-root` is green (#00cc44, not black branch).
    s.app.update(|cx| {
        s.window
            .update(cx, |v, window, cx| {
                v.set_mode(PlaygroundMode::Edgeless, window, cx);
                v.set_edgeless_camera(0.0, 0.0, 1.0, cx);
            })
            .unwrap();
    });
    let _ = s.frame();
    let wb_img = s.app.update(|cx| {
        s.window
            .update(cx, |v, window, _| {
                let vp_origin = point(px(0.0), px(TOPBAR_HEIGHT));
                let sp = v
                    .edgeless
                    .camera
                    .world_to_screen(point(px(220.0), px(100.0)), vp_origin);
                let np = v
                    .edgeless
                    .camera
                    .world_to_screen(point(px(115.0), px(100.0)), vp_origin);
                let img = window.render_to_image().unwrap();
                (
                    img.get_pixel(
                        f32::from(sp.x).round() as u32,
                        f32::from(sp.y).round() as u32,
                    )
                    .0,
                    img.get_pixel(
                        f32::from(np.x).round() as u32,
                        f32::from(np.y).round() as u32,
                    )
                    .0,
                )
            })
            .unwrap()
    });
    assert!(
        wb_img.0[0] < 90 && wb_img.0[1] < 90 && wb_img.0[2] < 90,
        "Whiteboard crossing point (220, 100) must also show black mindmap branch over red shape: {:?}",
        wb_img.0
    );
    assert!(
        wb_img.1[0] < 40 && wb_img.1[1] > 160,
        "Whiteboard node interior (115, 100) must show green shape over mindmap branch: {:?}",
        wb_img.1
    );
}

#[test]
fn single_axis_aligned_connectors_and_rotated_zero_width_strokes_fit_cold_start_camera() {
    enum Case {
        Connector((f64, f64)),
        RotatedZeroWidthBrush { highlighter: bool },
    }
    for (label, case, expected_pts) in [
        (
            "horizontal-connector",
            Case::Connector((5440.0, 5000.0)),
            [(5000.0_f32, 5000.0_f32), (5440.0, 5000.0)],
        ),
        (
            "vertical-connector",
            Case::Connector((5000.0, 5440.0)),
            [(5000.0, 5000.0), (5000.0, 5440.0)],
        ),
        (
            "rotated-90-zero-width-brush",
            Case::RotatedZeroWidthBrush { highlighter: false },
            [(4780.0, 5220.0), (5220.0, 5220.0)],
        ),
        (
            "rotated-90-zero-width-highlighter",
            Case::RotatedZeroWidthBrush { highlighter: true },
            [(4780.0, 5220.0), (5220.0, 5220.0)],
        ),
    ] {
        let s = MobileSession::open(390, 844, PlaygroundTheme::Light);
        let mut state = DocState::new("axis-line-fit", 74).unwrap();
        state
            .workspace
            .create_page(HOME_PAGE_ID, "Axis Line Fit", 1_795_731_000_000)
            .unwrap();
        {
            let page = state.workspace.ensure_page(HOME_PAGE_ID).unwrap();
            page.add_block(
                "root",
                BlockSpec::Page {
                    title: "Axis Line Fit".into(),
                },
                None,
                None,
                1,
            )
            .unwrap();
            page.add_block("surface", BlockSpec::Surface, Some("root"), None, 2)
                .unwrap();
            match case {
                Case::Connector(dst) => {
                    page.add_surface_element(
                        "surface",
                        "line-1",
                        "a0",
                        SurfaceElementSpec::Connector {
                            mode: 0,
                            seed: 1,
                            source: ConnectorEndpointSpec::point(5000.0, 5000.0),
                            target: ConnectorEndpointSpec::point(dst.0, dst.1),
                            text: None,
                            label_xywh: None,
                        },
                        3,
                    )
                    .unwrap();
                }
                Case::RotatedZeroWidthBrush { highlighter } => {
                    let points = vec![vec![0.0, 0.0, 0.5], vec![0.0, 440.0, 0.5]];
                    let spec = if highlighter {
                        SurfaceElementSpec::Highlighter {
                            seed: 1,
                            points,
                            xywh: "[5000,5000,0,440]".into(),
                        }
                    } else {
                        SurfaceElementSpec::Brush {
                            seed: 1,
                            points,
                            xywh: "[5000,5000,0,440]".into(),
                        }
                    };
                    page.add_surface_element("surface", "stroke-1", "a0", spec, 3)
                        .unwrap();
                    for (k, v) in [
                        ("rotate", SessionValue::Any(Any::Float64(90.0.into()))),
                        ("lineWidth", SessionValue::Any(Any::Float64(4.0.into()))),
                    ] {
                        page.set_surface_element_field("surface", "stroke-1", k, v, 4)
                            .unwrap();
                    }
                }
            }
        }
        s.app.update(|cx| {
            s.window
                .update(cx, |v, window, cx| {
                    v.set_document(state, cx);
                    v.set_mode(PlaygroundMode::Edgeless, window, cx);
                })
                .unwrap();
        });
        let snap = s.frame();
        assert!(
            audit_frame_snapshot(&snap).is_empty(),
            "{label}: frame audit violations"
        );
        let (p0, p1) = s.view(|v| {
            let vp = point(px(0.0), px(TOPBAR_HEIGHT));
            (
                v.edgeless
                    .camera
                    .world_to_screen(point(px(expected_pts[0].0), px(expected_pts[0].1)), vp),
                v.edgeless
                    .camera
                    .world_to_screen(point(px(expected_pts[1].0), px(expected_pts[1].1)), vp),
            )
        });
        for (name, pt) in [("start", p0), ("end", p1)] {
            let sx = f32::from(pt.x);
            let sy = f32::from(pt.y);
            assert!(
                (4.0..=386.0).contains(&sx) && (TOPBAR_HEIGHT..=840.0).contains(&sy),
                "{label} {name} endpoint must fit on Frame 1 in 390x844 without clipping, got ({sx}, {sy})"
            );
        }
    }
}
