//! Mobile `Settings` view covering all 10 required sections (without `enable_editor_rtl`)
//! with a `>= 44×44pt` back button and interactive preference toggles.

use ui::{
    Context, Direction, InteractiveElement, IntoElement, ParentElement, StatefulInteractiveElement,
    Styled, div, px, svg,
};
use ui_kit::{LogicalStyled, bidi_isolate};

use crate::{
    state::{
        MobileAppState, MobileBackCoordinator, MobileSheet, SettingRowInteraction, SettingsGroupId,
        ThemePreference,
    },
    strings::MobileStrings,
};

use super::{
    A11yBoundsMap, CHEVRON_LEFT_SVG, MobileFlexExt, MobilePalette, MobileShellView,
    a11y_bounds_probe,
};

fn row_dir(dir: Direction) -> ui::Div {
    let d = div().flex().flex_row().items_center();
    if dir.is_rtl() {
        d.dir_rtl()
    } else {
        d.dir_ltr()
    }
}

pub(super) fn render_settings(
    state: &mut MobileAppState,
    viewport_h: f32,
    palette: MobilePalette,
    dir: Direction,
    strings: &'static MobileStrings,
    a11y_bounds: &A11yBoundsMap,
    cx: &mut Context<MobileShellView>,
) -> impl IntoElement {
    let locale = state.locale();
    let landscape = viewport_h < 520.0;

    let back_btn = row_dir(dir)
        .id("mobile.settings.back_btn")
        .snapshot("mobile.settings.back_btn", Some("mobile.shell.root"))
        .relative()
        .h(px(44.0))
        .min_w(px(64.0))
        .gap(px(4.0))
        .ps(px(4.0), dir)
        .pe(px(8.0), dir)
        .on_click(cx.listener(|this, _, _, cx| {
            let t = this.now_ms(cx);
            MobileBackCoordinator::handle_back(&mut this.state, t);
            cx.notify();
        }))
        .child(a11y_bounds_probe(
            "mobile.settings.back_btn",
            a11y_bounds.clone(),
        ))
        .child(
            svg()
                .data(CHEVRON_LEFT_SVG)
                .mirror_in_rtl(true)
                .w(px(15.0))
                .h(px(15.0))
                .text_color(palette.accent),
        )
        .child(
            div()
                .text_size(px(14.0))
                .text_color(palette.accent)
                .child(strings.back_label),
        );

    let header = row_dir(dir)
        .id("mobile.settings.header")
        .snapshot("mobile.settings.header", Some("mobile.shell.root"))
        .w_full()
        .h(px(52.0))
        .flex_shrink(0.0)
        .bg(palette.bg_surface)
        .border_b_1()
        .border_color(palette.border)
        .ps(px(8.0), dir)
        .pe(px(14.0), dir)
        .justify_between()
        .child(
            row_dir(dir).gap(px(6.0)).child(back_btn).child(
                div()
                    .text_size(px(17.0))
                    .text_color(palette.text_primary)
                    .child(strings.settings_title),
            ),
        );

    let theme_label = match state.settings.theme_preference {
        ThemePreference::Light => strings.theme_light,
        ThemePreference::Dark => strings.theme_dark,
        ThemePreference::System => strings.theme_system,
    };

    let mut rows: Vec<ui::AnyElement> = Vec::with_capacity(SettingsGroupId::ALL.len());
    for (idx, group) in SettingsGroupId::ALL.iter().copied().enumerate() {
        let top_border = if landscape {
            idx != 0 && idx != 5
        } else {
            idx > 0
        };
        let title = strings.settings_groups[idx];
        let value = match group {
            SettingsGroupId::Account => {
                if state.settings.account_email.trim().is_empty() {
                    strings.sign_in_label.to_string()
                } else {
                    state.settings.account_email.clone()
                }
            }
            SettingsGroupId::Workspace => state.active_workspace().summary.name.clone(),
            SettingsGroupId::Appearance => theme_label.to_string(),
            SettingsGroupId::Language => state.settings.locale.display_name().to_string(),
            SettingsGroupId::Editor => format!("{}%", state.settings.editor_font_scale_pct),
            SettingsGroupId::SyncOffline => {
                if state.settings.offline_sync_enabled {
                    strings.toggle_on.to_string()
                } else {
                    strings.toggle_off.to_string()
                }
            }
            SettingsGroupId::Storage => format!("{} MB", state.settings.cache_size_mb),
            SettingsGroupId::Notifications => {
                if state.settings.push_notifications {
                    strings.toggle_on.to_string()
                } else {
                    strings.toggle_off.to_string()
                }
            }
            SettingsGroupId::Experimental => {
                strings.flags_count(locale, state.settings.experimental_flags.len())
            }
            SettingsGroupId::About => {
                format!(
                    "{} v{}",
                    strings.about_version_label, state.settings.app_version
                )
            }
        };
        let display_value = if dir.is_rtl() {
            bidi_isolate(&value)
        } else {
            value
        };

        let interaction = group.interaction();
        let toggle_enabled = match group {
            SettingsGroupId::SyncOffline => state.settings.offline_sync_enabled,
            SettingsGroupId::Notifications => state.settings.push_notifications,
            _ => false,
        };
        let trailing: ui::AnyElement = match interaction {
            SettingRowInteraction::Toggle => div()
                .px(px(10.0))
                .py(px(4.0))
                .rounded(px(999.0))
                .bg(if toggle_enabled {
                    palette.accent
                } else {
                    palette.bg_pill
                })
                .text_size(px(12.0))
                .text_color(if toggle_enabled {
                    ui::hsla(0.0, 0.0, 1.0, 1.0)
                } else {
                    palette.text_secondary
                })
                .child(display_value)
                .into_any_element(),
            SettingRowInteraction::Cycle => div()
                .px(px(10.0))
                .py(px(4.0))
                .rounded(px(8.0))
                .bg(palette.bg_pill)
                .border_1()
                .border_color(palette.border)
                .text_size(px(12.0))
                .text_color(palette.text_primary)
                .child(display_value)
                .into_any_element(),
            SettingRowInteraction::Info => div()
                .text_size(px(12.0))
                .text_color(palette.text_secondary)
                .child(display_value)
                .into_any_element(),
        };

        let row_id = if interaction == SettingRowInteraction::Info {
            format!("mobile.settings.group.{idx}")
        } else {
            format!("mobile.settings.row.{}", group.a11y_key())
        };
        let mut row = row_dir(dir)
            .id(row_id.clone())
            .snapshot(row_id.clone(), Some("mobile.shell.root"))
            .relative()
            .w_full()
            .h(px(44.0))
            .flex_shrink(0.0)
            .ps(px(14.0), dir)
            .pe(px(14.0), dir)
            .justify_between()
            .overflow_hidden()
            .child(
                div()
                    .text_size(px(13.0))
                    .text_color(palette.text_primary)
                    .child(title),
            )
            .child(trailing);
        row = row.child(a11y_bounds_probe(row_id.clone(), a11y_bounds.clone()));
        if interaction != SettingRowInteraction::Info {
            row = row.on_click(cx.listener(move |this, _, _, cx| {
                this.state.activate_setting(group);
                cx.notify();
            }));
        } else if group == SettingsGroupId::Workspace {
            let trigger_id = row_id;
            row = row.on_click(cx.listener(move |this, _, _, cx| {
                let t = this.now_ms(cx);
                this.state
                    .open_sheet_from(MobileSheet::WorkspaceSelector, Some(&trigger_id), t);
                cx.notify();
            }));
        }
        if top_border {
            row = row.border_t(px(1.0)).border_color(palette.border);
        }
        rows.push(row.into_any_element());
    }

    let body_content: ui::AnyElement = if landscape {
        let mut left_col = div()
            .flex_1()
            .min_w(px(0.0))
            .rounded(px(12.0))
            .bg(palette.bg_surface)
            .border_1()
            .border_color(palette.border)
            .flex()
            .flex_col()
            .overflow_hidden();
        let mut right_col = div()
            .flex_1()
            .min_w(px(0.0))
            .rounded(px(12.0))
            .bg(palette.bg_surface)
            .border_1()
            .border_color(palette.border)
            .flex()
            .flex_col()
            .overflow_hidden();
        for (idx, row) in rows.into_iter().enumerate() {
            if idx < 5 {
                left_col = left_col.child(row);
            } else {
                right_col = right_col.child(row);
            }
        }
        row_dir(dir)
            .w_full()
            .gap(px(12.0))
            .items_start()
            .child(left_col)
            .child(right_col)
            .into_any_element()
    } else {
        let mut list = div()
            .w_full()
            .rounded(px(12.0))
            .bg(palette.bg_surface)
            .border_1()
            .border_color(palette.border)
            .flex()
            .flex_col()
            .overflow_hidden();
        for row in rows {
            list = list.child(row);
        }
        list.into_any_element()
    };

    let avail_h = (viewport_h - 52.0).max(44.0);
    let pad = if landscape { 12.0 } else { 14.0 };
    let rows_per_col = if landscape { 5.0 } else { 10.0 };
    let content_h = pad * 2.0 + rows_per_col * 44.0 + 4.0;
    let max_scroll = (content_h - avail_h).max(0.0);
    state.settings_scroll_y = state.settings_scroll_y.clamp(0.0, max_scroll);
    let scroll_y = state.settings_scroll_y;

    div()
        .size_full()
        .flex()
        .flex_col()
        .overflow_hidden()
        .child(header)
        .child(
            div()
                .id("mobile.settings.scroll_viewport")
                .flex_1()
                .min_h(px(0.0))
                .w_full()
                .relative()
                .overflow_hidden()
                .on_scroll(cx.listener(move |this, event: &ui::ScrollEvent, _, cx| {
                    let dy: f32 = event.delta.pixel_delta(px(24.0)).y.into();
                    if dy.abs() > 0.01 {
                        this.state.settings_scroll_y =
                            (this.state.settings_scroll_y - dy).clamp(0.0, max_scroll);
                        cx.notify();
                    }
                }))
                .child(
                    div()
                        .w_full()
                        .mt(px(-scroll_y))
                        .p(px(pad))
                        .child(body_content),
                ),
        )
}
