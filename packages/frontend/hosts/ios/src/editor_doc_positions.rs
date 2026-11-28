//! Read-only full-document position, document-bounds, and cross-block stepping helpers
//! on [`IosEditorRuntime`].
//!
//! Bridges `PlaygroundView`'s multi-block `SelectionEndpointAnchor` queries to Swift
//! `UITextPosition` / `UITextRange` across the entire addressable document without
//! mutating editor selection on hit-tests or coordinate queries.

use playground::{SelectionEndpointAnchor, editor_session::DocPoint};

use super::{editor_runtime::IosEditorRuntime, selection::AffineRect};

/// C-ABI document-level text position (`block_order`, `utf16_offset`, `endpoint_token`).
#[repr(C)]
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct AffineDocPosition {
    pub valid: bool,
    pub block_order: i32,
    pub utf16_offset: u32,
    pub endpoint_token: u64,
}

impl IosEditorRuntime {
    pub(crate) fn focused_block_order(&mut self) -> i32 {
        let view = self.view;
        self.app
            .update(|cx| view.read_with(cx, |v, _| v.focused_selection_block_order()))
            .unwrap_or(0)
    }

    /// Full-document addressable bounds `(beginningOfDocument, endOfDocument)` spanning all
    /// editable blocks in layout order (never truncated to the currently focused block).
    pub(crate) fn doc_document_bounds(&mut self) -> Option<(AffineDocPosition, AffineDocPosition)> {
        let view = self.view;
        let bounds = self
            .app
            .update(|cx| {
                view.read_with(cx, |v, _| {
                    let layout = v.flow_layout()?;
                    let mut first: Option<(i32, SelectionEndpointAnchor, u32)> = None;
                    let mut last: Option<(i32, SelectionEndpointAnchor, u32)> = None;
                    for (idx, block) in layout.blocks.iter().enumerate() {
                        if !block.editable() {
                            continue;
                        }
                        if first.is_none() {
                            first = Some((
                                idx as i32,
                                SelectionEndpointAnchor::Doc(DocPoint::new(&block.block_id, 0)),
                                0,
                            ));
                        }
                        let u16_len = block.body.plain.encode_utf16().count() as u32;
                        last = Some((
                            idx as i32,
                            SelectionEndpointAnchor::Doc(DocPoint::new(
                                &block.block_id,
                                u64::from(u16_len),
                            )),
                            u16_len,
                        ));
                    }
                    Some((first?, last?))
                })
            })
            .ok()
            .flatten()?;
        let ((s_ord, s_ep, s_off), (e_ord, e_ep, e_off)) = bounds;
        let s_tok = self.intern_endpoint_token(s_ep);
        let e_tok = self.intern_endpoint_token(e_ep);
        Some((
            AffineDocPosition {
                valid: true,
                block_order: s_ord,
                utf16_offset: s_off,
                endpoint_token: s_tok,
            },
            AffineDocPosition {
                valid: true,
                block_order: e_ord,
                utf16_offset: e_off,
                endpoint_token: e_tok,
            },
        ))
    }

    pub(crate) fn current_selection_doc_positions(
        &mut self,
    ) -> Option<(AffineDocPosition, AffineDocPosition)> {
        let view = self.view;
        let pair = self
            .app
            .update(|cx| view.read_with(cx, |v, _| v.current_selection_doc_endpoints()))
            .ok()
            .flatten()?;
        let ((s_ep, s_ord, s_off), (e_ep, e_ord, e_off)) = pair;
        let s_tok = self.intern_endpoint_token(s_ep);
        let e_tok = self.intern_endpoint_token(e_ep);
        Some((
            AffineDocPosition {
                valid: true,
                block_order: s_ord,
                utf16_offset: s_off,
                endpoint_token: s_tok,
            },
            AffineDocPosition {
                valid: true,
                block_order: e_ord,
                utf16_offset: e_off,
                endpoint_token: e_tok,
            },
        ))
    }

