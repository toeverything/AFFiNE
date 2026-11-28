//! Root `DesktopShellView` (`Workbench`, topbar, multi-tab strip, split-view panes,
//! keyboard shortcuts, and modal layers).

use ui::{
    Context, FocusHandle, Focusable, FontWeight, InteractiveElement, IntoElement, KeyDownEvent,
    ParentElement, Render, StatefulInteractiveElement, Styled, Window, div, prelude::FluentBuilder,
    px, svg,
};
use ui_tokens::FONT_SANS;

pub use crate::state::{DesktopAppState, DesktopModal, DocInspectorTab};

use crate::{
    CHEVRON_LEFT_SVG, CHEVRON_RIGHT_SVG, CLOSE_ICON_SVG, DOC_ICON_SVG, DesktopFlexExt,
    DesktopPalette, EDGELESS_ICON_SVG, INFO_ICON_SVG, PEEK_ICON_SVG, SIDEBAR_TOGGLE_SVG,
    SPLIT_ICON_SVG, STAR_FILLED_SVG, STAR_ICON_SVG, editor_host::DesktopEditorHost, palette_for,
    pane_render::render_pane_content, peek_view::render_peek_view_modal,
    quick_search::render_quick_search_modal, settings_modal::render_settings_modal,
    sidebar::render_sidebar, split_view::DocViewMode, views_extra::render_doc_inspector,
};

/// Interactive GPU UI root view for AFFiNE Web Desktop & Electron shell.
pub struct DesktopShellView {
    pub state: DesktopAppState,
    editor_host: DesktopEditorHost,
    focus_handle: FocusHandle,
}

impl DesktopShellView {
    pub fn new(state: DesktopAppState, cx: &mut Context<Self>) -> Self {
        Self {
            state,
            editor_host: DesktopEditorHost::new(),
            focus_handle: cx.focus_handle(),
        }
    }

    pub fn state(&self) -> &DesktopAppState {
        &self.state
    }

    pub fn state_mut(&mut self) -> &mut DesktopAppState {
        &mut self.state
    }

    pub fn editor_host(&self) -> &DesktopEditorHost {
        &self.editor_host
    }

    /// Synchronize live CRDT edits across all mounted `Entity<PlaygroundView>` panes.
    pub fn sync_editors(&mut self, cx: &mut Context<Self>) {
        self.editor_host.sync_all(&mut self.state.store, cx);
    }

    fn handle_key_down(
        &mut self,
        event: &KeyDownEvent,
        _window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let key = event.keystroke.key.as_str();
        let cmd_or_ctrl = event.keystroke.modifiers.platform || event.keystroke.modifiers.control;

        if self.state.quick_search.open {
            let total = self.state.quick_search.items(&self.state.store).len();
            match key {
                "escape" => self.state.quick_search.close(),
                "down" => self.state.quick_search.move_selection(1, total),
                "up" => self.state.quick_search.move_selection(-1, total),
                "enter" => {
                    self.state.confirm_quick_search(cmd_or_ctrl);
                }
                "backspace" => {
                    self.state.quick_search.query.pop();
                    self.state.quick_search.selected_index = 0;
                }
                _ => {
                    if let Some(ch) = &event.keystroke.key_char
                        && !cmd_or_ctrl
                        && !ch.chars().any(char::is_control)
                    {
                        self.state.quick_search.query.push_str(ch);
                        self.state.quick_search.selected_index = 0;
                    }
                }
            }
            cx.notify();
            return;
        }

        if key == "escape" {
            if self.state.peek_view.is_open() {
                self.state.peek_view.close();
                cx.notify();
                return;
            }
            if self.state.modal.is_some() {
                self.state.close_modal();
                cx.notify();
                return;
            }
        }

        if cmd_or_ctrl {
            match key {
                "k" => {
                    self.state.open_quick_search();
                    cx.notify();
                }
                "\\" => {
                    self.state.open_split_edgeless_for_active_doc();
                    cx.notify();
                }
                "[" => {
                    self.state.split.active_mut().go_back();
                    cx.notify();
                }
                "]" => {
                    self.state.split.active_mut().go_forward();
                    cx.notify();
                }
                "/" => {
                    self.state.sidebar.toggle_open();
                    cx.notify();
                }
                _ => {}
            }
        }
    }
    /// Flush any mounted `Entity<PlaygroundView>` edits into `DesktopDocStore` and fan out
    /// to sibling panes/outline/topbar immediately when an observed editor changes.
    pub(crate) fn sync_editors_from_observer(&mut self, cx: &mut Context<Self>) {
        if self.editor_host.sync_all(&mut self.state.store, cx) {
            cx.notify();
        }
    }
}

