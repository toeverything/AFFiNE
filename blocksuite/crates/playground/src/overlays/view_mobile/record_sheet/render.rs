//! Rendering for the iOS 27 `"Record"` bottom detail sheet from a single [`PreparedRecordSheet`].

use ui::{
    AnyElement, ClickEvent, Context, FontWeight, MouseButton, SharedString, Window, div,
    prelude::*, px,
};

use crate::{
    PlaygroundView,
    theme::{Palette, TYPOGRAPHY},
};

use super::{PreparedFieldRow, PreparedFieldValue, inline_canvas};

impl PlaygroundView {
    /// Render the iOS 27 `"Record"` bottom detail sheet when open.
    pub(crate) fn render_database_record_sheet(
        &self,
        palette: &Palette,
        window: &Window,
        cx: &mut Context<Self>,
    ) -> Option<AnyElement> {
        let p = self.prepare_record_sheet(palette, window)?;
        let (win_w, win_h) = self.window_size;
        let value_w = p.value_w;

        let render_field_row = |idx: usize, row: &PreparedFieldRow, cx: &mut Context<Self>| {
            let mut row_el = div()
                .w_full()
                .h(px(row.row_h))
                .py(px(8.0))
                .px(px(4.0))
                .border_b_1()
                .border_color(palette.border)
                .flex()
                .items_center()
                .gap(px(12.0))
                .child(
                    div()
                        .flex_none()
                        .w(px(96.0))
                        .h(px(row.label_h))
                        .overflow_hidden()
                        .child(inline_canvas(row.label_layout.clone(), 96.0, row.label_h)),
                );
            match &row.value {
                PreparedFieldValue::Checkbox { checked } => {
                    let icon = crate::theme::IconPaint::named(if *checked {
                        "CheckBoxCheckSolidIcon"
                    } else {
                        "CheckBoxUnIcon"
                    });
                    let color = if *checked {
                        palette.brand
                    } else {
                        palette.icon
                    };
                    row_el = row_el.child(
                        div()
                            .w(px(value_w))
                            .min_w(px(0.0))
                            .h(px(20.0))
                            .flex()
                            .items_center()
                            .snapshot(
                                SharedString::from(format!(
                                    "overlay.database_record_sheet.checkbox.{idx}"
                                )),
                                Some("overlay.database_record_sheet"),
                            )
                            .child(
                                ui::canvas(
                                    |_, _, _| {},
                                    move |bounds, _, window, cx| {
                                        icon.paint(bounds, color, window, cx);
                                    },
                                )
                                .w(px(18.0))
                                .h(px(18.0))
                                .flex_none(),
                            ),
                    );
                }
                PreparedFieldValue::Progress { ratio, label } => {
                    let bar_w = (value_w - 46.0).max(32.0);
                    let fill_w = if *ratio > 0.0 {
                        (bar_w * *ratio).max(4.0)
                    } else {
                        0.0
                    };
                    let mut track = div()
                        .w(px(bar_w))
                        .h(px(8.0))
                        .rounded(px(4.0))
                        .bg(palette.background_secondary)
                        .border_1()
                        .border_color(palette.border)
                        .overflow_hidden();
                    if fill_w > 0.0 {
                        track = track.child(
                            div()
                                .w(px(fill_w))
                                .h(px(8.0))
                                .rounded(px(4.0))
                                .bg(palette.brand),
                        );
                    }
                    row_el = row_el.child(
                        div()
                            .w(px(value_w))
                            .min_w(px(0.0))
                            .h(px(20.0))
                            .flex()
                            .items_center()
                            .gap(px(8.0))
                            .snapshot(
                                SharedString::from(format!(
                                    "overlay.database_record_sheet.progress.{idx}"
                                )),
                                Some("overlay.database_record_sheet"),
                            )
                            .snapshot_text(label.clone())
                            .child(track)
                            .child(
                                div()
                                    .w(px(38.0))
                                    .text_size(px(TYPOGRAPHY.font_xs_px))
                                    .line_height(px(16.0))
                                    .font_weight(FontWeight::MEDIUM)
                                    .text_color(palette.text_secondary)
                                    .child(label.clone()),
                            ),
                    );
                }
                PreparedFieldValue::Pills { rows, height } => {
                    let mut col = div()
                        .w(px(value_w))
                        .min_w(px(0.0))
                        .h(px(*height))
                        .overflow_hidden()
                        .flex()
                        .flex_col()
                        .gap(px(6.0));
                    for pill_row in rows {
                        let mut line = div().h(px(22.0)).flex().items_center().gap(px(6.0));
                        for (lbl, pw, bg, ink) in pill_row {
                            line = line.child(
                                div()
                                    .w(px(*pw))
                                    .h(px(22.0))
                                    .px(px(8.0))
                                    .rounded(px(6.0))
                                    .bg(*bg)
                                    .flex()
                                    .items_center()
                                    .overflow_hidden()
                                    .text_size(px(TYPOGRAPHY.font_xs_px))
                                    .line_height(px(16.0))
                                    .font_weight(FontWeight::MEDIUM)
                                    .text_color(*ink)
                                    .child(lbl.clone()),
                            );
                        }
                        col = col.child(line);
                    }
                    row_el = row_el.child(col);
                }
                PreparedFieldValue::Text {
                    layout,
                    raw,
                    url: Some(valid_url),
                    height,
                } => {
                    let open_url = valid_url.clone();
                    row_el = row_el.child(
                        div()
                            .id(SharedString::from(format!("db-record-url-{idx}")))
                            .w(px(value_w))
                            .min_w(px(0.0))
                            .h(px(*height))
                            .overflow_hidden()
                            .cursor_pointer()
                            .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
                            .on_click(cx.listener(move |this, _: &ClickEvent, _, cx| {
                                this.last_opened_link_url = Some(open_url.clone());
                                cx.open_url(&open_url);
                                cx.notify();
                            }))
                            .snapshot(
                                SharedString::from(format!(
                                    "overlay.database_record_sheet.url.{idx}"
                                )),
                                Some("overlay.database_record_sheet"),
                            )
                            .snapshot_text(raw.clone())
                            .child(inline_canvas(layout.clone(), value_w, *height)),
                    );
                }
                PreparedFieldValue::Text {
                    layout,
                    raw,
                    url: None,
                    height,
                } => {
                    row_el = row_el.child(
                        div()
                            .w(px(value_w))
                            .min_w(px(0.0))
                            .h(px(*height))
                            .overflow_hidden()
                            .snapshot(
                                SharedString::from(format!(
                                    "overlay.database_record_sheet.field.{idx}"
                                )),
                                Some("overlay.database_record_sheet"),
                            )
                            .snapshot_text(raw.clone())
                            .child(inline_canvas(layout.clone(), value_w, *height)),
                    );
                }
            }
            row_el
        };

        let mut body_content = div()
            .w_full()
            .mt(px(-p.scroll_y))
            .px(px(16.0))
            .pb(px(20.0 + p.safe_bottom))
            .flex()
            .flex_col()
            .gap(px(10.0))
            // Top concentric highlight card (`22pt` radius = `38pt - 16pt` padding) for full wrapped title.
            .child(
                div()
                    .w_full()
                    .h(px(p.title_card_h))
                    .p(px(14.0))
                    .rounded(px(22.0))
                    .bg(palette.background_secondary)
                    .overflow_hidden()
                    .snapshot(
                        "overlay.database_record_sheet.title",
                        Some("overlay.database_record_sheet"),
                    )
                    .snapshot_text(p.title_raw.clone())
                    .child(inline_canvas(
                        p.title_layout.clone(),
                        p.title_inner_w,
                        p.title_h,
                    )),
            );

        let mut fields_box = div().w_full().flex().flex_col();
        for (idx, row) in p.visible_rows.iter().enumerate() {
            fields_box = fields_box.child(render_field_row(idx, row, cx));
        }
        body_content = body_content.child(fields_box);

        if !p.hidden_rows.is_empty() {
            let toggle_label = format!("Hidden fields ({})", p.hidden_rows.len());
            let chevron_icon = crate::theme::IconPaint::named(if p.hidden_expanded {
                "ToggleDownIcon"
            } else {
                "ToggleRightIcon"
            });
            let chevron_color = palette.text_secondary;
            let chevron_el = ui::canvas(
                move |_, _, _| {},
                move |bounds, _, window, cx| {
                    chevron_icon.paint(bounds, chevron_color, window, cx);
                },
            )
            .w(px(14.0))
            .h(px(14.0))
            .flex_none();
            body_content = body_content.child(
                div()
                    .id("db-record-hidden-toggle")
                    .w_full()
                    .h(px(if p.is_phone { 44.0 } else { 36.0 }))
                    .px(px(10.0))
                    .rounded(px(14.0))
                    .bg(palette.background_secondary)
                    .flex()
                    .items_center()
                    .gap(px(6.0))
                    .text_size(px(TYPOGRAPHY.font_xs_px + 1.0))
                    .font_weight(FontWeight::MEDIUM)
                    .text_color(palette.text_secondary)
                    .cursor_pointer()
                    .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
                    .on_click(cx.listener(|this, _: &ClickEvent, _, cx| {
                        if let Some(s) = this.database_record_sheet.as_mut() {
                            s.hidden_expanded = !s.hidden_expanded;
                            cx.notify();
                        }
                    }))
                    .snapshot(
                        "overlay.database_record_sheet.hidden_toggle",
                        Some("overlay.database_record_sheet"),
                    )
                    .snapshot_text(toggle_label.clone())
                    .child(chevron_el)
                    .child(toggle_label),
            );
            if p.hidden_expanded {
                let mut hidden_box = div().w_full().flex().flex_col();
                for (idx, row) in p.hidden_rows.iter().enumerate() {
                    hidden_box = hidden_box.child(render_field_row(100 + idx, row, cx));
                }
                body_content = body_content.child(hidden_box);
            }
        }

        let body = div()
            .w_full()
            .flex_1()
            .min_h_0()
            .overflow_hidden()
            .child(body_content);

        let close_btn = div()
            .id("db-record-sheet-close")
            .w(px(p.close_sz))
            .h(px(p.close_sz))
            .rounded(px(p.close_sz * 0.5))
            .bg(palette.background_secondary)
            .border_1()
            .border_color(palette.border)
            .flex()
            .items_center()
            .justify_center()
            .text_size(px(18.0))
            .font_weight(FontWeight::MEDIUM)
            .text_color(palette.text_primary)
            .cursor_pointer()
            .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
            .on_click(cx.listener(|this, _: &ClickEvent, _, cx| {
                this.close_database_record_sheet(cx);
            }))
            .snapshot(
                "overlay.database_record_sheet.close",
                Some("overlay.database_record_sheet"),
            )
            .snapshot_text("Close")
            .child("\u{00D7}");

        let header = div()
            .relative()
            .w_full()
            .h(px(p.close_sz + 8.0))
            .px(px(16.0))
            .flex()
            .items_center()
            .justify_center()
            .child(
                div()
                    .text_size(px(16.0))
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(palette.text_primary)
                    .snapshot(
                        "overlay.database_record_sheet.header",
                        Some("overlay.database_record_sheet"),
                    )
                    .snapshot_text("Record")
                    .child("Record"),
            )
            .child(
                div()
                    .absolute()
                    .right(px(16.0))
                    .top(px(4.0))
                    .child(close_btn),
            );

        let grabber = div()
            .id("db-record-sheet-grabber")
            .w_full()
            .pt(px(6.0))
            .pb(px(4.0))
            .flex()
            .justify_center()
            .on_mouse_down(
                MouseButton::Left,
                cx.listener(|this, event: &ui::MouseDownEvent, _, cx| {
                    cx.stop_propagation();
                    if let Some(s) = this.database_record_sheet.as_mut() {
                        s.grabber_drag_start_y = Some(f32::from(event.position.y));
                    }
                }),
            )
            .child(
                div()
                    .w(px(36.0))
                    .h(px(5.0))
                    .rounded(px(2.5))
                    .bg(palette.text_secondary.opacity(0.32)),
            );

        let mut sheet_el = div()
            .id("database-record-sheet")
            .absolute()
            .left(px(p.sheet_left))
            .bottom(px(0.0))
            .w(px(p.sheet_w))
            .h(px(p.sheet_h))
            .bg(palette.panel)
            .border_t(px(1.0))
            .border_color(palette.border)
            .shadow(
                palette
                    .theme
                    .shadows("--affine-overlay-panel-shadow")
                    .into(),
            )
            .flex()
            .flex_col()
            .occlude()
            .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
            .on_mouse_move(cx.listener(|this, event: &ui::MouseMoveEvent, _, cx| {
                let start_y = this
                    .database_record_sheet
                    .as_ref()
                    .and_then(|s| s.grabber_drag_start_y);
                if let Some(y0) = start_y {
                    if event.pressed_button != Some(MouseButton::Left) {
                        if let Some(s) = this.database_record_sheet.as_mut() {
                            s.grabber_drag_start_y = None;
                        }
                    } else if f32::from(event.position.y) - y0 >= 56.0 {
                        this.close_database_record_sheet(cx);
                    }
                }
            }))
            .on_mouse_up(
                MouseButton::Left,
                cx.listener(|this, event: &ui::MouseUpEvent, _, cx| {
                    if let Some(y0) = this
                        .database_record_sheet
                        .as_mut()
                        .and_then(|s| s.grabber_drag_start_y.take())
                        && f32::from(event.position.y) - y0 >= 56.0
                    {
                        this.close_database_record_sheet(cx);
                    }
                }),
            )
            .on_scroll(
                cx.listener(move |this, event: &ui::ScrollEvent, window, cx| {
                    cx.stop_propagation();
                    this.on_scroll(event, window, cx);
                }),
            )
            .snapshot("overlay.database_record_sheet", Some("root.canvas"))
            .child(grabber)
            .child(header)
            .child(body);
        sheet_el.style().corner_radii.top_left = Some(px(38.0).into());
        sheet_el.style().corner_radii.top_right = Some(px(38.0).into());

        let scrim = div()
            .id("database-record-sheet-scrim")
            .absolute()
            .left(px(0.0))
            .top(px(0.0))
            .w(px(win_w))
            .h(px(win_h))
            .bg(ui::black().opacity(0.32))
            .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
            .on_scroll(|_, _, cx| cx.stop_propagation())
            .on_click(cx.listener(|this, _: &ClickEvent, _, cx| {
                this.close_database_record_sheet(cx);
            }))
            .child(sheet_el);

        Some(scrim.into_any_element())
    }
}