    /// Pure read-only viewport hit-test: resolves `(block_order, utf16_offset, endpoint_token)`
    /// without changing `editor.selection` or focused block state.
    pub(crate) fn doc_hit_position(&mut self, x: f32, y: f32) -> Option<AffineDocPosition> {
        let view = self.view;
        let (ep, ord, off) = self
            .app
            .update(|cx| view.update(cx, |v, w, _| v.hit_test_doc_position(x, y, w)))
            .ok()
            .flatten()?;
        let tok = self.intern_endpoint_token(ep);
        Some(AffineDocPosition {
            valid: true,
            block_order: ord,
            utf16_offset: off,
            endpoint_token: tok,
        })
    }

    pub(crate) fn doc_caret_rect_for_token(&mut self, token: u64) -> Option<AffineRect> {
        let anchor = self.lookup_endpoint_token(token)?;
        let view = self.view;
        let geom = self
            .app
            .update(|cx| view.update(cx, |v, w, _| v.caret_rect_for_anchor(&anchor, w)))
            .ok()
            .flatten()?;
        Some(AffineRect {
            x: geom.x,
            y: geom.y,
            width: geom.width.max(2.0),
            height: geom.height.max(18.0),
        })
    }

    pub(crate) fn doc_selection_rects_between_tokens(
        &mut self,
        start_token: u64,
        end_token: u64,
    ) -> Vec<playground::SelectionRectGeometry> {
        let (Some(a), Some(b)) = (
            self.lookup_endpoint_token(start_token),
            self.lookup_endpoint_token(end_token),
        ) else {
            return Vec::new();
        };
        let view = self.view;
        self.app
            .update(|cx| view.update(cx, |v, w, _| v.selection_rects_between_anchors(a, b, w)))
            .unwrap_or_default()
    }

    /// Step `delta` UTF-16 units from `token`, seamlessly crossing editable block boundaries
    /// (`+1` per newline separator, matching `offset_between_anchors`).
    pub(crate) fn doc_step_position(
        &mut self,
        token: u64,
        delta: isize,
    ) -> Option<AffineDocPosition> {
        let anchor = self.lookup_endpoint_token(token)?;
        let view = self.view;
        if let Some((next_ep, ord, off)) = self
            .app
            .update(|cx| view.read_with(cx, |v, _| v.step_anchor_utf16(&anchor, delta)))
            .ok()
            .flatten()
        {
            let next_tok = self.intern_endpoint_token(next_ep);
            return Some(AffineDocPosition {
                valid: true,
                block_order: ord,
                utf16_offset: off,
                endpoint_token: next_tok,
            });
        }
        // Cross-block step for `SelectionEndpointAnchor::Doc`: resolve cumulative UTF-16 offset
        // across editable blocks (`+1` newline separator between editable blocks).
        let SelectionEndpointAnchor::Doc(pt) = anchor else {
            return None;
        };
        let cross = self
            .app
            .update(|cx| {
                view.read_with(cx, |v, _| {
                    let layout = v.flow_layout()?;
                    let mut editable_spans: Vec<(i32, &str, isize, isize)> = Vec::new();
                    let mut acc: isize = 0;
                    let mut current_cum: Option<isize> = None;
                    for (idx, block) in layout.blocks.iter().enumerate() {
                        if !block.editable() {
                            continue;
                        }
                        let len = block.body.plain.encode_utf16().count() as isize;
                        if block.block_id == pt.block_id {
                            let local = (pt.offset() as isize).clamp(0, len);
                            current_cum = Some(acc + local);
                        }
                        editable_spans.push((idx as i32, block.block_id.as_str(), acc, len));
                        acc += len + 1;
                    }
                    let total_max = acc.saturating_sub(1).max(0);
                    let target = current_cum?.checked_add(delta)?;
                    if target < 0 || target > total_max {
                        return None;
                    }
                    for (i, &(ord, block_id, start, len)) in editable_spans.iter().enumerate() {
                        let end = start + len;
                        if target <= end {
                            let local = (target - start).clamp(0, len) as u32;
                            return Some((
                                SelectionEndpointAnchor::Doc(DocPoint::new(
                                    block_id,
                                    u64::from(local),
                                )),
                                ord,
                                local,
                            ));
                        }
                        // Target landed on the virtual `\n` separator between block `i` and `i+1`.
                        if target == end + 1 && i + 1 < editable_spans.len() {
                            let (next_ord, next_id, _, _) = editable_spans[i + 1];
                            return Some((
                                SelectionEndpointAnchor::Doc(DocPoint::new(next_id, 0)),
                                next_ord,
                                0,
                            ));
                        }
                    }
                    None
                })
            })
            .ok()
            .flatten()?;
        let (next_ep, ord, off) = cross;
        let next_tok = self.intern_endpoint_token(next_ep);
        Some(AffineDocPosition {
            valid: true,
            block_order: ord,
            utf16_offset: off,
            endpoint_token: next_tok,
        })
    }