impl Focusable for DesktopShellView {
    fn focus_handle(&self, _cx: &ui::App) -> FocusHandle {
        self.focus_handle.clone()
    }
}

impl Render for DesktopShellView {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        // Sync all mounted editors BEFORE pruning closed panes so closing a split pane
        // never discards uncommitted Yjs V1 edits.
        self.editor_host.sync_all(&mut self.state.store, cx);
        let active_pane_ids: Vec<_> = self.state.split.panes.iter().map(|p| p.id).collect();
        self.editor_host.retain_panes(&active_pane_ids);

        let palette = palette_for(self.state.theme);
        let vp = window.viewport_size();
        let vp_w: f32 = vp.width.into();
        let vp_h: f32 = vp.height.into();
        let sidebar_w = if self.state.sidebar.open {
            self.state.sidebar.width
        } else {
            0.0
        };
        let inspector_w = if self.state.inspector_tab.is_some() {
            250.0
        } else {
            0.0
        };
        let workbench_w = (vp_w - sidebar_w - inspector_w).max(320.0);
        let pane_body_h = (vp_h - 86.0).max(160.0);

        let active_route = self.state.split.active().active_route().clone();
        let active_doc_id = active_route.doc_id().map(ToOwned::to_owned);
        let active_mode = self.state.split.active().active_mode();
        let active_title = self.state.route_title(&active_route);
        let is_fav = active_doc_id
            .as_deref()
            .and_then(|id| self.state.store.get_doc(id))
            .is_some_and(|e| e.meta.is_favorite);
        let can_back = self.state.split.active().can_go_back();
        let can_fwd = self.state.split.active().can_go_forward();

