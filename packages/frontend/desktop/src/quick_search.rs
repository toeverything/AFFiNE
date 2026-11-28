//! `Cmd/Ctrl+K` QuickSearch modal: fuzzy & substring document search plus quick commands,
//! keyboard navigation (`Up`/`Down`/`Enter`/`Cmd+Enter`/`Escape`), and clean modal UI.

use ui::{
    Context, FontWeight, InteractiveElement, IntoElement, ParentElement,
    StatefulInteractiveElement, Styled, div, px, svg,
};
use ui_tokens::FONT_SANS;

use crate::{
    CLOSE_ICON_SVG, DOC_ICON_SVG, DesktopFlexExt, DesktopPalette, EDGELESS_ICON_SVG,
    JOURNAL_ICON_SVG, PLUS_ICON_SVG, SEARCH_ICON_SVG, SIDEBAR_TOGGLE_SVG, SPLIT_ICON_SVG,
    doc_store::DesktopDocStore, workbench::DesktopShellView,
};

/// Built-in command actions available from `Cmd/Ctrl+K`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum QuickCommandId {
    NewPage,
    NewEdgeless,
    ToggleTheme,
    OpenTodayJournal,
    ToggleSidebar,
    SplitView,
}

impl QuickCommandId {
    pub const ALL: [Self; 6] = [
        Self::NewPage,
        Self::NewEdgeless,
        Self::ToggleTheme,
        Self::OpenTodayJournal,
        Self::ToggleSidebar,
        Self::SplitView,
    ];

    pub const fn label(self) -> &'static str {
        match self {
            Self::NewPage => "New Page",
            Self::NewEdgeless => "New Edgeless Whiteboard",
            Self::ToggleTheme => "Toggle Theme (Light / Dark)",
            Self::OpenTodayJournal => "Open Today's Journal",
            Self::ToggleSidebar => "Toggle Sidebar",
            Self::SplitView => "Split View (Page + Edgeless)",
        }
    }

    pub const fn shortcut(self) -> &'static str {
        match self {
            Self::NewPage => "⌘N",
            Self::NewEdgeless => "⌘⇧N",
            Self::ToggleTheme => "⌘⇧L",
            Self::OpenTodayJournal => "⌘J",
            Self::ToggleSidebar => "⌘/",
            Self::SplitView => "⌘\\",
        }
    }
}

/// One selectable entry in the QuickSearch results list.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum QuickSearchItem {
    Doc {
        doc_id: String,
        title: String,
        summary: String,
        is_edgeless: bool,
    },
    Command(QuickCommandId),
}

/// Interactive state for the `Cmd/Ctrl+K` QuickSearch modal.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct QuickSearchState {
    pub open: bool,
    pub query: String,
    pub selected_index: usize,
    pub scroll_y: f32,
}

impl QuickSearchState {
    pub fn open(&mut self) {
        self.open = true;
        self.query.clear();
        self.selected_index = 0;
        self.scroll_y = 0.0;
    }

    pub fn close(&mut self) {
        self.open = false;
        self.query.clear();
        self.selected_index = 0;
        self.scroll_y = 0.0;
    }

    pub fn set_query(&mut self, query: impl Into<String>) {
        self.query = query.into();
        self.selected_index = 0;
        self.scroll_y = 0.0;
    }

    /// Compute ordered document matches + matching quick commands.
    pub fn items(&self, store: &DesktopDocStore) -> Vec<QuickSearchItem> {
        let mut out = Vec::new();
        let hits = store.search_docs(&self.query, 8);
        for hit in hits {
            if let Some(entry) = store.get_doc(&hit.doc_id) {
                out.push(QuickSearchItem::Doc {
                    doc_id: entry.meta.id.clone(),
                    title: entry.meta.title.clone(),
                    summary: entry.meta.summary.clone(),
                    is_edgeless: entry.meta.default_mode
                        == affine_store::directory::DocMode::Edgeless,
                });
            }
        }
        let q = self.query.trim().to_ascii_lowercase();
        for cmd in QuickCommandId::ALL {
            if q.is_empty() || cmd.label().to_ascii_lowercase().contains(&q) {
                out.push(QuickSearchItem::Command(cmd));
            }
        }
        out
    }

