//! Action-oriented mobile modal sheet bodies (`DocActions` and `ConfirmDeleteDoc`).

use ui::{
    Context, Direction, InteractiveElement, IntoElement, ParentElement, StatefulInteractiveElement,
    Styled, div, px,
};
use ui_kit::LogicalStyled;

use crate::{
    state::{MobileAppState, MobileRoute, MobileSheet},
    strings::MobileStrings,
};

use super::{
    A11yBoundsMap, MobileFlexExt, MobilePalette, MobileShellView, a11y_bounds_probe,
    a11y_bounds_probe_border,
};

fn row_dir(dir: Direction) -> ui::Div {
    let d = div().flex().flex_row().items_center();
    if dir.is_rtl() {
        d.dir_rtl()
    } else {
        d.dir_ltr()
    }
}

pub(super) fn render_doc_actions_content(
    state: &MobileAppState,
    accepts_input: bool,
    palette: MobilePalette,
    dir: Direction,
    strings: &'static MobileStrings,
    a11y_bounds: &A11yBoundsMap,
    cx: &mut Context<MobileShellView>,
) -> ui::AnyElement {
    let ws_id = state.active_workspace_id().to_string();
    let doc_id = match &state.route {
        MobileRoute::Page(id) => id.clone(),
        _ => String::new(),
    };
    let is_fav = state.doc_by_id(&doc_id).is_some_and(|d| d.is_favorite);
    let fav_label = if is_fav {
        strings.remove_from_favorites
    } else {
        strings.add_to_favorites
    };
    let mut actions_box = div()
        .w_full()
        .rounded(px(10.0))
        .bg(palette.bg_canvas)
        .border_1()
        .border_color(palette.border)
        .flex()
        .flex_col()
        .overflow_hidden();

    let fav_ws = ws_id.clone();
    let fav_doc = doc_id.clone();
    let mut fav_row = row_dir(dir)
        .id("mobile.sheet.doc_action.favorite")
        .snapshot(
            "mobile.sheet.doc_action.favorite",
            Some("mobile.sheet.panel"),
        )
        .relative()
        .h(px(48.0))
        .flex_shrink(0.0)
        .ps(px(14.0), dir)
        .pe(px(14.0), dir)
        .justify_between()
        .child(a11y_bounds_probe(
            "mobile.sheet.doc_action.favorite",
            a11y_bounds.clone(),
        ))
        .child(
            div()
                .text_size(px(14.0))
                .text_color(palette.text_primary)
                .child(fav_label),
        );
    if accepts_input {
        fav_row = fav_row.on_click(cx.listener(move |this, _, _, cx| {
            let t = this.now_ms(cx);
            this.state.toggle_favorite_scoped(&fav_ws, &fav_doc);
            this.state.close_sheet(t);
            cx.notify();
        }));
    }
    actions_box = actions_box.child(fav_row);

    let mut loc_row = row_dir(dir)
        .id("mobile.sheet.doc_action.location_trail")
        .snapshot(
            "mobile.sheet.doc_action.location_trail",
            Some("mobile.sheet.panel"),
        )
        .relative()
        .h(px(48.0))
        .flex_shrink(0.0)
        .border_t(px(1.0))
        .border_color(palette.border)
        .ps(px(14.0), dir)
        .pe(px(14.0), dir)
        .justify_between()
        .child(a11y_bounds_probe(
            "mobile.sheet.doc_action.location_trail",
            a11y_bounds.clone(),
        ))
        .child(
            div()
                .text_size(px(14.0))
                .text_color(palette.text_primary)
                .child(strings.location_trail_title),
        );
    if accepts_input {
        loc_row = loc_row.on_click(cx.listener(|this, _, _, cx| {
            let t = this.now_ms(cx);
            this.state.open_sheet_from(
                MobileSheet::LocationAndTrail,
                Some("mobile.page.more_btn"),
                t,
            );
            cx.notify();
        }));
    }
    actions_box = actions_box.child(loc_row);

    let mut trash_row = row_dir(dir)
        .id("mobile.sheet.doc_action.trash")
        .snapshot("mobile.sheet.doc_action.trash", Some("mobile.sheet.panel"))
        .relative()
        .h(px(48.0))
        .flex_shrink(0.0)
        .border_t(px(1.0))
        .border_color(palette.border)
        .ps(px(14.0), dir)
        .pe(px(14.0), dir)
        .justify_between()
        .child(a11y_bounds_probe(
            "mobile.sheet.doc_action.trash",
            a11y_bounds.clone(),
        ))
        .child(
            div()
                .text_size(px(14.0))
                .text_color(palette.danger)
                .child(strings.move_to_trash),
        );
    if accepts_input {
        trash_row = trash_row.on_click(cx.listener(move |this, _, _, cx| {
            let t = this.now_ms(cx);
            this.state.move_doc_to_trash_scoped(&ws_id, &doc_id, t);
            cx.notify();
        }));
    }
    actions_box.child(trash_row).into_any_element()
}

