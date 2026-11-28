//! Document-level selection geometry, cross-block handle drag, authoritative
//! selection actions, and multi-MIME clipboard helpers for `AndroidEditorRuntime`.

use crate::editor_runtime::AndroidEditorRuntime;

impl AndroidEditorRuntime {
    pub(crate) fn set_page_readonly(&mut self, readonly: bool) {
        let _ = self.app.update(|cx| {
            let _ = self
                .view
                .update(cx, |v, _, cx| v.set_page_readonly(readonly, cx));
        });
        self.window.request_frame_now();
    }

    pub(crate) fn document_selection_geometry(&mut self) -> playground::DocumentSelectionGeometry {
        self.app
            .update(|cx| {
                self.view
                    .update(cx, |v, w, _| v.document_selection_geometry(w))
            })
            .unwrap_or_default()
    }

    /// Packs document-level selection geometry into a 24-float buffer (dp coordinates)
    /// for zero-allocation per-frame JNI queries from `MainActivity` and `AndroidSelectionOverlayView`.
    pub(crate) fn pack_document_selection_floats(&mut self) -> [f32; 24] {
        let g = self.document_selection_geometry();
        [
            if g.has_selection { 1.0 } else { 0.0 },
            if g.is_collapsed { 1.0 } else { 0.0 },
            if g.is_reversed { 1.0 } else { 0.0 },
            if g.start_visible { 1.0 } else { 0.0 },
            g.start_caret.x,
            g.start_caret.y,
            g.start_caret.height,
            if g.start_caret.is_rtl { 1.0 } else { 0.0 },
            if g.end_visible { 1.0 } else { 0.0 },
            g.end_caret.x,
            g.end_caret.y,
            g.end_caret.height,
            if g.end_caret.is_rtl { 1.0 } else { 0.0 },
            if g.menu_anchor_visible { 1.0 } else { 0.0 },
            g.menu_anchor_rect.x,
            g.menu_anchor_rect.y,
            g.menu_anchor_rect.width,
            g.menu_anchor_rect.height,
            g.action_mask as f32,
            if g.menu_suppressed_for_motion {
                1.0
            } else {
                0.0
            },
            g.visible_top,
            g.visible_bottom,
            g.selection_rects.len() as f32,
            0.0,
        ]
    }

    pub(crate) fn selection_menu_request_seq(&self) -> u64 {
        self.app
            .update(|cx| {
                self.view
                    .read_with(cx, |v, _| v.selection_menu_request_seq())
            })
            .unwrap_or(0)
    }

    pub(crate) fn begin_document_selection_drag(&mut self, handle: u8) -> bool {
        self.app
            .update(|cx| {
                self.view
                    .update(cx, |v, w, _| v.begin_document_selection_drag(handle, w))
            })
            .unwrap_or(false)
    }

    pub(crate) fn update_document_selection_drag(&mut self, x_dp: f32, y_dp: f32) -> bool {
        let ok = self
            .app
            .update(|cx| {
                self.view.update(cx, |v, w, cx| {
                    v.update_document_selection_drag(x_dp, y_dp, w, cx)
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
            let _ = self
                .view
                .update(cx, |v, w, cx| v.end_document_selection_drag(w, cx));
        });
        self.window.request_frame_now();
    }

    pub(crate) fn cancel_document_selection_drag(&mut self) {
        let _ = self.app.update(|cx| {
            let _ = self
                .view
                .update(cx, |v, _, _| v.cancel_document_selection_drag());
        });
        self.window.request_frame_now();
    }

    pub(crate) fn selection_copy(&mut self) {
        let _ = self.app.update(|cx| {
            let _ = self.view.update(cx, |v, w, cx| v.selection_copy(w, cx));
        });
        self.window.request_frame_now();
    }

    pub(crate) fn selection_cut(&mut self) {
        let _ = self.app.update(|cx| {
            let _ = self.view.update(cx, |v, w, cx| v.selection_cut(w, cx));
        });
        self.window.request_frame_now();
    }

    pub(crate) fn selection_paste(
        &mut self,
        plain: Option<String>,
        html: Option<String>,
        markdown: Option<String>,
        snapshot: Option<String>,
    ) {
        self.platform
            .set_clipboard_from_host(plain, html, markdown, snapshot);
        let _ = self.app.update(|cx| {
            let _ = self.view.update(cx, |v, w, cx| v.selection_paste(w, cx));
        });
        self.window.request_frame_now();
    }

    pub(crate) fn selection_select_all(&mut self) {
        let _ = self.app.update(|cx| {
            let _ = self
                .view
                .update(cx, |v, w, cx| v.selection_select_all(w, cx));
        });
        self.window.request_frame_now();
    }

    pub(crate) fn take_pending_clipboard_json(&self) -> Option<String> {
        self.platform.take_pending_clipboard_json()
    }

    pub(crate) fn caret_rect_dp(&mut self) -> Option<[f32; 4]> {
        self.ensure_input_handler();
        let (_, end) = self.selection_range();
        let b = self
            .window
            .with_input_handler(|h| h.bounds_for_range(end..end))
            .flatten()?;
        Some([
            f32::from(b.origin.x),
            f32::from(b.origin.y),
            f32::from(b.size.width).max(2.0),
            f32::from(b.size.height).max(20.0),
        ])
    }
}
