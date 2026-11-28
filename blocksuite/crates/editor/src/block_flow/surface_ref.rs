//! Layout and cache fingerprinting for `affine:surface-ref` whiteboard preview cards.

use std::{collections::BTreeSet, rc::Rc};

use blocksuite_playground_doc::read::{BlockContent, BlockNode, PageSnapshot};

use crate::theme::{FONT_SANS, IconPaint, TYPOGRAPHY};

use super::{
    BlockBody, CARD_BLOCK_MARGIN, FlowKind, FlowPass, FlowRect, InlineAlign, InlineStyle, Prim,
    inline::truncate_to_width,
};

fn parse_xywh_rect(raw: &str) -> Option<(f32, f32, f32, f32)> {
    let trimmed = raw.trim().trim_start_matches('[').trim_end_matches(']');
    let mut parts = trimmed.split(',').map(|s| s.trim().parse::<f32>().ok());
    Some((
        parts.next()??,
        parts.next()??,
        parts.next()??,
        parts.next()??,
    ))
}

fn find_frame_node<'a>(root: &'a BlockNode, reference: &str) -> Option<&'a BlockNode> {
    root.walk()
        .find(|node| node.id == reference && matches!(node.content, BlockContent::Frame { .. }))
}

/// Fallback lookup for `affine:surface-ref` pointing to a surface `Group` or individual
/// whiteboard element (shape, text, brush, mindmap) rather than an `affine:frame` block.
fn find_surface_target_bounds(
    root: &BlockNode,
    reference: &str,
    external_bounds: &std::collections::BTreeMap<String, crate::surface::WorldBounds>,
) -> Option<(
    String,
    (f32, f32, f32, f32),
    Vec<blocksuite_playground_doc::read::SurfaceElement>,
)> {
    use blocksuite_playground_doc::read::SurfaceElementKind;
    for node in root.walk() {
        let BlockContent::Surface { elements, .. } = &node.content else {
            continue;
        };
        let Some(target) = elements.iter().find(|e| e.id == reference && !e.hidden) else {
            continue;
        };
        let (all_bounds, collapsed_hidden) =
            crate::surface::resolve_surface_element_bounds(elements, external_bounds);
        let mut inc = BTreeSet::new();
        inc.insert(target.id.clone());
        let title = match &target.kind {
            SurfaceElementKind::Group { title, children } => {
                for cid in children {
                    inc.insert(cid.clone());
                }
                if title.plain.trim().is_empty() {
                    "Canvas Group".to_string()
                } else {
                    title.plain.trim().to_string()
                }
            }
            SurfaceElementKind::Mindmap(mm) => {
                for nid in mm.nodes.keys() {
                    inc.insert(nid.clone());
                }
                "Canvas Mindmap".to_string()
            }
            _ => "Canvas Element".to_string(),
        };
        let mut min_x = f64::INFINITY;
        let mut min_y = f64::INFINITY;
        let mut max_x = f64::NEG_INFINITY;
        let mut max_y = f64::NEG_INFINITY;
        for id in &inc {
            if collapsed_hidden.contains(id) {
                continue;
            }
            if let Some(wb) = all_bounds.get(id) {
                let [x, y, w, h] = wb.aabb().xywh;
                min_x = min_x.min(x);
                min_y = min_y.min(y);
                max_x = max_x.max(x + w);
                max_y = max_y.max(y + h);
            }
        }
        if !min_x.is_finite() || !min_y.is_finite() || max_x <= min_x || max_y <= min_y {
            return None;
        }
        let pad = 12.0;
        let top_pad = if matches!(target.kind, SurfaceElementKind::Group { .. }) {
            34.0
        } else {
            pad
        };
        let rect = (
            (min_x - pad) as f32,
            (min_y - top_pad) as f32,
            (max_x - min_x + pad * 2.0) as f32,
            (max_y - min_y + top_pad + pad) as f32,
        );
        let rel: Vec<_> = elements
            .iter()
            .filter(|e| !e.hidden && !collapsed_hidden.contains(&e.id) && inc.contains(&e.id))
            .cloned()
            .collect();
        return Some((title, rect, rel));
    }
    None
}

