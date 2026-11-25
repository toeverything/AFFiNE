//! Mobile `Settings` view covering all 10 required sections (without `enable_editor_rtl`)
//! with a `>= 44×44pt` back button and interactive preference toggles.

use ui::{
    Context, Direction, InteractiveElement, IntoElement, ParentElement, StatefulInteractiveElement,
    Styled, div, px, svg,
};
use ui_kit::{LogicalStyled, bidi_isolate};

use crate::{
    state::{MobileAppState, MobileBackCoordinator, SettingsGroupId, ThemePreference},
    strings::{MobileLocale, MobileStrings},
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
    state: &MobileAppState,
    viewport_h: f32,
    palette: MobilePalette,
    dir: Direction,
    strings: &'static MobileStrings,
    a11y_bounds: &A11yBoundsMap,
    cx: &mut Context<MobileShellView>,
) -> impl IntoElement {
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
        )
        .child(
            div()
                .px(px(8.0))
                .py(px(3.0))
                .rounded(px(6.0))
                .bg(palette.bg_pill)
                .text_size(px(11.0))
                .text_color(palette.text_secondary)
                .child(strings.about_version_label),
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
            SettingsGroupId::Account => state.settings.account_email.clone(),
            SettingsGroupId::Workspace => state.active_workspace().name.clone(),
            SettingsGroupId::Appearance => theme_label.to_string(),
            SettingsGroupId::Language => state.settings.locale.code().to_string(),
            SettingsGroupId::Editor => format!("{}%", state.settings.editor_font_scale_pct),
            SettingsGroupId::SyncOffline => {
                if state.settings.offline_sync_enabled {
                    "On".to_string()
                } else {
                    "Off".to_string()
                }
            }
            SettingsGroupId::Storage => format!("{} MB", state.settings.cache_size_mb),
            SettingsGroupId::Notifications => {
                if state.settings.push_notifications {
                    "On".to_string()
                } else {
                    "Off".to_string()
                }
            }
            SettingsGroupId::Experimental => {
                format!("{} flags", state.settings.experimental_flags.len())
            }
            SettingsGroupId::About => format!("v{}", state.settings.app_version),
        };
        let display_value = if dir.is_rtl() {
            bidi_isolate(&value)
        } else {
            value
        };

        let mut row = row_dir(dir)
            .id(format!("mobile.settings.group.{idx}"))
            .snapshot(
                format!("mobile.settings.group.{idx}"),
                Some("mobile.shell.root"),
            )
            .w_full()
            .h(px(44.0))
            .flex_shrink(0.0)
            .ps(px(14.0), dir)
            .pe(px(14.0), dir)
            .justify_between()
            .overflow_hidden()
            .on_click(cx.listener(move |this, _, _, cx| {
                match group {
                    SettingsGroupId::Appearance => {
                        this.state.settings.theme_preference =
                            match this.state.settings.theme_preference {
                                ThemePreference::Light => ThemePreference::Dark,
                                ThemePreference::Dark => ThemePreference::System,
                                ThemePreference::System => ThemePreference::Light,
                            };
                    }
                    SettingsGroupId::Language => {
                        this.state.settings.locale = match this.state.settings.locale {
                            MobileLocale::En => MobileLocale::ZhHans,
                            MobileLocale::ZhHans => MobileLocale::Ar,
                            MobileLocale::Ar => MobileLocale::En,
                        };
                    }
                    SettingsGroupId::SyncOffline => {
                        this.state.settings.offline_sync_enabled =
                            !this.state.settings.offline_sync_enabled;
                    }
                    SettingsGroupId::Notifications => {
                        this.state.settings.push_notifications =
                            !this.state.settings.push_notifications;
                    }
                    _ => {}
                }
                cx.notify();
            }))
            .child(
                div()
                    .text_size(px(13.0))
                    .text_color(palette.text_primary)
                    .child(title),
            )
            .child(
                div()
                    .text_size(px(12.0))
                    .text_color(palette.text_secondary)
                    .child(display_value),
            );
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

    div()
        .size_full()
        .flex()
        .flex_col()
        .overflow_hidden()
        .child(header)
        .child(
            div()
                .flex_1()
                .min_h(px(0.0))
                .p(px(if landscape { 12.0 } else { 14.0 }))
                .overflow_hidden()
                .child(body_content),
        )
}