        // Top Workbench bar
        let topbar = div()
            .id("desktop.workbench.topbar")
            .snapshot("desktop.workbench.topbar", Some("desktop.workbench"))
            .flex()
            .flex_row()
            .items_center()
            .justify_between()
            .w_full()
            .h(px(48.0))
            .px(px(14.0))
            .flex_shrink(0.0)
            .bg(palette.bg_canvas)
            .border_b_1()
            .border_color(palette.border)
            .child(
                div()
                    .flex()
                    .flex_row()
                    .items_center()
                    .gap(px(8.0))
                    .child(icon_btn(
                        "desktop.topbar.sidebar_toggle",
                        SIDEBAR_TOGGLE_SVG,
                        false,
                        palette,
                        cx.listener(|this, _, _, cx| {
                            this.state.sidebar.toggle_open();
                            cx.notify();
                        }),
                    ))
                    .child(icon_btn(
                        "desktop.topbar.nav_back",
                        CHEVRON_LEFT_SVG,
                        !can_back,
                        palette,
                        cx.listener(|this, _, _, cx| {
                            this.state.split.active_mut().go_back();
                            cx.notify();
                        }),
                    ))
                    .child(icon_btn(
                        "desktop.topbar.nav_forward",
                        CHEVRON_RIGHT_SVG,
                        !can_fwd,
                        palette,
                        cx.listener(|this, _, _, cx| {
                            this.state.split.active_mut().go_forward();
                            cx.notify();
                        }),
                    ))
                    .child(
                        div()
                            .pl(px(4.0))
                            .text_size(px(14.0))
                            .font_weight(FontWeight::SEMIBOLD)
                            .text_color(palette.text_primary)
                            .child(active_title),
                    )
                    .when_some(active_doc_id.clone(), |el, doc_id| {
                        el.child(
                            div()
                                .id("desktop.topbar.favorite")
                                .w(px(28.0))
                                .h(px(28.0))
                                .rounded(px(6.0))
                                .flex()
                                .items_center()
                                .justify_center()
                                .on_click(cx.listener(move |this, _, _, cx| {
                                    this.state.store.toggle_favorite(&doc_id);
                                    cx.notify();
                                }))
                                .child(
                                    svg()
                                        .data(if is_fav {
                                            STAR_FILLED_SVG
                                        } else {
                                            STAR_ICON_SVG
                                        })
                                        .w(px(15.0))
                                        .h(px(15.0))
                                        .text_color(if is_fav {
                                            ui::hsla(0.11, 0.92, 0.52, 1.0)
                                        } else {
                                            palette.text_muted
                                        }),
                                ),
                        )
                    }),
            )
            .child(
                // Page / Edgeless segmented switcher
                div()
                    .id("desktop.topbar.mode_switch")
                    .snapshot(
                        "desktop.topbar.mode_switch",
                        Some("desktop.workbench.topbar"),
                    )
                    .flex()
                    .flex_row()
                    .items_center()
                    .p(px(3.0))
                    .gap(px(2.0))
                    .rounded(px(9.0))
                    .bg(palette.bg_pill)
                    .child(mode_pill(
                        "desktop.topbar.mode.page",
                        DOC_ICON_SVG,
                        "Page",
                        active_mode == DocViewMode::Page,
                        DocViewMode::Page,
                        palette,
                        cx,
                    ))
                    .child(mode_pill(
                        "desktop.topbar.mode.edgeless",
                        EDGELESS_ICON_SVG,
                        "Edgeless",
                        active_mode == DocViewMode::Edgeless,
                        DocViewMode::Edgeless,
                        palette,
                        cx,
                    )),
            )
            .child(
                // Right action buttons: Peek, Split View, DocInfo/Outline
                div()
                    .flex()
                    .flex_row()
                    .items_center()
                    .gap(px(6.0))
                    .child(
                        div()
                            .id("desktop.topbar.peek_ref")
                            .h(px(28.0))
                            .px(px(9.0))
                            .rounded(px(7.0))
                            .bg(palette.bg_pill)
                            .flex()
                            .flex_row()
                            .items_center()
                            .gap(px(5.0))
                            .text_size(px(12.0))
                            .text_color(palette.text_secondary)
                            .on_click(cx.listener(|this, _, _, cx| {
                                if let Some(doc_id) = this.state.resolve_peek_target() {
                                    this.state.open_peek_view(&doc_id);
                                    cx.notify();
                                }
                            }))
                            .child(
                                svg()
                                    .data(PEEK_ICON_SVG)
                                    .w(px(14.0))
                                    .h(px(14.0))
                                    .text_color(palette.text_secondary),
                            )
                            .child("Peek"),
                    )
                    .child(
                        div()
                            .id("desktop.topbar.split_btn")
                            .snapshot("desktop.topbar.split_btn", Some("desktop.workbench.topbar"))
                            .h(px(28.0))
                            .px(px(9.0))
                            .rounded(px(7.0))
                            .bg(if self.state.split.is_split() {
                                palette.accent_soft
                            } else {
                                palette.bg_pill
                            })
                            .flex()
                            .flex_row()
                            .items_center()
                            .gap(px(5.0))
                            .text_size(px(12.0))
                            .font_weight(FontWeight::MEDIUM)
                            .text_color(if self.state.split.is_split() {
                                palette.accent
                            } else {
                                palette.text_secondary
                            })
                            .on_click(cx.listener(|this, _, _, cx| {
                                this.editor_host.sync_all(&mut this.state.store, cx);
                                if this.state.split.is_split() {
                                    while this.state.split.panes.len() > 1 {
                                        let last = this.state.split.panes.len() - 1;
                                        this.state.split.close_pane(last);
                                    }
                                } else {
                                    this.state.open_split_edgeless_for_active_doc();
                                }
                                cx.notify();
                            }))
                            .child(
                                svg()
                                    .data(SPLIT_ICON_SVG)
                                    .w(px(14.0))
                                    .h(px(14.0))
                                    .text_color(if self.state.split.is_split() {
                                        palette.accent
                                    } else {
                                        palette.text_secondary
                                    }),
                            )
                            .child(if self.state.split.is_split() {
                                "Split On"
                            } else {
                                "Split"
                            }),
                    )
                    .child(icon_btn(
                        "desktop.topbar.inspector_toggle",
                        INFO_ICON_SVG,
                        false,
                        palette,
                        cx.listener(|this, _, _, cx| {
                            this.state.toggle_inspector();
                            cx.notify();
                        }),
                    )),
            );

        // Render 1..=3 split panes
        let pane_count = self.state.split.panes.len();
        let active_pane_idx = self.state.split.active_pane;
        let split_ratio = self.state.split.split_ratio;
        let mut panes_row = div()
            .flex()
            .flex_row()
            .w_full()
            .flex_1()
            .min_h_0()
            .items_stretch();

