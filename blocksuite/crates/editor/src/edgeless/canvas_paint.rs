//! GPU painting and screen-space snapshot markers for the Edgeless spatial canvas.

use ui::{
    AnyElement, Background, BorderStyle, Bounds, ContentMask, Corners, Edges, Hsla, ScaledPixels,
    SharedString, TransformationMatrix, Window, canvas, div, point, prelude::*, px, size,
};

use crate::block_flow::{BlockPaint, FlowLayout, FlowRect};
use crate::editor_session::DocumentSelection;

use super::{
    EDGELESS_VIEWPORT_ID, EdgelessCanvasState, EdgelessInlineEdit, EdgelessRenderInput,
    FRAME_RADIUS, NOTE_CARD_PADDING, PaintItem, PreparedEdgelessScene, WorldRect, bg_grid_gap,
    build_edgeless_authoring_overlay, prepare_edgeless_scene, world_rect,
};

/// Prepare cached Note & EdgelessText layouts (zero relayout when camera moves), fit camera
/// on first render, and return the spatial canvas element plus screen-space snapshot markers.
pub fn build_edgeless_layer(
    state: &mut EdgelessCanvasState,
    input: &EdgelessRenderInput<'_>,
    window: &Window,
    zoom_controls: AnyElement,
    toolbar: Option<AnyElement>,
) -> AnyElement {
    let PreparedEdgelessScene {
        frames,
        notes,
        texts,
        surfaces,
        order,
    } = prepare_edgeless_scene(state, input, window);
    if !state.camera_initialized && input.viewport_width > 0.0 && input.viewport_height > 0.0 {
        let bounds = state.scene_world_bounds(input.snapshot);
        state.camera.fit_to_bounds(
            bounds,
            size(px(input.viewport_width), px(input.viewport_height)),
            48.0,
        );
        state.camera_initialized = true;
    }

    let camera = state.camera;
    let palette = *input.palette;
    let theme = input.theme;
    let visible_world =
        camera.visible_world_bounds(size(px(input.viewport_width), px(input.viewport_height)));

    // Record screen-space snapshot markers for fully-visible spatial items so `bs-harness audit`
    // and tests can inspect their screen bounds without triggering false clipping violations.
    let mut snapshot_markers: Vec<AnyElement> = Vec::new();
    let vp_origin = point(px(0.0), px(0.0));
    let push_marker =
        |markers: &mut Vec<AnyElement>, id: String, rect: WorldRect, text: Option<String>| {
            let tl = camera.world_to_screen(point(px(rect.x), px(rect.y)), vp_origin);
            let br = camera.world_to_screen(point(px(rect.right()), px(rect.bottom())), vp_origin);
            let x = f32::from(tl.x);
            let y = f32::from(tl.y);
            let w = f32::from(br.x) - x;
            let h = f32::from(br.y) - y;
            if x >= 0.0
                && y >= 0.0
                && x + w <= input.viewport_width
                && y + h <= input.viewport_height
                && w >= 1.0
                && h >= 1.0
            {
                let mut el = div()
                    .absolute()
                    .left(px(x))
                    .top(px(y))
                    .w(px(w))
                    .h(px(h))
                    .snapshot(SharedString::from(id), Some(EDGELESS_VIEWPORT_ID));
                if let Some(t) = text {
                    el = el.snapshot_text(t);
                }
                markers.push(el.into_any_element());
            }
        };

    for frame in &frames {
        push_marker(
            &mut snapshot_markers,
            format!("edgeless.frame.{}", frame.id),
            frame.rect,
            Some(frame.title.clone()),
        );
    }
    for layout in surfaces.iter() {
        for (id, bounds) in layout.bounds() {
            push_marker(
                &mut snapshot_markers,
                format!("edgeless.surface.{id}"),
                world_rect(bounds),
                None,
            );
        }
    }
    for note in &notes {
        push_marker(
            &mut snapshot_markers,
            format!("edgeless.note.{}", note.id),
            note.rect,
            None,
        );
    }
    for et in &texts {
        push_marker(
            &mut snapshot_markers,
            format!("edgeless.text.{}", et.id),
            et.world_aabb,
            None,
        );
    }

    let frame_border = theme
        .css_var("--affine-v2-edgeless-frame-border")
        .unwrap_or(palette.border);
    let frame_pill_bg = palette.panel;

    let authoring_overlays = build_edgeless_authoring_overlay(
        &state.authoring,
        camera,
        input.viewport_width,
        input.viewport_height,
        &palette,
        theme,
    );
    let editing_overlay: Option<(String, bool, Vec<FlowRect>, Option<FlowRect>)> = input
        .editing_selection
        .as_ref()
        .and_then(|(editing_id, is_note, sel, focus)| {
            let layout = state.cached_block_layout(editing_id, *is_note)?;
            let sel_rects = spatial_selection_rects(sel, &layout);
            let caret = layout
                .block(&focus.block_id)
                .and_then(|b| b.caret_rect(focus.caret));
            Some((editing_id.clone(), *is_note, sel_rects, caret))
        });
    let editing_label_id: Option<String> = match &state.authoring.inline_edit {
        Some(EdgelessInlineEdit::Label(ed)) => Some(ed.target.item_id().to_string()),
        _ => None,
    };

    let paint_canvas = canvas(
        |_, _, _| (),
        move |bounds, _, window, cx| {
            // 1. Single-draw-call procedural dot-grid background.
            let gap = bg_grid_gap(camera.zoom);
            let (phase_x, phase_y) = camera.dot_grid_phase(gap);
            window.paint_quad(ui::fill(
                bounds,
                Background::dot_grid(
                    palette.background,
                    palette.edgeless_grid,
                    gap,
                    1.0,
                    phase_x,
                    phase_y,
                ),
            ));

            let cam_matrix = camera.to_transformation_matrix(bounds.origin);
            let cull_world = visible_world.dilate(120.0);

            window.with_content_mask(Some(ContentMask { bounds }), |window| {
                window.with_paint_transformation(cam_matrix, |window| {
                    let viewport_world = Bounds::new(
                        point(px(visible_world.x), px(visible_world.y)),
                        size(px(visible_world.w), px(visible_world.h)),
                    );
                    for item in order.iter() {
                        match *item {
                            PaintItem::Frame(i) => {
                                let frame = &frames[i];
                                if !frame.rect.intersects(cull_world) {
                                    continue;
                                }
                                let fb = Bounds::new(
                                    point(px(frame.rect.x), px(frame.rect.y)),
                                    size(px(frame.rect.w), px(frame.rect.h)),
                                );
                                window.paint_quad(ui::quad(
                                    fb,
                                    Corners::all(px(FRAME_RADIUS)),
                                    frame.fill.unwrap_or_else(Hsla::transparent_black),
                                    Edges::all(px(1.0)),
                                    frame_border,
                                    BorderStyle::Solid,
                                ));

                                // Frame title pill above top-left corner (shared exact layout with hit-test).
                                let pill = frame.title_pill_rect;
                                window.paint_quad(ui::quad(
                                    Bounds::new(
                                        point(px(pill.x), px(pill.y)),
                                        size(px(pill.w), px(pill.h)),
                                    ),
                                    Corners::all(px(4.0)),
                                    frame_pill_bg,
                                    Edges::all(px(1.0)),
                                    palette.border,
                                    BorderStyle::Solid,
                                ));
                                if editing_label_id.as_deref() != Some(frame.id.as_str()) {
                                    frame.title_inline.paint(
                                        point(px(pill.x + 8.0), px(pill.y)),
                                        window,
                                        cx,
                                    );
                                }
                            }

                            PaintItem::Surface(l, i) => surfaces[l].paint_item(
                                i,
                                viewport_world,
                                editing_label_id.as_deref(),
                                window,
                                cx,
                            ),
                            PaintItem::Note(i) => {
                                let note = &notes[i];
                                if !note.rect.intersects(cull_world) {
                                    continue;
                                }
                                let nb = Bounds::new(
                                    point(px(note.rect.x), px(note.rect.y)),
                                    size(px(note.rect.w), px(note.rect.h)),
                                );
                                if !note.shadows.is_empty() {
                                    window.paint_drop_shadows(
                                        nb,
                                        Corners::all(px(note.border_radius)),
                                        &note.shadows,
                                    );
                                }
                                let (border_widths, border_color, border_style) = match note.border
                                {
                                    Some((style, width)) => {
                                        (Edges::all(px(width)), palette.border, style)
                                    }
                                    None => (
                                        Edges::default(),
                                        Hsla::transparent_black(),
                                        BorderStyle::Solid,
                                    ),
                                };
                                window.paint_quad(ui::quad(
                                    nb,
                                    Corners::all(px(note.border_radius)),
                                    note.fill,
                                    border_widths,
                                    border_color,
                                    border_style,
                                ));

                                let scale_transform = TransformationMatrix::unit()
                                    .translate(point(
                                        ScaledPixels(note.rect.x),
                                        ScaledPixels(note.rect.y),
                                    ))
                                    .scale(size(note.scale, note.scale))
                                    .translate(point(
                                        ScaledPixels(-note.rect.x),
                                        ScaledPixels(-note.rect.y),
                                    ));
                                let inner_bounds = Bounds::new(
                                    point(
                                        px(note.rect.x + NOTE_CARD_PADDING),
                                        px(note.rect.y + NOTE_CARD_PADDING),
                                    ),
                                    size(
                                        px((note.rect.w / note.scale - 2.0 * NOTE_CARD_PADDING)
                                            .max(0.0)),
                                        px((note.rect.h / note.scale - 2.0 * NOTE_CARD_PADDING)
                                            .max(0.0)),
                                    ),
                                );
                                window.with_paint_transformation(scale_transform, |window| {
                                    window.with_local_paint_mask(
                                        ContentMask {
                                            bounds: inner_bounds,
                                        },
                                        |window| {
                                            for block in &note.layout.blocks {
                                                let origin = point(
                                                    px(note.rect.x + NOTE_CARD_PADDING + block.x),
                                                    px(note.rect.y + NOTE_CARD_PADDING + block.y),
                                                );
                                                block.body.paint(
                                                    origin,
                                                    BlockPaint::default(),
                                                    window,
                                                    cx,
                                                );
                                            }
                                            if let Some((ref eid, true, ref sel_rects, caret)) =
                                                editing_overlay
                                                && eid == &note.id
                                            {
                                                for sr in sel_rects {
                                                    let sb = Bounds::new(
                                                        point(
                                                            px(note.rect.x
                                                                + NOTE_CARD_PADDING
                                                                + sr.x),
                                                            px(note.rect.y
                                                                + NOTE_CARD_PADDING
                                                                + sr.y),
                                                        ),
                                                        size(px(sr.w), px(sr.h)),
                                                    );
                                                    window.paint_quad(ui::fill(
                                                        sb,
                                                        palette.brand.opacity(0.22),
                                                    ));
                                                }
                                                if let Some(caret) = caret {
                                                    let cb = Bounds::new(
                                                        point(
                                                            px(note.rect.x
                                                                + NOTE_CARD_PADDING
                                                                + caret.x),
                                                            px(note.rect.y
                                                                + NOTE_CARD_PADDING
                                                                + caret.y),
                                                        ),
                                                        size(
                                                            px(caret.w.max(2.0)),
                                                            px(caret.h.max(16.0)),
                                                        ),
                                                    );
                                                    window.paint_quad(ui::fill(cb, palette.brand));
                                                }
                                            }
                                        },
                                    );
                                });
                            }

                            PaintItem::Text(i) => {
                                let et = &texts[i];
                                if !et.world_aabb.intersects(cull_world) {
                                    continue;
                                }
                                let (cx_w, cy_w) = et.rect.center();
                                let scale_from_tl = TransformationMatrix::unit()
                                    .translate(point(
                                        ScaledPixels(et.rect.x),
                                        ScaledPixels(et.rect.y),
                                    ))
                                    .scale(size(et.scale, et.scale))
                                    .translate(point(
                                        ScaledPixels(-et.rect.x),
                                        ScaledPixels(-et.rect.y),
                                    ));
                                let rotate_around_center = TransformationMatrix::unit()
                                    .translate(point(ScaledPixels(cx_w), ScaledPixels(cy_w)))
                                    .rotate(ui::radians(et.rotate_deg.to_radians()))
                                    .translate(point(ScaledPixels(-cx_w), ScaledPixels(-cy_w)));
                                let local_transform = rotate_around_center.compose(scale_from_tl);
                                window.with_paint_transformation(local_transform, |window| {
                                    for block in &et.layout.blocks {
                                        let origin =
                                            point(px(et.rect.x + block.x), px(et.rect.y + block.y));
                                        block.body.paint(origin, BlockPaint::default(), window, cx);
                                    }
                                    if let Some((ref eid, false, ref sel_rects, caret)) =
                                        editing_overlay
                                        && eid == &et.id
                                    {
                                        for sr in sel_rects {
                                            let sb = Bounds::new(
                                                point(px(et.rect.x + sr.x), px(et.rect.y + sr.y)),
                                                size(px(sr.w), px(sr.h)),
                                            );
                                            window.paint_quad(ui::fill(
                                                sb,
                                                palette.brand.opacity(0.22),
                                            ));
                                        }
                                        if let Some(caret) = caret {
                                            let cb = Bounds::new(
                                                point(
                                                    px(et.rect.x + caret.x),
                                                    px(et.rect.y + caret.y),
                                                ),
                                                size(px(caret.w.max(2.0)), px(caret.h.max(16.0))),
                                            );
                                            window.paint_quad(ui::fill(cb, palette.brand));
                                        }
                                    }
                                });
                            }
                        }
                    }
                });
            });
        },
    )
    .size_full();

    div()
        .relative()
        .flex_1()
        .w_full()
        .min_h_0()
        .overflow_hidden()
        .snapshot(EDGELESS_VIEWPORT_ID, Some("root.canvas"))
        .child(paint_canvas)
        .children(snapshot_markers)
        .children(authoring_overlays)
        .children(toolbar)
        .child(zoom_controls)
        .into_any_element()
}

fn spatial_selection_rects(sel: &DocumentSelection, layout: &FlowLayout) -> Vec<FlowRect> {
    let mut out = Vec::new();
    if sel.empty() {
        return out;
    }
    let Some((start, end, a, b, _)) = sel.ordered(layout) else {
        return out;
    };
    for block in &layout.blocks[a..=b] {
        let from = if start.block_id == block.block_id {
            start.offset()
        } else {
            0
        };
        let to = if end.block_id == block.block_id {
            end.offset()
        } else {
            block.body.plain.encode_utf16().count() as u64
        };
        if let Some(t) = &block.body.text {
            for (line, x0, x1) in t.layout.selection_spans(from as usize, to as usize) {
                let top = block.y + t.y + line as f32 * t.layout.line_height();
                out.push(FlowRect::new(
                    block.x + t.x + x0,
                    top,
                    (x1 - x0).max(2.0),
                    t.layout.line_height(),
                ));
            }
        }
    }
    out
}
