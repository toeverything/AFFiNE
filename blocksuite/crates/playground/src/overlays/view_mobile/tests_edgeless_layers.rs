//! Regression tests for hierarchical document z-order parity between `SurfaceRef` Frame
//! thumbnails and the Edgeless whiteboard (explicit Frame members, equal-index Frame/Group
//! tie-breaking, and transitive nested-Group cache invalidation across consecutive frames).

use blocksuite_playground_doc::schema::{BlockSpec, SurfaceElementSpec};
use ui::{point, px};
use y_octo::{Any, SessionValue};

use crate::{DocState, HOME_PAGE_ID, PlaygroundMode, PlaygroundTheme, TOPBAR_HEIGHT};

use super::tests::MobileSession;

fn sample_sref_and_whiteboard_overlap_px(
    s: &MobileSession,
    sref_id: &str,
    world_pt: (f32, f32),
) -> ([u8; 4], [u8; 4]) {
    let page_snap = s.frame();
    let sref_b = page_snap.elements[&format!("page.block.{sref_id}")].bounds;
    let thumb_px = s.app.update(|cx| {
        s.window
            .update(cx, |_, window, _| {
                let img = window.render_to_image().unwrap();
                let cx_px = (sref_b.x + sref_b.width * 0.5).round() as u32;
                let cy_px = (sref_b.y + 12.0 + 60.0).round() as u32;
                img.get_pixel(cx_px, cy_px).0
            })
            .unwrap()
    });

    s.app.update(|cx| {
        s.window
            .update(cx, |v, window, cx| {
                v.set_mode(PlaygroundMode::Edgeless, window, cx);
                v.set_edgeless_camera(
                    (world_pt.0 - 240.0).max(0.0),
                    (world_pt.1 - 240.0).max(0.0),
                    1.0,
                    cx,
                );
            })
            .unwrap();
    });
    let _ = s.frame();
    let wb_px = s.app.update(|cx| {
        s.window
            .update(cx, |v, window, _| {
                let sp = v.edgeless.camera.world_to_screen(
                    point(px(world_pt.0), px(world_pt.1)),
                    point(px(0.0), px(TOPBAR_HEIGHT)),
                );
                let img = window.render_to_image().unwrap();
                img.get_pixel(
                    f32::from(sp.x).round() as u32,
                    f32::from(sp.y).round() as u32,
                )
                .0
            })
            .unwrap()
    });
    (thumb_px, wb_px)
}

