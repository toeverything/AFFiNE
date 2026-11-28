use ui::{Context, Window};

#[cfg(target_arch = "wasm32")]
use crate::block_flow::EmbedCardState;
use crate::{
    PlaygroundView,
    block_flow::{FlowKind, FlowLayout},
};

use super::OverlayEvent;

impl PlaygroundView {
    pub(crate) fn sync_embeds_shielded(&mut self) {
        let embeds_shielded = self.doc_panel_tab.is_some()
            || self.overlays.slash_menu().is_some()
            || self.overlays.linked_doc_menu().is_some()
            || self.overlays.equation_editor().is_some()
            || self.overlays.bookmark_prompt().is_some()
            || self.overlays.context_menu().is_some()
            || self.overlays.active_text_field().is_some()
            || self.touch_selection_menu_open;
        if self.flow.embeds_shielded != embeds_shielded {
            self.flow.embeds_shielded = embeds_shielded;
            self.env_rev += 1;
            #[cfg(target_arch = "wasm32")]
            crate::wasm_preview::sync_embed_shield(embeds_shielded);
        }
    }

    /// Block id of the currently focused or selected code block, if any, so its
    /// floating toolbar stays visible while editing or inspecting it.
    pub(super) fn focused_code_block_id<'a>(&self, layout: &'a FlowLayout) -> Option<&'a str> {
        self.editor
            .selection
            .as_ref()
            .and_then(|sel| layout.block(&sel.focus.block_id))
            .filter(|b| matches!(b.body.kind, FlowKind::Code))
            .or_else(|| {
                self.editor
                    .block_selection
                    .iter()
                    .find_map(|id| layout.block(id))
                    .filter(|b| matches!(b.body.kind, FlowKind::Code))
            })
            .map(|b| b.block_id.as_str())
    }

    /// Handle code-block preview toggling and external embed block selection / URL open.
    /// Returns `true` when the event was consumed.
    pub(super) fn handle_embed_and_code_event(
        &mut self,
        event: &OverlayEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> bool {
        use blocksuite_playground_doc::read::{BlockContent, ExternalEmbedKind};

        match event {
            OverlayEvent::ToggleCodePreview(block_id) => {
                let supported = self
                    .snapshot
                    .as_ref()
                    .and_then(|s| s.block(block_id))
                    .and_then(|n| match &n.content {
                        BlockContent::Code { language, .. } => {
                            crate::block_flow::CodePreviewKind::from_language(language)
                        }
                        _ => None,
                    })
                    .is_some_and(crate::block_flow::code_preview_supported);
                if !supported {
                    return true;
                }
                let id = block_id.clone();
                if !self.flow.code_preview_blocks.remove(&id) {
                    self.flow.code_preview_blocks.insert(id);
                }
                self.env_rev += 1;
                cx.notify();
                true
            }
            OverlayEvent::ExternalEmbedInteract { block_id, activate } => {
                // Real block selection (aligns with Image / Bookmark blocks: clears text caret,
                // highlights block with the standard selection ring, and Backspace deletes it).
                self.finish_inline_targets(
                    super::InlineTargetEnd::CommitPreedit,
                    Some(window),
                    Some(cx),
                );
                self.editor.selection = None;
                self.editor.block_selection = vec![block_id.clone()];
                self.announce_selection(cx);
                window.notify_text_selection_changed(&self.editor_focus);

                if *activate
                    && let Some(node) = self.snapshot.as_ref().and_then(|s| s.block(block_id))
                    && let BlockContent::ExternalEmbed { kind, url, .. } = &node.content
                {
                    if *kind == ExternalEmbedKind::Html {
                        #[cfg(target_arch = "wasm32")]
                        {
                            let current = self
                                .flow
                                .embed_states
                                .get(block_id)
                                .copied()
                                .unwrap_or_default();
                            let next = if current == EmbedCardState::Active {
                                EmbedCardState::Idle
                            } else {
                                EmbedCardState::Active
                            };
                            self.flow.embed_states.insert(block_id.clone(), next);
                            self.env_rev += 1;
                        }
                    } else {
                        let trimmed = url.trim();
                        if trimmed.starts_with("https://") || trimmed.starts_with("http://") {
                            self.last_opened_link_url = Some(trimmed.to_string());
                            cx.open_url(trimmed);
                        }
                    }
                }
                cx.notify();
                true
            }
            _ => false,
        }
    }

    /// Reconcile every active HTML code preview and active `ExternalEmbedKind::Html` iframe
    /// against `#embed-layer` on every frame (keeps coordinates synced on scroll/resize,
    /// leaves top control bars uncovered, hides offscreen entries, and unmounts stale/Edgeless
    /// entries while revoking their `blob:` URLs).
    #[cfg(target_arch = "wasm32")]
    pub(crate) fn reconcile_wasm_html_embeds(&self, viewport_width: f32, viewport_height: f32) {
        use blocksuite_playground_doc::read::{BlockContent, ExternalEmbedKind};

        use crate::{
            PlaygroundMode,
            block_flow::{CODE_PADDING, CodePreviewKind, page_geometry},
            wasm_preview::{HtmlEmbedMount, reconcile_html_embeds},
        };

        if self.mode != PlaygroundMode::Page {
            reconcile_html_embeds(&[]);
            return;
        }
        let (Some(snap), Some(layout)) = (self.snapshot.as_ref(), self.flow_layout()) else {
            reconcile_html_embeds(&[]);
            return;
        };

        let geom = page_geometry(viewport_width);
        let (origin, _) = self.canvas_rect_cached();
        let ox = f32::from(origin.x);
        let vp_top = f32::from(origin.y);
        let vp_bottom = vp_top + viewport_height;
        let mut mounts = Vec::new();

        for b in &layout.blocks {
            let Some(node) = snap.block(&b.block_id) else {
                continue;
            };
            match &node.content {
                BlockContent::Code { language, text, .. }
                    if self.flow.code_preview_blocks.contains(&b.block_id)
                        && CodePreviewKind::from_language(language)
                            == Some(CodePreviewKind::Html) =>
                {
                    let (pad_x, pad_y) = CODE_PADDING;
                    let header_h = 34.0;
                    let raw_top = vp_top + b.y + header_h - self.scroll_y;
                    let raw_bottom = vp_top + b.y + b.body.height - pad_y - self.scroll_y;
                    let clipped_top = raw_top.max(vp_top);
                    let clipped_bottom = raw_bottom.min(vp_bottom);
                    let w = (b.body.width - pad_x * 2.0).max(0.0);
                    let h = (clipped_bottom - clipped_top).max(0.0);
                    mounts.push(HtmlEmbedMount {
                        id: format!("code-html-{}", b.block_id),
                        html: text.clone(),
                        x: ox + geom.column_x + b.x + pad_x,
                        y: clipped_top,
                        w,
                        h,
                        visible: !self.flow.embeds_shielded && w > 0.0 && h > 0.0,
                    });
                }
                BlockContent::ExternalEmbed {
                    kind: ExternalEmbedKind::Html,
                    html,
                    ..
                } if self.flow.embed_states.get(&b.block_id) == Some(&EmbedCardState::Active) => {
                    let pad = 14.0;
                    let header_h = 48.0;
                    let raw_top = vp_top + b.y + header_h - self.scroll_y;
                    let raw_bottom = vp_top + b.y + b.body.height - pad - self.scroll_y;
                    let clipped_top = raw_top.max(vp_top);
                    let clipped_bottom = raw_bottom.min(vp_bottom);
                    let w = (b.body.width - pad * 2.0).max(0.0);
                    let h = (clipped_bottom - clipped_top).max(0.0);
                    mounts.push(HtmlEmbedMount {
                        id: format!("ext-html-{}", b.block_id),
                        html: html.clone().unwrap_or_default(),
                        x: ox + geom.column_x + b.x + pad,
                        y: clipped_top,
                        w,
                        h,
                        visible: !self.flow.embeds_shielded && w > 0.0 && h > 0.0,
                    });
                }
                _ => {}
            }
        }
        use std::cell::RefCell;
        thread_local! {
            static LAST_RECONCILED_JSON: RefCell<String> = const { RefCell::new(String::new()) };
        }
        let next_json = if mounts.is_empty() {
            "[]".to_string()
        } else {
            serde_json::to_string(&mounts).unwrap_or_else(|_| "[]".to_string())
        };
        let changed = LAST_RECONCILED_JSON.with(|slot| {
            let mut prev = slot.borrow_mut();
            if *prev == next_json {
                false
            } else {
                *prev = next_json;
                true
            }
        });
        if changed {
            reconcile_html_embeds(&mounts);
        }
    }
}