fn frame_member_ids(frame_node: &BlockNode) -> BTreeSet<String> {
    match frame_node.props.get("prop:childElementIds") {
        Some(serde_json::Value::Object(map)) => map.keys().cloned().collect(),
        _ => BTreeSet::new(),
    }
}

fn xywh_intersects([x, y, w, h]: [f64; 4], (fx, fy, fw, fh): (f32, f32, f32, f32)) -> bool {
    let (x, y, w, h) = (x as f32, y as f32, w as f32, h as f32);
    !(x + w < fx || x > fx + fw || y + h < fy || y > fy + fh)
}

fn subtree_contains_block(node: &BlockNode, target_id: &str) -> bool {
    !target_id.is_empty() && node.walk().any(|n| n.id == target_id)
}

fn collect_spatial_bounds(
    root: &BlockNode,
    frect: (f32, f32, f32, f32),
    exclude_ancestor_of: &str,
) -> (
    std::collections::BTreeMap<String, crate::surface::WorldBounds>,
    BTreeSet<String>,
) {
    let mut external_bounds = std::collections::BTreeMap::new();
    let mut spatial_in_frame = BTreeSet::new();
    for sp in crate::edgeless::spatial_blocks(root) {
        if subtree_contains_block(sp, exclude_ancestor_of) {
            continue;
        }
        match &sp.content {
            BlockContent::Note {
                xywh,
                hidden: false,
                ..
            } => {
                if let Some((nx, ny, nw, nh)) = parse_xywh_rect(xywh)
                    && nw > 1.0
                    && nh > 1.0
                {
                    let xywh64 = [nx.into(), ny.into(), nw.into(), nh.into()];
                    external_bounds.insert(
                        sp.id.clone(),
                        crate::surface::WorldBounds {
                            xywh: xywh64,
                            rotate: 0.0,
                        },
                    );
                    if xywh_intersects(xywh64, frect) {
                        spatial_in_frame.insert(sp.id.clone());
                    }
                }
            }
            BlockContent::Frame { xywh, .. } | BlockContent::EdgelessText { xywh } => {
                if let Some((bx, by, bw, bh)) = parse_xywh_rect(xywh) {
                    let rot = crate::edgeless::prop_f32(sp, "prop:rotate", 0.0);
                    let wb = crate::surface::WorldBounds {
                        xywh: [bx.into(), by.into(), bw.into(), bh.into()],
                        rotate: rot.into(),
                    };
                    external_bounds.insert(sp.id.clone(), wb);
                    if matches!(sp.content, BlockContent::EdgelessText { .. })
                        && xywh_intersects(wb.aabb().xywh, frect)
                    {
                        spatial_in_frame.insert(sp.id.clone());
                    }
                }
            }
            _ => {}
        }
    }
    (external_bounds, spatial_in_frame)
}

