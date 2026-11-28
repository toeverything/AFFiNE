//! iOS 27 compliant read-only `"Record"` bottom detail sheet.
//!
//! Geometry follows `mbui-ui-craft` iOS 27 sheet standards:
//! - Outer top corners `38pt` (`pane_corner = 38pt`) with top grabber pill (`y = 6..11pt`).
//! - Fixed centered Semibold short title `"Record"` + concentric circular close button
//!   (`44x44pt` / `r = 22pt` on Phone, `36x36pt` / `r = 18pt` on Tablet/Desktop).
//! - Full multi-line wrapped record title inside a top concentric card (`r = 22pt`),
//!   followed by current view's visible columns, collapsible `"Hidden fields (N)"`,
//!   and `http(s)://` validated clickable URL values (zero CRDT writeback, zero keyboard).

use blocksuite_playground_doc::read::{
    BlockContent, DatabaseCellValue, DatabaseColumn, DatabaseData, DatabaseRow, DatabaseView,
};
use ui::{
    AnyElement, ClickEvent, Context, FontWeight, MouseButton, SharedString, Window, div,
    prelude::*, px,
};

use crate::{
    PlaygroundView,
    block_flow::{InlineAlign, InlineBaseline, InlineStyle, layout_inline},
    database::{
        format_database_created_time, format_database_date, format_database_number,
        format_database_progress, resolve_tag_color,
    },
    theme::{FONT_SANS, Palette, TYPOGRAPHY},
};

/// Active read-only database record detail sheet state (view-layer only, zero CRDT writeback).
#[derive(Clone, Debug, PartialEq)]
pub struct DatabaseRecordSheetState {
    pub block_id: String,
    pub row_id: String,
    pub hidden_expanded: bool,
    pub scroll_y: f32,
    pub grabber_drag_start_y: Option<f32>,
    pub touch_body_drag: bool,
    pub scroll_fling: Option<ui::InertialDecay>,
}

struct FieldEntry {
    label: String,
    value: String,
    pills: Vec<(String, ui::Hsla, ui::Hsla)>,
    url: Option<String>,
}

fn validate_http_url(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.starts_with("https://") || trimmed.starts_with("http://") {
        Some(trimmed.to_string())
    } else {
        None
    }
}

fn format_field_entry(
    col: &DatabaseColumn,
    row: &DatabaseRow,
    data: &DatabaseData,
    theme: crate::PlaygroundTheme,
    offset_at: &dyn Fn(i64) -> i32,
) -> FieldEntry {
    let val = data.cells.get(&(row.row_id.clone(), col.id.clone()));
    let mut pills = Vec::new();
    let mut url = None;
    let value = match (col.column_type.as_str(), val) {
        ("select" | "multi-select", Some(v)) => {
            let opts = col.select_options();
            for id in v.as_string_list() {
                let (lbl, clr) = opts
                    .iter()
                    .find(|o| o.id == id || o.value == id)
                    .map_or((id.clone(), "var(--affine-tag-gray)".to_string()), |o| {
                        (o.value.clone(), o.color.clone())
                    });
                let (bg, ink) = resolve_tag_color(&clr, theme);
                pills.push((lbl, bg, ink));
            }
            if pills.is_empty() {
                "-".to_string()
            } else {
                String::new()
            }
        }
        ("checkbox", Some(v)) => {
            if v.as_bool().unwrap_or(false) {
                "Checked".to_string()
            } else {
                "Unchecked".to_string()
            }
        }
        ("progress", Some(v)) => {
            let pct = v.as_i64().unwrap_or(0).clamp(0, 100);
            format_database_progress(pct).1
        }
        ("number", Some(v)) => v
            .as_f64()
            .map(|n| {
                let fmt = col
                    .data
                    .get("format")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or("number");
                let dec = col
                    .data
                    .get("decimal")
                    .and_then(serde_json::Value::as_u64)
                    .map(|d| d as usize);
                format_database_number(n, fmt, dec)
            })
            .unwrap_or_else(|| "-".to_string()),
        ("date", Some(v)) => v
            .as_i64()
            .map(|ts| format_database_date(ts, offset_at(ts)))
            .unwrap_or_else(|| "-".to_string()),
        ("created-time" | "last-edited-time", Some(v)) => v
            .as_i64()
            .map(|ts| format_database_created_time(ts, offset_at(ts)))
            .unwrap_or_else(|| "-".to_string()),
        ("link", Some(v)) => {
            let s = v.as_str().unwrap_or("").trim().to_string();
            url = validate_http_url(&s);
            if s.is_empty() { "-".to_string() } else { s }
        }
        (_, Some(v)) => match v {
            DatabaseCellValue::Null => "-".to_string(),
            DatabaseCellValue::Bool(b) => if *b { "Yes" } else { "No" }.to_string(),
            DatabaseCellValue::Integer(n) => n.to_string(),
            DatabaseCellValue::Number(n) => format!("{n}"),
            DatabaseCellValue::RichText(rt) => {
                if rt.plain.trim().is_empty() {
                    "-".to_string()
                } else {
                    url = validate_http_url(&rt.plain);
                    rt.plain.clone()
                }
            }
            DatabaseCellValue::Text(s) => {
                if s.trim().is_empty() {
                    "-".to_string()
                } else {
                    url = validate_http_url(s);
                    s.clone()
                }
            }
            DatabaseCellValue::MultiSelect(list) => {
                if list.is_empty() {
                    "-".to_string()
                } else {
                    list.join(", ")
                }
            }
            DatabaseCellValue::Json(j) => j.to_string(),
        },
        (_, None) => "-".to_string(),
    };
    FieldEntry {
        label: if col.name.is_empty() {
            col.column_type.clone()
        } else {
            col.name.clone()
        },
        value,
        pills,
        url,
    }
}

