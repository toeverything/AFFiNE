//! Double-click inline rich-text & IME editing for Edgeless shapes, connectors, text, frames, and notes.

use std::ops::Range;

use blocksuite_playground_doc::read::{
    BlockContent, ConnectorMode, SurfaceConnector, SurfaceElementKind, TextAlign,
};
use ui::{Bounds, Context, FontWeight, Pixels, Window, point, px, size};
use y_octo::{TextDeltaOp, TextInsert};

use crate::{
    PlaygroundView, TOPBAR_HEIGHT,
    editor_session::{DocPoint, DocumentSelection},
    rich_text::{RichParagraph, RichParagraphStyle},
    theme::ThemeMode,
};

use super::{
    EdgelessInlineEdit, EdgelessLabelEditor, LabelSplice, LabelTarget, NOTE_CARD_PADDING,
    SpatialItemKind, WorldRect, find_block, find_surface_element, rotate_point_around, utf16_len,
};

/// Sample the routed connector polyline at `distance` (`0.0..=1.0`), matching
/// `surface::paint`'s `route.point_at_distance(mode, distance)`.
fn connector_label_anchor_point(
    polyline: &[(f32, f32)],
    fallback_center: (f32, f32),
    mode: ConnectorMode,
    distance: f64,
) -> (f64, f64) {
    if polyline.len() < 2 {
        return (fallback_center.0 as f64, fallback_center.1 as f64);
    }
    let d = distance.clamp(0.0, 1.0);
    if mode == ConnectorMode::Curve {
        let f = d * (polyline.len() - 1) as f64;
        let i = (f.floor() as usize).min(polyline.len() - 2);
        let t = f - i as f64;
        let a = polyline[i];
        let b = polyline[i + 1];
        return (
            a.0 as f64 + (b.0 as f64 - a.0 as f64) * t,
            a.1 as f64 + (b.1 as f64 - a.1 as f64) * t,
        );
    }
    let seg_len = |a: (f32, f32), b: (f32, f32)| ((b.0 - a.0) as f64).hypot((b.1 - a.1) as f64);
    let total: f64 = polyline.windows(2).map(|w| seg_len(w[0], w[1])).sum();
    let mut rem = total * d;
    for w in polyline.windows(2) {
        let l = seg_len(w[0], w[1]);
        if rem <= l && l > 0.0 {
            let t = rem / l;
            return (
                w[0].0 as f64 + (w[1].0 as f64 - w[0].0 as f64) * t,
                w[0].1 as f64 + (w[1].1 as f64 - w[0].1 as f64) * t,
            );
        }
        rem -= l;
    }
    let last = *polyline.last().unwrap();
    (last.0 as f64, last.1 as f64)
}

fn measure_connector_label_xywh(
    c: &SurfaceConnector,
    polyline: &[(f32, f32)],
    fallback_center: (f32, f32),
    trimmed: &str,
    theme_mode: ThemeMode,
    window: &Window,
) -> [f64; 4] {
    let p =
        connector_label_anchor_point(polyline, fallback_center, c.mode, c.label_offset.distance);
    let l = &c.label_style;
    let max_w = if c.label_constraints.has_max_width {
        c.label_constraints.max_width as f32
    } else {
        1e6_f32
    };
    let mut style = RichParagraphStyle {
        font_family: l
            .font_family
            .trim_start_matches("blocksuite:surface:")
            .to_string()
            .into(),
        font_size: l.font_size as f32,
        base_weight: FontWeight(l.font_weight.parse().unwrap_or(if l.font_weight == "bold" {
            700.0
        } else {
            400.0
        })),
        align: match l.text_align {
            TextAlign::Left => ui::TextAlign::Left,
            TextAlign::Center => ui::TextAlign::Center,
            TextAlign::Right => ui::TextAlign::Right,
        },
        ..RichParagraphStyle::from_theme(theme_mode)
    };
    let ts = window.text_system();
    let mut face = ui::font(style.font_family.clone());
    face.weight = style.base_weight;
    let font_id = ts.resolve_font(&face);
    let font_px = px(style.font_size);
    let ascent = f32::from(ts.ascent(font_id, font_px));
    let descent = f32::from(ts.descent(font_id, font_px)).abs();
    style.line_height = ascent + descent;
    style.baseline_offset = Some(ascent);
    let delta = vec![TextDeltaOp::Insert {
        insert: TextInsert::Text(trimmed.to_string()),
        format: None,
    }];
    let (w, h) = if let Ok(para) = RichParagraph::from_delta(delta) {
        let laid = para.layout(ts, &style, max_w);
        let measured_w = laid
            .lines()
            .iter()
            .map(|line| f32::from(line.width))
            .fold(0.0_f32, f32::max)
            .ceil()
            .max(1.0) as f64;
        let measured_h = f64::from(f32::from(laid.size().height)).max(1.0);
        (measured_w, measured_h)
    } else {
        let fallback_w = (trimmed.chars().count() as f64 * 8.0 + 24.0).clamp(64.0, 260.0);
        (fallback_w, 28.0)
    };
    [p.0 - w * 0.5, p.1 - h * 0.5, w, h]
}

