//! Document Outline (TOC) and DocInfo statistics drawer panel for [`PlaygroundView`].

use std::collections::{BTreeMap, BTreeSet};

use blocksuite_playground_doc::{
    read::{BlockContent, BlockNode, PageSnapshot},
    schema::ParagraphType,
};
use ui::{AnyElement, FontWeight, MouseButton, SharedString, div, prelude::*, px};
use y_octo::{Any, TextDeltaOp};

use crate::{
    PlaygroundView,
    theme::{Palette, TYPOGRAPHY},
};

/// Active tab of the docked TOC / DocInfo panel.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DocPanelTab {
    Outline,
    Info,
}

/// One heading entry extracted from the document tree for the TOC Outline.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TocHeading {
    pub block_id: String,
    pub level: u8,
    pub text: String,
}

/// Summary statistics shown in the DocInfo panel.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct DocStats {
    pub words: usize,
    pub chars: usize,
    pub blocks: usize,
    pub headings: usize,
    pub linked_docs: Vec<String>,
}

/// Extract ordered H1–H6 headings from visible page notes.
pub fn extract_toc_headings(snapshot: &PageSnapshot) -> Vec<TocHeading> {
    let mut out = Vec::new();
    let Some(root) = &snapshot.root else {
        return out;
    };
    for node in root.walk() {
        if let BlockContent::Paragraph { kind, text, .. } = &node.content {
            let level = match kind {
                ParagraphType::H1 => 1,
                ParagraphType::H2 => 2,
                ParagraphType::H3 => 3,
                ParagraphType::H4 => 4,
                ParagraphType::H5 => 5,
                ParagraphType::H6 => 6,
                _ => continue,
            };
            let title = text.plain.trim();
            out.push(TocHeading {
                block_id: node.id.clone(),
                level,
                text: if title.is_empty() {
                    format!("Heading {level}")
                } else {
                    title.to_string()
                },
            });
        }
    }
    out
}

/// Compute deterministic word/character/block/heading counts and outgoing doc references.
pub fn compute_doc_stats(
    snapshot: &PageSnapshot,
    page_titles: &BTreeMap<String, String>,
) -> DocStats {
    let mut stats = DocStats::default();
    let Some(root) = &snapshot.root else {
        return stats;
    };
    let mut ref_ids = BTreeSet::new();
    let mut count_text = |s: &str| {
        stats.chars += s.chars().count();
        stats.words += s.split_whitespace().count();
    };
    for node in root.walk() {
        stats.blocks += 1;
        collect_node_stats(node, &mut stats.headings, &mut count_text, &mut ref_ids);
    }
    stats.linked_docs = ref_ids
        .into_iter()
        .map(|id| {
            page_titles
                .get(&id)
                .filter(|t| !t.trim().is_empty())
                .cloned()
                .unwrap_or(id)
        })
        .collect();
    stats
}

fn collect_node_stats(
    node: &BlockNode,
    headings: &mut usize,
    count_text: &mut impl FnMut(&str),
    ref_ids: &mut BTreeSet<String>,
) {
    let collect_inline_refs = |delta: &[TextDeltaOp], refs: &mut BTreeSet<String>| {
        for op in delta {
            if let TextDeltaOp::Insert {
                format: Some(attrs),
                ..
            } = op
                && let Some(Any::Object(obj)) = attrs.get("reference")
                && let Some(Any::String(pid)) = obj.get("pageId")
            {
                refs.insert(pid.clone());
            }
        }
    };
    match &node.content {
        BlockContent::Page { title } => count_text(&title.plain),
        BlockContent::Paragraph { kind, text, .. } => {
            if matches!(
                kind,
                ParagraphType::H1
                    | ParagraphType::H2
                    | ParagraphType::H3
                    | ParagraphType::H4
                    | ParagraphType::H5
                    | ParagraphType::H6
            ) {
                *headings += 1;
            }
            count_text(&text.plain);
            collect_inline_refs(&text.delta, ref_ids);
        }
        BlockContent::List { text, .. } | BlockContent::Callout { text, .. } => {
            count_text(&text.plain);
            collect_inline_refs(&text.delta, ref_ids);
        }
        BlockContent::Code { text, .. } => count_text(text),
        BlockContent::Table(table) => {
            for cell in table.cells.values() {
                count_text(&cell.text.plain);
                collect_inline_refs(&cell.text.delta, ref_ids);
            }
        }
        BlockContent::EmbedLinkedDoc { page_id, .. }
        | BlockContent::EmbedSyncedDoc { page_id, .. } => {
            if !page_id.is_empty() {
                ref_ids.insert(page_id.clone());
            }
        }
        _ => {}
    }
}