    pub(crate) fn doc_word_range(
        &mut self,
        token: u64,
    ) -> Option<(AffineDocPosition, AffineDocPosition)> {
        let anchor = self.lookup_endpoint_token(token)?;
        let view = self.view;
        let ((s_ep, s_ord, s_off), (e_ep, e_ord, e_off)) = self
            .app
            .update(|cx| view.read_with(cx, |v, _| v.word_anchors_at(&anchor)))
            .ok()
            .flatten()?;
        let s_tok = self.intern_endpoint_token(s_ep);
        let e_tok = self.intern_endpoint_token(e_ep);
        Some((
            AffineDocPosition {
                valid: true,
                block_order: s_ord,
                utf16_offset: s_off,
                endpoint_token: s_tok,
            },
            AffineDocPosition {
                valid: true,
                block_order: e_ord,
                utf16_offset: e_off,
                endpoint_token: e_tok,
            },
        ))
    }

    pub(crate) fn doc_offset_between_tokens(&mut self, from_token: u64, to_token: u64) -> i32 {
        let (Some(a), Some(b)) = (
            self.lookup_endpoint_token(from_token),
            self.lookup_endpoint_token(to_token),
        ) else {
            return 0;
        };
        let view = self.view;
        self.app
            .update(|cx| view.read_with(cx, |v, _| v.offset_between_anchors(&a, &b)))
            .unwrap_or(0)
    }

    pub(crate) fn doc_text_between_tokens(&mut self, start_token: u64, end_token: u64) -> String {
        let (Some(a), Some(b)) = (
            self.lookup_endpoint_token(start_token),
            self.lookup_endpoint_token(end_token),
        ) else {
            return String::new();
        };
        let view = self.view;
        self.app
            .update(|cx| view.read_with(cx, |v, _| v.plain_text_between_anchors(&a, &b)))
            .unwrap_or_default()
    }

    pub(crate) fn document_selection_geometry(&mut self) -> playground::DocumentSelectionGeometry {
        self.app
            .update(|cx| {
                self.view.update(cx, |view, window, _| {
                    view.document_selection_geometry(window)
                })
            })
            .unwrap_or_default()
    }

    pub(crate) fn begin_document_selection_drag(&mut self, handle: u8) -> bool {
        self.app
            .update(|cx| {
                self.view.update(cx, |view, window, _| {
                    view.begin_document_selection_drag(handle, window)
                })
            })
            .unwrap_or(false)
    }

    pub(crate) fn update_document_selection_drag(&mut self, x: f32, y: f32) -> bool {
        let ok = self
            .app
            .update(|cx| {
                self.view.update(cx, |view, window, cx| {
                    view.update_document_selection_drag(x, y, window, cx)
                })
            })
            .unwrap_or(false);
        if ok {
            self.window.request_frame_now();
        }
        ok
    }