impl PlaygroundView {
    /// Apply a live UTF-16 splice on the active inline label editor directly into `PageDocSession`
    /// and update its `RelativePosition` anchors so concurrent remote edits merge cleanly.
    pub(crate) fn edgeless_label_edit(
        &mut self,
        window: &mut Window,
        cx: &mut Context<Self>,
        f: impl FnOnce(&mut EdgelessLabelEditor) -> Option<LabelSplice>,
    ) -> Option<()> {
        let (target, splice, sel_after) = {
            let ed = self.edgeless.authoring.label_editor_mut()?;
            let splice = f(ed);
            (ed.target.clone(), splice, ed.selection.clone())
        };
        if let Some(splice) = splice {
            let now_ms = self.now_ms(cx) as u64;
            let commit = self
                .page_mut()
                .ok()
                .and_then(|page| target.splice(page, splice, now_ms));
            if let Some(commit) = commit {
                self.did_edgeless_doc_commit(commit, cx);
            }
        }
        self.edgeless_update_label_anchors(sel_after);
        window.notify_text_input_changed(&self.editor_focus);
        cx.notify();
        Some(())
    }

    pub(crate) fn edgeless_update_label_anchors(&mut self, sel: Range<usize>) {
        let Some((target, preedit_range)) = self.edgeless.authoring.label_editor().map(|ed| {
            (
                ed.target.clone(),
                ed.preedit.as_ref().map(|p| p.replacement.clone()),
            )
        }) else {
            return;
        };
        let (anchors, preedit_anchors) = match self.page() {
            Some(page) => {
                let a = target
                    .encode_pos(page, sel.start)
                    .zip(target.encode_pos(page, sel.end));
                let pa = preedit_range.and_then(|r| {
                    target
                        .encode_pos(page, r.start)
                        .zip(target.encode_pos(page, r.end))
                });
                (a, pa)
            }
            None => (None, None),
        };
        if let Some(ed) = self.edgeless.authoring.label_editor_mut() {
            ed.anchors = anchors;
            ed.preedit_anchors = preedit_anchors;
        }
    }

    /// Refresh an open `EdgelessLabelEditor` from the latest snapshot after a remote update,
    /// resolving its `RelativePosition` selection and preedit anchors so the local caret and
    /// active composition track remote insertions.
    pub(crate) fn edgeless_refresh_label_editor_from_snapshot(&mut self) {
        let Some((target, anchors, preedit_anchors)) =
            self.edgeless.authoring.label_editor().map(|ed| {
                (
                    ed.target.clone(),
                    ed.anchors.clone(),
                    ed.preedit_anchors.clone(),
                )
            })
        else {
            return;
        };
        let Some(snapshot) = self.snapshot.clone() else {
            return;
        };
        let latest = match &target {
            LabelTarget::Shape { id, .. }
            | LabelTarget::Connector { id, .. }
            | LabelTarget::SurfaceText { id, .. } => {
                find_surface_element(&snapshot, id).and_then(|(_, el)| match &el.kind {
                    SurfaceElementKind::Shape(s) => Some(s.text.plain.clone()),
                    SurfaceElementKind::Connector(c) => Some(c.text.plain.clone()),
                    SurfaceElementKind::Text(t) => Some(t.text.plain.clone()),
                    _ => None,
                })
            }
            LabelTarget::FrameTitle { id } => {
                find_block(&snapshot, id).and_then(|n| match &n.content {
                    BlockContent::Frame { title, .. } => Some(title.plain.clone()),
                    _ => None,
                })
            }
        };
        let Some(latest_text) = latest else {
            self.edgeless.authoring.inline_edit = None;
            return;
        };
        let resolve_pair = |pair: Option<(y_octo::RelativePosition, y_octo::RelativePosition)>| {
            let (a, b) = pair?;
            let page = self.page()?;
            let s = target.resolve_pos(page, &a)?;
            let e = target.resolve_pos(page, &b)?;
            Some(s.min(e)..s.max(e))
        };
        let resolved_sel = resolve_pair(anchors);
        let resolved_preedit = resolve_pair(preedit_anchors);
        if let Some(ed) = self.edgeless.authoring.label_editor_mut() {
            ed.text = latest_text;
            let len = utf16_len(&ed.text);
            ed.selection = match resolved_sel {
                Some(r) => r.start.min(len)..r.end.min(len),
                None => ed.selection.start.min(len)..ed.selection.end.min(len),
            };
            if let Some(pre) = &mut ed.preedit {
                pre.replacement = match resolved_preedit {
                    Some(r) => r.start.min(len)..r.end.min(len),
                    None => pre.replacement.start.min(len)..pre.replacement.end.min(len),
                };
            }
        }
    }

