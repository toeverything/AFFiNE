//! Double-click inline rich-text & IME editing for Edgeless shapes, connectors, text, frames, and notes.

use blocksuite_playground_doc::{
    read::{BlockContent, SurfaceElementKind},
    session::PageDocSession,
};
use ui::{Bounds, Context, Pixels, Window, point, px, size};
use y_octo::{Any, SessionValue};

use crate::{
    PlaygroundView,
    editor_session::{DocPoint, DocumentSelection},
};

use super::{
    EdgelessInlineEdit, EdgelessLabelEditor, LabelSplice, LabelTarget, NOTE_CARD_PADDING,
    SpatialItemKind, WorldRect,
    connector_edit::{connector_label_anchor_point, measure_connector_label_xywh},
    find_block, find_surface_element, layout_label_editor_paragraph, rotate_point_around,
};

impl PlaygroundView {
    /// Apply a live UTF-16 splice on the active inline label editor directly into `PageDocSession`,
    /// auto-grow Shape height when multiline text overflows (`AUTO_HEIGHT`), and update CRDT anchors.
    pub(crate) fn edgeless_label_edit(
        &mut self,
        window: &mut Window,
        cx: &mut Context<Self>,
        f: impl FnOnce(&mut EdgelessLabelEditor) -> Option<LabelSplice>,
    ) -> Option<()> {
        let (target, splice) = {
            let ed = self.edgeless.authoring.label_editor_mut()?;
            let splice = f(ed);
            (ed.target.clone(), splice)
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
            self.edgeless_sync_shape_auto_height(window, cx);
        }
        self.edgeless_update_label_anchors();
        window.notify_text_input_changed(&self.editor_focus);
        cx.notify();
        Some(())
    }

    /// Grow (or shrink back down to `min_world_height`) an actively edited Shape's `xywh` height
    /// to fit its wrapped multiline label, matching Web `edgeless-shape-text-editor.ts` `AUTO_HEIGHT`.
    pub(crate) fn edgeless_sync_shape_auto_height(
        &mut self,
        window: &Window,
        cx: &mut Context<Self>,
    ) {
        let Some((surface_id, id, new_rect)) =
            self.edgeless.authoring.label_editor().and_then(|ed| {
                let LabelTarget::Shape { surface_id, id } = &ed.target else {
                    return None;
                };
                let laid =
                    layout_label_editor_paragraph(ed, ed.world_rect.w, 1.0, self.theme, window)?;
                let pad_y = ed.shape_style.as_ref().map_or(10.0, |st| st.padding[0]);
                let needed_h = (f32::from(laid.size().height) + 2.0 * pad_y)
                    .ceil()
                    .max(ed.min_world_height);
                if (needed_h - ed.world_rect.h).abs() < 1.0 {
                    return None;
                }
                let mut r = ed.world_rect;
                r.h = needed_h;
                Some((surface_id.clone(), id.clone(), r))
            })
        else {
            return;
        };
        if let Some(ed) = self.edgeless.authoring.label_editor_mut() {
            ed.world_rect = new_rect;
        }
        let now_ms = self.now_ms(cx) as u64;
        let xywh = PageDocSession::format_xywh([
            new_rect.x as f64,
            new_rect.y as f64,
            new_rect.w as f64,
            new_rect.h as f64,
        ]);
        let commit = self.page_mut().ok().and_then(|page| {
            page.set_surface_element_field(
                &surface_id,
                &id,
                "xywh",
                SessionValue::Any(Any::String(xywh)),
                now_ms,
            )
            .ok()
            .flatten()
        });
        if let Some(commit) = commit {
            self.did_edgeless_doc_commit(commit, cx);
        }
    }

    pub(crate) fn edgeless_update_label_anchors(&mut self) {
        let Some(target) = self
            .edgeless
            .authoring
            .label_editor()
            .map(|ed| ed.target.clone())
        else {
            return;
        };
        let mut anchored = match self.edgeless.authoring.label_editor() {
            Some(ed) => ed.anchored.clone(),
            None => return,
        };
        match self.page() {
            Some(page) => anchored.update_anchors(|off| target.encode_pos(page, off)),
            None => {
                anchored.anchors = None;
                anchored.preedit_anchors = None;
            }
        }
        if let Some(ed) = self.edgeless.authoring.label_editor_mut() {
            ed.anchored.anchors = anchored.anchors;
            ed.anchored.preedit_anchors = anchored.preedit_anchors;
        }
    }