impl PlaygroundView {
    /// Open, switch, or close the TOC / DocInfo side panel.
    pub fn set_doc_panel_tab(&mut self, tab: Option<DocPanelTab>, cx: &mut ui::Context<Self>) {
        self.doc_panel_tab = tab;
        cx.notify();
    }

    /// Currently active TOC / DocInfo panel tab, if open.
    pub fn doc_panel_tab(&self) -> Option<DocPanelTab> {
        self.doc_panel_tab
    }

    /// Scroll smoothly to a block id in Page mode (used by TOC outline navigation).
    pub fn scroll_to_block(&mut self, block_id: &str, cx: &mut ui::Context<Self>) -> bool {
        let Some(y) = self
            .flow_layout()
            .and_then(|layout| layout.block(block_id).map(|b| b.y))
        else {
            return false;
        };
        self.scroll_y = (y - 24.0).clamp(0.0, self.max_scroll);
        cx.notify();
        true
    }

    pub(crate) fn render_doc_panel_toggle(
        &self,
        palette: &Palette,
        compact: bool,
        cx: &mut ui::Context<Self>,
    ) -> impl IntoElement + use<> {
        let active = self.doc_panel_tab.is_some();
        let hover = palette.hover;
        let fg = if active {
            palette.brand
        } else {
            palette.text_primary
        };
        let mut btn = div()
            .id("doc-panel-toggle")
            .flex_none()
            .h(px(crate::THEME_TOGGLE_SIZE))
            .rounded(px(8.0))
            .bg(if active {
                palette.brand.opacity(0.14)
            } else {
                palette.background
            })
            .border_1()
            .border_color(if active {
                palette.brand
            } else {
                palette.border
            })
            .flex()
            .items_center()
            .justify_center()
            .cursor_pointer()
            .hover(move |s| s.bg(hover))
            .text_size(px(12.0))
            .font_weight(FontWeight::MEDIUM)
            .text_color(fg)
            .on_click(cx.listener(|this, _, _, cx| {
                this.doc_panel_tab = if this.doc_panel_tab.is_some() {
                    None
                } else {
                    Some(DocPanelTab::Outline)
                };
                cx.notify();
            }))
            .snapshot("chrome.doc_panel_toggle", Some("chrome.topbar"))
            .snapshot_focused(active)
            .snapshot_text("Outline");
        if compact {
            btn = btn.w(px(crate::THEME_TOGGLE_SIZE)).child(
                div()
                    .w(px(14.0))
                    .flex()
                    .flex_col()
                    .gap(px(3.0))
                    .child(div().w(px(14.0)).h(px(1.5)).rounded(px(1.0)).bg(fg))
                    .child(div().w(px(10.0)).h(px(1.5)).rounded(px(1.0)).bg(fg))
                    .child(div().w(px(12.0)).h(px(1.5)).rounded(px(1.0)).bg(fg)),
            );
        } else {
            btn = btn.px(px(10.0)).child("Outline");
        }
        btn
    }