    pub fn move_selection(&mut self, delta: isize, total: usize) {
        if total == 0 {
            self.selected_index = 0;
            return;
        }
        let cur = self.selected_index.min(total - 1) as isize;
        self.selected_index = (cur + delta).rem_euclid(total as isize) as usize;
    }
}

/// Render the centered `Cmd/Ctrl+K` QuickSearch command palette modal.
pub(crate) fn render_quick_search_modal(
    qs: &QuickSearchState,
    store: &DesktopDocStore,
    palette: DesktopPalette,
    cx: &mut Context<DesktopShellView>,
) -> impl IntoElement {
    let items = qs.items(store);
    let selected = qs.selected_index.min(items.len().saturating_sub(1));

    let doc_items: Vec<(usize, &QuickSearchItem)> = items
        .iter()
        .enumerate()
        .filter(|(_, item)| matches!(item, QuickSearchItem::Doc { .. }))
        .collect();
    let cmd_items: Vec<(usize, &QuickSearchItem)> = items
        .iter()
        .enumerate()
        .filter(|(_, item)| matches!(item, QuickSearchItem::Command(_)))
        .collect();

    let mut list = div()
        .flex()
        .flex_col()
        .w_full()
        .gap(px(4.0))
        .mt(px(-qs.scroll_y));

    if !doc_items.is_empty() {
        list = list.child(
            div()
                .px(px(12.0))
                .py(px(4.0))
                .text_size(px(11.0))
                .font_weight(FontWeight::MEDIUM)
                .text_color(palette.text_muted)
                .child("DOCUMENTS"),
        );
        for (idx, item) in doc_items {
            if let QuickSearchItem::Doc {
                doc_id,
                title,
                summary,
                is_edgeless,
            } = item
            {
                let is_sel = idx == selected;
                let doc_id_click = doc_id.clone();
                let doc_id_split = doc_id.clone();
                list = list.child(
                    div()
                        .id(ui::SharedString::from(format!("desktop.qs.doc.{doc_id}")))
                        .snapshot(
                            ui::SharedString::from(format!("desktop.qs.doc.{doc_id}")),
                            Some("desktop.qs.modal"),
                        )
                        .flex()
                        .flex_row()
                        .items_center()
                        .justify_between()
                        .w_full()
                        .px(px(12.0))
                        .py(px(8.0))
                        .rounded(px(10.0))
                        .bg(if is_sel {
                            palette.bg_active
                        } else {
                            ui::hsla(0.0, 0.0, 0.0, 0.0)
                        })
                        .on_click(cx.listener(move |this, _, _, cx| {
                            this.state.open_doc_in_active_pane(&doc_id_click);
                            this.state.quick_search.close();
                            cx.notify();
                        }))
                        .child(
                            div()
                                .flex()
                                .flex_row()
                                .items_start()
                                .gap(px(10.0))
                                .flex_1()
                                .min_w_0()
                                .child(
                                    div()
                                        .w(px(20.0))
                                        .h(px(20.0))
                                        .flex()
                                        .items_center()
                                        .justify_center()
                                        .child(
                                            svg()
                                                .data(if *is_edgeless {
                                                    EDGELESS_ICON_SVG
                                                } else {
                                                    DOC_ICON_SVG
                                                })
                                                .w(px(16.0))
                                                .h(px(16.0))
                                                .text_color(if is_sel {
                                                    palette.accent
                                                } else {
                                                    palette.text_secondary
                                                }),
                                        ),
                                )
                                .child(
                                    div()
                                        .flex()
                                        .flex_col()
                                        .gap(px(2.0))
                                        .flex_1()
                                        .min_w_0()
                                        .child(
                                            div()
                                                .text_size(px(13.5))
                                                .font_weight(FontWeight::MEDIUM)
                                                .text_color(palette.text_primary)
                                                .child(title.clone()),
                                        )
                                        .child(
                                            div()
                                                .text_size(px(12.0))
                                                .text_color(palette.text_muted)
                                                .child(summary.clone()),
                                        ),
                                ),
                        )
                        .child(
                            div()
                                .id(ui::SharedString::from(format!("desktop.qs.split.{doc_id}")))
                                .px(px(8.0))
                                .py(px(4.0))
                                .rounded(px(6.0))
                                .bg(palette.bg_pill)
                                .text_size(px(11.0))
                                .text_color(palette.text_secondary)
                                .on_click(cx.listener(move |this, _, _, cx| {
                                    this.state.open_doc_in_split(&doc_id_split);
                                    this.state.quick_search.close();
                                    cx.notify();
                                }))
                                .child("⌘↵ Split"),
                        ),
                );
            }
        }
    }

    if !cmd_items.is_empty() {
        list = list.child(
            div()
                .px(px(12.0))
                .pt(px(8.0))
                .pb(px(4.0))
                .text_size(px(11.0))
                .font_weight(FontWeight::MEDIUM)
                .text_color(palette.text_muted)
                .child("COMMANDS"),
        );
        for (idx, item) in cmd_items {
            if let QuickSearchItem::Command(cmd) = item {
                let is_sel = idx == selected;
                let cmd_copy = *cmd;
                let icon_bytes = match cmd_copy {
                    QuickCommandId::NewPage | QuickCommandId::NewEdgeless => PLUS_ICON_SVG,
                    QuickCommandId::OpenTodayJournal => JOURNAL_ICON_SVG,
                    QuickCommandId::ToggleSidebar => SIDEBAR_TOGGLE_SVG,
                    QuickCommandId::SplitView => SPLIT_ICON_SVG,
                    QuickCommandId::ToggleTheme => SEARCH_ICON_SVG,
                };
                list = list.child(
                    div()
                        .id(ui::SharedString::from(format!("desktop.qs.cmd.{idx}")))
                        .flex()
                        .flex_row()
                        .items_center()
                        .justify_between()
                        .w_full()
                        .px(px(12.0))
                        .py(px(8.0))
                        .rounded(px(10.0))
                        .bg(if is_sel {
                            palette.bg_active
                        } else {
                            ui::hsla(0.0, 0.0, 0.0, 0.0)
                        })
                        .on_click(cx.listener(move |this, _, _, cx| {
                            this.state.execute_quick_command(cmd_copy);
                            this.state.quick_search.close();
                            cx.notify();
                        }))
                        .child(
                            div()
                                .flex()
                                .flex_row()
                                .items_center()
                                .gap(px(10.0))
                                .child(
                                    svg()
                                        .data(icon_bytes)
                                        .w(px(16.0))
                                        .h(px(16.0))
                                        .text_color(palette.text_secondary),
                                )
                                .child(
                                    div()
                                        .text_size(px(13.5))
                                        .text_color(palette.text_primary)
                                        .child(cmd_copy.label()),
                                ),
                        )
                        .child(
                            div()
                                .px(px(7.0))
                                .py(px(3.0))
                                .rounded(px(6.0))
                                .bg(palette.bg_pill)
                                .text_size(px(11.0))
                                .text_color(palette.text_muted)
                                .child(cmd_copy.shortcut()),
                        ),
                );
            }
        }
    }

    if items.is_empty() {
        list = list.child(
            div()
                .px(px(16.0))
                .py(px(28.0))
                .text_size(px(13.0))
                .text_color(palette.text_muted)
                .child("No matching documents or commands."),
        );
    }

    let query_display = if qs.query.is_empty() {
        "Search documents, tags, or type a command...".to_string()
    } else {
        qs.query.clone()
    };
    let query_color = if qs.query.is_empty() {
        palette.text_muted
    } else {
        palette.text_primary
    };

    div()
        .id("desktop.qs.backdrop")
        .absolute()
        .top(px(0.0))
        .left(px(0.0))
        .w_full()
        .h_full()
        .bg(palette.scrim)
        .flex()
        .flex_col()
        .items_center()
        .pt(px(56.0))
        .child(
            div()
                .id("desktop.qs.modal")
                .snapshot("desktop.qs.modal", Some("desktop.shell.root"))
                .w(px(640.0))
                .rounded(px(38.0))
                .bg(palette.bg_elevated)
                .border_1()
                .border_color(palette.border_strong)
                .font_family(FONT_SANS)
                .flex()
                .flex_col()
                .p(px(16.0))
                .gap(px(12.0))
                .child(
                    // Fixed short header + top-right 36x36 (r=18) circular close button
                    div()
                        .flex()
                        .flex_row()
                        .items_center()
                        .justify_between()
                        .px(px(4.0))
                        .pt(px(4.0))
                        .child(
                            div()
                                .text_size(px(15.0))
                                .font_weight(FontWeight::SEMIBOLD)
                                .text_color(palette.text_primary)
                                .child("Quick Search"),
                        )
                        .child(
                            div()
                                .id("desktop.qs.close")
                                .snapshot("desktop.qs.close", Some("desktop.qs.modal"))
                                .w(px(36.0))
                                .h(px(36.0))
                                .rounded(px(18.0))
                                .bg(palette.bg_pill)
                                .flex()
                                .items_center()
                                .justify_center()
                                .on_click(cx.listener(|this, _, _, cx| {
                                    this.state.quick_search.close();
                                    cx.notify();
                                }))
                                .child(
                                    svg()
                                        .data(CLOSE_ICON_SVG)
                                        .w(px(14.0))
                                        .h(px(14.0))
                                        .text_color(palette.text_primary),
                                ),
                        ),
                )
                .child(
                    // Search input box (concentric inner radius <= 22px)
                    div()
                        .id("desktop.qs.input")
                        .snapshot("desktop.qs.input", Some("desktop.qs.modal"))
                        .flex()
                        .flex_row()
                        .items_center()
                        .gap(px(10.0))
                        .px(px(14.0))
                        .h(px(44.0))
                        .rounded(px(14.0))
                        .bg(palette.bg_surface)
                        .border_1()
                        .border_color(palette.accent)
                        .child(
                            svg()
                                .data(SEARCH_ICON_SVG)
                                .w(px(16.0))
                                .h(px(16.0))
                                .text_color(palette.accent),
                        )
                        .child(
                            div()
                                .flex_1()
                                .text_size(px(14.0))
                                .text_color(query_color)
                                .child(query_display),
                        ),
                )
                .child(
                    // Scrollable concentric results card (R_inner = 22px)
                    div()
                        .id("desktop.qs.results")
                        .w_full()
                        .h(px(360.0))
                        .rounded(px(22.0))
                        .bg(palette.bg_surface)
                        .border_1()
                        .border_color(palette.border)
                        .p(px(8.0))
                        .overflow_hidden()
                        .on_scroll(cx.listener(|this, event: &ui::ScrollEvent, _, cx| {
                            let dy: f32 = event.delta.pixel_delta(px(20.0)).y.into();
                            let max_scroll =
                                (this.state.quick_search.items(&this.state.store).len() as f32
                                    * 52.0
                                    - 300.0)
                                    .max(0.0);
                            this.state.quick_search.scroll_y =
                                (this.state.quick_search.scroll_y - dy).clamp(0.0, max_scroll);
                            cx.notify();
                        }))
                        .child(list),
                )
                .child(
                    div()
                        .flex()
                        .flex_row()
                        .items_center()
                        .justify_between()
                        .pt(px(6.0))
                        .px(px(8.0))
                        .text_size(px(11.5))
                        .text_color(palette.text_muted)
                        .child("↑↓ Navigate   ↵ Open   ⌘↵ Split View   Esc Close")
                        .child(if items.len() == 1 {
                            "1 result".to_string()
                        } else {
                            format!("{} results", items.len())
                        }),
                ),
        )
}