    pub(crate) fn end_document_selection_drag(&mut self) {
        let _ = self.app.update(|cx| {
            let _ = self.view.update(cx, |view, window, cx| {
                view.end_document_selection_drag(window, cx)
            });
        });
        self.window.request_frame_now();
    }

    pub(crate) fn intern_endpoint_token(
        &mut self,
        endpoint: playground::SelectionEndpointAnchor,
    ) -> u64 {
        if let Some((tok, _)) = self
            .endpoint_tokens
            .iter()
            .find(|(_, existing)| *existing == endpoint)
        {
            return *tok;
        }
        let tok = self.next_endpoint_token;
        self.next_endpoint_token = self.next_endpoint_token.wrapping_add(1).max(1);
        if self.endpoint_tokens.len() >= 4096 {
            let active = self
                .app
                .update(|cx| {
                    self.view
                        .read_with(cx, |v, _| v.ordered_selection_endpoints())
                })
                .ok()
                .flatten();
            if let Some(evict_idx) = self
                .endpoint_tokens
                .iter()
                .position(|(_, ep)| active.as_ref().is_none_or(|(s, e)| ep != s && ep != e))
            {
                self.endpoint_tokens.remove(evict_idx);
            } else {
                self.endpoint_tokens.remove(0);
            }
        }
        self.endpoint_tokens.push((tok, endpoint));
        tok
    }

    pub(crate) fn current_selection_endpoint_tokens(&mut self) -> (u64, u64) {
        let pair = self
            .app
            .update(|cx| {
                self.view
                    .read_with(cx, |view, _| view.ordered_selection_endpoints())
            })
            .ok()
            .flatten();
        let Some((start_ep, end_ep)) = pair else {
            return (0, 0);
        };
        let s = self.intern_endpoint_token(start_ep);
        let e = self.intern_endpoint_token(end_ep);
        (s, e)
    }

    pub(crate) fn lookup_endpoint_token(
        &self,
        token: u64,
    ) -> Option<playground::SelectionEndpointAnchor> {
        self.endpoint_tokens
            .iter()
            .find(|(t, _)| *t == token)
            .map(|(_, ep)| ep.clone())
    }

    pub(crate) fn select_from_endpoint_token(
        &mut self,
        fixed_token: u64,
        fx: f32,
        fy: f32,
    ) -> bool {
        let Some(fixed) = self.lookup_endpoint_token(fixed_token) else {
            return false;
        };
        let ok = self
            .app
            .update(|cx| {
                self.view.update(cx, |view, window, cx| {
                    view.select_from_anchor_to_viewport_point(fixed, fx, fy, window, cx)
                })
            })
            .unwrap_or(false);
        if ok {
            self.window.request_frame_now();
        }
        ok
    }

    pub(crate) fn select_between_viewport_points(
        &mut self,
        ax: f32,
        ay: f32,
        fx: f32,
        fy: f32,
    ) -> bool {
        let ok = self
            .app
            .update(|cx| {
                self.view.update(cx, |view, window, cx| {
                    view.select_between_viewport_points(ax, ay, fx, fy, window, cx)
                })
            })
            .unwrap_or(false);
        if ok {
            self.window.request_frame_now();
        }
        ok
    }

    pub(crate) fn select_between_endpoint_tokens(
        &mut self,
        start_token: u64,
        end_token: u64,
    ) -> bool {
        let (Some(start), Some(end)) = (
            self.lookup_endpoint_token(start_token),
            self.lookup_endpoint_token(end_token),
        ) else {
            return false;
        };
        let ok = self
            .app
            .update(|cx| {
                self.view.update(cx, |view, window, cx| {
                    view.select_between_anchors(start, end, window, cx)
                })
            })
            .unwrap_or(false);
        if ok {
            self.window.request_frame_now();
        }
        ok
    }