fn partition_view_columns<'a>(
    view: Option<&DatabaseView>,
    data: &'a DatabaseData,
) -> (Vec<&'a DatabaseColumn>, Vec<&'a DatabaseColumn>) {
    let mut visible = Vec::new();
    let mut hidden = Vec::new();
    let mut seen = std::collections::BTreeSet::new();

    if let Some(view) = view {
        for vc in &view.columns {
            if vc.id == "title" {
                continue;
            }
            if let Some(col) = data.columns.iter().find(|c| c.id == vc.id) {
                seen.insert(col.id.as_str());
                if vc.hide.unwrap_or(false) {
                    hidden.push(col);
                } else {
                    visible.push(col);
                }
            }
        }
    }
    for col in &data.columns {
        if col.id == "title" || col.column_type == "title" || seen.contains(col.id.as_str()) {
            continue;
        }
        visible.push(col);
    }
    (visible, hidden)
}

impl PlaygroundView {
    /// Open the read-only `"Record"` bottom detail sheet for a database row (zero CRDT writeback).
    pub fn open_database_record_sheet(
        &mut self,
        block_id: impl Into<String>,
        row_id: impl Into<String>,
        cx: &mut Context<Self>,
    ) {
        self.database_record_sheet = Some(DatabaseRecordSheetState {
            block_id: block_id.into(),
            row_id: row_id.into(),
            hidden_expanded: false,
            scroll_y: 0.0,
            grabber_drag_start_y: None,
            touch_body_drag: false,
            scroll_fling: None,
        });
        cx.notify();
    }

    /// Close the read-only `"Record"` bottom detail sheet if open.
    pub fn close_database_record_sheet(&mut self, cx: &mut Context<Self>) -> bool {
        if self.database_record_sheet.take().is_some() {
            cx.notify();
            true
        } else {
            false
        }
    }

    /// Currently open database record sheet state, if any.
    pub fn database_record_sheet(&self) -> Option<&DatabaseRecordSheetState> {
        self.database_record_sheet.as_ref()
    }

