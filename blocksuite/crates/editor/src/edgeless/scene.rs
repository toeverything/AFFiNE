//! Single-pass Edgeless scene preparation: cached note/text/surface layout and paint-order hit-test metadata.

use std::rc::Rc;

use blocksuite_playground_doc::read::{BlockContent, BlockNode, NoteDisplayMode};
use ui::Window;

use crate::{
    block_flow::{
        BlockFlow, FlowInput, FlowLayout, InlineAlign, InlineBaseline, InlineStyle, layout_inline,
    },
    surface::{SurfaceLayout, layout_surface_in_doc},
    theme::FONT_SANS,
};

use super::{
    CachedNoteFlow, CachedSurfaces, EdgelessCanvasState, EdgelessRenderInput, FRAME_TITLE_GAP,
    FRAME_TITLE_HEIGHT, Layers, NOTE_CARD_PADDING, PaintEdgelessText, PaintFrame, PaintItem,
    PaintNote, SpatialItemInfo, SpatialItemKind, WorldRect, note_border_radius, note_border_style,
    note_collapse, note_scale, note_shadow_type, parse_xywh, prop_bool, prop_f32,
    resolve_edgeless_color, rotated_bounds, spatial_blocks, world_bounds, world_rect,
};

/// Collects child element ids listed as `true` in a frame block's `prop:childElementIds`.
pub fn collect_frame_children(node: &BlockNode) -> Vec<String> {
    node.props
        .get("prop:childElementIds")
        .and_then(|v| v.as_object())
        .map(|m| {
            m.iter()
                .filter(|(_, v)| v.as_bool() == Some(true))
                .map(|(k, _)| k.clone())
                .collect()
        })
        .unwrap_or_default()
}

pub struct PreparedEdgelessScene {
    pub(super) frames: Vec<PaintFrame>,
    pub(super) notes: Vec<PaintNote>,
    pub(super) texts: Vec<PaintEdgelessText>,
    pub(super) surfaces: Rc<[SurfaceLayout]>,
    pub(super) order: Rc<[PaintItem]>,
}