    pub(crate) fn selection_copy(&mut self) {
        let _ = self.app.update(|cx| {
            let _ = self
                .view
                .update(cx, |view, window, cx| view.selection_copy(window, cx));
        });
        self.window.request_frame_now();
    }

    pub(crate) fn selection_cut(&mut self) {
        let _ = self.app.update(|cx| {
            let _ = self
                .view
                .update(cx, |view, window, cx| view.selection_cut(window, cx));
        });
        self.window.request_frame_now();
    }

    pub(crate) fn selection_paste(&mut self) {
        let _ = self.app.update(|cx| {
            let _ = self
                .view
                .update(cx, |view, window, cx| view.selection_paste(window, cx));
        });
        self.window.request_frame_now();
    }

    pub(crate) fn selection_select_all(&mut self) {
        let _ = self.app.update(|cx| {
            let _ = self
                .view
                .update(cx, |view, window, cx| view.selection_select_all(window, cx));
        });
        self.window.request_frame_now();
    }
}

#[cfg(test)]
mod tests {
    use playground::FormFactor;

    use crate::{
        AffineUtf16Range, AffineWindowInsets, editor_runtime::IosEditorRuntime,
        selection::AffinePoint,
    };

    #[test]
    fn full_document_bounds_cross_block_step_and_transient_kb_inset_do_not_lock() {
        let mut rt =
            IosEditorRuntime::new(390.0, 844.0, 3.0, FormFactor::Phone, false).expect("runtime");
        let p1: Vec<u16> = "甲乙丙丁🚀".encode_utf16().collect();
        rt.insert_text(&p1);
        let nl: Vec<u16> = "\n".encode_utf16().collect();
        let p2: Vec<u16> = "Second paragraph".encode_utf16().collect();
        rt.insert_text(&nl);
        rt.insert_text(&p2);
        let _ = rt.render_frame(1.0);

        // Full-document bounds must span from block 0 offset 0 to last editable block's end,
        // even when a different block is focused.
        let (doc_start, doc_end) = rt.doc_document_bounds().expect("doc bounds");
        assert!(doc_start.valid && doc_end.valid);
        assert!(
            doc_end.block_order > doc_start.block_order,
            "endOfDocument must reach the last editable block, not just focused block"
        );
        let total_len =
            rt.doc_offset_between_tokens(doc_start.endpoint_token, doc_end.endpoint_token);
        assert!(total_len >= (p1.len() + 1 + p2.len()) as i32);

        // Stepping from doc_start across the first block boundary lands cleanly in the next block.
        let stepped = rt
            .doc_step_position(doc_start.endpoint_token, (total_len - 1).max(1) as isize)
            .expect("cross-block step");
        assert!(stepped.block_order > doc_start.block_order);

        // Transient keyboard inset 300 -> 0 must not self-lock wants_software_keyboard().
        assert!(rt.wants_software_keyboard());
        rt.set_insets(AffineWindowInsets {
            safe_top: 59.0,
            safe_right: 0.0,
            safe_bottom: 34.0,
            safe_left: 0.0,
            ime_bottom: 300.0,
        });
        assert!(rt.wants_software_keyboard());
        rt.set_insets(AffineWindowInsets {
            safe_top: 59.0,
            safe_right: 0.0,
            safe_bottom: 34.0,
            safe_left: 0.0,
            ime_bottom: 0.0,
        });
        assert!(
            rt.wants_software_keyboard(),
            "transient ime_bottom -> 0 must never self-lock software keyboard"
        );

        // Read-only hit-test in an unfocused block must never mutate focused block.
        let focused_before = rt.focused_block_order();
        let c0 = rt.caret_rect(0).expect("caret");
        let _ = rt.closest_offset(AffinePoint {
            x: c0.x,
            y: c0.y + c0.height * 0.5,
        });
        assert_eq!(rt.focused_block_order(), focused_before);
        let _ = AffineUtf16Range {
            location: 0,
            length: 0,
        };
    }
}