    /// Flush and commit an active inline label edit to `PageDocSession`, returning `true` if one was active.
    pub(crate) fn edgeless_flush_label_edit(
        &mut self,
        window: &Window,
        cx: &mut Context<Self>,
    ) -> bool {
        let Some(EdgelessInlineEdit::Label(mut ed)) = self.edgeless.authoring.inline_edit.take()
        else {
            return false;
        };
        let now_ms = self.now_ms(cx) as u64;
        if let Some(splice) = ed.unmark() {
            let commit = self
                .page_mut()
                .ok()
                .and_then(|page| ed.target.splice(page, splice, now_ms));
            if let Some(commit) = commit {
                self.did_edgeless_doc_commit(commit, cx);
            }
        }

        if ed.created_new_text && ed.text.trim().is_empty() {
            if let LabelTarget::SurfaceText { surface_id, id } = &ed.target {
                let sid = surface_id.clone();
                let eid = id.clone();
                self.edgeless.authoring.selection.remove(&eid);
                let commit = self.page_mut().ok().and_then(|page| {
                    page.structural_edit(now_ms, move |page| {
                        page.remove_surface_element(&sid, &eid, now_ms)?;
                        Ok(())
                    })
                    .ok()
                    .flatten()
                });
                if let Some(commit) = commit {
                    self.did_edgeless_doc_commit(commit, cx);
                }
            }
        } else if let LabelTarget::Connector { surface_id, id } = &ed.target
            && ed.dirty
        {
            let trimmed = ed.text.trim();
            let label_xywh = if trimmed.is_empty() {
                [0.0; 4]
            } else {
                let polyline: Vec<(f32, f32)> = self
                    .edgeless
                    .authoring
                    .painted_items
                    .iter()
                    .find(|i| i.id == *id)
                    .map(|i| i.polyline.clone())
                    .unwrap_or_default();
                if let Some((_, el)) = self
                    .snapshot
                    .as_deref()
                    .and_then(|snap| find_surface_element(snap, id))
                    && let SurfaceElementKind::Connector(c) = &el.kind
                {
                    measure_connector_label_xywh(
                        c,
                        &polyline,
                        ed.world_rect.center(),
                        trimmed,
                        self.theme.mode(),
                        window,
                    )
                } else {
                    let (cx_w, cy_w) = ed.world_rect.center();
                    let lw = (trimmed.chars().count() as f64 * 8.0 + 24.0).clamp(64.0, 260.0);
                    let lh = 28.0;
                    [cx_w as f64 - lw * 0.5, cy_w as f64 - lh * 0.5, lw, lh]
                }
            };
            let commit = self.page_mut().ok().and_then(|page| {
                page.commit_connector_label(surface_id, id, trimmed, label_xywh, now_ms)
                    .ok()
                    .flatten()
            });
            if let Some(commit) = commit {
                self.did_edgeless_doc_commit(commit, cx);
            }
        }

        if let Ok(page) = self.page_mut() {
            let _ = page.stop_capturing();
        }
        true
    }

    /// Commit and exit any active Edgeless inline edit (label or spatial block).
    pub fn edgeless_commit_inline_edit(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if matches!(
            self.edgeless.authoring.inline_edit,
            Some(EdgelessInlineEdit::Label(_))
        ) {
            self.edgeless_flush_label_edit(window, cx);
            window.notify_text_input_changed(&self.editor_focus);
            cx.notify();
            return;
        }
        let Some(EdgelessInlineEdit::SpatialBlock { .. }) =
            self.edgeless.authoring.inline_edit.take()
        else {
            return;
        };
        self.clear_composition(window, cx);
        self.editor.selection = None;
        self.announce_selection(cx);
        window.notify_text_input_changed(&self.editor_focus);
        cx.notify();
    }

