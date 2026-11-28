//! Centered `Settings` modal adhering to iOS 27 `pane_corner = 38pt` geometry
//! (`16pt` edge inset, `22pt` concentric inner cards, `36×36pt` close button),
//! three-state `System / Light / Dark` theme switcher, and independent wheel scrolling.

use ui::{
    Context, FontWeight, InteractiveElement, IntoElement, ParentElement, ScrollEvent,
    StatefulInteractiveElement, Styled, div, px, svg,
};
use ui_tokens::FONT_SANS;

use crate::{
    CLOSE_ICON_SVG, DesktopFlexExt, DesktopPalette,
    doc_store::DesktopDocStore,
    draft_store::{ComposerDraftStore, DesktopDraftBackend},
    state::ThemePreference,
    workbench::DesktopShellView,
};

fn info_row(label: &'static str, value: String, palette: DesktopPalette) -> ui::Div {
    div()
        .flex()
        .flex_row()
        .items_center()
        .justify_between()
        .w_full()
        .py(px(4.0))
        .child(
            div()
                .text_size(px(12.5))
                .text_color(palette.text_muted)
                .child(label),
        )
        .child(
            div()
                .text_size(px(12.5))
                .font_weight(FontWeight::MEDIUM)
                .text_color(palette.text_primary)
                .child(value),
        )
}

fn theme_pill(
    id: &'static str,
    label: &'static str,
    active: bool,
    pref: ThemePreference,
    palette: DesktopPalette,
    cx: &mut Context<DesktopShellView>,
) -> ui::Stateful<ui::Div> {
    div()
        .id(id)
        .h(px(32.0))
        .px(px(14.0))
        .rounded(px(12.0))
        .bg(if active {
            palette.accent
        } else {
            palette.bg_pill
        })
        .flex()
        .items_center()
        .justify_center()
        .text_size(px(12.5))
        .font_weight(FontWeight::MEDIUM)
        .text_color(if active {
            ui::hsla(0.0, 0.0, 1.0, 1.0)
        } else {
            palette.text_primary
        })
        .on_click(cx.listener(move |this, _, _, cx| {
            this.state.set_theme_preference(pref);
            cx.notify();
        }))
        .child(label)
}

/// Render the centered `Settings` modal (Appearance `System/Light/Dark`, Workspace & Local Drafts).
pub(crate) fn render_settings_modal(
    pref: ThemePreference,
    scroll_y: f32,
    store: &DesktopDocStore,
    draft_store: &ComposerDraftStore<DesktopDraftBackend>,
    palette: DesktopPalette,
    cx: &mut Context<DesktopShellView>,
) -> impl IntoElement {
    let ws = store.active_workspace();
    let content = div()
        .flex()
        .flex_col()
        .w_full()
        .gap(px(12.0))
        .mt(px(-scroll_y))
        .child(
            // Concentric inner card: R_inner = 38 - 16 = 22px
            div()
                .flex()
                .flex_col()
                .p(px(18.0))
                .rounded(px(22.0))
                .bg(palette.bg_surface)
                .border_1()
                .border_color(palette.border)
                .gap(px(12.0))
                .child(
                    div()
                        .text_size(px(13.5))
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_color(palette.text_primary)
                        .child("Appearance"),
                )
                .child(
                    div()
                        .flex()
                        .flex_row()
                        .items_center()
                        .justify_between()
                        .child(
                            div()
                                .text_size(px(13.0))
                                .text_color(palette.text_secondary)
                                .child("Color Theme"),
                        )
                        .child(
                            div()
                                .flex()
                                .flex_row()
                                .gap(px(6.0))
                                .child(theme_pill(
                                    "desktop.settings.theme.system",
                                    "System",
                                    pref == ThemePreference::System,
                                    ThemePreference::System,
                                    palette,
                                    cx,
                                ))
                                .child(theme_pill(
                                    "desktop.settings.theme.light",
                                    "Light",
                                    pref == ThemePreference::Light,
                                    ThemePreference::Light,
                                    palette,
                                    cx,
                                ))
                                .child(theme_pill(
                                    "desktop.settings.theme.dark",
                                    "Dark",
                                    pref == ThemePreference::Dark,
                                    ThemePreference::Dark,
                                    palette,
                                    cx,
                                )),
                        ),
                ),
        )
        .child(
            // Concentric inner card: R_inner = 38 - 16 = 22px
            div()
                .flex()
                .flex_col()
                .p(px(18.0))
                .rounded(px(22.0))
                .bg(palette.bg_surface)
                .border_1()
                .border_color(palette.border)
                .gap(px(8.0))
                .child(
                    div()
                        .text_size(px(13.5))
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_color(palette.text_primary)
                        .child("Workspace & Local Drafts"),
                )
                .child(info_row("Active Workspace", ws.name.clone(), palette))
                .child(info_row(
                    "Storage Mode",
                    ws.kind.badge().to_string(),
                    palette,
                ))
                .child(info_row(
                    "Draft Store Namespace",
                    draft_store.namespace().to_string(),
                    palette,
                ))
                .child(info_row(
                    "Local Unpublished Drafts",
                    draft_store.draft_count().to_string(),
                    palette,
                ))
                .child(info_row(
                    "SHA-256 Deduplicated Blobs",
                    draft_store.attachment_count().to_string(),
                    palette,
                )),
        );

    div()
        .id("desktop.settings.backdrop")
        .absolute()
        .top(px(0.0))
        .left(px(0.0))
        .w_full()
        .h_full()
        .bg(palette.scrim)
        .flex()
        .items_center()
        .justify_center()
        .child(
            div()
                .id("desktop.settings.modal")
                .snapshot("desktop.settings.modal", Some("desktop.shell.root"))
                .w(px(640.0))
                .rounded(px(38.0))
                .bg(palette.bg_elevated)
                .border_1()
                .border_color(palette.border_strong)
                .font_family(FONT_SANS)
                .flex()
                .flex_col()
                .p(px(16.0))
                .gap(px(14.0))
                .child(
                    div()
                        .flex()
                        .flex_row()
                        .items_center()
                        .justify_between()
                        .px(px(4.0))
                        .pt(px(4.0))
                        .child(
                            div()
                                .text_size(px(16.0))
                                .font_weight(FontWeight::SEMIBOLD)
                                .text_color(palette.text_primary)
                                .child("Settings"),
                        )
                        .child(
                            div()
                                .id("desktop.settings.close")
                                .snapshot("desktop.settings.close", Some("desktop.settings.modal"))
                                .w(px(36.0))
                                .h(px(36.0))
                                .rounded(px(18.0))
                                .bg(palette.bg_pill)
                                .flex()
                                .items_center()
                                .justify_center()
                                .on_click(cx.listener(|this, _, _, cx| {
                                    this.state.close_modal();
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
                    div()
                        .id("desktop.settings.scroll")
                        .w_full()
                        .h(px(360.0))
                        .overflow_hidden()
                        .on_scroll(cx.listener(|this, event: &ScrollEvent, _, cx| {
                            let dy: f32 = event.delta.pixel_delta(px(20.0)).y.into();
                            this.state.settings_scroll_y =
                                (this.state.settings_scroll_y - dy).clamp(0.0, 240.0);
                            cx.notify();
                        }))
                        .child(content),
                ),
        )
}
