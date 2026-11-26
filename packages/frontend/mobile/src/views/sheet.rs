//! Closed-form animated mobile bottom sheets (`Location & Trail`, `Backlinks`,
//! and `WorkspaceSelector`) with closing-transition content retention and input release.

use affine_client::{BreadcrumbAction, ContextState, LocationChoice, Origin};
use ui::{
    Context, Direction, Hsla, InteractiveElement, IntoElement, ParentElement,
    StatefulInteractiveElement, Styled, div, px,
};
use ui_kit::LogicalStyled;

use crate::{
    state::{MobileAppState, MobileRoute, MobileSheet},
    strings::MobileStrings,
};

use super::{A11yBoundsMap, MobileFlexExt, MobilePalette, MobileShellView, a11y_bounds_probe};

fn row_dir(dir: Direction) -> ui::Div {
    let d = div().flex().flex_row().items_center();
    if dir.is_rtl() {
        d.dir_rtl()
    } else {
        d.dir_ltr()
    }
}

#[allow(clippy::too_many_arguments)]
pub(super) fn render_active_sheet(
    state: &mut MobileAppState,
    sheet_kind: MobileSheet,
    viewport_h: f32,
    progress: f32,
    accepts_input: bool,
    palette: MobilePalette,
    dir: Direction,
    strings: &'static MobileStrings,
    a11y_bounds: &A11yBoundsMap,
    cx: &mut Context<MobileShellView>,
) -> impl IntoElement {
    let p = progress.clamp(0.0, 1.0);
    let compact = viewport_h < 460.0;
    let title = match sheet_kind {
        MobileSheet::WorkspaceSelector => strings.switch_workspace,
        MobileSheet::LocationAndTrail => strings.location_trail_title,
        MobileSheet::Backlinks => strings.backlinks_label,
        MobileSheet::ConfirmDeleteDoc => strings.confirm_delete_title,
        MobileSheet::None => "",
    };

    let mut content = div().w_full().flex().flex_col().gap(px(10.0));

    match sheet_kind {
        MobileSheet::LocationAndTrail => {
            let derivation = state.derive_breadcrumb();
            let cur_seq = state.history.current().map(|e| e.seq).unwrap_or(0);
            let cur_doc_id = match &state.route {
                MobileRoute::Page(id) => id.clone(),
                _ => String::new(),
            };

            let trail_steps = if derivation.can_return_to_trail {
                &derivation.recoverable_trail
            } else {
                &derivation.trail
            };

            let mut trail_box = div()
                .w_full()
                .rounded(px(10.0))
                .bg(palette.bg_canvas)
                .border_1()
                .border_color(palette.border)
                .flex()
                .flex_col()
                .overflow_hidden();
            for (idx, step) in trail_steps.iter().enumerate() {
                let seq = step.seq;
                let is_cur = step.is_current;
                let trail_id = format!("mobile.sheet.trail.{idx}");
                let mut row = row_dir(dir)
                    .id(trail_id.clone())
                    .snapshot(trail_id.clone(), Some("mobile.sheet.panel"))
                    .relative()
                    .h(px(44.0))
                    .flex_shrink(0.0)
                    .ps(px(12.0), dir)
                    .pe(px(12.0), dir)
                    .justify_between()
                    .child(a11y_bounds_probe(trail_id, a11y_bounds.clone()))
                    .child(
                        div()
                            .text_size(px(13.0))
                            .text_color(if is_cur {
                                palette.accent
                            } else {
                                palette.text_primary
                            })
                            .child(step.title.clone()),
                    );
                if accepts_input {
                    row = row.on_click(cx.listener(move |this, _, _, cx| {
                        let t = this.now_ms(cx);
                        if !is_cur {
                            this.state.click_breadcrumb(
                                &BreadcrumbAction::NavigateHistoryAnchor { anchor_seq: seq },
                                t,
                            );
                        }
                        this.state.close_sheet(t);
                        cx.notify();
                    }));
                }
                if idx > 0 {
                    row = row.border_t(px(1.0)).border_color(palette.border);
                }
                trail_box = trail_box.child(row);
            }

            // If chain head `d0 != cur` has multi-location ambiguity, expose `owner_doc`'s
            // location picker targeting `owner_seq`.
            let owner_multi = match &derivation.context {
                ContextState::MultiLocation {
                    owner_doc_id,
                    owner_doc_title,
                    owner_seq,
                    options,
                    ..
                } if *owner_doc_id != cur_doc_id => {
                    Some((owner_doc_title.clone(), *owner_seq, options.clone()))
                }
                _ => None,
            };

            let mut loc_box = div()
                .w_full()
                .rounded(px(10.0))
                .bg(palette.bg_canvas)
                .border_1()
                .border_color(palette.border)
                .flex()
                .flex_col()
                .overflow_hidden();
            for (idx, opt) in derivation.current_doc_locations.iter().enumerate() {
                let loc = opt.location.clone();
                // Current-document location picker ALWAYS targets `cur_seq`, never `d0.seq`.
                let loc_id = format!("mobile.sheet.loc.{idx}");
                let mut row = row_dir(dir)
                    .id(loc_id.clone())
                    .snapshot(loc_id.clone(), Some("mobile.sheet.panel"))
                    .relative()
                    .h(px(46.0))
                    .flex_shrink(0.0)
                    .ps(px(12.0), dir)
                    .pe(px(12.0), dir)
                    .justify_between()
                    .child(a11y_bounds_probe(loc_id, a11y_bounds.clone()))
                    .child(
                        div()
                            .text_size(px(13.0))
                            .text_color(palette.text_primary)
                            .child(opt.label.clone()),
                    )
                    .child(
                        div()
                            .text_size(px(13.0))
                            .text_color(palette.accent)
                            .child(if opt.selected { "✓" } else { "" }),
                    );
                if accepts_input {
                    row = row.on_click(cx.listener(move |this, _, _, cx| {
                        let t = this.now_ms(cx);
                        this.state.pick_location(
                            cur_seq,
                            Some(LocationChoice::Location(loc.clone())),
                            t,
                        );
                        cx.notify();
                    }));
                }
                if idx > 0 {
                    row = row.border_t(px(1.0)).border_color(palette.border);
                }
                loc_box = loc_box.child(row);
            }

            let mut trail_col = div()
                .flex_1()
                .min_w(px(0.0))
                .flex()
                .flex_col()
                .gap(px(6.0))
                .child(
                    div()
                        .w_full()
                        .text_size(px(12.0))
                        .text_color(palette.text_secondary)
                        .align_start_for(dir)
                        .child(strings.current_trail_heading),
                )
                .child(trail_box);

            let mut owner_col_opt = None;
            if let Some((owner_title, owner_seq, owner_opts)) = owner_multi {
                let mut owner_box = div()
                    .w_full()
                    .rounded(px(10.0))
                    .bg(palette.bg_canvas)
                    .border_1()
                    .border_color(palette.border)
                    .flex()
                    .flex_col()
                    .overflow_hidden();
                for (idx, opt) in owner_opts.into_iter().enumerate() {
                    let loc = opt.location.clone();
                    let owner_id = format!("mobile.sheet.owner_loc.{idx}");
                    let mut row = row_dir(dir)
                        .id(owner_id.clone())
                        .snapshot(owner_id.clone(), Some("mobile.sheet.panel"))
                        .relative()
                        .h(px(44.0))
                        .flex_shrink(0.0)
                        .ps(px(12.0), dir)
                        .pe(px(12.0), dir)
                        .justify_between()
                        .child(a11y_bounds_probe(owner_id, a11y_bounds.clone()))
                        .child(
                            div()
                                .text_size(px(13.0))
                                .text_color(palette.text_primary)
                                .child(opt.label),
                        );
                    if accepts_input {
                        row = row.on_click(cx.listener(move |this, _, _, cx| {
                            let t = this.now_ms(cx);
                            this.state.pick_location(
                                owner_seq,
                                Some(LocationChoice::Location(loc.clone())),
                                t,
                            );
                            cx.notify();
                        }));
                    }
                    if idx > 0 {
                        row = row.border_t(px(1.0)).border_color(palette.border);
                    }
                    owner_box = owner_box.child(row);
                }
                if compact {
                    owner_col_opt = Some(
                        div()
                            .flex_1()
                            .min_w(px(0.0))
                            .flex()
                            .flex_col()
                            .gap(px(6.0))
                            .child(
                                div()
                                    .w_full()
                                    .text_size(px(12.0))
                                    .text_color(palette.text_secondary)
                                    .align_start_for(dir)
                                    .child(owner_title),
                            )
                            .child(owner_box),
                    );
                } else {
                    trail_col = trail_col
                        .child(
                            div()
                                .w_full()
                                .text_size(px(12.0))
                                .text_color(palette.text_secondary)
                                .align_start_for(dir)
                                .child(owner_title),
                        )
                        .child(owner_box);
                }
            }

            let mut loc_col = div()
                .flex_1()
                .min_w(px(0.0))
                .flex()
                .flex_col()
                .gap(px(6.0))
                .child(
                    div()
                        .w_full()
                        .text_size(px(12.0))
                        .text_color(palette.text_secondary)
                        .align_start_for(dir)
                        .child(strings.doc_locations_heading),
                )
                .child(loc_box);

            if derivation.can_return_to_trail {
                let mut btn = div()
                    .id("mobile.sheet.use_trail_btn")
                    .snapshot("mobile.sheet.use_trail_btn", Some("mobile.sheet.panel"))
                    .relative()
                    .w_full()
                    .h(px(44.0))
                    .flex_shrink(0.0)
                    .rounded(px(10.0))
                    .bg(palette.accent)
                    .flex()
                    .items_center()
                    .justify_center()
                    .text_size(px(13.0))
                    .text_color(ui::hsla(0.0, 0.0, 1.0, 1.0))
                    .child(a11y_bounds_probe(
                        "mobile.sheet.use_trail_btn",
                        a11y_bounds.clone(),
                    ))
                    .child(strings.use_trail_action);
                if accepts_input {
                    btn = btn.on_click(cx.listener(move |this, _, _, cx| {
                        let t = this.now_ms(cx);
                        this.state
                            .pick_location(cur_seq, Some(LocationChoice::UseTrail), t);
                        cx.notify();
                    }));
                }
                loc_col = loc_col.child(btn);
            }

            if compact {
                let mut cols = row_dir(dir)
                    .w_full()
                    .gap(px(10.0))
                    .items_start()
                    .child(trail_col);
                if let Some(owner_col) = owner_col_opt {
                    cols = cols.child(owner_col);
                }
                cols = cols.child(loc_col);
                content = content.child(cols);
            } else {
                content = content.child(trail_col).child(loc_col);
            }
        }
        MobileSheet::WorkspaceSelector => {
            let mut ws_box = div()
                .w_full()
                .rounded(px(10.0))
                .bg(palette.bg_canvas)
                .border_1()
                .border_color(palette.border)
                .flex()
                .flex_col()
                .overflow_hidden();
            for (idx, ws) in state.workspaces.iter().enumerate() {
                let selected = idx == state.active_workspace_idx;
                let ws_row_id = format!("mobile.sheet.ws.{}", ws.id);
                let mut row = row_dir(dir)
                    .id(ws_row_id.clone())
                    .snapshot(ws_row_id.clone(), Some("mobile.sheet.panel"))
                    .relative()
                    .h(px(48.0))
                    .flex_shrink(0.0)
                    .ps(px(12.0), dir)
                    .pe(px(12.0), dir)
                    .justify_between()
                    .child(a11y_bounds_probe(ws_row_id, a11y_bounds.clone()))
                    .child(
                        div()
                            .text_size(px(14.0))
                            .text_color(palette.text_primary)
                            .child(ws.name.clone()),
                    )
                    .child(
                        div()
                            .text_size(px(13.0))
                            .text_color(palette.accent)
                            .child(if selected { "✓" } else { "" }),
                    );
                if accepts_input {
                    row = row.on_click(cx.listener(move |this, _, _, cx| {
                        let t = this.now_ms(cx);
                        this.state.select_workspace(idx, t);
                        cx.notify();
                    }));
                }
                if idx > 0 {
                    row = row.border_t(px(1.0)).border_color(palette.border);
                }
                ws_box = ws_box.child(row);
            }
            content = content.child(ws_box);
        }
        MobileSheet::Backlinks => {
            let doc_id = match &state.route {
                MobileRoute::Page(id) => id.clone(),
                _ => String::new(),
            };
            let bl = state.backlinks_for(&doc_id);
            let mut bl_box = div()
                .w_full()
                .rounded(px(10.0))
                .bg(palette.bg_canvas)
                .border_1()
                .border_color(palette.border)
                .flex()
                .flex_col()
                .overflow_hidden();
            for (idx, item) in bl.items.iter().enumerate() {
                let src_id = item.source_doc_id.clone();
                let block_id = item.source_block_id.clone();
                let src_title = state
                    .doc_by_id(&src_id)
                    .map(|d| d.display_title(state.locale()))
                    .unwrap_or_else(|| src_id.clone());
                let bl_id = format!("mobile.sheet.backlink.{idx}");
                let mut row = row_dir(dir)
                    .id(bl_id.clone())
                    .snapshot(bl_id.clone(), Some("mobile.sheet.panel"))
                    .relative()
                    .h(px(46.0))
                    .flex_shrink(0.0)
                    .ps(px(12.0), dir)
                    .pe(px(12.0), dir)
                    .child(a11y_bounds_probe(bl_id, a11y_bounds.clone()))
                    .child(
                        div()
                            .text_size(px(13.0))
                            .text_color(palette.text_primary)
                            .child(src_title),
                    );
                if accepts_input {
                    row = row.on_click(cx.listener(move |this, _, _, cx| {
                        let t = this.now_ms(cx);
                        this.state.close_sheet(t);
                        this.state.open_doc(
                            &src_id,
                            Origin::Backlink {
                                source_doc_id: src_id.clone(),
                                block_id: Some(block_id.clone()),
                            },
                        );
                        cx.notify();
                    }));
                }
                if idx > 0 {
                    row = row.border_t(px(1.0)).border_color(palette.border);
                }
                bl_box = bl_box.child(row);
            }
            content = content.child(bl_box);
        }
        MobileSheet::ConfirmDeleteDoc => {
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
                .child(crate::a11y::a11y_bounds_probe_border(
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

            let confirm_ws = ws_id.clone();
            let confirm_doc = doc_id.clone();
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
                    this.state
                        .delete_doc_permanently_scoped(&confirm_ws, &confirm_doc, t);
                    cx.notify();
                }));
            }

            content = content
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
                );
        }
        MobileSheet::None => {}
    }

    let scrim_bg = Hsla {
        a: palette.scrim.a * p,
        ..palette.scrim
    };

    let mut header_row = row_dir(dir).w_full().h(px(44.0)).justify_between().child(
        div()
            .text_size(px(16.0))
            .text_color(palette.text_primary)
            .child(title),
    );

    if sheet_kind != MobileSheet::ConfirmDeleteDoc {
        let mut done_btn = div()
            .id("mobile.sheet.done_btn")
            .snapshot("mobile.sheet.done_btn", Some("mobile.sheet.panel"))
            .relative()
            .h(px(44.0))
            .min_w(px(44.0))
            .px(px(10.0))
            .flex()
            .items_center()
            .justify_center()
            .text_size(px(14.0))
            .text_color(palette.accent)
            .child(a11y_bounds_probe(
                "mobile.sheet.done_btn",
                a11y_bounds.clone(),
            ))
            .child(strings.close_label);
        if accepts_input {
            done_btn = done_btn.on_click(cx.listener(|this, _, _, cx| {
                let t = this.now_ms(cx);
                this.state.close_sheet(t);
                cx.notify();
            }));
        }
        header_row = header_row.child(done_btn);
    }

    let mut panel = div()
        .id("mobile.sheet.panel")
        .snapshot("mobile.sheet.panel", Some("mobile.sheet.backdrop"))
        .relative()
        .w_full()
        .max_h(px((viewport_h - 24.0).max(180.0)))
        .p(px(if compact { 12.0 } else { 16.0 }))
        .rounded(px(16.0))
        .bg(palette.bg_elevated)
        .border_t(px(1.0))
        .border_color(palette.border)
        .opacity(p)
        .flex()
        .flex_col()
        .gap(px(if compact { 8.0 } else { 12.0 }))
        .overflow_hidden()
        .child(a11y_bounds_probe("app.sheet.dialog", a11y_bounds.clone()))
        .child(
            div().w_full().flex().justify_center().child(
                div()
                    .w(px(36.0))
                    .h(px(4.0))
                    .rounded(px(2.0))
                    .bg(palette.border),
            ),
        )
        .child(header_row)
        .child(content);
    if accepts_input {
        panel = panel.on_click(|_, _, _| {});
    }

    let mut backdrop = div()
        .id("mobile.sheet.backdrop")
        .snapshot("mobile.sheet.backdrop", Some("mobile.shell.root"))
        .absolute()
        .inset_0()
        .bg(scrim_bg)
        .flex()
        .flex_col()
        .justify_end()
        .child(panel);
    if accepts_input {
        backdrop = backdrop.occlude().on_click(cx.listener(|this, _, _, cx| {
            let t = this.now_ms(cx);
            this.state.close_sheet(t);
            cx.notify();
        }));
    }
    backdrop
}