        let mut pane_origin_x = sidebar_w;
        let pane_origin_y = 84.0;
        for idx in 0..pane_count {
            let pane_w = if pane_count == 1 {
                workbench_w
            } else if pane_count == 2 {
                if idx == 0 {
                    workbench_w * split_ratio
                } else {
                    workbench_w * (1.0 - split_ratio)
                }
            } else {
                workbench_w / (pane_count as f32)
            };
            let is_focused = idx == active_pane_idx;
            let tab_meta: Vec<(usize, String, DocViewMode, bool)> = self.state.split.panes[idx]
                .tabs
                .iter()
                .enumerate()
                .map(|(t_idx, t)| {
                    (
                        t_idx,
                        self.state.route_title(&t.route),
                        t.mode,
                        t_idx == self.state.split.panes[idx].active_tab,
                    )
                })
                .collect();

            let mut tab_bar = div()
                .flex()
                .flex_row()
                .items_center()
                .justify_between()
                .w_full()
                .h(px(36.0))
                .px(px(10.0))
                .bg(palette.bg_surface)
                .border_b_1()
                .border_color(if is_focused && pane_count > 1 {
                    palette.accent
                } else {
                    palette.border
                });

            let mut tab_strip = div().flex().flex_row().items_center().gap(px(4.0));
            for (t_idx, label, mode, is_active_tab) in tab_meta {
                tab_strip = tab_strip.child(
                    div()
                        .id(ui::SharedString::from(format!(
                            "desktop.pane.{idx}.tab.{t_idx}"
                        )))
                        .flex()
                        .flex_row()
                        .items_center()
                        .gap(px(6.0))
                        .h(px(26.0))
                        .px(px(10.0))
                        .rounded(px(6.0))
                        .bg(if is_active_tab {
                            palette.bg_elevated
                        } else {
                            ui::hsla(0.0, 0.0, 0.0, 0.0)
                        })
                        .border_1()
                        .border_color(if is_active_tab {
                            palette.border
                        } else {
                            ui::hsla(0.0, 0.0, 0.0, 0.0)
                        })
                        .on_click(cx.listener(move |this, _, _, cx| {
                            this.state.split.focus_pane(idx);
                            this.state.split.panes[idx].select_tab(t_idx);
                            cx.notify();
                        }))
                        .child(
                            svg()
                                .data(if mode == DocViewMode::Edgeless {
                                    EDGELESS_ICON_SVG
                                } else {
                                    DOC_ICON_SVG
                                })
                                .w(px(12.0))
                                .h(px(12.0))
                                .text_color(if is_active_tab {
                                    palette.accent
                                } else {
                                    palette.text_muted
                                }),
                        )
                        .child(
                            div()
                                .text_size(px(12.0))
                                .font_weight(if is_active_tab {
                                    FontWeight::MEDIUM
                                } else {
                                    FontWeight::NORMAL
                                })
                                .text_color(if is_active_tab {
                                    palette.text_primary
                                } else {
                                    palette.text_secondary
                                })
                                .child(label),
                        ),
                );
            }
            tab_bar = tab_bar.child(tab_strip);

            if pane_count > 1 {
                let pane_mode_label = self.state.split.panes[idx].active_mode().label();
                tab_bar = tab_bar.child(
                    div()
                        .flex()
                        .flex_row()
                        .items_center()
                        .gap(px(6.0))
                        .child(
                            div()
                                .px(px(7.0))
                                .py(px(2.0))
                                .rounded(px(5.0))
                                .bg(if is_focused {
                                    palette.accent_soft
                                } else {
                                    palette.bg_pill
                                })
                                .text_size(px(11.0))
                                .text_color(if is_focused {
                                    palette.accent
                                } else {
                                    palette.text_muted
                                })
                                .child(pane_mode_label),
                        )
                        .child(
                            div()
                                .id(ui::SharedString::from(format!("desktop.pane.{idx}.close")))
                                .w(px(22.0))
                                .h(px(22.0))
                                .rounded(px(5.0))
                                .flex()
                                .items_center()
                                .justify_center()
                                .on_click(cx.listener(move |this, _, _, cx| {
                                    this.editor_host.sync_all(&mut this.state.store, cx);
                                    this.state.split.close_pane(idx);
                                    cx.notify();
                                }))
                                .child(
                                    svg()
                                        .data(CLOSE_ICON_SVG)
                                        .w(px(12.0))
                                        .h(px(12.0))
                                        .text_color(palette.text_muted),
                                ),
                        ),
                );
            }

            let content = render_pane_content(
                &mut self.state.split.panes[idx],
                idx,
                &mut self.state.store,
                &mut self.editor_host,
                self.state.theme,
                palette,
                pane_origin_x,
                pane_origin_y,
                pane_w,
                pane_body_h,
                cx,
            );
            pane_origin_x += pane_w;

            let mut pane_el = div()
                .id(ui::SharedString::from(format!("desktop.pane.{idx}")))
                .snapshot(
                    ui::SharedString::from(format!("desktop.pane.{idx}")),
                    Some("desktop.workbench"),
                )
                .w(px(pane_w))
                .h_full()
                .flex()
                .flex_col()
                .min_w_0()
                .min_h_0()
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.state.split.focus_pane(idx);
                    cx.notify();
                }))
                .child(tab_bar)
                .child(div().flex_1().min_h_0().w_full().child(content));

            if idx + 1 < pane_count {
                pane_el = pane_el.border_r_1().border_color(palette.border_strong);
            }
            panes_row = panes_row.child(pane_el);
        }

        let workbench = div()
            .id("desktop.workbench")
            .snapshot("desktop.workbench", Some("desktop.shell.root"))
            .flex_1()
            .min_w_0()
            .h_full()
            .flex()
            .flex_col()
            .bg(palette.bg_canvas)
            .child(topbar)
            .child(panes_row);

        let mut root = div()
            .id("desktop.shell.root")
            .snapshot("desktop.shell.root", None)
            .track_focus(&self.focus_handle)
            .on_key_down(cx.listener(Self::handle_key_down))
            .relative()
            .w_full()
            .h_full()
            .bg(palette.bg_canvas)
            .font_family(FONT_SANS)
            .flex()
            .flex_row()
            .items_stretch();

        if self.state.sidebar.open {
            root = root.child(render_sidebar(
                &self.state.sidebar,
                &self.state.store,
                &active_route,
                palette,
                cx,
            ));
        }

        root = root.child(workbench);

        if let Some(tab) = self.state.inspector_tab {
            root = root.child(render_doc_inspector(
                tab,
                active_doc_id.as_deref(),
                &self.state.store,
                palette,
                cx,
            ));
        }

        if self.state.quick_search.open {
            root = root.child(render_quick_search_modal(
                &self.state.quick_search,
                &self.state.store,
                palette,
                cx,
            ));
        } else if let Some(peek_doc_id) = self.state.peek_view.doc_id.clone() {
            let peek_ox = ((vp_w - 780.0) * 0.5).max(0.0) + 16.0;
            let peek_oy = ((vp_h - 580.0) * 0.5).max(0.0) + 68.0;
            let peek_entity = self.editor_host.ensure_peek_editor(
                &peek_doc_id,
                self.state.theme,
                peek_ox,
                peek_oy,
                748.0,
                446.0,
                &mut self.state.store,
                cx,
            );
            root = root.child(render_peek_view_modal(peek_entity, palette, cx));
        } else if matches!(self.state.modal, Some(DesktopModal::Settings)) {
            root = root.child(render_settings_modal(
                self.state.theme_preference,
                self.state.settings_scroll_y,
                &self.state.store,
                &self.state.draft_store,
                palette,
                cx,
            ));
        }

        root
    }
}