pub fn prepare_edgeless_scene(
    state: &mut EdgelessCanvasState,
    input: &EdgelessRenderInput<'_>,
    window: &Window,
) -> PreparedEdgelessScene {
    state.last_frame_relayouts = 0;
    let live_overrides = state.authoring.live_overrides();

    let mut frames = Vec::new();
    let mut notes = Vec::new();
    let mut texts = Vec::new();
    // Preserve exact `sys:children` order across Frames, Notes, and EdgelessTexts when merging
    // equal-index items into `Layers::merge`.
    let mut spatial_order: Vec<(String, PaintItem)> = Vec::new();

    if let Some(root) = &input.snapshot.root {
        let mut active_notes = Vec::new();
        let mut active_texts = Vec::new();

        for child in spatial_blocks(root) {
            match &child.content {
                BlockContent::Frame { title, xywh } => {
                    if let Some(mut rect) = parse_xywh(xywh) {
                        if let Some(ov) = live_overrides.get(&child.id) {
                            rect = ov.rect;
                        }
                        let fill = child
                            .props
                            .get("prop:background")
                            .and_then(|v| resolve_edgeless_color(v, input.theme))
                            .filter(|c| !c.is_transparent());
                        let title_text = if title.plain.is_empty() {
                            "Frame"
                        } else {
                            title.plain.as_str()
                        };
                        let zoom = state.camera.zoom.max(0.1);
                        let inv_zoom = 1.0 / zoom;
                        let title_color = input
                            .theme
                            .css_var("--affine-v2-edgeless-frame-fontColor-font")
                            .unwrap_or_else(ui::Hsla::black);
                        let title_style = InlineStyle::new(FONT_SANS, 14.0, 500.0, title_color);
                        let max_screen_w = (rect.w * zoom).max(80.0);
                        let title_inline = Rc::new(layout_inline(
                            title_text,
                            &title_style,
                            max_screen_w,
                            FRAME_TITLE_HEIGHT,
                            InlineBaseline::Of(&title_style),
                            InlineAlign::Left,
                            window,
                        ));
                        let pill_screen_w = (title_inline.content_width() + 8.0)
                            .min(max_screen_w)
                            .max(28.0);
                        let pill_screen_h = FRAME_TITLE_HEIGHT;
                        let pill_world_w = pill_screen_w * inv_zoom;
                        let pill_world_h = pill_screen_h * inv_zoom;
                        let pill_world_gap = FRAME_TITLE_GAP * inv_zoom;
                        let title_pill_rect = WorldRect::new(
                            rect.x,
                            rect.y - pill_world_h - pill_world_gap,
                            pill_world_w,
                            pill_world_h,
                        );
                        let index = child
                            .props
                            .get("prop:index")
                            .and_then(|v| v.as_str())
                            .unwrap_or("a0")
                            .to_string();
                        let frame_children = collect_frame_children(child);
                        let idx = frames.len();
                        frames.push(PaintFrame {
                            id: child.id.clone(),
                            title: title_text.to_string(),
                            index,
                            frame_children,
                            rect,
                            title_inline,
                            title_pill_rect,
                            title_pill_screen_size: (pill_screen_w, pill_screen_h),
                            fill,
                        });
                        spatial_order.push((child.id.clone(), PaintItem::Frame(idx)));
                    }
                }
                BlockContent::Note {
                    display_mode,
                    xywh,
                    background,
                    hidden,
                } if !hidden && *display_mode != NoteDisplayMode::DocOnly => {
                    let mut rect =
                        parse_xywh(xywh).unwrap_or(WorldRect::new(0.0, 0.0, 800.0, 95.0));
                    if let Some(ov) = live_overrides.get(&child.id) {
                        rect = ov.rect;
                    }
                    let scale = note_scale(child);
                    let collapse = note_collapse(child);
                    let border = note_border_style(child);
                    let border_radius = note_border_radius(child);
                    let shadows = input.theme.shadows(note_shadow_type(child));
                    let inner_width = (rect.w / scale - 2.0 * NOTE_CARD_PADDING).max(60.0);
                    let is_rtl = input.direction.is_rtl();
                    let key = (
                        input.doc_rev,
                        inner_width.to_bits(),
                        scale.to_bits(),
                        input.theme,
                        input.env_rev,
                        input.preview_rev,
                        input.preedit_nonce,
                        is_rtl,
                        input.utc_offset_minutes,
                    );
                    let layout = match state.note_flows.get_mut(&child.id) {
                        Some(cached) if cached.key == key => cached.layout.clone(),
                        _ => {
                            let flow_input = FlowInput {
                                snapshot: input.snapshot,
                                width: inner_width,
                                theme: input.theme,
                                page_titles: input.page_titles,
                                images: input.images,
                                pdf_previews: input.pdf_previews,
                                doc_directory: input.doc_directory,
                                equation_draft: None,
                                env_rev: input.env_rev,
                                direction: input.direction,
                                utc_offset_minutes: input.utc_offset_minutes,
                                utc_offset_at: input.utc_offset_at,
                            };
                            let entry =
                                state.note_flows.entry(child.id.clone()).or_insert_with(|| {
                                    CachedNoteFlow {
                                        flow: BlockFlow::new(),
                                        key: (u64::MAX, 0, 0, input.theme, 0, 0, 0, !is_rtl, 0),
                                        layout: Rc::new(FlowLayout {
                                            blocks: Vec::new(),
                                            width: inner_width,
                                            height: 0.0,
                                            direction: input.direction,
                                            stats: Default::default(),
                                        }),
                                    }
                                });
                            let laid_out =
                                entry
                                    .flow
                                    .layout_nodes(&child.children, &flow_input, window);
                            state.last_frame_relayouts += laid_out.stats.laid_out as u64;
                            let rc = Rc::new(laid_out);
                            entry.key = key;
                            entry.layout = rc.clone();
                            rc
                        }
                    };
                    if !collapse {
                        rect.h = rect
                            .h
                            .max((layout.height + 2.0 * NOTE_CARD_PADDING) * scale);
                    }
                    let fill = resolve_edgeless_color(background, input.theme)
                        .filter(|c| !c.is_transparent())
                        .unwrap_or(input.palette.background);
                    active_notes.push(child.id.clone());
                    let index = child
                        .props
                        .get("prop:index")
                        .and_then(|v| v.as_str())
                        .unwrap_or("a0")
                        .to_string();
                    let idx = notes.len();
                    notes.push(PaintNote {
                        id: child.id.clone(),
                        index,
                        rect,
                        scale,
                        border,
                        border_radius,
                        shadows,
                        fill,
                        layout,
                    });
                    spatial_order.push((child.id.clone(), PaintItem::Note(idx)));
                }
                BlockContent::EdgelessText { xywh } => {
                    if let Some(mut rect) = parse_xywh(xywh) {
                        let scale = prop_f32(child, "prop:scale", 1.0).clamp(0.1, 10.0);
                        let mut rotate_deg = prop_f32(child, "prop:rotate", 0.0);
                        if let Some(ov) = live_overrides.get(&child.id) {
                            rect = ov.rect;
                            if let Some(r) = ov.rotate_deg {
                                rotate_deg = r;
                            }
                        }
                        let has_max_width = prop_bool(child, "prop:hasMaxWidth", false);
                        let min_unscaled_w = (rect.w / scale).max(60.0);
                        let cache_width = if has_max_width {
                            min_unscaled_w
                        } else {
                            // Encode min_unscaled_w negatively to distinguish auto-width cache keys.
                            -min_unscaled_w
                        };
                        let is_rtl = input.direction.is_rtl();
                        let key = (
                            input.doc_rev,
                            cache_width.to_bits(),
                            scale.to_bits(),
                            input.theme,
                            input.env_rev,
                            input.preview_rev,
                            input.preedit_nonce,
                            is_rtl,
                            input.utc_offset_minutes,
                        );
                        let layout = match state.text_flows.get_mut(&child.id) {
                            Some(cached) if cached.key == key => cached.layout.clone(),
                            _ => {
                                let make_flow_input =
                                    |width: f32, direction: ui::Direction| FlowInput {
                                        snapshot: input.snapshot,
                                        width,
                                        theme: input.theme,
                                        page_titles: input.page_titles,
                                        images: input.images,
                                        pdf_previews: input.pdf_previews,
                                        doc_directory: input.doc_directory,
                                        equation_draft: None,
                                        env_rev: input.env_rev,
                                        direction,
                                        utc_offset_minutes: input.utc_offset_minutes,
                                        utc_offset_at: input.utc_offset_at,
                                    };
                                let entry = state
                                    .text_flows
                                    .entry(child.id.clone())
                                    .or_insert_with(|| CachedNoteFlow {
                                        flow: BlockFlow::new(),
                                        key: (u64::MAX, 0, 0, input.theme, 0, 0, 0, !is_rtl, 0),
                                        layout: Rc::new(FlowLayout {
                                            blocks: Vec::new(),
                                            width: min_unscaled_w,
                                            height: 0.0,
                                            direction: input.direction,
                                            stats: Default::default(),
                                        }),
                                    });
                                let final_width = if has_max_width {
                                    min_unscaled_w
                                } else {
                                    // Pass 1: measure natural max-content width in LTR using a
                                    // temporary BlockFlow so `entry.flow` keeps its cached width
                                    // for incremental per-block relayouts on Pass 2.
                                    let measure_in = make_flow_input(10_000.0, ui::Direction::Ltr);
                                    let mut measure_flow = BlockFlow::new();
                                    let measured = measure_flow.layout_nodes(
                                        &child.children,
                                        &measure_in,
                                        window,
                                    );
                                    let natural_content_w = measured
                                        .blocks
                                        .iter()
                                        .filter_map(|b| {
                                            b.body
                                                .text
                                                .as_ref()
                                                .map(|t| b.x + t.x + t.layout.natural_width())
                                        })
                                        .fold(0.0_f32, f32::max);
                                    (natural_content_w + 16.0).max(min_unscaled_w)
                                };
                                // Pass 2: lay out at the resolved container width so textAlign
                                // (left/center/right) and RTL align cleanly inside natural width.
                                let final_in = make_flow_input(final_width, input.direction);
                                let laid_out =
                                    entry.flow.layout_nodes(&child.children, &final_in, window);
                                state.last_frame_relayouts += laid_out.stats.laid_out as u64;
                                let rc = Rc::new(laid_out);
                                entry.key = key;
                                entry.layout = rc.clone();
                                rc
                            }
                        };
                        if !has_max_width {
                            rect.w = rect.w.max((layout.width * scale).max(60.0));
                        }
                        rect.h = rect.h.max((layout.height * scale).max(26.0));
                        active_texts.push(child.id.clone());
                        let index = child
                            .props
                            .get("prop:index")
                            .and_then(|v| v.as_str())
                            .unwrap_or("a0")
                            .to_string();
                        let idx = texts.len();
                        texts.push(PaintEdgelessText {
                            world_aabb: rotated_bounds(rect, rotate_deg),
                            id: child.id.clone(),
                            index,
                            rect,
                            scale,
                            rotate_deg,
                            layout,
                        });
                        spatial_order.push((child.id.clone(), PaintItem::Text(idx)));
                    }
                }
                _ => {}
            }
        }

        if state.note_flows.len() > active_notes.len() {
            state.note_flows.retain(|id, _| active_notes.contains(id));
        }
        if state.text_flows.len() > active_texts.len() {
            state.text_flows.retain(|id, _| active_texts.contains(id));
        }
    }

    let key = (input.doc_rev, input.theme, input.env_rev);
    let has_live_overrides = !live_overrides.is_empty();
    let (surfaces, order, painted_items) = match &state.surfaces {
        Some(cached) if cached.key == key && !has_live_overrides => (
            Rc::clone(&cached.layouts),
            Rc::clone(&cached.order),
            Rc::clone(&cached.painted_items),
        ),
        _ => {
            let external = frames
                .iter()
                .map(|f| (f.id.clone(), world_bounds(f.rect, 0.)))
                .chain(
                    notes
                        .iter()
                        .map(|n| (n.id.clone(), world_bounds(n.rect, 0.))),
                )
                .chain(
                    texts
                        .iter()
                        .map(|t| (t.id.clone(), world_bounds(t.rect, t.rotate_deg))),
                )
                .collect();
            let layouts: Rc<[SurfaceLayout]> = input
                .snapshot
                .root
                .iter()
                .flat_map(|root| &root.children)
                .filter_map(|node| match &node.content {
                    BlockContent::Surface { elements, .. } => {
                        if has_live_overrides {
                            let mut patched = elements.clone();
                            for el in &mut patched {
                                if let Some(ov) = live_overrides.get(&el.id) {
                                    if let Some(r) = ov.rotate_deg {
                                        el.rotate = r as f64;
                                    }
                                    let xywh = [
                                        ov.rect.x as f64,
                                        ov.rect.y as f64,
                                        ov.rect.w as f64,
                                        ov.rect.h as f64,
                                    ];
                                    match &mut el.kind {
                                        blocksuite_playground_doc::read::SurfaceElementKind::Shape(s) => s.xywh = xywh,
                                        blocksuite_playground_doc::read::SurfaceElementKind::Text(t) => t.xywh = xywh,
                                        blocksuite_playground_doc::read::SurfaceElementKind::Brush(b)
                                        | blocksuite_playground_doc::read::SurfaceElementKind::Highlighter(b) => b.xywh = xywh,
                                        blocksuite_playground_doc::read::SurfaceElementKind::Connector(c) => {
                                            let (dx, dy) = (ov.delta.0 as f64, ov.delta.1 as f64);
                                            if c.source.id.is_none()
                                                && let Some([sx, sy]) = c.source.position
                                            {
                                                c.source.position = Some([sx + dx, sy + dy]);
                                            }
                                            if c.target.id.is_none()
                                                && let Some([tx, ty]) = c.target.position
                                            {
                                                c.target.position = Some([tx + dx, ty + dy]);
                                            }
                                            if let Some([lx, ly, lw, lh]) = c.label_xywh {
                                                c.label_xywh = Some([lx + dx, ly + dy, lw, lh]);
                                            }
                                        }
                                        _ => {}
                                    }
                                }
                            }
                            Some(layout_surface_in_doc(
                                input.snapshot.root.as_ref(),
                                &patched,
                                &external,
                                input.theme,
                                window,
                            ))
                        } else {
                            Some(layout_surface_in_doc(
                                input.snapshot.root.as_ref(),
                                elements,
                                &external,
                                input.theme,
                                window,
                            ))
                        }
                    }
                    _ => None,
                })
                .collect();
            let order: Rc<[PaintItem]> = input
                .snapshot
                .root
                .as_ref()
                .map(|root| {
                    let items = spatial_order
                        .iter()
                        .map(|(id, item)| (id.as_str(), *item))
                        .chain(layouts.iter().enumerate().flat_map(|(l, layout)| {
                            layout
                                .item_ids()
                                .enumerate()
                                .map(move |(i, id)| (id, PaintItem::Surface(l, i)))
                        }));
                    Layers::from_root(root).merge(items)
                })
                .unwrap_or_default()
                .into();

            // Build painted_items in exact paint order once per doc/theme/env revision (or during live drag).
            let mut built_items = Vec::with_capacity(order.len());
            let surface_nodes: Vec<(&str, &[blocksuite_playground_doc::read::SurfaceElement])> =
                input
                    .snapshot
                    .root
                    .iter()
                    .flat_map(|root| &root.children)
                    .filter_map(|node| match &node.content {
                        BlockContent::Surface { elements, .. } => {
                            Some((node.id.as_str(), elements.as_slice()))
                        }
                        _ => None,
                    })
                    .collect();
            for item in order.iter() {
                match *item {
                    PaintItem::Frame(i) => {
                        let f = &frames[i];
                        built_items.push(SpatialItemInfo {
                            id: f.id.clone(),
                            kind: SpatialItemKind::Frame,
                            shape_type: None,
                            surface_id: None,
                            rect: f.rect,
                            rotate_deg: 0.0,
                            index: f.index.clone(),
                            scale: 1.0,
                            stroke_width: 1.0,
                            polyline: Vec::new(),
                            frame_children: f.frame_children.clone(),
                            title_pill_rect: Some(f.title_pill_rect),
                        });
                    }
                    PaintItem::Note(i) => {
                        let n = &notes[i];
                        built_items.push(SpatialItemInfo {
                            id: n.id.clone(),
                            kind: SpatialItemKind::Note,
                            shape_type: None,
                            surface_id: None,
                            rect: n.rect,
                            rotate_deg: 0.0,
                            index: n.index.clone(),
                            scale: n.scale,
                            stroke_width: 1.0,
                            polyline: Vec::new(),
                            frame_children: Vec::new(),
                            title_pill_rect: None,
                        });
                    }
                    PaintItem::Text(i) => {
                        let t = &texts[i];
                        built_items.push(SpatialItemInfo {
                            id: t.id.clone(),
                            kind: SpatialItemKind::EdgelessText,
                            shape_type: None,
                            surface_id: None,
                            rect: t.rect,
                            rotate_deg: t.rotate_deg,
                            index: t.index.clone(),
                            scale: t.scale,
                            stroke_width: 1.0,
                            polyline: Vec::new(),
                            frame_children: Vec::new(),
                            title_pill_rect: None,
                        });
                    }
                    PaintItem::Surface(l, i) => {
                        let Some(id) = surfaces_item_id(&layouts, l, i) else {
                            continue;
                        };
                        let Some((surface_id, elements)) = surface_nodes.get(l) else {
                            continue;
                        };
                        let Some(el) = elements.iter().find(|e| e.id == id) else {
                            continue;
                        };
                        let bounds_rect = layouts[l]
                            .bounds()
                            .find(|(bid, _)| *bid == id)
                            .map(|(_, b)| world_rect(b))
                            .unwrap_or_default();
                        let [lx, ly, lw, lh] = layouts[l].item_local_xywh(i);
                        let local_rect = WorldRect::new(lx as f32, ly as f32, lw as f32, lh as f32);
                        let (kind, rect) = match &el.kind {
                            blocksuite_playground_doc::read::SurfaceElementKind::Shape(_) => {
                                (SpatialItemKind::Shape, local_rect)
                            }
                            blocksuite_playground_doc::read::SurfaceElementKind::Connector(_) => {
                                (SpatialItemKind::Connector, bounds_rect)
                            }
                            blocksuite_playground_doc::read::SurfaceElementKind::Brush(s) => (
                                SpatialItemKind::Brush,
                                WorldRect::new(
                                    s.xywh[0] as f32,
                                    s.xywh[1] as f32,
                                    s.xywh[2] as f32,
                                    s.xywh[3] as f32,
                                ),
                            ),
                            blocksuite_playground_doc::read::SurfaceElementKind::Highlighter(s) => {
                                (
                                    SpatialItemKind::Highlighter,
                                    WorldRect::new(
                                        s.xywh[0] as f32,
                                        s.xywh[1] as f32,
                                        s.xywh[2] as f32,
                                        s.xywh[3] as f32,
                                    ),
                                )
                            }
                            blocksuite_playground_doc::read::SurfaceElementKind::Text(_) => {
                                (SpatialItemKind::SurfaceText, local_rect)
                            }
                            blocksuite_playground_doc::read::SurfaceElementKind::Group {
                                ..
                            }
                            | blocksuite_playground_doc::read::SurfaceElementKind::Mindmap(_) => {
                                (SpatialItemKind::Group, bounds_rect)
                            }
                            blocksuite_playground_doc::read::SurfaceElementKind::Unknown {
                                ..
                            } => {
                                continue;
                            }
                        };
                        let stroke_width = layouts[l].item_stroke_width(i);
                        let polyline = layouts[l].item_polyline(i).to_vec();
                        let final_rect = live_overrides.get(id).map_or(rect, |o| o.rect);
                        let final_rot = live_overrides
                            .get(id)
                            .and_then(|o| o.rotate_deg)
                            .unwrap_or(el.rotate as f32);
                        built_items.push(SpatialItemInfo {
                            id: el.id.clone(),
                            kind,
                            shape_type: match &el.kind {
                                blocksuite_playground_doc::read::SurfaceElementKind::Shape(s) => {
                                    Some(s.shape_type)
                                }
                                _ => None,
                            },
                            surface_id: Some((*surface_id).to_string()),
                            rect: final_rect,
                            rotate_deg: final_rot,
                            index: el.index.clone(),
                            scale: 1.0,
                            stroke_width,
                            polyline,
                            frame_children: Vec::new(),
                            title_pill_rect: None,
                        });
                    }
                }
            }
            let painted_items: Rc<[SpatialItemInfo]> = built_items.into();
            if !has_live_overrides {
                state.surfaces = Some(CachedSurfaces {
                    key,
                    layouts: Rc::clone(&layouts),
                    order: Rc::clone(&order),
                    painted_items: Rc::clone(&painted_items),
                });
            }
            (layouts, order, painted_items)
        }
    };

    let painted_items = if !frames.is_empty()
        && painted_items.iter().any(|item| {
            item.kind == SpatialItemKind::Frame
                && frames
                    .iter()
                    .find(|f| f.id == item.id)
                    .is_some_and(|f| item.title_pill_rect != Some(f.title_pill_rect))
        }) {
        let updated: Vec<SpatialItemInfo> = painted_items
            .iter()
            .cloned()
            .map(|mut item| {
                if item.kind == SpatialItemKind::Frame
                    && let Some(f) = frames.iter().find(|f| f.id == item.id)
                {
                    item.title_pill_rect = Some(f.title_pill_rect);
                }
                item
            })
            .collect();
        Rc::from(updated)
    } else {
        painted_items
    };
    state.authoring.painted_items = painted_items;

    PreparedEdgelessScene {
        frames,
        notes,
        texts,
        surfaces,
        order,
    }
}

fn surfaces_item_id(layouts: &[SurfaceLayout], l: usize, i: usize) -> Option<&str> {
    layouts.get(l).and_then(|lay| lay.item_ids().nth(i))
}
