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

fn frame_relevant_surface_elements(
    frame_node: &BlockNode,
    frect: (f32, f32, f32, f32),
    spatial_in_frame_ids: &BTreeSet<String>,
    elements: &[blocksuite_playground_doc::read::SurfaceElement],
) -> Vec<blocksuite_playground_doc::read::SurfaceElement> {
    use blocksuite_playground_doc::read::SurfaceElementKind;
    let pt_in = |pt: Option<[f64; 2]>| {
        pt.is_some_and(|[px, py]| {
            let (x, y) = (px as f32, py as f32);
            x >= frect.0 && x <= frect.0 + frect.2 && y >= frect.1 && y <= frect.1 + frect.3
        })
    };
    let members = frame_member_ids(frame_node);
    let mut inc = spatial_in_frame_ids.clone();
    for el in elements.iter().filter(|el| !el.hidden) {
        let hit = members.contains(&el.id)
            || match &el.kind {
                SurfaceElementKind::Shape(s) => xywh_intersects(s.xywh, frect),
                SurfaceElementKind::Text(t) => xywh_intersects(t.xywh, frect),
                SurfaceElementKind::Brush(st) | SurfaceElementKind::Highlighter(st) => {
                    xywh_intersects(st.xywh, frect)
                }
                SurfaceElementKind::Connector(c) => {
                    pt_in(c.source.position) || pt_in(c.target.position)
                }
                _ => false,
            };
        if hit {
            inc.insert(el.id.clone());
        }
    }
    elements
        .iter()
        .filter(|el| {
            !el.hidden
                && (inc.contains(&el.id)
                    || match &el.kind {
                        SurfaceElementKind::Connector(c) => {
                            c.source.id.as_deref().is_some_and(|id| inc.contains(id))
                                || c.target.id.as_deref().is_some_and(|id| inc.contains(id))
                        }
                        SurfaceElementKind::Group { children, .. } => {
                            children.iter().any(|id| inc.contains(id))
                        }
                        _ => false,
                    })
        })
        .cloned()
        .collect()
}

/// Deterministic cache fingerprint of the referenced `Frame`, intersecting spatial blocks,
/// and frame-relevant whiteboard elements so `BlockFlow` invalidates a `SurfaceRef` card on edit.
pub(super) fn surface_ref_fingerprint(snapshot: &PageSnapshot, reference: &str) -> u64 {
    use std::hash::{Hash, Hasher};
    let Some((root, frame_node)) = snapshot
        .root
        .as_ref()
        .and_then(|r| Some((r, find_frame_node(r, reference)?)))
    else {
        return 0;
    };
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    format!("{:?}", (&frame_node.content, frame_member_ids(frame_node))).hash(&mut hasher);
    if let BlockContent::Frame { xywh, .. } = &frame_node.content
        && let Some(frect) = parse_xywh_rect(xywh)
        && frect.2 > 1.0
        && frect.3 > 1.0
    {
        let mut spatial_in_frame = BTreeSet::new();
        for sp in crate::edgeless::spatial_blocks(root) {
            if let BlockContent::Note {
                xywh,
                hidden: false,
                ..
            }
            | BlockContent::EdgelessText { xywh } = &sp.content
                && let Some((nx, ny, nw, nh)) = parse_xywh_rect(xywh)
                && xywh_intersects([nx.into(), ny.into(), nw.into(), nh.into()], frect)
            {
                spatial_in_frame.insert(sp.id.clone());
                let rot = crate::edgeless::prop_f32(sp, "prop:rotate", 0.0);
                format!("{:?}", (&sp.id, &sp.content, rot.to_bits())).hash(&mut hasher);
            }
        }
        for node in root.walk() {
            if let BlockContent::Surface { elements, .. } = &node.content {
                let rel =
                    frame_relevant_surface_elements(frame_node, frect, &spatial_in_frame, elements);
                format!("{rel:?}").hash(&mut hasher);
            }
        }
    }
    hasher.finish()
}

impl FlowPass<'_> {
    pub(super) fn surface_ref_body(
        &mut self,
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

            prims.push(Prim::Quad {
                rect: FlowRect::new(ox, oy, draw_w, draw_h),
                fill: Some(self.palette.background),
                border: Some(self.palette.brand.opacity(0.45)),
                radius: 4.0,
                dashed: false,
            });
            drew_canvas_items = true;

            let mut external_bounds = std::collections::BTreeMap::new();
            let mut spatial_in_frame = BTreeSet::new();
            for spatial in crate::edgeless::spatial_blocks(root) {
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
                            external_bounds.insert(
                                spatial.id.clone(),
                                crate::surface::WorldBounds {
                                    xywh: [bx.into(), by.into(), bw.into(), bh.into()],
                                    rotate: rot.into(),
                                },
                            );
                            if matches!(spatial.content, BlockContent::EdgelessText { .. })
                                && !(bx + bw < fx || bx > fx + fw || by + bh < fy || by > fy + fh)
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
                        let rel = frame_relevant_surface_elements(
                            fnode,
                            (fx, fy, fw, fh),
                            &spatial_in_frame,
                            elements,
                        );
                        if !rel.is_empty() {
                            let surface_layout = crate::surface::layout_surface(
                                &rel,
                                &external_bounds,
                                self.input.theme,
                                self.window,
                            );
                            prims.push(Prim::Surface {
                                rect: FlowRect::new(ox, oy, draw_w, draw_h),
                                layout: Rc::new(surface_layout),
                                world_origin: (fx, fy),
                                scale,
                            });
                        }
                    }
                }
            }
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