    /// Measure the exact `(sheet_left, sheet_top, sheet_w, sheet_h, max_scroll)` of the open
    /// record sheet using real `layout_inline` text metrics so touch gestures, wheel scroll,
    /// and sheet rendering share one source of truth.
    pub(crate) fn record_sheet_geometry(
        &self,
        window: &Window,
    ) -> Option<(f32, f32, f32, f32, f32)> {
        let sheet = self.database_record_sheet.as_ref()?;
        let snapshot = self.snapshot.as_ref()?;
        let BlockContent::Database(db) = &snapshot.block(&sheet.block_id)?.content else {
            return None;
        };
        let row = db.rows.iter().find(|r| r.row_id == sheet.row_id)?;
        let ui_state = self.flow.database_state.state_for(&sheet.block_id);
        let active_view = ui_state
            .active_view_id
            .as_deref()
            .and_then(|id| db.views.iter().find(|v| v.id == id))
            .or_else(|| db.views.first());
        let (visible_cols, hidden_cols) = partition_view_columns(active_view, db);
        let offset_at = self.utc_offset_resolver();
        let visible_fields: Vec<FieldEntry> = visible_cols
            .iter()
            .map(|c| format_field_entry(c, row, db, self.theme, &offset_at))
            .collect();
        let hidden_fields: Vec<FieldEntry> = hidden_cols
            .iter()
            .map(|c| format_field_entry(c, row, db, self.theme, &offset_at))
            .collect();
        let title_text = if row.title.plain.trim().is_empty() {
            "Untitled".to_string()
        } else {
            row.title.plain.clone()
        };
        Some(self.measure_record_sheet_bounds(
            &title_text,
            &visible_fields,
            &hidden_fields,
            sheet.hidden_expanded,
            window,
        ))
    }

    fn measure_record_sheet_bounds(
        &self,
        title_text: &str,
        visible_fields: &[FieldEntry],
        hidden_fields: &[FieldEntry],
        hidden_expanded: bool,
        window: &Window,
    ) -> (f32, f32, f32, f32, f32) {
        let (win_w, win_h) = self.window_size;
        let is_phone = self.form_factor == crate::FormFactor::Phone || win_w < 600.0;
        let close_sz = if is_phone { 44.0_f32 } else { 36.0_f32 };
        let sheet_w = if is_phone {
            win_w.max(280.0)
        } else {
            win_w.min(480.0)
        };
        let sheet_left = ((win_w - sheet_w) * 0.5).max(0.0).round();
        let max_sheet_h = ((win_h - crate::TOPBAR_HEIGHT - 24.0) * 0.78).clamp(240.0, 560.0);
        let safe_bottom = f32::from(window.insets().safe_area.bottom).max(0.0);

        let grabber_h = 15.0_f32;
        let header_h = close_sz + 8.0;
        let title_inner_w = (sheet_w - 32.0 - 28.0).max(40.0);
        let title_style = InlineStyle::new(FONT_SANS, 16.0, 600.0, ui::black());
        let title_h = layout_inline(
            title_text,
            &title_style,
            title_inner_w,
            22.0,
            InlineBaseline::At(17.0),
            InlineAlign::Left,
            window,
        )
        .height()
        .max(22.0)
            + 28.0;

        let label_style =
            InlineStyle::new(FONT_SANS, TYPOGRAPHY.font_xs_px + 1.0, 500.0, ui::black());
        let val_style = InlineStyle::new(FONT_SANS, TYPOGRAPHY.font_sm_px, 400.0, ui::black());
        let pill_style = InlineStyle::new(FONT_SANS, TYPOGRAPHY.font_xs_px, 500.0, ui::black());
        let value_w = (sheet_w - 32.0 - 8.0 - 96.0 - 12.0).max(40.0);

        let measure_row = |field: &FieldEntry| -> f32 {
            let label_h = layout_inline(
                &field.label,
                &label_style,
                96.0,
                18.0,
                InlineBaseline::At(14.0),
                InlineAlign::Left,
                window,
            )
            .height()
            .max(18.0);
            let value_h = if !field.pills.is_empty() {
                let mut rows = 1_usize;
                let mut line_x = 0.0_f32;
                for (lbl, _, _) in &field.pills {
                    let pw = layout_inline(
                        lbl,
                        &pill_style,
                        value_w,
                        16.0,
                        InlineBaseline::At(12.0),
                        InlineAlign::Left,
                        window,
                    )
                    .content_width()
                        + 16.0;
                    if line_x > 0.0 && line_x + 6.0 + pw > value_w {
                        rows += 1;
                        line_x = pw;
                    } else {
                        line_x = if line_x > 0.0 { line_x + 6.0 + pw } else { pw };
                    }
                }
                rows as f32 * 22.0 + (rows.saturating_sub(1)) as f32 * 6.0
            } else {
                let text = field.url.as_deref().unwrap_or(&field.value);
                layout_inline(
                    text,
                    &val_style,
                    value_w,
                    20.0,
                    InlineBaseline::At(15.0),
                    InlineAlign::Left,
                    window,
                )
                .height()
                .max(20.0)
            };
            label_h.max(value_h) + 17.0
        };

        let visible_h: f32 = visible_fields.iter().map(&measure_row).sum();
        let hidden_toggle_h = if !hidden_fields.is_empty() {
            10.0 + if is_phone { 44.0 } else { 36.0 }
        } else {
            0.0
        };
        let hidden_rows_h: f32 = if !hidden_fields.is_empty() && hidden_expanded {
            10.0 + hidden_fields.iter().map(&measure_row).sum::<f32>()
        } else {
            0.0
        };
        let total_h = grabber_h
            + header_h
            + title_h
            + 10.0
            + visible_h
            + hidden_toggle_h
            + hidden_rows_h
            + 20.0
            + safe_bottom
            + 4.0;
        let sheet_h = total_h.min(max_sheet_h).round();
        let max_scroll = (total_h - sheet_h).max(0.0).ceil();
        let sheet_top = (win_h - sheet_h).max(0.0).round();
        (sheet_left, sheet_top, sheet_w, sheet_h, max_scroll)
    }

