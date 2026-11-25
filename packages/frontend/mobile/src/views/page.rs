//! Mobile `Page` route (interactive header, real-measured single-line interactive `Breadcrumb`,
//! independent `Backlinks` pill, and RTL-aligned title/body).

use affine_client::{BacklinkCompleteness, BreadcrumbAction, ContextState};
use ui::{
    Context, Direction, Font, Hsla, InteractiveElement, IntoElement, ParentElement,
    StatefulInteractiveElement, Styled, TextRun, Window, div, px, svg,
};
use ui_kit::{
    BreadcrumbBarConfig, BreadcrumbBarLayout, BreadcrumbItem, BreadcrumbItemKind,
    BreadcrumbSlotKind, LogicalStyled, MIN_TOUCH_WIDTH, layout_breadcrumb_bar_with_measurer,
};
use ui_tokens::FONT_SANS;

use crate::{
    state::{MobileAppState, MobileBackCoordinator, MobileSheet},
    strings::MobileStrings,
};

use super::{
    A11yBoundsMap, CHEVRON_DOWN_SVG, CHEVRON_LEFT_SVG, CHEVRON_RIGHT_SVG, MORE_ICON_SVG,
    MobileFlexExt, MobilePalette, MobileShellView, a11y_bounds_probe, a11y_bounds_probe_border,
};

fn row_dir(dir: Direction) -> ui::Div {
    let d = div().flex().flex_row().items_center();
    if dir.is_rtl() {
        d.dir_rtl()
    } else {
        d.dir_ltr()
    }
}