    /// Refresh an open `EdgelessLabelEditor` from the latest snapshot after a remote update,
    /// resolving its `RelativePosition` selection and preedit anchors so the local caret and
    /// active composition track remote insertions.
    pub(crate) fn edgeless_refresh_label_editor_from_snapshot(&mut self) {
        let Some(target) = self
            .edgeless
            .authoring
            .label_editor()
            .map(|ed| ed.target.clone())
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
            self.finish_inline_targets(
                crate::overlays::InlineTargetEnd::DiscardPreedit,
                None,
                None,
            );
            return;
        };
        let mut anchored = match self.edgeless.authoring.label_editor() {
            Some(ed) => ed.anchored.clone(),
            None => return,
        };
        anchored.reconcile_from_text(latest_text, |pos| {
            self.page().and_then(|page| target.resolve_pos(page, pos))
        });
        if let Some(ed) = self.edgeless.authoring.label_editor_mut() {
            ed.anchored = anchored;
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

        if ed.created_new_text && ed.input.text.trim().is_empty() {
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
            let trimmed = ed.input.text.trim();
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
        let Some(EdgelessInlineEdit::SpatialBlock {
            block_id,
            is_note,
            created_new,
        }) = self.edgeless.authoring.inline_edit.take()
        else {
            return;
        };
        self.commit_active_preedit(window, cx);
        if created_new
            && !is_note
            && let Some(snap) = self.snapshot.as_deref()
            && let Some(node) = find_block(snap, &block_id)
            && node.children.len() == 1
            && node.children[0].children.is_empty()
            && matches!(
                &node.children[0].content,
                blocksuite_playground_doc::read::BlockContent::Paragraph { text, .. }
                    if text.plain.trim().is_empty()
            )
        {
            self.edgeless.authoring.selection.remove(&block_id);
            let now_ms = self.now_ms(cx) as u64;
            let commit = self.page_mut().ok().and_then(|page| {
                page.delete_blocks_and_elements_with_connectors(&[block_id.as_str()], &[], now_ms)
                    .ok()
                    .flatten()
            });
            if let Some(commit) = commit {
                self.did_edgeless_doc_commit(commit, cx);
            }
        }
        self.editor.selection = None;
        self.editor.slash_trigger = None;
        self.editor.linked_doc_trigger = None;
        let now_ms = self.now_ms(cx);
        self.overlays.close_slash(now_ms);
        self.overlays.close_linked_doc(now_ms);
        self.overlays.close_link_field();
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
        self.edgeless_begin_inline_edit_at(item_id, None, window, cx)
    }

    /// Open inline editing on an Edgeless item, placing the caret at `world_pos` when given.
    pub fn edgeless_begin_inline_edit_at(
        &mut self,
        item_id: &str,
        world_pos: Option<(f32, f32)>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> bool {
        if self.edgeless_readonly {
            return false;
        }
        self.edgeless_readonly_selection_target = None;
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
                let clicked_pt = world_pos.and_then(|(wx, wy)| {
                    let (cx_w, cy_w) = info.rect.center();
                    let (lx, ly) = rotate_point_around(wx, wy, cx_w, cy_w, -info.rotate_deg);
                    let pad = if is_note { NOTE_CARD_PADDING } else { 0.0 };
                    let flow_x = (lx - info.rect.x) / info.scale - pad;
                    let flow_y = (ly - info.rect.y) / info.scale - pad;
                    let layout = self.edgeless.cached_block_layout(item_id, is_note)?;
                    Self::hit_test_flow_layout(&layout, flow_x, flow_y)
                });
                let fallback_pt = || {
                    find_block(&snapshot, item_id).and_then(|node| {
                        node.walk()
                            .find(|n| {
                                matches!(
                                    n.content,
                                    BlockContent::Paragraph { .. }
                                        | BlockContent::List { .. }
                                        | BlockContent::Code { .. }
                                )
                            })
                            .map(|n| DocPoint::new(&n.id, 0))
                    })
                };
                self.edgeless.authoring.selection.clear();
                self.edgeless
                    .authoring
                    .selection
                    .insert(item_id.to_string());
                self.edgeless.authoring.inline_edit = Some(EdgelessInlineEdit::SpatialBlock {
                    block_id: item_id.to_string(),
                    is_note,
                    created_new: false,
                });
                if let Some(pt) = clicked_pt.or_else(fallback_pt) {
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
                let (target, initial, multiline, edit_rect, shape_style) = match &el.kind {
                    SurfaceElementKind::Shape(s) => (
                        LabelTarget::Shape {
                            surface_id: surface_id.to_string(),
                            id: el.id.clone(),
                        },
                        s.text.plain.clone(),
                        true,
                        info.rect,
                        Some(super::ShapeTextStyle {
                            font_family: s.font_family.clone(),
                            font_size: s.font_size as f32,
                            font_weight: s.font_weight.parse().unwrap_or(
                                if s.font_weight == "bold" {
                                    700.0
                                } else {
                                    400.0
                                },
                            ),
                            font_style: s.font_style.clone(),
                            color: s.color.clone(),
                            text_align: s.text_align,
                            vertical_align: s.text_vertical_align,
                            padding: [s.padding[0] as f32, s.padding[1] as f32],
                        }),
                    ),
                    SurfaceElementKind::Connector(c) => {
                        let edit_rect = if let Some([lx, ly, lw, lh]) = c.label_xywh
                            && lw > 0.0
                            && lh > 0.0
                        {
                            WorldRect::new(lx as f32, ly as f32, lw as f32, lh as f32)
                        } else {
                            let p = connector_label_anchor_point(
                                &info.polyline,
                                info.rect.center(),
                                c.mode,
                                c.label_offset.distance,
                            );
                            WorldRect::new(p.0 as f32 - 60.0, p.1 as f32 - 14.0, 120.0, 28.0)
                        };
                        let ls = &c.label_style;
                        (
                            LabelTarget::Connector {
                                surface_id: surface_id.to_string(),
                                id: el.id.clone(),
                            },
                            c.text.plain.clone(),
                            true,
                            edit_rect,
                            Some(super::ShapeTextStyle {
                                font_family: ls.font_family.clone(),
                                font_size: ls.font_size as f32,
                                font_weight: ls.font_weight.parse().unwrap_or(
                                    if ls.font_weight == "bold" {
                                        700.0
                                    } else {
                                        400.0
                                    },
                                ),
                                font_style: ls.font_style.clone(),
                                color: ls.color.clone(),
                                text_align: ls.text_align,
                                vertical_align:
                                    blocksuite_playground_doc::read::VerticalAlign::Center,
                                padding: [4.0, 8.0],
                            }),
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
                        Some(super::ShapeTextStyle {
                            font_family: t.font_family.clone(),
                            font_size: t.font_size as f32,
                            font_weight: t.font_weight.parse().unwrap_or(
                                if t.font_weight == "bold" {
                                    700.0
                                } else {
                                    400.0
                                },
                            ),
                            font_style: t.font_style.clone(),
                            color: t.color.clone(),
                            text_align: t.text_align,
                            vertical_align: blocksuite_playground_doc::read::VerticalAlign::Top,
                            padding: [0.0, 0.0],
                        }),
                    ),
                    _ => return false,
                };
                self.edgeless.authoring.selection.clear();
                self.edgeless
                    .authoring
                    .selection
                    .insert(item_id.to_string());
                let eff_rotate = if target.rotates_in_place() {
                    info.rotate_deg
                } else {
                    0.0
                };
                let mut label_ed =
                    EdgelessLabelEditor::new(target, initial, edit_rect, eff_rotate, multiline);
                if let Some(style) = shape_style {
                    label_ed = label_ed.with_shape_style(style);
                }
                self.edgeless.authoring.inline_edit = Some(EdgelessInlineEdit::Label(label_ed));
                if let Ok(page) = self.page_mut() {
                    let _ = page.stop_capturing();
                }
                self.edgeless_update_label_anchors();
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
                let rect = info.title_pill_rect.unwrap_or_else(|| {
                    WorldRect::new(info.rect.x, info.rect.y - 28.0, 140.0, 24.0)
                });
                self.edgeless.authoring.selection.clear();
                self.edgeless
                    .authoring
                    .selection
                    .insert(item_id.to_string());
                let mut frame_ed = EdgelessLabelEditor::new(
                    LabelTarget::FrameTitle {
                        id: item_id.to_string(),
                    },
                    initial,
                    rect,
                    0.0,
                    false,
                );
                frame_ed.select_all();
                self.edgeless.authoring.inline_edit = Some(EdgelessInlineEdit::Label(frame_ed));
                if let Ok(page) = self.page_mut() {
                    let _ = page.stop_capturing();
                }
                self.edgeless_update_label_anchors();
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
        let out = {
            let ed = self.edgeless.authoring.label_editor_mut()?;
            f(ed)
        };
        self.edgeless_update_label_anchors();
        window.notify_text_input_changed(&self.editor_focus);
        cx.notify();
        Some(out)
    }

    pub(crate) fn edgeless_label_layout_screen_bounds(
        &self,
        window: &Window,
    ) -> Option<Bounds<Pixels>> {
        let ed = self.edgeless.authoring.label_editor()?;
        let (vp_origin, canvas_size) = self.canvas_rect(window);
        let vp_w = f32::from(canvas_size.width).max(1.0);
        let vp_h = f32::from(canvas_size.height).max(1.0);
        let (_, _, _, _, lx, ly, lw, lh) = blocksuite_editor::edgeless::label_editor_screen_box(
            ed,
            self.edgeless.camera,
            vp_origin,
            vp_w,
            vp_h,
            self.theme,
            window,
        );
        Some(Bounds::new(
            point(
                px(lx + f32::from(vp_origin.x)),
                px(ly + f32::from(vp_origin.y)),
            ),
            size(px(lw.max(0.5)), px(lh.max(0.5))),
        ))
    }

    pub(crate) fn edgeless_label_screen_bounds(&self, window: &Window) -> Option<Bounds<Pixels>> {
        let ed = self.edgeless.authoring.label_editor()?;
        let (vp_origin, canvas_size) = self.canvas_rect(window);
        let vp_w = f32::from(canvas_size.width).max(1.0);
        let vp_h = f32::from(canvas_size.height).max(1.0);
        let (x, y, w, h, _, _, _, _) = blocksuite_editor::edgeless::label_editor_screen_box(
            ed,
            self.edgeless.camera,
            vp_origin,
            vp_w,
            vp_h,
            self.theme,
            window,
        );
        Some(Bounds::new(
            point(
                px(x + f32::from(vp_origin.x)),
                px(y + f32::from(vp_origin.y)),
            ),
            size(px(w.max(1.0)), px(h.max(1.0))),
        ))
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
        let (vp_origin, _) = self.canvas_rect_cached();
        let tl = self
            .edgeless
            .camera
            .world_to_screen(point(px(rx), px(ry)), vp_origin);
        let z = self.edgeless.camera.zoom;
        Some(Bounds::new(
            tl,
            size(
                px((caret.w * info.scale * z).max(2.0)),
                px((caret.h * info.scale * z).max(16.0)),
            ),
        ))
    }

    pub(crate) fn active_overlay_target(
        &self,
    ) -> Option<(
        std::rc::Rc<blocksuite_playground_doc::read::PageSnapshot>,
        std::rc::Rc<crate::block_flow::FlowLayout>,
        Option<crate::overlays::OverlayScreenTransform>,
    )> {
        let snapshot = self.snapshot.clone()?;
        match self.mode {
            crate::PlaygroundMode::Page => Some((snapshot, self.flow_layout()?, None)),
            crate::PlaygroundMode::Edgeless => {
                let (editing_id, is_note) = self.edgeless.authoring.editing_spatial_block()?;
                let layout = self.edgeless.cached_block_layout(editing_id, is_note)?;
                let info = self
                    .edgeless
                    .authoring
                    .painted_items
                    .iter()
                    .find(|i| i.id == editing_id)?;
                let pad = if is_note { NOTE_CARD_PADDING } else { 0.0 };
                let (topbar, _) = self.canvas_rect_cached();
                let origin_screen = self.edgeless.camera.world_to_screen(
                    point(
                        px(info.rect.x + pad * info.scale),
                        px(info.rect.y + pad * info.scale),
                    ),
                    topbar,
                );
                let (cx, cy) = info.rect.center();
                let pivot_screen = self
                    .edgeless
                    .camera
                    .world_to_screen(point(px(cx), px(cy)), topbar);
                Some((
                    snapshot,
                    layout,
                    Some(crate::overlays::OverlayScreenTransform {
                        origin: (f32::from(origin_screen.x), f32::from(origin_screen.y)),
                        pivot: (f32::from(pivot_screen.x), f32::from(pivot_screen.y)),
                        scale: info.scale * self.edgeless.camera.zoom,
                        rotate_deg: info.rotate_deg,
                    }),
                ))
            }
        }
    }
}