    /// Render the iOS 27 `"Record"` bottom detail sheet when open.
    pub(crate) fn render_database_record_sheet(
        &self,
        palette: &Palette,
        window: &Window,
        cx: &mut Context<Self>,
    ) -> Option<AnyElement> {
        let sheet = self.database_record_sheet.as_ref()?;
        let snapshot = self.snapshot.as_ref()?;
        let BlockContent::Database(db) = &snapshot.block(&sheet.block_id)?.content else {
            return None;
        };
        let row = db.rows.iter().find(|r| r.row_id == sheet.row_id)?;
        let ui_state = self.flow.database_state.state_for(&sheet.block_id);
        let active_view = ui_state
            .active_view_id
            .as_deref()
            .and_then(|id| db.views.iter().find(|v| v.id == id))
            .or_else(|| db.views.first());
        let (visible_cols, hidden_cols) = partition_view_columns(active_view, db);
        let offset_at = self.utc_offset_resolver();
        let visible_fields: Vec<FieldEntry> = visible_cols
            .iter()
            .map(|c| format_field_entry(c, row, db, self.theme, &offset_at))
            .collect();
        let hidden_fields: Vec<FieldEntry> = hidden_cols
            .iter()
            .map(|c| format_field_entry(c, row, db, self.theme, &offset_at))
            .collect();

        let (win_w, win_h) = self.window_size;
        let is_phone = self.form_factor == crate::FormFactor::Phone || win_w < 600.0;
        let close_sz = if is_phone { 44.0_f32 } else { 36.0_f32 };

        let title_text = if row.title.plain.trim().is_empty() {
            "Untitled".to_string()
        } else {
            row.title.plain.clone()
        };
        let (sheet_left, _, sheet_w, sheet_h, max_scroll) = self.measure_record_sheet_bounds(
            &title_text,
            &visible_fields,
            &hidden_fields,
            sheet.hidden_expanded,
            window,
        );

        let render_field_row = |idx: usize, field: &FieldEntry, cx: &mut Context<Self>| {
            let mut row_el = div()
                .w_full()
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
                        .text_size(px(TYPOGRAPHY.font_xs_px + 1.0))
                        .line_height(px(18.0))
                        .font_weight(FontWeight::MEDIUM)
                        .text_color(palette.text_secondary)
                        .child(field.label.clone()),
                );
            if !field.pills.is_empty() {
                let mut pills_row = div().flex_1().flex().flex_wrap().gap(px(6.0));
                for (lbl, bg, ink) in &field.pills {
                    pills_row = pills_row.child(
                        div()
                            .px(px(8.0))
                            .py(px(3.0))
                            .rounded(px(6.0))
                            .bg(*bg)
                            .text_size(px(TYPOGRAPHY.font_xs_px))
                            .line_height(px(16.0))
                            .font_weight(FontWeight::MEDIUM)
                            .text_color(*ink)
                            .child(lbl.clone()),
                    );
                }
                row_el = row_el.child(pills_row);
            } else if let Some(valid_url) = field.url.clone() {
                let open_url = valid_url.clone();
                row_el = row_el.child(
                    div()
                        .id(SharedString::from(format!("db-record-url-{idx}")))
                        .flex_1()
                        .cursor_pointer()
                        .text_size(px(TYPOGRAPHY.font_sm_px))
                        .line_height(px(20.0))
                        .text_color(palette.brand)
                        .on_mouse_down(MouseButton::Left, |_, _, cx| cx.stop_propagation())
                        .on_click(cx.listener(move |this, _: &ClickEvent, _, cx| {
                            this.last_opened_link_url = Some(open_url.clone());
                            cx.open_url(&open_url);
                            cx.notify();
                        }))
                        .snapshot(
                            SharedString::from(format!("overlay.database_record_sheet.url.{idx}")),
                            Some("overlay.database_record_sheet"),
                        )
                        .snapshot_text(valid_url.clone())
                        .child(valid_url),
                );
            } else {
                row_el = row_el.child(
                    div()
                        .flex_1()
                        .text_size(px(TYPOGRAPHY.font_sm_px))
                        .line_height(px(20.0))
                        .text_color(palette.text_primary)
                        .child(field.value.clone()),
                );
            }
            row_el
        };