#[allow(clippy::too_many_arguments)]
pub(super) fn render_page(
    state: &mut MobileAppState,
    doc_id: &str,
    viewport_w: f32,
    palette: MobilePalette,
    dir: Direction,
    strings: &'static MobileStrings,
    a11y_bounds: &A11yBoundsMap,
    window: &mut Window,
    cx: &mut Context<MobileShellView>,
) -> (impl IntoElement, Option<BreadcrumbBarLayout>) {
    let locale = state.locale();
    let font_scale = state.font_scale.max(0.5);
    let doc_opt = state.doc_by_id(doc_id).cloned();
    let ws_id = state.active_workspace_id().to_string();
    let derivation = state.derive_breadcrumb();
    let backlinks = state.backlinks_for(doc_id);
    let doc_title = doc_opt
        .as_ref()
        .map(|d| d.display_title(locale))
        .unwrap_or_else(|| strings.doc_not_found_title.to_string());
    let doc_body = doc_opt
        .as_ref()
        .map(|d| d.body_preview.clone())
        .unwrap_or_default();

    let header = row_dir(dir)
        .id("mobile.page.header")
        .snapshot("mobile.page.header", Some("mobile.shell.root"))
        .w_full()
        .h(px(52.0))
        .flex_shrink(0.0)
        .bg(palette.bg_surface)
        .border_b_1()
        .border_color(palette.border)
        .ps(px(8.0), dir)
        .pe(px(8.0), dir)
        .justify_between()
        .child(
            row_dir(dir)
                .id("mobile.page.back_btn")
                .snapshot("mobile.page.back_btn", Some("mobile.shell.root"))
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
                    "mobile.page.back_btn",
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
                        .text_size(px(14.0 * font_scale))
                        .text_color(palette.accent)
                        .child(strings.back_label),
                ),
        )
        .child(
            div()
                .id("mobile.page.more_btn")
                .snapshot("mobile.page.more_btn", Some("mobile.shell.root"))
                .relative()
                .w(px(44.0))
                .h(px(44.0))
                .flex()
                .items_center()
                .justify_center()
                .on_click(cx.listener(|this, _, _, cx| {
                    let t = this.now_ms(cx);
                    this.state.open_sheet_from(
                        MobileSheet::LocationAndTrail,
                        Some("mobile.page.more_btn"),
                        t,
                    );
                    cx.notify();
                }))
                .child(a11y_bounds_probe(
                    "mobile.page.more_btn",
                    a11y_bounds.clone(),
                ))
                .child(
                    svg()
                        .data(MORE_ICON_SVG)
                        .w(px(18.0))
                        .h(px(18.0))
                        .text_color(palette.text_secondary),
                ),
        );

    let mut page_col = div()
        .size_full()
        .flex()
        .flex_col()
        .overflow_hidden()
        .child(header);

    let mut measured_layout = None;
    if !derivation.should_hide_bar_on_mobile && !derivation.crumbs.is_empty() {
        let actions_by_id: std::collections::HashMap<String, BreadcrumbAction> = derivation
            .crumbs
            .iter()
            .map(|c| (c.id.clone(), c.action.clone()))
            .collect();

        let items: Vec<BreadcrumbItem> = derivation
            .crumbs
            .iter()
            .map(|c| {
                let label = if c.is_switcher {
                    match &derivation.context {
                        ContextState::MultiLocation {
                            count,
                            owner_doc_id,
                            owner_doc_title,
                            ..
                        } if owner_doc_id != doc_id => strings.compact_owner_multi_location_label(
                            locale,
                            owner_doc_title,
                            *count,
                        ),
                        ContextState::MultiLocation { count, .. } => {
                            strings.multi_location_label(locale, *count)
                        }
                        _ => c.label.clone(),
                    }
                } else if c.id == "root:trash" {
                    strings.trash.to_string()
                } else if c.id == "root:journals" {
                    strings.tab_journals.to_string()
                } else {
                    c.label.clone()
                };
                BreadcrumbItem {
                    id: c.id.clone(),
                    label,
                    kind: if c.is_current {
                        BreadcrumbItemKind::Current
                    } else if c.is_switcher {
                        BreadcrumbItemKind::Switcher
                    } else {
                        BreadcrumbItemKind::Segment
                    },
                    clickable: !c.is_current,
                }
            })
            .collect();

        let bc_font_size = 13.0 * font_scale;
        let text_system = window.text_system().clone();
        let bc_font = Font {
            family: FONT_SANS.into(),
            ..Font::default()
        };
        let layout = layout_breadcrumb_bar_with_measurer(
            &items,
            &BreadcrumbBarConfig::new(viewport_w, dir).with_font_scale(font_scale),
            |label| {
                let run = TextRun {
                    len: label.len(),
                    font: bc_font.clone(),
                    color: Hsla::default(),
                    background_color: None,
                    underline: None,
                    strikethrough: None,
                };
                let line = text_system.layout_line(label, px(bc_font_size), &[run], None);
                line.width.into()
            },
        );

        let mut bar_row = row_dir(dir)
            .w_full()
            .h(px(layout.height))
            .overflow_hidden()
            .ps(px(12.0), dir)
            .pe(px(12.0), dir);

        for (idx, slot) in layout.slots.iter().enumerate() {
            if idx > 0 {
                bar_row = bar_row.child(
                    div()
                        .w(px(14.0))
                        .h(px(layout.height))
                        .flex_shrink(0.0)
                        .flex()
                        .items_center()
                        .justify_center()
                        .child(
                            svg()
                                .data(CHEVRON_RIGHT_SVG)
                                .mirror_in_rtl(true)
                                .w(px(12.0))
                                .h(px(12.0))
                                .text_color(palette.text_muted),
                        ),
                );
            }

            let is_pill = matches!(
                slot.kind,
                BreadcrumbSlotKind::Ellipsis | BreadcrumbSlotKind::Switcher
            );
            let text_color = if slot.is_current {
                palette.text_primary
            } else {
                palette.text_secondary
            };
            let action = if slot.kind == BreadcrumbSlotKind::Ellipsis {
                BreadcrumbAction::OpenLocationSheet {
                    owner_seq: derivation.chain_head_seq.unwrap_or(0),
                }
            } else {
                actions_by_id
                    .get(&slot.id)
                    .cloned()
                    .unwrap_or(BreadcrumbAction::None)
            };

            let slot_snap_id = format!("mobile.page.breadcrumb.slot.{}", slot.id);
            let slot_a11y_id = format!("breadcrumb.slot.{}", slot.id);
            let trigger_id = slot_a11y_id.clone();
            let mut item_el = div()
                .id(slot_snap_id.clone())
                .snapshot(slot_snap_id, Some("mobile.page.breadcrumb_bar"))
                .relative()
                .w(px(slot.width))
                .h(px(layout.height))
                .min_w(px(MIN_TOUCH_WIDTH))
                .flex_shrink(0.0)
                .overflow_hidden()
                .flex()
                .items_center()
                .justify_center()
                .ps(px(4.0), dir)
                .pe(px(4.0), dir)
                .text_color(text_color)
                .text_size(px(bc_font_size))
                .on_click(cx.listener(move |this, _, _, cx| {
                    if !matches!(action, BreadcrumbAction::None) {
                        let t = this.now_ms(cx);
                        this.state
                            .click_breadcrumb_from(&action, Some(&trigger_id), t);
                        cx.notify();
                    }
                }))
                .child(a11y_bounds_probe(slot_a11y_id, a11y_bounds.clone()));

            if is_pill {
                let mut pill = row_dir(dir)
                    .h(px(28.0))
                    .px(px(8.0))
                    .rounded(px(8.0))
                    .bg(palette.accent_soft)
                    .border_1()
                    .border_color(palette.accent)
                    .justify_center()
                    .gap(px(4.0))
                    .overflow_hidden()
                    .child(slot.display_text.clone());
                if slot.kind == BreadcrumbSlotKind::Switcher {
                    pill = pill.child(
                        svg()
                            .data(CHEVRON_DOWN_SVG)
                            .w(px(12.0))
                            .h(px(12.0))
                            .text_color(text_color),
                    );
                }
                item_el = item_el.child(pill);
            } else {
                item_el = item_el.child(slot.display_text.clone());
            }

            bar_row = bar_row.child(item_el);
        }

        page_col = page_col.child(
            div()
                .id("mobile.page.breadcrumb_bar")
                .snapshot("mobile.page.breadcrumb_bar", Some("mobile.shell.root"))
                .relative()
                .w_full()
                .h(px(45.0))
                .flex_shrink(0.0)
                .bg(palette.bg_surface)
                .border_b_1()
                .border_color(palette.border)
                .overflow_hidden()
                .child(a11y_bounds_probe("app.nav.breadcrumb", a11y_bounds.clone()))
                .child(bar_row),
        );
        measured_layout = Some(layout);
    }

    // Independent Backlinks pill (strictly outside `Navigation("Breadcrumb")`).
    let is_ready = backlinks.completeness == BacklinkCompleteness::Ready;
    let bl_label = strings.backlinks_pill_label(locale, backlinks.items.len(), is_ready);

    let mut body = div()
        .flex_1()
        .min_h(px(0.0))
        .p(px(16.0))
        .flex()
        .flex_col()
        .gap(px(12.0))
        .overflow_hidden();

    if doc_opt.is_none() {
        let not_found_body = div()
            .id("mobile.page.not_found")
            .snapshot("mobile.page.not_found", Some("mobile.shell.root"))
            .flex_1()
            .min_h(px(0.0))
            .p(px(24.0))
            .flex()
            .flex_col()
            .items_center()
            .justify_center()
            .gap(px(12.0))
            .child(
                div()
                    .text_size(px(18.0 * font_scale))
                    .text_color(palette.text_primary)
                    .child(strings.doc_not_found_title),
            )
            .child(
                div()
                    .text_size(px(13.0 * font_scale))
                    .text_color(palette.text_secondary)
                    .child(strings.doc_not_found_body),
            )
            .child(
                div()
                    .id("mobile.page.not_found_back_btn")
                    .snapshot("mobile.page.not_found_back_btn", Some("mobile.shell.root"))
                    .relative()
                    .h(px(44.0))
                    .min_w(px(120.0))
                    .px(px(16.0))
                    .rounded(px(10.0))
                    .bg(palette.accent)
                    .text_color(ui::hsla(0.0, 0.0, 1.0, 1.0))
                    .text_size(px(14.0 * font_scale))
                    .flex()
                    .items_center()
                    .justify_center()
                    .on_click(cx.listener(|this, _, _, cx| {
                        let t = this.now_ms(cx);
                        MobileBackCoordinator::handle_back(&mut this.state, t);
                        cx.notify();
                    }))
                    .child(a11y_bounds_probe(
                        "mobile.page.not_found_back_btn",
                        a11y_bounds.clone(),
                    ))
                    .child(strings.back_label),
            );
        return (page_col.child(not_found_body), measured_layout);
    }

    if derivation.in_trash {
        let scoped = crate::encode_scoped_doc_target(&ws_id, doc_id);
        let restore_ws = ws_id.clone();
        let restore_doc_id = doc_id.to_string();
        let restore_id = format!("mobile.page.trash_restore_btn.{scoped}");
        let delete_ws = ws_id.clone();
        let delete_doc_id = doc_id.to_string();
        let delete_id = format!("mobile.page.trash_delete_btn.{scoped}");
        let delete_trigger = delete_id.clone();

        let restore_btn = div()
            .id(restore_id.clone())
            .snapshot(restore_id.clone(), Some("mobile.shell.root"))
            .relative()
            .h(px(44.0))
            .min_w(px(64.0))
            .px(px(10.0))
            .rounded(px(8.0))
            .bg(palette.bg_surface)
            .border_1()
            .border_color(palette.border)
            .flex()
            .items_center()
            .justify_center()
            .text_size(px(12.0 * font_scale))
            .text_color(palette.text_primary)
            .on_click(cx.listener(move |this, _, _, cx| {
                this.state.restore_doc_scoped(&restore_ws, &restore_doc_id);
                cx.notify();
            }))
            .child(a11y_bounds_probe_border(
                restore_id,
                a11y_bounds.clone(),
                1.0,
            ))
            .child(strings.restore_doc_label);

        let delete_btn = div()
            .id(delete_id.clone())
            .snapshot(delete_id.clone(), Some("mobile.shell.root"))
            .relative()
            .h(px(44.0))
            .min_w(px(88.0))
            .px(px(10.0))
            .rounded(px(8.0))
            .bg(palette.danger)
            .flex()
            .items_center()
            .justify_center()
            .text_size(px(12.0 * font_scale))
            .text_color(ui::hsla(0.0, 0.0, 1.0, 1.0))
            .on_click(cx.listener(move |this, _, _, cx| {
                let t = this.now_ms(cx);
                this.state.request_delete_doc_scoped(
                    &delete_ws,
                    &delete_doc_id,
                    Some(&delete_trigger),
                    t,
                );
                cx.notify();
            }))
            .child(a11y_bounds_probe(delete_id, a11y_bounds.clone()))
            .child(strings.delete_permanently_label);

        let actions = row_dir(dir)
            .gap(px(8.0))
            .child(restore_btn)
            .child(delete_btn);
        let badge = div()
            .text_size(px(12.0 * font_scale))
            .text_color(palette.danger)
            .align_start_for(dir)
            .child(strings.in_trash_badge);
        let banner = if viewport_w >= 360.0 {
            row_dir(dir)
                .id("mobile.page.trash_banner")
                .snapshot("mobile.page.trash_banner", Some("mobile.shell.root"))
                .w_full()
                .p(px(10.0))
                .rounded(px(10.0))
                .bg(palette.danger_soft)
                .justify_between()
                .gap(px(8.0))
                .child(badge)
                .child(actions)
                .into_any_element()
        } else {
            div()
                .id("mobile.page.trash_banner")
                .snapshot("mobile.page.trash_banner", Some("mobile.shell.root"))
                .w_full()
                .p(px(10.0))
                .rounded(px(10.0))
                .bg(palette.danger_soft)
                .flex()
                .flex_col()
                .gap(px(8.0))
                .child(badge)
                .child(actions)
                .into_any_element()
        };
        body = body.child(banner);
    }

    body = body
        .child(
            div()
                .w_full()
                .text_size(px(22.0 * font_scale))
                .text_color(palette.text_primary)
                .align_start_for(dir)
                .child(doc_title),
        )
        .child(
            row_dir(dir)
                .id("mobile.page.backlinks_pill")
                .snapshot("mobile.page.backlinks_pill", Some("mobile.shell.root"))
                .relative()
                .w_full()
                .h(px(44.0))
                .flex_shrink(0.0)
                .rounded(px(10.0))
                .bg(palette.bg_surface)
                .border_1()
                .border_color(palette.border)
                .ps(px(12.0), dir)
                .pe(px(12.0), dir)
                .justify_between()
                .on_click(cx.listener(|this, _, _, cx| {
                    let t = this.now_ms(cx);
                    this.state.open_sheet_from(
                        MobileSheet::Backlinks,
                        Some("page.backlinks.pill"),
                        t,
                    );
                    cx.notify();
                }))
                .child(a11y_bounds_probe_border(
                    "page.backlinks.pill",
                    a11y_bounds.clone(),
                    1.0,
                ))
                .child(
                    div()
                        .text_size(px(13.0 * font_scale))
                        .text_color(palette.accent)
                        .child(bl_label),
                )
                .child(
                    svg()
                        .data(CHEVRON_RIGHT_SVG)
                        .mirror_in_rtl(true)
                        .w(px(14.0))
                        .h(px(14.0))
                        .text_color(palette.text_muted),
                ),
        )
        .child(
            div()
                .w_full()
                .p(px(14.0))
                .rounded(px(12.0))
                .bg(palette.bg_surface)
                .border_1()
                .border_color(palette.border)
                .text_size(px(14.0 * font_scale))
                .text_color(palette.text_secondary)
                .align_start_for(dir)
                .child(doc_body),
        );

    (page_col.child(body), measured_layout)
}