fn icon_btn(
    id: &'static str,
    icon: &'static [u8],
    disabled: bool,
    palette: DesktopPalette,
    on_click: impl Fn(&ui::ClickEvent, &mut Window, &mut ui::App) + 'static,
) -> ui::Stateful<ui::Div> {
    div()
        .id(id)
        .w(px(28.0))
        .h(px(28.0))
        .rounded(px(6.0))
        .flex()
        .items_center()
        .justify_center()
        .on_click(on_click)
        .child(
            svg()
                .data(icon)
                .w(px(15.0))
                .h(px(15.0))
                .text_color(if disabled {
                    palette.border_strong
                } else {
                    palette.text_secondary
                }),
        )
}

fn mode_pill(
    id: &'static str,
    icon: &'static [u8],
    label: &'static str,
    active: bool,
    mode: DocViewMode,
    palette: DesktopPalette,
    cx: &mut Context<DesktopShellView>,
) -> ui::Stateful<ui::Div> {
    div()
        .id(id)
        .h(px(26.0))
        .px(px(10.0))
        .rounded(px(6.0))
        .bg(if active {
            palette.bg_elevated
        } else {
            ui::hsla(0.0, 0.0, 0.0, 0.0)
        })
        .flex()
        .flex_row()
        .items_center()
        .gap(px(5.0))
        .text_size(px(12.0))
        .font_weight(if active {
            FontWeight::MEDIUM
        } else {
            FontWeight::NORMAL
        })
        .text_color(if active {
            palette.text_primary
        } else {
            palette.text_muted
        })
        .on_click(cx.listener(move |this, _, _, cx| {
            this.state.split.active_mut().set_mode(mode);
            cx.notify();
        }))
        .child(
            svg()
                .data(icon)
                .w(px(13.0))
                .h(px(13.0))
                .text_color(if active {
                    palette.accent
                } else {
                    palette.text_muted
                }),
        )
        .child(label)
}