        let safe_bottom = f32::from(window.insets().safe_area.bottom).max(0.0);
        let scroll_y = sheet.scroll_y.clamp(0.0, max_scroll).round();

        let mut body_content = div()
            .w_full()
            .mt(px(-scroll_y))
            .px(px(16.0))
            .pb(px(20.0 + safe_bottom))
            .flex()
            .flex_col()
            .gap(px(10.0))
            // Top concentric highlight card (`22pt` radius = `38pt - 16pt` padding) for full wrapped title.
            .child(
                div()
                    .w_full()
                    .p(px(14.0))
                    .rounded(px(22.0))
                    .bg(palette.background_secondary)
                    .text_size(px(16.0))
                    .line_height(px(22.0))
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(palette.text_primary)
                    .snapshot(
                        "overlay.database_record_sheet.title",
                        Some("overlay.database_record_sheet"),
                    )
                    .snapshot_text(title_text.clone())
                    .child(title_text),
            );

        let mut fields_box = div().w_full().flex().flex_col();
        for (idx, field) in visible_fields.iter().enumerate() {
            fields_box = fields_box.child(render_field_row(idx, field, cx));
        }
        body_content = body_content.child(fields_box);

        if !hidden_fields.is_empty() {
            let toggle_label = format!("Hidden fields ({})", hidden_fields.len());
            let chevron_icon = crate::theme::IconPaint::named(if sheet.hidden_expanded {
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
                    .h(px(if is_phone { 44.0 } else { 36.0 }))
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
            if sheet.hidden_expanded {
                let mut hidden_box = div().w_full().flex().flex_col();
                for (idx, field) in hidden_fields.iter().enumerate() {
                    hidden_box = hidden_box.child(render_field_row(100 + idx, field, cx));
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
            .w(px(close_sz))
            .h(px(close_sz))
            .rounded(px(close_sz * 0.5))
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
            .h(px(close_sz + 8.0))
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
            .left(px(sheet_left))
            .bottom(px(0.0))
            .w(px(sheet_w))
            .h(px(sheet_h))
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
            .on_scroll(cx.listener(move |this, event: &ui::ScrollEvent, _, cx| {
                cx.stop_propagation();
                if let Some(s) = this.database_record_sheet.as_mut() {
                    if s.grabber_drag_start_y.is_some() {
                        return;
                    }
                    s.scroll_fling = None;
                    let dy = f32::from(event.delta.pixel_delta(px(crate::SCROLL_LINE)).y);
                    let next = (s.scroll_y - dy).clamp(0.0, max_scroll).round();
                    if (next - s.scroll_y).abs() > 0.5 {
                        s.scroll_y = next;
                        cx.notify();
                    }
                }
            }))
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