    /// Open inline editing on an Edgeless item (Note, EdgelessText, Shape, Connector, SurfaceText, or Frame).
    pub fn edgeless_begin_inline_edit(
        &mut self,
        item_id: &str,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> bool {
        self.edgeless_commit_inline_edit(window, cx);
        let Some(snapshot) = self.snapshot.clone() else {
            return false;
        };
        let Some(info) = self
            .edgeless
            .authoring
            .painted_items
            .iter()
            .find(|i| i.id == item_id)
            .cloned()
        else {
            return false;
        };
        match info.kind {
            SpatialItemKind::Note | SpatialItemKind::EdgelessText => {
                let is_note = info.kind == SpatialItemKind::Note;
                let first_text_id = find_block(&snapshot, item_id).and_then(|node| {
                    node.walk()
                        .find(|n| {
                            matches!(
                                n.content,
                                BlockContent::Paragraph { .. }
                                    | BlockContent::List { .. }
                                    | BlockContent::Code { .. }
                            )
                        })
                        .map(|n| n.id.clone())
                });
                self.edgeless.authoring.selection.clear();
                self.edgeless
                    .authoring
                    .selection
                    .insert(item_id.to_string());
                self.edgeless.authoring.inline_edit = Some(EdgelessInlineEdit::SpatialBlock {
                    block_id: item_id.to_string(),
                    is_note,
                });
                if let Some(tid) = first_text_id {
                    let pt = DocPoint::new(&tid, 0);
                    self.editor.selection = Some(DocumentSelection {
                        anchor: pt.clone(),
                        focus: pt,
                    });
                }
                self.editor_focus.focus(window, cx);
                window.notify_text_input_changed(&self.editor_focus);
                cx.notify();
                true
            }
            SpatialItemKind::Shape | SpatialItemKind::Connector | SpatialItemKind::SurfaceText => {
                let Some((surface_id, el)) = find_surface_element(&snapshot, item_id) else {
                    return false;
                };
                let (target, initial, multiline, edit_rect) = match &el.kind {
                    SurfaceElementKind::Shape(s) => (
                        LabelTarget::Shape {
                            surface_id: surface_id.to_string(),
                            id: el.id.clone(),
                        },
                        s.text.plain.clone(),
                        true,
                        info.rect,
                    ),
                    SurfaceElementKind::Connector(c) => {
                        let p = connector_label_anchor_point(
                            &info.polyline,
                            info.rect.center(),
                            c.mode,
                            c.label_offset.distance,
                        );
                        (
                            LabelTarget::Connector {
                                surface_id: surface_id.to_string(),
                                id: el.id.clone(),
                            },
                            c.text.plain.clone(),
                            false,
                            WorldRect::new(p.0 as f32 - 80.0, p.1 as f32 - 18.0, 160.0, 36.0),
                        )
                    }
                    SurfaceElementKind::Text(t) => (
                        LabelTarget::SurfaceText {
                            surface_id: surface_id.to_string(),
                            id: el.id.clone(),
                        },
                        t.text.plain.clone(),
                        true,
                        info.rect,
                    ),
                    _ => return false,
                };
                let len = utf16_len(&initial);
                self.edgeless.authoring.selection.clear();
                self.edgeless
                    .authoring
                    .selection
                    .insert(item_id.to_string());
                self.edgeless.authoring.inline_edit =
                    Some(EdgelessInlineEdit::Label(EdgelessLabelEditor::new(
                        target,
                        initial,
                        edit_rect,
                        info.rotate_deg,
                        multiline,
                    )));
                if let Ok(page) = self.page_mut() {
                    let _ = page.stop_capturing();
                }
                self.edgeless_update_label_anchors(len..len);
                self.editor_focus.focus(window, cx);
                window.notify_text_input_changed(&self.editor_focus);
                cx.notify();
                true
            }
            SpatialItemKind::Frame => {
                let initial = find_block(&snapshot, item_id)
                    .and_then(|n| match &n.content {
                        BlockContent::Frame { title, .. } => Some(title.plain.clone()),
                        _ => None,
                    })
                    .unwrap_or_default();
                let len = utf16_len(&initial);
                let rect = info.title_pill_rect.unwrap_or_else(|| {
                    WorldRect::new(info.rect.x, info.rect.y - 28.0, 140.0, 24.0)
                });
                self.edgeless.authoring.selection.clear();
                self.edgeless
                    .authoring
                    .selection
                    .insert(item_id.to_string());
                self.edgeless.authoring.inline_edit =
                    Some(EdgelessInlineEdit::Label(EdgelessLabelEditor::new(
                        LabelTarget::FrameTitle {
                            id: item_id.to_string(),
                        },
                        initial,
                        rect,
                        0.0,
                        false,
                    )));
                if let Ok(page) = self.page_mut() {
                    let _ = page.stop_capturing();
                }
                self.edgeless_update_label_anchors(len..len);
                self.editor_focus.focus(window, cx);
                window.notify_text_input_changed(&self.editor_focus);
                cx.notify();
                true
            }
            _ => false,
        }
    }

    pub(crate) fn edgeless_label_input<R>(
        &mut self,
        window: &mut Window,
        cx: &mut Context<Self>,
        f: impl FnOnce(&mut EdgelessLabelEditor) -> R,
    ) -> Option<R> {
        let (out, sel) = {
            let ed = self.edgeless.authoring.label_editor_mut()?;
            let out = f(ed);
            (out, ed.selection.clone())
        };
        self.edgeless_update_label_anchors(sel);
        window.notify_text_input_changed(&self.editor_focus);
        cx.notify();
        Some(out)
    }

    pub(crate) fn edgeless_label_screen_bounds(&self) -> Option<Bounds<Pixels>> {
        let ed = self.edgeless.authoring.label_editor()?;
        let vp_origin = point(px(0.0), px(TOPBAR_HEIGHT));
        let vp_w = self.window_size.0.max(1.0);
        let vp_h = (self.window_size.1 - TOPBAR_HEIGHT).max(1.0);
        let cam = self.edgeless.camera;
        let tl = cam.world_to_screen(point(px(ed.world_rect.x), px(ed.world_rect.y)), vp_origin);
        let br = cam.world_to_screen(
            point(px(ed.world_rect.right()), px(ed.world_rect.bottom())),
            vp_origin,
        );
        let w = (f32::from(br.x) - f32::from(tl.x))
            .max(120.0)
            .min(vp_w - 16.0);
        let h = (f32::from(br.y) - f32::from(tl.y))
            .max(32.0)
            .min(vp_h - 16.0);
        let x = f32::from(tl.x).clamp(8.0, (vp_w - w - 8.0).max(8.0));
        let y =
            (f32::from(tl.y) - TOPBAR_HEIGHT).clamp(8.0, (vp_h - h - 8.0).max(8.0)) + TOPBAR_HEIGHT;
        Some(Bounds::new(point(px(x), px(y)), size(px(w), px(h))))
    }

    /// Map a local caret `FlowRect` inside an actively edited Edgeless Note or EdgelessText
    /// to screen-space `Bounds<Pixels>` for macOS IME candidates & Web `ImeMirror`.
    pub(crate) fn edgeless_spatial_block_caret_bounds(
        &self,
        block_id: &str,
        offset: u64,
    ) -> Option<Bounds<Pixels>> {
        let (editing_id, is_note) = self.edgeless.authoring.editing_spatial_block()?;
        let info = self
            .edgeless
            .authoring
            .painted_items
            .iter()
            .find(|i| i.id == editing_id)?;
        let caret = self
            .edgeless
            .cached_block_layout(editing_id, is_note)?
            .block(block_id)?
            .caret_rect(DocPoint::new(block_id, offset).caret)?;
        let pad = if is_note { NOTE_CARD_PADDING } else { 0.0 };
        let (cx_w, cy_w) = info.rect.center();
        let (rx, ry) = rotate_point_around(
            info.rect.x + (pad + caret.x) * info.scale,
            info.rect.y + (pad + caret.y) * info.scale,
            cx_w,
            cy_w,
            info.rotate_deg,
        );
        let tl = self
            .edgeless
            .camera
            .world_to_screen(point(px(rx), px(ry)), point(px(0.0), px(TOPBAR_HEIGHT)));
        let z = self.edgeless.camera.zoom;
        Some(Bounds::new(
            tl,
            size(
                px((caret.w * info.scale * z).max(2.0)),
                px((caret.h * info.scale * z).max(16.0)),
            ),
        ))
    }
}