fn frame_relevant_surface_elements(
    frame_node: &BlockNode,
    frect: (f32, f32, f32, f32),
    external_bounds: &std::collections::BTreeMap<String, crate::surface::WorldBounds>,
    spatial_in_frame_ids: &BTreeSet<String>,
    elements: &[blocksuite_playground_doc::read::SurfaceElement],
) -> (
    Vec<blocksuite_playground_doc::read::SurfaceElement>,
    BTreeSet<String>,
) {
    use blocksuite_playground_doc::read::SurfaceElementKind;
    let (all_bounds, collapsed_hidden) =
        crate::surface::resolve_surface_element_bounds(elements, external_bounds);
    let mut all_shapes = std::collections::BTreeMap::new();
    for el in elements
        .iter()
        .filter(|el| !el.hidden && !collapsed_hidden.contains(&el.id))
    {
        if let SurfaceElementKind::Shape(s) = &el.kind {
            all_shapes.insert(el.id.as_str(), s.shape_type);
        }
    }

    let members = frame_member_ids(frame_node);
    let mut inc = spatial_in_frame_ids.clone();
    for el in elements
        .iter()
        .filter(|el| !el.hidden && !collapsed_hidden.contains(&el.id))
    {
        let hit = members.contains(&el.id)
            || match &el.kind {
                SurfaceElementKind::Shape(s) => all_bounds.get(&el.id).is_some_and(|b| {
                    xywh_intersects(b.aabb().expand((s.stroke_width * 0.5).max(0.0)).xywh, frect)
                }),
                SurfaceElementKind::Text(_) => all_bounds
                    .get(&el.id)
                    .is_some_and(|b| xywh_intersects(b.aabb().xywh, frect)),
                SurfaceElementKind::Brush(s) | SurfaceElementKind::Highlighter(s) => {
                    all_bounds.get(&el.id).is_some_and(|b| {
                        let half = (s.line_width * 0.5).max(0.5);
                        xywh_intersects(b.aabb().expand(half).xywh, frect)
                    })
                }
                SurfaceElementKind::Connector(c) => {
                    crate::surface::connector_intersects_rect(c, &all_bounds, &all_shapes, frect)
                }
                SurfaceElementKind::Mindmap(mm) => {
                    crate::surface::mindmap_intersects_rect(mm, &all_bounds, &all_shapes, frect)
                }
                _ => false,
            };
        if hit {
            inc.insert(el.id.clone());
        }
    }

    // Retain any connector or mindmap attached to an included node, and pull in bound endpoint
    // or mindmap node IDs so `layout_surface` resolves ports on shapes outside the frame (clipped
    // by paint mask) and `surface_ref_fingerprint` invalidates when an outside endpoint moves.
    let mut endpoint_deps = BTreeSet::new();
    for el in elements.iter().filter(|el| !el.hidden) {
        match &el.kind {
            SurfaceElementKind::Connector(c) => {
                let touches_inc = inc.contains(&el.id)
                    || c.source.id.as_deref().is_some_and(|id| inc.contains(id))
                    || c.target.id.as_deref().is_some_and(|id| inc.contains(id));
                if touches_inc {
                    endpoint_deps.insert(el.id.clone());
                    if let Some(id) = &c.source.id {
                        endpoint_deps.insert(id.clone());
                    }
                    if let Some(id) = &c.target.id {
                        endpoint_deps.insert(id.clone());
                    }
                }
            }
            SurfaceElementKind::Mindmap(mm) => {
                if inc.contains(&el.id) || mm.nodes.keys().any(|nid| inc.contains(nid)) {
                    endpoint_deps.insert(el.id.clone());
                    endpoint_deps.extend(mm.nodes.keys().cloned());
                }
            }
            _ => {}
        }
    }
    inc.extend(endpoint_deps);

    loop {
        let before = inc.len();
        for el in elements {
            if !el.hidden
                && match &el.kind {
                    SurfaceElementKind::Group { children, .. } => {
                        children.iter().any(|id| inc.contains(id))
                    }
                    SurfaceElementKind::Mindmap(mm) => mm.nodes.keys().any(|id| inc.contains(id)),
                    _ => false,
                }
            {
                inc.insert(el.id.clone());
            }
        }
        if inc.len() == before {
            break;
        }
    }

    let filtered = elements
        .iter()
        .filter(|el| !el.hidden && inc.contains(&el.id))
        .cloned()
        .collect();
    (filtered, inc)
}