    pub(crate) fn render_doc_panel(
        &self,
        palette: &Palette,
        viewport_width: f32,
        viewport_height: f32,
        cx: &mut ui::Context<Self>,
    ) -> Option<AnyElement> {
        let tab = self.doc_panel_tab?;
        let snapshot = self.snapshot.as_ref()?;
        let panel_w = (viewport_width - 24.0).clamp(200.0, 268.0);
        let left = (viewport_width - panel_w - 12.0).max(12.0);
        let narrow_viewport = viewport_width < 600.0;
        let hover = palette.hover;

        let tab_btn = |id: &'static str, label: &'static str, target: DocPanelTab| {
            let is_active = tab == target;
            div()
                .id(id)
                .flex_1()
                .h(px(28.0))
                .rounded(px(4.0))
                .bg(if is_active {
                    palette.background
                } else {
                    ui::transparent_black()
                })
                .border_1()
                .border_color(if is_active {
                    palette.border
                } else {
                    ui::transparent_black()
                })
                .flex()
                .items_center()
                .justify_center()
                .cursor_pointer()
                .text_size(px(TYPOGRAPHY.font_xs_px))
                .font_weight(FontWeight::MEDIUM)
                .text_color(if is_active {
                    palette.text_primary
                } else {
                    palette.text_secondary
                })
                .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.doc_panel_tab = Some(target);
                    cx.notify();
                }))
                .snapshot(
                    SharedString::from(format!("overlay.doc_panel.tab.{id}")),
                    Some("overlay.doc_panel"),
                )
                .snapshot_focused(is_active)
                .snapshot_text(label)
                .child(label)
        };

        let mut body = div()
            .flex_1()
            .min_h_0()
            .overflow_hidden()
            .flex()
            .flex_col()
            .gap(px(4.0))
            .p(px(10.0));

        match tab {
            DocPanelTab::Outline => {
                let headings = extract_toc_headings(snapshot);
                if headings.is_empty() {
                    body = body.child(
                        div()
                            .py(px(12.0))
                            .text_size(px(TYPOGRAPHY.font_xs_px))
                            .text_color(palette.text_secondary)
                            .child("No headings in this document"),
                    );
                } else {
                    let row_stride = 32.0;
                    let content_h = headings.len() as f32 * row_stride;
                    let max_list_h =
                        (viewport_height - self.topbar_height() - 84.0).clamp(120.0, 460.0);
                    let list_h = content_h.min(max_list_h);
                    let max_scroll = (content_h - list_h).max(0.0);
                    let scroll_y = self.doc_panel_scroll_y.clamp(0.0, max_scroll);
                    let mut list_inner = div()
                        .absolute()
                        .left(px(0.0))
                        .right(px(0.0))
                        .top(px(-scroll_y))
                        .flex()
                        .flex_col()
                        .gap(px(4.0));
                    for h in headings {
                        let indent = f32::from(h.level.saturating_sub(1)) * 12.0;
                        let target_id = h.block_id.clone();
                        let label = SharedString::from(h.text.clone());
                        list_inner = list_inner.child(
                            div()
                                .id(SharedString::from(format!("toc-{}", h.block_id)))
                                .h(px(28.0))
                                .pl(px(8.0 + indent))
                                .pr(px(8.0))
                                .rounded(px(4.0))
                                .flex()
                                .items_center()
                                .cursor_pointer()
                                .hover(move |s| s.bg(hover))
                                .text_size(px(TYPOGRAPHY.font_xs_px))
                                .font_weight(if h.level <= 2 {
                                    FontWeight::MEDIUM
                                } else {
                                    FontWeight::NORMAL
                                })
                                .text_color(palette.text_primary)
                                .truncate()
                                .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
                                .on_click(cx.listener(move |this, _, _, cx| {
                                    this.scroll_to_block(&target_id, cx);
                                    if narrow_viewport {
                                        this.doc_panel_tab = None;
                                        cx.notify();
                                    }
                                }))
                                .snapshot(
                                    SharedString::from(format!(
                                        "overlay.doc_panel.heading.{}",
                                        h.block_id
                                    )),
                                    Some("overlay.doc_panel"),
                                )
                                .snapshot_text(label.clone())
                                .child(label),
                        );
                    }
                    body = body.child(
                        div()
                            .id("doc-panel-outline-scroll")
                            .relative()
                            .h(px(list_h))
                            .w_full()
                            .overflow_hidden()
                            .on_scroll(cx.listener(move |this, ev: &ui::ScrollEvent, _, cx| {
                                let dy = f32::from(ev.delta.pixel_delta(px(20.0)).y);
                                let next = (this.doc_panel_scroll_y - dy).clamp(0.0, max_scroll);
                                if (next - this.doc_panel_scroll_y).abs() > 0.1 {
                                    this.doc_panel_scroll_y = next;
                                    cx.notify();
                                }
                                cx.stop_propagation();
                            }))
                            .child(list_inner),
                    );
                }
            }
            DocPanelTab::Info => {
                let stats = compute_doc_stats(snapshot, &self.page_titles);
                for (key, val) in [
                    ("Words", stats.words.to_string()),
                    ("Characters", stats.chars.to_string()),
                    ("Blocks", stats.blocks.to_string()),
                    ("Headings", stats.headings.to_string()),
                    ("References", stats.linked_docs.len().to_string()),
                ] {
                    body = body.child(
                        div()
                            .h(px(28.0))
                            .px(px(6.0))
                            .flex()
                            .items_center()
                            .text_size(px(TYPOGRAPHY.font_xs_px))
                            .child(div().flex_1().text_color(palette.text_secondary).child(key))
                            .child(
                                div()
                                    .font_weight(FontWeight::MEDIUM)
                                    .text_color(palette.text_primary)
                                    .snapshot(
                                        SharedString::from(format!(
                                            "overlay.doc_panel.stat.{}",
                                            key.to_ascii_lowercase()
                                        )),
                                        Some("overlay.doc_panel"),
                                    )
                                    .snapshot_text(val.clone())
                                    .child(val),
                            ),
                    );
                }
                if !stats.linked_docs.is_empty() {
                    body = body.child(
                        div()
                            .pt(px(6.0))
                            .px(px(6.0))
                            .text_size(px(11.0))
                            .font_weight(FontWeight::MEDIUM)
                            .text_color(palette.text_secondary)
                            .child("Linked Documents"),
                    );
                    for title in stats.linked_docs {
                        body = body.child(
                            div()
                                .px(px(6.0))
                                .py(px(2.0))
                                .text_size(px(TYPOGRAPHY.font_xs_px))
                                .text_color(palette.brand)
                                .truncate()
                                .child(title),
                        );
                    }
                }
            }
        }

        Some(
            div()
                .id("doc-panel")
                .absolute()
                .left(px(left))
                .top(px(self.topbar_height() + 8.0))
                .w(px(panel_w))
                .overflow_hidden()
                .rounded(px(10.0))
                .bg(palette.panel)
                .border_1()
                .border_color(palette.border)
                .flex()
                .flex_col()
                .occlude()
                .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
                .snapshot("overlay.doc_panel", Some("root.canvas"))
                .child(
                    div()
                        .p(px(6.0))
                        .bg(palette.background_secondary)
                        .border_b_1()
                        .border_color(palette.border)
                        .flex()
                        .items_center()
                        .gap(px(4.0))
                        .child(tab_btn("outline", "Outline", DocPanelTab::Outline))
                        .child(tab_btn("info", "Doc Info", DocPanelTab::Info)),
                )
                .child(body)
                .into_any_element(),
        )
    }

    /// Replace the shown document, e.g. with one prepared by a host or a test.
    pub fn set_document(&mut self, state: crate::DocState, cx: &mut ui::Context<Self>) {
        self.finish_inline_targets(crate::overlays::InlineTargetEnd::DiscardPreedit, None, None);
        self.editor = Default::default();
        self.saved_page_selection = None;
        self.overlays.reset();
        self.reading_anchor = None;
        self.flow = crate::block_flow::BlockFlow::new();
        self.flow.database_state.mobile_readonly = self.database_readonly;
        self.flow.database_state.clock_ms = self.local_calendar_now(cx).0;
        self.layout = None;
        self.edgeless = crate::edgeless::EdgelessCanvasState::new();
        self.edgeless_camera_transition = None;
        self.edgeless_shape_picker_presence = None;
        self.page_scroll_fling = None;
        self.code_scroll_fling = None;
        self.edgeless_pan_fling = None;
        self.touch_scroll_axis_lock = None;
        self.active_touch_owner = crate::touch_interaction::TouchStrokeOwner::None;
        self.touch_long_press_anchor = None;
        self.touch_selection_menu_open = false;
        self.edgeless_readonly_selection_target = None;
        self.caret_blink_task = None;
        self.scrollbar_drag = None;
        self.context_toast_timer = None;
        self.context_paste_task = None;
        self.context_menu_target = None;
        self.last_opened_link_url = None;
        self.database_readonly_toast_shown = false;
        self.database_record_sheet = None;
        self.doc_epoch = self.doc_epoch.wrapping_add(1);
        self.state = state;
        self.default_doc_directory = crate::directory::InMemoryDocDirectory::with_namespace(
            format!("doc:{:x}", self.state.awareness.local_client_id()),
        );
        self.doc_panel_tab = None;
        self.doc_panel_scroll_y = 0.0;
        self.preflight_renamed_title = None;
        self.cached_page_revisions.clear();
        self.pending_sync_since_sv.clear();
        self.images.clear();
        self.pdf_previews.clear();
        self.pdf_preview_keys.clear();
        self.failed_pdf_blobs.clear();
        self.pdf_page_indices.clear();
        self.keyboard_toolbar_dismissed = false;
        self.ime_insets = crate::chrome::ImeInsetsState::default();
        self.last_opened_embed_doc = None;
        self.nav_history.clear();
        self.page_id = None;
        self.blob_fetches.clear();
        self.blob_uploads.clear();
        self.scroll_y = 0.0;
        self.refresh_document();
        cx.notify();
    }

    pub(crate) fn render_nav_back(
        &self,
        palette: &crate::theme::Palette,
        cx: &mut ui::Context<Self>,
    ) -> Option<ui::AnyElement> {
        use ui::{FontWeight, InteractiveElement, IntoElement, ParentElement, Styled, div, px};
        if self.nav_history.is_empty() {
            return None;
        }
        let hover = palette.hover;
        Some(
            div()
                .id("chrome-nav-back")
                .h(px(28.0))
                .px(px(10.0))
                .rounded(px(6.0))
                .bg(palette.background)
                .border_1()
                .border_color(palette.border)
                .flex()
                .items_center()
                .justify_center()
                .cursor_pointer()
                .text_size(px(12.0))
                .font_weight(FontWeight::MEDIUM)
                .text_color(palette.text_primary)
                .hover(move |style| style.bg(hover))
                .on_click(cx.listener(|this, _, window, cx| {
                    this.navigate_back(Some(window), cx);
                }))
                .snapshot("chrome.nav_back", Some("chrome.topbar"))
                .snapshot_text("Back")
                .child("‹ Back")
                .into_any_element(),
        )
    }
}

#[cfg(not(target_arch = "wasm32"))]
pub(crate) fn install_native_preview_wakeup(
    tasks: &mut Vec<ui::Task<()>>,
    cx: &mut ui::Context<PlaygroundView>,
) {
    crate::block_flow::ensure_native_preview_providers_installed();
    let (wakeup_tx, wakeup_rx) = async_channel::bounded::<()>(1);
    let wakeup_sub = crate::block_flow::subscribe_preview_wakeup(std::sync::Arc::new(move || {
        let _ = wakeup_tx.try_send(());
    }));
    tasks.push(cx.spawn(async move |this, cx| {
        let _keep_alive = wakeup_sub;
        while wakeup_rx.recv().await.is_ok() {
            if this.update(cx, |_, cx| cx.notify()).is_err() {
                break;
            }
        }
    }));
}