pub(super) fn render_confirm_delete_content(
    state: &MobileAppState,
    accepts_input: bool,
    palette: MobilePalette,
    dir: Direction,
    strings: &'static MobileStrings,
    a11y_bounds: &A11yBoundsMap,
    cx: &mut Context<MobileShellView>,
) -> ui::AnyElement {
    let (ws_id, doc_id) = state
        .pending_delete_target
        .clone()
        .unwrap_or_else(|| (state.active_workspace_id().to_string(), String::new()));
    let doc_title = state
        .doc_by_id(&doc_id)
        .map(|d| d.display_title(state.locale()))
        .unwrap_or_else(|| doc_id.clone());
    let scoped = crate::encode_scoped_doc_target(&ws_id, &doc_id);
    let cancel_id = format!("app.sheet.delete_cancel.{scoped}");
    let confirm_id = format!("app.sheet.delete_confirm.{scoped}");

    let mut cancel_btn = div()
        .id(cancel_id.clone())
        .snapshot(cancel_id.clone(), Some("mobile.sheet.panel"))
        .relative()
        .flex_1()
        .h(px(44.0))
        .min_w(px(44.0))
        .rounded(px(10.0))
        .bg(palette.bg_canvas)
        .border_1()
        .border_color(palette.border)
        .flex()
        .items_center()
        .justify_center()
        .text_size(px(14.0))
        .text_color(palette.text_primary)
        .child(a11y_bounds_probe_border(
            cancel_id,
            a11y_bounds.clone(),
            1.0,
        ))
        .child(strings.cancel_label);
    if accepts_input {
        cancel_btn = cancel_btn.on_click(cx.listener(|this, _, _, cx| {
            let t = this.now_ms(cx);
            this.state.close_sheet(t);
            cx.notify();
        }));
    }

    let mut confirm_btn = div()
        .id(confirm_id.clone())
        .snapshot(confirm_id.clone(), Some("mobile.sheet.panel"))
        .relative()
        .flex_1()
        .h(px(44.0))
        .min_w(px(44.0))
        .rounded(px(10.0))
        .bg(palette.danger)
        .flex()
        .items_center()
        .justify_center()
        .text_size(px(14.0))
        .text_color(ui::hsla(0.0, 0.0, 1.0, 1.0))
        .child(a11y_bounds_probe(confirm_id, a11y_bounds.clone()))
        .child(strings.delete_permanently_label);
    if accepts_input {
        confirm_btn = confirm_btn.on_click(cx.listener(move |this, _, _, cx| {
            let t = this.now_ms(cx);
            this.state.delete_doc_permanently_scoped(&ws_id, &doc_id, t);
            cx.notify();
        }));
    }

    div()
        .w_full()
        .flex()
        .flex_col()
        .gap(px(10.0))
        .child(
            div()
                .w_full()
                .p(px(12.0))
                .rounded(px(10.0))
                .bg(palette.bg_canvas)
                .border_1()
                .border_color(palette.border)
                .flex()
                .flex_col()
                .gap(px(6.0))
                .child(
                    div()
                        .w_full()
                        .text_size(px(14.0))
                        .text_color(palette.text_primary)
                        .align_start_for(dir)
                        .child(doc_title),
                )
                .child(
                    div()
                        .w_full()
                        .text_size(px(13.0))
                        .text_color(palette.text_secondary)
                        .align_start_for(dir)
                        .child(strings.confirm_delete_body),
                ),
        )
        .child(
            row_dir(dir)
                .w_full()
                .gap(px(10.0))
                .child(cancel_btn)
                .child(confirm_btn),
        )
        .into_any_element()
}