#[test]
fn frame_explicit_member_and_equal_index_group_tie_break_match_between_thumbnail_and_whiteboard() {
    // Case A: Explicit Frame (`a5`) member `s-red` (`a0`) paints above non-member `s-blue` (`a2`).
    {
        let s = MobileSession::open(960, 720, PlaygroundTheme::Light);
        let mut state = DocState::new("frame-member-z", 75).unwrap();
        state
            .workspace
            .create_page(HOME_PAGE_ID, "Frame Member Z", 1_795_731_000_000)
            .unwrap();
        {
            let page = state.workspace.ensure_page(HOME_PAGE_ID).unwrap();
            page.add_block(
                "root",
                BlockSpec::Page {
                    title: "Frame Member Z".into(),
                },
                None,
                None,
                1,
            )
            .unwrap();
            page.add_block("surface", BlockSpec::Surface, Some("root"), None, 2)
                .unwrap();
            page.add_block(
                "note",
                BlockSpec::Note {
                    xywh: Some("[0,320,800,300]".into()),
                },
                Some("root"),
                None,
                3,
            )
            .unwrap();
            for (id, idx, color) in [("s-red", "a0", "#e03131"), ("s-blue", "a2", "#1971c2")] {
                page.add_surface_element(
                    "surface",
                    id,
                    idx,
                    SurfaceElementSpec::Shape {
                        shape_type: "rect".into(),
                        xywh: "[40,40,160,120]".into(),
                        seed: 1,
                        filled: true,
                        text: None,
                    },
                    4,
                )
                .unwrap();
                for (k, v) in [
                    ("fillColor", SessionValue::Any(Any::String(color.into()))),
                    ("strokeWidth", SessionValue::Any(Any::Float64(0.0.into()))),
                ] {
                    page.set_surface_element_field("surface", id, k, v, 4)
                        .unwrap();
                }
            }
            page.add_block(
                "frame-high",
                BlockSpec::Frame {
                    title: "High Frame".into(),
                    xywh: Some("[0,0,240,200]".into()),
                    presentation_index: Some("a5".into()),
                },
                Some("surface"),
                None,
                5,
            )
            .unwrap();
            page.set_block_prop(
                "frame-high",
                "prop:index",
                SessionValue::Any(Any::String("a5".into())),
                5,
            )
            .unwrap();
            page.set_frame_child_element_ids("frame-high", &["s-red".to_string()], 6)
                .unwrap();
            page.add_block(
                "sref-f",
                BlockSpec::SurfaceRef {
                    reference: "frame-high".into(),
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
        let (thumb_px, wb_px) = sample_sref_and_whiteboard_overlap_px(&s, "sref-f", (120.0, 100.0));
        assert!(
            thumb_px[0] > 180 && thumb_px[2] < 90 && wb_px[0] > 180 && wb_px[2] < 90,
            "Explicit Frame member red (a5>a2) must top both views: thumb={thumb_px:?}, wb={wb_px:?}"
        );
    }

    // Case B: Frame F (`a1`) with member Blue `B` (`a2`) vs equal-index Group G (`a1`) with child Red `R` (`a3`),
    // authored in source order `[G, B, R]`: both thumbnail and whiteboard apply single-pass document hierarchy
    // from identical source order, painting Red on top in both views!
    {
        let s = MobileSession::open(960, 720, PlaygroundTheme::Light);
        let mut state = DocState::new("equal-anc-tie", 76).unwrap();
        state
            .workspace
            .create_page(HOME_PAGE_ID, "Equal Ancestor Tie", 1_795_731_000_000)
            .unwrap();
        {
            let page = state.workspace.ensure_page(HOME_PAGE_ID).unwrap();
            page.add_block(
                "root",
                BlockSpec::Page {
                    title: "Equal Ancestor Tie".into(),
                },
                None,
                None,
                1,
            )
            .unwrap();
            page.add_block("surface", BlockSpec::Surface, Some("root"), None, 2)
                .unwrap();
            page.add_block(
                "note",
                BlockSpec::Note {
                    xywh: Some("[0,320,800,300]".into()),
                },
                Some("root"),
                None,
                3,
            )
            .unwrap();
            page.add_surface_element(
                "surface",
                "g-tie",
                "a1",
                SurfaceElementSpec::Group {
                    seed: 1,
                    title: String::new(),
                    children: vec!["s-red".into()],
                },
                4,
            )
            .unwrap();
            for (id, idx, color, clk) in [
                ("s-blue", "a2", "#1971c2", 5),
                ("s-red", "a3", "#e03131", 6),
            ] {
                page.add_surface_element(
                    "surface",
                    id,
                    idx,
                    SurfaceElementSpec::Shape {
                        shape_type: "rect".into(),
                        xywh: "[40,40,160,120]".into(),
                        seed: 1,
                        filled: true,
                        text: None,
                    },
                    clk,
                )
                .unwrap();
                for (k, v) in [
                    ("fillColor", SessionValue::Any(Any::String(color.into()))),
                    ("strokeWidth", SessionValue::Any(Any::Float64(0.0.into()))),
                ] {
                    page.set_surface_element_field("surface", id, k, v, clk)
                        .unwrap();
                }
            }
            page.add_block(
                "frame-tie",
                BlockSpec::Frame {
                    title: "Tie Frame".into(),
                    xywh: Some("[0,0,240,200]".into()),
                    presentation_index: Some("a1".into()),
                },
                Some("surface"),
                None,
                7,
            )
            .unwrap();
            page.set_block_prop(
                "frame-tie",
                "prop:index",
                SessionValue::Any(Any::String("a1".into())),
                7,
            )
            .unwrap();
            page.set_frame_child_element_ids("frame-tie", &["s-blue".to_string()], 8)
                .unwrap();
            page.add_block(
                "sref-tie",
                BlockSpec::SurfaceRef {
                    reference: "frame-tie".into(),
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
        let (thumb_px, wb_px) =
            sample_sref_and_whiteboard_overlap_px(&s, "sref-tie", (120.0, 100.0));
        assert!(
            thumb_px[0] > 180 && thumb_px[2] < 90 && wb_px[0] > 180 && wb_px[2] < 90,
            "Equal-index Frame(a1)/Group(a1) must resolve to identical Red top pixel in both views: thumb={thumb_px:?}, wb={wb_px:?}"
        );
    }
}

#[test]
fn nested_outer_group_reorder_invalidates_open_surface_ref_card_on_next_frame() {
    let s = MobileSession::open(960, 720, PlaygroundTheme::Light);
    let mut state = DocState::new("nested-group-sref", 77).unwrap();
    state
        .workspace
        .create_page(HOME_PAGE_ID, "Nested Group Cache", 1_795_731_000_000)
        .unwrap();
    {
        let page = state.workspace.ensure_page(HOME_PAGE_ID).unwrap();
        page.add_block(
            "root",
            BlockSpec::Page {
                title: "Nested Group Cache".into(),
            },
            None,
            None,
            1,
        )
        .unwrap();
        page.add_block("surface", BlockSpec::Surface, Some("root"), None, 2)
            .unwrap();
        page.add_block(
            "note",
            BlockSpec::Note {
                xywh: Some("[0,320,800,300]".into()),
            },
            Some("root"),
            None,
            3,
        )
        .unwrap();
        for (id, idx, color, clk) in [
            ("s-red", "a0", "#e03131", 4),
            ("s-blue", "a2", "#1971c2", 5),
        ] {
            page.add_surface_element(
                "surface",
                id,
                idx,
                SurfaceElementSpec::Shape {
                    shape_type: "rect".into(),
                    xywh: "[40,40,160,120]".into(),
                    seed: 1,
                    filled: true,
                    text: None,
                },
                clk,
            )
            .unwrap();
            for (k, v) in [
                ("fillColor", SessionValue::Any(Any::String(color.into()))),
                ("strokeWidth", SessionValue::Any(Any::Float64(0.0.into()))),
            ] {
                page.set_surface_element_field("surface", id, k, v, clk)
                    .unwrap();
            }
        }
        page.add_surface_element(
            "surface",
            "g-inner",
            "a0",
            SurfaceElementSpec::Group {
                seed: 2,
                title: String::new(),
                children: vec!["s-red".into()],
            },
            6,
        )
        .unwrap();
        page.add_surface_element(
            "surface",
            "g-outer",
            "a1",
            SurfaceElementSpec::Group {
                seed: 3,
                title: String::new(),
                children: vec!["g-inner".into()],
            },
            7,
        )
        .unwrap();
        page.add_block(
            "frame-n",
            BlockSpec::Frame {
                title: "Nested Frame".into(),
                xywh: Some("[0,0,240,200]".into()),
                presentation_index: Some("a0".into()),
            },
            Some("surface"),
            None,
            8,
        )
        .unwrap();
        page.add_block(
            "sref-n",
            BlockSpec::SurfaceRef {
                reference: "frame-n".into(),
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
    // Frame 1: `g-outer` is `a1` < `s-blue` (`a2`), so the open card must show Blue (`#1971c2`).
    let snap_1 = s.frame();
    let sref_b = snap_1.elements["page.block.sref-n"].bounds;
    let cx_px = (sref_b.x + sref_b.width * 0.5).round() as u32;
    let cy_px = (sref_b.y + 38.0 + (sref_b.height - 38.0) * 0.5).round() as u32;
    let px_frame_1 = s.app.update(|cx| {
        s.window
            .update(cx, |_, window, _| {
                window.render_to_image().unwrap().get_pixel(cx_px, cy_px).0
            })
            .unwrap()
    });
    assert!(
        px_frame_1[2] > 160 && px_frame_1[0] < 80,
        "Frame 1 (g-outer = a1 < s-blue = a2) must show Blue on open card, got {px_frame_1:?}"
    );

    // Frame 2 (consecutive frame on the ALREADY-OPEN cached card!): raise `g-outer` from `a1` to `a3`.
    s.app.update(|cx| {
        s.window
            .update(cx, |v, window, cx| {
                let commit = v
                    .page_mut()
                    .unwrap()
                    .set_surface_element_field(
                        "surface",
                        "g-outer",
                        "index",
                        SessionValue::Any(Any::String("a3".into())),
                        10,
                    )
                    .unwrap()
                    .unwrap();
                v.did_edit(Some(commit), None, window, cx);
            })
            .unwrap();
    });
    let (px_frame_2, wb_px) = sample_sref_and_whiteboard_overlap_px(&s, "sref-n", (120.0, 100.0));
    assert!(
        px_frame_2[0] > 180 && px_frame_2[2] < 90 && wb_px[0] > 180 && wb_px[2] < 90,
        "Frame 2 (g-outer raised a1 -> a3) must invalidate SurfaceRef cache and flip to Red matching whiteboard: thumb={px_frame_2:?}, wb={wb_px:?}"
    );
}

#[test]
fn rotated_zero_width_brush_and_highlighter_render_in_frame_thumbnail_and_refresh_on_live_rotate() {
    for is_highlighter in [false, true] {
        let s = MobileSession::open(960, 720, PlaygroundTheme::Light);
        let mut state = DocState::new("rot-stroke-sref", 91).unwrap();
        state
            .workspace
            .create_page(HOME_PAGE_ID, "Rotated Stroke Frame", 1_795_731_000_000)
            .unwrap();
        {
            let page = state.workspace.ensure_page(HOME_PAGE_ID).unwrap();
            page.add_block(
                "root",
                BlockSpec::Page {
                    title: "Rotated Stroke Frame".into(),
                },
                None,
                None,
                1,
            )
            .unwrap();
            page.add_block("surface", BlockSpec::Surface, Some("root"), None, 2)
                .unwrap();
            page.add_block(
                "note",
                BlockSpec::Note {
                    xywh: Some("[4700,5300,800,300]".into()),
                },
                Some("root"),
                None,
                3,
            )
            .unwrap();
            let dense_pts: Vec<Vec<f64>> = (0..=22)
                .map(|i| vec![0.0, (i as f64 * 20.0).min(440.0), 0.5])
                .collect();
            let spec = if is_highlighter {
                SurfaceElementSpec::Highlighter {
                    seed: 7,
                    points: dense_pts,
                    xywh: "[5000,5000,0,440]".into(),
                }
            } else {
                SurfaceElementSpec::Brush {
                    seed: 7,
                    points: dense_pts,
                    xywh: "[5000,5000,0,440]".into(),
                }
            };
            page.add_surface_element("surface", "stroke-rot", "a1", spec, 4)
                .unwrap();
            for (k, v) in [
                ("color", SessionValue::Any(Any::String("#e03131".into()))),
                ("lineWidth", SessionValue::Any(Any::Float64(4.0.into()))),
                ("rotate", SessionValue::Any(Any::Float64(0.0.into()))),
            ] {
                page.set_surface_element_field("surface", "stroke-rot", k, v, 5)
                    .unwrap();
            }
            // Frame without explicit `prop:childElementIds` at `[4800,5200,100,40]` (center `(4850,5220)`).
            page.add_block(
                "frame-s",
                BlockSpec::Frame {
                    title: "Stroke Target".into(),
                    xywh: Some("[4800,5200,100,40]".into()),
                    presentation_index: Some("a0".into()),
                },
                Some("surface"),
                None,
                6,
            )
            .unwrap();
            page.add_block(
                "sref-s",
                BlockSpec::SurfaceRef {
                    reference: "frame-s".into(),
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
        let sample_open_card_center = |s: &MobileSession| -> [u8; 4] {
            let snap = s.frame();
            let sb = snap.elements["page.block.sref-s"].bounds;
            let cx_px = (sb.x + sb.width * 0.5).round() as u32;
            let cy_px = (sb.y + 12.0 + 60.0).round() as u32;
            s.app.update(|cx| {
                s.window
                    .update(cx, |_, window, _| {
                        window.render_to_image().unwrap().get_pixel(cx_px, cy_px).0
                    })
                    .unwrap()
            })
        };

        // 1. At `rotate = 0°`, `[5000,5000,0,440]` misses Frame `[4800,5200,100,40]` -> card center is white.
        let px_unrotated = sample_open_card_center(&s);
        assert!(
            px_unrotated[0] > 240 && px_unrotated[1] > 240 && px_unrotated[2] > 240,
            "is_highlighter={is_highlighter}: unrotated x=5000 stroke must leave frame center white, got {px_unrotated:?}"
        );

        // 2. While the `SurfaceRef` card is open, rotate the stroke to `90°` so it crosses `(4850,5220)`.
        s.app.update(|cx| {
            s.window
                .update(cx, |v, window, cx| {
                    let commit = v
                        .page_mut()
                        .unwrap()
                        .set_surface_element_field(
                            "surface",
                            "stroke-rot",
                            "rotate",
                            SessionValue::Any(Any::Float64(90.0.into())),
                            8,
                        )
                        .unwrap()
                        .unwrap();
                    v.did_edit(Some(commit), None, window, cx);
                })
                .unwrap();
        });
        let px_rotated_card = sample_open_card_center(&s);
        assert!(
            px_rotated_card[0] > px_rotated_card[1].saturating_add(20)
                && px_rotated_card[0] > px_rotated_card[2].saturating_add(20),
            "is_highlighter={is_highlighter}: rotating stroke 0°->90° on open card must render red ink at frame center, got {px_rotated_card:?}"
        );
        let (thumb_px, wb_px) =
            sample_sref_and_whiteboard_overlap_px(&s, "sref-s", (4850.0, 5220.0));
        assert!(
            thumb_px[0] > thumb_px[1].saturating_add(20)
                && thumb_px[0] > thumb_px[2].saturating_add(20)
                && wb_px[0] > wb_px[1].saturating_add(20)
                && wb_px[0] > wb_px[2].saturating_add(20),
            "is_highlighter={is_highlighter}: both thumbnail and whiteboard must paint 90° stroke at (4850,5220): thumb={thumb_px:?}, wb={wb_px:?}"
        );

        // 3. Switch back to Page mode and rotate `90° -> 0°` while card is open -> cache clears stroke ink.
        s.app.update(|cx| {
            s.window
                .update(cx, |v, window, cx| {
                    v.set_mode(PlaygroundMode::Page, window, cx);
                })
                .unwrap();
        });
        let _ = sample_open_card_center(&s);
        s.app.update(|cx| {
            s.window
                .update(cx, |v, window, cx| {
                    let commit = v
                        .page_mut()
                        .unwrap()
                        .set_surface_element_field(
                            "surface",
                            "stroke-rot",
                            "rotate",
                            SessionValue::Any(Any::Float64(0.0.into())),
                            9,
                        )
                        .unwrap()
                        .unwrap();
                    v.did_edit(Some(commit), None, window, cx);
                })
                .unwrap();
        });
        let px_cleared = sample_open_card_center(&s);
        assert!(
            px_cleared[1] > 240 && px_cleared[2] > 240,
            "is_highlighter={is_highlighter}: rotating 90°->0° on open card must clear stroke from thumbnail, got {px_cleared:?}"
        );
    }
}