/// Deterministic cache fingerprint of the referenced `Frame`, intersecting spatial blocks,
/// and frame-relevant whiteboard elements so `BlockFlow` invalidates a `SurfaceRef` card on edit.
pub(super) fn surface_ref_fingerprint(
    snapshot: &PageSnapshot,
    reference: &str,
    surface_ref_block_id: &str,
) -> u64 {
    use std::hash::{Hash, Hasher};
    let Some(root) = snapshot.root.as_ref() else {
        return 0;
    };
    let Some(frame_node) = find_frame_node(root, reference) else {
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        if let Some((title, rect, rel)) =
            find_surface_target_bounds(root, reference, &std::collections::BTreeMap::new())
        {
            title.hash(&mut hasher);
            format!("{rect:?}{rel:?}").hash(&mut hasher);
            return hasher.finish();
        }
        return 0;
    };
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    format!("{:?}", (&frame_node.content, frame_member_ids(frame_node))).hash(&mut hasher);
    if let BlockContent::Frame { xywh, .. } = &frame_node.content
        && let Some(frect) = parse_xywh_rect(xywh)
        && frect.2 > 1.0
        && frect.3 > 1.0
    {
        let (external_bounds, mut tracked_spatial) =
            collect_spatial_bounds(root, frect, surface_ref_block_id);
        for node in root.walk() {
            if let BlockContent::Surface { elements, .. } = &node.content {
                let (rel, inc_ids) = frame_relevant_surface_elements(
                    frame_node,
                    frect,
                    &external_bounds,
                    &tracked_spatial,
                    elements,
                );
                let (resolved_bounds, _) =
                    crate::surface::resolve_surface_element_bounds(elements, &external_bounds);
                for id in &inc_ids {
                    if let Some(b) = resolved_bounds.get(id) {
                        format!("{b:?}").hash(&mut hasher);
                    }
                }
                tracked_spatial.extend(inc_ids);
                format!("{rel:?}").hash(&mut hasher);
            }
        }
        for sp in crate::edgeless::spatial_blocks(root) {
            if !subtree_contains_block(sp, surface_ref_block_id) {
                if matches!(sp.content, BlockContent::Frame { .. }) {
                    let idx = sp.props.get("prop:index").and_then(|v| v.as_str());
                    format!("{:?}", (&sp.id, idx, frame_member_ids(sp))).hash(&mut hasher);
                }
                if tracked_spatial.contains(&sp.id) {
                    let rot = crate::edgeless::prop_f32(sp, "prop:rotate", 0.0);
                    format!("{:?}", (&sp.id, &sp.content, rot.to_bits())).hash(&mut hasher);
                }
            }
        }
    }
    hasher.finish()
}

impl FlowPass<'_> {
    pub(super) fn surface_ref_body(
        &mut self,
        surface_ref_block_id: &str,
        reference: &str,
        _ref_flavour: &str,
        caption: &str,
        width: f32,
    ) -> BlockBody {
        let frame_node = self
            .input
            .snapshot
            .root
            .as_ref()
            .and_then(|root| find_frame_node(root, reference));

        let surface_target = if frame_node.is_none() {
            self.input.snapshot.root.as_ref().and_then(|root| {
                find_surface_target_bounds(root, reference, &std::collections::BTreeMap::new())
            })
        } else {
            None
        };

        let frame_title = frame_node.and_then(|node| match &node.content {
            BlockContent::Frame { title, .. } if !title.plain.trim().is_empty() => {
                Some(title.plain.trim())
            }
            _ => None,
        });
        let frame_xywh = frame_node.and_then(|node| match &node.content {
            BlockContent::Frame { xywh, .. } => parse_xywh_rect(xywh),
            _ => None,
        });
        let clean_title = frame_title
            .or_else(|| surface_target.as_ref().map(|(t, _, _)| t.as_str()))
            .or_else(|| (!caption.trim().is_empty()).then_some(caption.trim()))
            .unwrap_or("Canvas Frame");

        let pad = 12.0;
        let thumb_h = 120.0;
        let header_h = 34.0;
        let card_h = pad + thumb_h + header_h;
        let thumb_rect = FlowRect::new(pad, pad, (width - 2.0 * pad).max(40.0), thumb_h);

        let mut prims = vec![
            Prim::Quad {
                rect: FlowRect::new(0.0, 0.0, width, card_h),
                fill: Some(self.palette.background),
                border: Some(self.palette.card_border),
                radius: 8.0,
                dashed: false,
            },
            Prim::Quad {
                rect: thumb_rect,
                fill: Some(self.palette.background_secondary),
                border: Some(self.palette.border),
                radius: 6.0,
                dashed: false,
            },
        ];

        // Project surface shapes/elements inside the referenced frame's world bounds into the
        // miniature canvas thumbnail (reusing snapshot surface data, zero second renderer).
        let mut drew_canvas_items = false;
        if let (Some((fx, fy, fw, fh)), Some(root)) = (frame_xywh, &self.input.snapshot.root)
            && fw > 1.0
            && fh > 1.0
        {
            let inset = 8.0;
            let avail_w = (thumb_rect.w - 2.0 * inset).max(1.0);
            let avail_h = (thumb_rect.h - 2.0 * inset).max(1.0);
            let scale = (avail_w / fw).min(avail_h / fh);
            let draw_w = fw * scale;
            let draw_h = fh * scale;
            let ox = thumb_rect.x + (thumb_rect.w - draw_w) * 0.5;
            let oy = thumb_rect.y + (thumb_rect.h - draw_h) * 0.5;

            let frame_draw_rect = FlowRect::new(ox, oy, draw_w, draw_h);
            prims.push(Prim::Quad {
                rect: frame_draw_rect,
                fill: Some(self.palette.background),
                border: None,
                radius: 4.0,
                dashed: false,
            });
            drew_canvas_items = true;

            let mut external_bounds = std::collections::BTreeMap::new();
            let mut spatial_in_frame = BTreeSet::new();
            for spatial in crate::edgeless::spatial_blocks(root) {
                if subtree_contains_block(spatial, surface_ref_block_id) {
                    continue;
                }
                match &spatial.content {
                    BlockContent::Note {
                        xywh,
                        background,
                        hidden: false,
                        ..
                    } => {
                        if let Some((nx, ny, nw, nh)) = parse_xywh_rect(xywh)
                            && nw > 1.0
                            && nh > 1.0
                        {
                            external_bounds.insert(
                                spatial.id.clone(),
                                crate::surface::WorldBounds {
                                    xywh: [nx.into(), ny.into(), nw.into(), nh.into()],
                                    rotate: 0.0,
                                },
                            );
                            if !(nx + nw < fx || nx > fx + fw || ny + nh < fy || ny > fy + fh) {
                                spatial_in_frame.insert(spatial.id.clone());
                                let note_fill = crate::edgeless::resolve_edgeless_color(
                                    background,
                                    self.input.theme,
                                )
                                .filter(|c| !c.is_transparent())
                                .unwrap_or(self.palette.background_secondary);
                                let sx = ox + (nx - fx).max(0.0) * scale;
                                let sy = oy + (ny - fy).max(0.0) * scale;
                                let sw = (nw * scale).min(ox + draw_w - sx).max(6.0);
                                let sh = (nh * scale).min(oy + draw_h - sy).max(6.0);
                                prims.push(Prim::Quad {
                                    rect: FlowRect::new(sx, sy, sw, sh),
                                    fill: Some(note_fill),
                                    border: Some(self.palette.card_border),
                                    radius: 3.0,
                                    dashed: false,
                                });
                            }
                        }
                    }
                    BlockContent::Frame { xywh, .. } | BlockContent::EdgelessText { xywh } => {
                        if let Some((bx, by, bw, bh)) = parse_xywh_rect(xywh) {
                            let rot = crate::edgeless::prop_f32(spatial, "prop:rotate", 0.0);
                            let wb = crate::surface::WorldBounds {
                                xywh: [bx.into(), by.into(), bw.into(), bh.into()],
                                rotate: rot.into(),
                            };
                            external_bounds.insert(spatial.id.clone(), wb);
                            if matches!(spatial.content, BlockContent::EdgelessText { .. })
                                && xywh_intersects(wb.aabb().xywh, (fx, fy, fw, fh))
                            {
                                spatial_in_frame.insert(spatial.id.clone());
                            }
                        }
                    }
                    _ => {}
                }
            }
            if let Some(fnode) = frame_node {
                for node in root.walk() {
                    if let BlockContent::Surface { elements, .. } = &node.content {
                        let (rel, _) = frame_relevant_surface_elements(
                            fnode,
                            (fx, fy, fw, fh),
                            &external_bounds,
                            &spatial_in_frame,
                            elements,
                        );
                        if !rel.is_empty() {
                            let surface_layout = crate::surface::layout_surface_in_doc(
                                Some(root),
                                &rel,
                                &external_bounds,
                                self.input.theme,
                                self.window,
                            );
                            prims.push(Prim::Surface {
                                rect: frame_draw_rect,
                                layout: Rc::new(surface_layout),
                                world_origin: (fx, fy),
                                scale,
                            });
                        }
                    }
                }
            }
            // Paint the frame border stroke on top of projected items so clipped shapes/notes
            // never occlude the frame outline.
            prims.push(Prim::Quad {
                rect: frame_draw_rect,
                fill: None,
                border: Some(self.palette.brand.opacity(0.45)),
                radius: 4.0,
                dashed: false,
            });
        }
        if !drew_canvas_items
            && let (Some((_, (gx, gy, gw, gh), rel)), Some(root)) =
                (surface_target.as_ref(), &self.input.snapshot.root)
            && *gw > 1.0
            && *gh > 1.0
            && !rel.is_empty()
        {
            let inset = 8.0;
            let avail_w = (thumb_rect.w - 2.0 * inset).max(1.0);
            let avail_h = (thumb_rect.h - 2.0 * inset).max(1.0);
            let scale = (avail_w / gw).min(avail_h / gh);
            let draw_w = gw * scale;
            let draw_h = gh * scale;
            let ox = thumb_rect.x + (thumb_rect.w - draw_w) * 0.5;
            let oy = thumb_rect.y + (thumb_rect.h - draw_h) * 0.5;
            let draw_rect = FlowRect::new(ox, oy, draw_w, draw_h);
            let surface_layout = crate::surface::layout_surface_in_doc(
                Some(root),
                rel,
                &std::collections::BTreeMap::new(),
                self.input.theme,
                self.window,
            );
            prims.push(Prim::Surface {
                rect: draw_rect,
                layout: Rc::new(surface_layout),
                world_origin: (*gx, *gy),
                scale,
            });
            drew_canvas_items = true;
        }
        if !drew_canvas_items {
            let icon_size = 24.0;
            prims.push(Prim::Icon {
                rect: FlowRect::new(
                    thumb_rect.x + (thumb_rect.w - icon_size) * 0.5,
                    thumb_rect.y + (thumb_rect.h - icon_size) * 0.5,
                    icon_size,
                    icon_size,
                ),
                icon: IconPaint::named("EdgelessIcon"),
                color: self.palette.icon,
            });
        }

        let footer_y = pad + thumb_h + 7.0;
        let inner_w = (width - pad * 2.0 - 26.0).max(40.0);
        let title_style = InlineStyle::new(
            FONT_SANS,
            TYPOGRAPHY.font_sm_px,
            500.0,
            self.palette.text_primary,
        );
        let title_str = truncate_to_width(self.window, clean_title, &title_style, inner_w)
            .text
            .to_string();
        prims.push(Prim::Icon {
            rect: FlowRect::new(pad, footer_y + 2.0, 16.0, 16.0),
            icon: IconPaint::named("EdgelessIcon"),
            color: self.palette.icon,
        });
        prims.push(Prim::Text {
            x: pad + 24.0,
            y: footer_y,
            layout: self.plain_inline(&title_str, title_style, inner_w, 20.0, InlineAlign::Left),
            clip: None,
        });

        BlockBody {
            kind: FlowKind::SurfaceRef,
            width,
            height: card_h,
            margin_top: CARD_BLOCK_MARGIN,
            margin_bottom: CARD_BLOCK_MARGIN,
            plain: clean_title.to_string(),
            prims,
            text: None,
            prefix: None,
            code_scroll: None,
            pdf_controls: None,
            table_cells: Vec::new(),
        }
    }
}
