//! iOS 27 compliant read-only `"Record"` bottom detail sheet.
//!
//! Geometry follows `mbui-ui-craft` iOS 27 sheet standards:
//! - Outer top corners `38pt` (`pane_corner = 38pt`) with top grabber pill (`y = 6..11pt`).
//! - Fixed centered Semibold short title `"Record"` + concentric circular close button
//!   (`44x44pt` / `r = 22pt` on Phone, `36x36pt` / `r = 18pt` on Tablet/Desktop).
//! - Full multi-line wrapped record title inside a top concentric card (`r = 22pt`),
//!   followed by current view's visible columns, collapsible `"Hidden fields (N)"`,
//!   and `http(s)://` validated clickable URL values (zero CRDT writeback, zero keyboard).

use std::rc::Rc;

use blocksuite_playground_doc::read::{
    BlockContent, DatabaseCellValue, DatabaseColumn, DatabaseData, DatabaseRow, DatabaseView,
};
use ui::{AnyElement, Context, Window, prelude::*, px};

use crate::{
    PlaygroundView,
    block_flow::{InlineAlign, InlineBaseline, InlineLayout, InlineStyle, layout_inline},
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
    checkbox: Option<bool>,
    progress: Option<(f32, String)>,
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
    let mut checkbox = None;
    let mut progress = None;
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
        ("checkbox", val_opt) => {
            let checked = val_opt
                .and_then(DatabaseCellValue::as_bool)
                .unwrap_or(false);
            checkbox = Some(checked);
            String::new()
        }
        ("progress", Some(v)) => {
            let pct = v.as_i64().unwrap_or(0).clamp(0, 100);
            let (ratio, lbl) = format_database_progress(pct);
            progress = Some((ratio, lbl));
            String::new()
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
        checkbox,
        progress,
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

mod render;

enum PreparedFieldValue {
    Pills {
        rows: Vec<Vec<(String, f32, ui::Hsla, ui::Hsla)>>,
        height: f32,
    },
    Checkbox {
        checked: bool,
    },
    Progress {
        ratio: f32,
        label: String,
    },
    Text {
        layout: Rc<InlineLayout>,
        raw: String,
        url: Option<String>,
        height: f32,
    },
}

struct PreparedFieldRow {
    label_layout: Rc<InlineLayout>,
    label_h: f32,
    value: PreparedFieldValue,
    row_h: f32,
}

struct PreparedRecordSheet {
    is_phone: bool,
    close_sz: f32,
    sheet_left: f32,
    sheet_top: f32,
    sheet_w: f32,
    sheet_h: f32,
    max_scroll: f32,
    safe_bottom: f32,
    title_raw: String,
    title_inner_w: f32,
    title_h: f32,
    title_card_h: f32,
    title_layout: Rc<InlineLayout>,
    value_w: f32,
    visible_rows: Vec<PreparedFieldRow>,
    hidden_rows: Vec<PreparedFieldRow>,
    hidden_expanded: bool,
    scroll_y: f32,
}

fn inline_canvas(layout: Rc<InlineLayout>, w: f32, h: f32) -> AnyElement {
    ui::canvas(
        |_, _, _| {},
        move |bounds, _, window, cx| {
            layout.paint(bounds.origin, window, cx);
        },
    )
    .w(px(w))
    .h(px(h))
    .flex_none()
    .into_any_element()
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

    /// Clear the open record sheet if its target database block or row no longer exists in the
    /// latest document snapshot (e.g. after a remote collaborator delete or Undo).
    pub(crate) fn sync_database_record_sheet_from_snapshot(&mut self) -> bool {
        let Some(sheet) = self.database_record_sheet.as_ref() else {
            return false;
        };
        let still_exists = self
            .snapshot
            .as_ref()
            .and_then(|s| s.block(&sheet.block_id))
            .is_some_and(|node| {
                matches!(
                    &node.content,
                    BlockContent::Database(db) if db.rows.iter().any(|r| r.row_id == sheet.row_id)
                )
            });
        if !still_exists {
            self.database_record_sheet = None;
            return true;
        }
        false
    }

    /// Single source of truth for laying out and measuring the open `"Record"` sheet.
    /// Every row's wrapped `InlineLayout`, height, and the sheet's `max_scroll` are computed once
    /// here and consumed verbatim by `render_database_record_sheet`.
    fn prepare_record_sheet(
        &self,
        palette: &Palette,
        window: &Window,
    ) -> Option<PreparedRecordSheet> {
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
        let sheet_w = if is_phone {
            win_w.max(280.0)
        } else {
            win_w.min(480.0)
        };
        let sheet_left = ((win_w - sheet_w) * 0.5).max(0.0).round();
        let max_sheet_h = ((win_h - crate::TOPBAR_HEIGHT - 24.0) * 0.78).clamp(240.0, 560.0);
        let safe_bottom = f32::from(window.insets().safe_area.bottom).max(0.0);

        let border_top_h = 1.0_f32;
        let grabber_h = 15.0_f32;
        let header_h = close_sz + 8.0;
        let title_raw = if row.title.plain.trim().is_empty() {
            "Untitled".to_string()
        } else {
            row.title.plain.clone()
        };
        let title_inner_w = (sheet_w - 32.0 - 28.0).max(40.0);
        let title_style = InlineStyle::new(FONT_SANS, 16.0, 600.0, palette.text_primary);
        let title_layout = Rc::new(layout_inline(
            &title_raw,
            &title_style,
            title_inner_w,
            22.0,
            InlineBaseline::At(17.0),
            InlineAlign::Left,
            window,
        ));
        let title_h = title_layout.height().max(22.0).ceil();
        let title_card_h = title_h + 28.0;

        let label_style = InlineStyle::new(
            FONT_SANS,
            TYPOGRAPHY.font_xs_px + 1.0,
            500.0,
            palette.text_secondary,
        );
        let val_style = InlineStyle::new(
            FONT_SANS,
            TYPOGRAPHY.font_sm_px,
            400.0,
            palette.text_primary,
        );
        let url_style = InlineStyle::new(FONT_SANS, TYPOGRAPHY.font_sm_px, 400.0, palette.brand);
        let pill_style = InlineStyle::new(
            FONT_SANS,
            TYPOGRAPHY.font_xs_px,
            500.0,
            palette.text_primary,
        );
        let value_w = (sheet_w - 32.0 - 8.0 - 96.0 - 12.0).max(40.0);

        let prepare_row = |field: &FieldEntry| -> PreparedFieldRow {
            let label_layout = Rc::new(layout_inline(
                &field.label,
                &label_style,
                96.0,
                18.0,
                InlineBaseline::At(14.0),
                InlineAlign::Left,
                window,
            ));
            let label_h = label_layout.height().max(18.0).ceil();
            let (value, value_h) = if let Some(checked) = field.checkbox {
                (PreparedFieldValue::Checkbox { checked }, 20.0)
            } else if let Some((ratio, label)) = &field.progress {
                (
                    PreparedFieldValue::Progress {
                        ratio: *ratio,
                        label: label.clone(),
                    },
                    20.0,
                )
            } else if !field.pills.is_empty() {
                let mut rows: Vec<Vec<(String, f32, ui::Hsla, ui::Hsla)>> = vec![Vec::new()];
                let mut line_x = 0.0_f32;
                for (lbl, bg, ink) in &field.pills {
                    let pw = (layout_inline(
                        lbl,
                        &pill_style,
                        value_w,
                        16.0,
                        InlineBaseline::At(12.0),
                        InlineAlign::Left,
                        window,
                    )
                    .content_width()
                    .ceil()
                        + 16.0)
                        .min(value_w);
                    if line_x > 0.0 && line_x + 6.0 + pw > value_w {
                        rows.push(vec![(lbl.clone(), pw, *bg, *ink)]);
                        line_x = pw;
                    } else {
                        if let Some(cur) = rows.last_mut() {
                            cur.push((lbl.clone(), pw, *bg, *ink));
                        }
                        line_x = if line_x > 0.0 { line_x + 6.0 + pw } else { pw };
                    }
                }
                let h = rows.len() as f32 * 22.0 + rows.len().saturating_sub(1) as f32 * 6.0;
                (PreparedFieldValue::Pills { rows, height: h }, h)
            } else {
                let raw = field
                    .url
                    .as_deref()
                    .unwrap_or(field.value.as_str())
                    .to_string();
                let style = if field.url.is_some() {
                    &url_style
                } else {
                    &val_style
                };
                let layout = Rc::new(layout_inline(
                    &raw,
                    style,
                    value_w,
                    20.0,
                    InlineBaseline::At(15.0),
                    InlineAlign::Left,
                    window,
                ));
                let h = layout.height().max(20.0).ceil();
                (
                    PreparedFieldValue::Text {
                        layout,
                        raw,
                        url: field.url.clone(),
                        height: h,
                    },
                    h,
                )
            };
            let row_h = label_h.max(value_h) + 17.0;
            PreparedFieldRow {
                label_layout,
                label_h,
                value,
                row_h,
            }
        };

        let visible_rows: Vec<PreparedFieldRow> = visible_fields.iter().map(&prepare_row).collect();
        let hidden_rows: Vec<PreparedFieldRow> = hidden_fields.iter().map(&prepare_row).collect();
        let visible_h: f32 = visible_rows.iter().map(|r| r.row_h).sum();
        let hidden_toggle_h = if !hidden_rows.is_empty() {
            10.0 + if is_phone { 44.0 } else { 36.0 }
        } else {
            0.0
        };
        let hidden_rows_h: f32 = if !hidden_rows.is_empty() && sheet.hidden_expanded {
            10.0 + hidden_rows.iter().map(|r| r.row_h).sum::<f32>()
        } else {
            0.0
        };
        let body_total_h =
            title_card_h + 10.0 + visible_h + hidden_toggle_h + hidden_rows_h + 20.0 + safe_bottom;
        let chrome_h = border_top_h + grabber_h + header_h;
        let total_h = chrome_h + body_total_h;
        let sheet_h = total_h.min(max_sheet_h).round();
        let body_viewport_h = (sheet_h - chrome_h).max(0.0);
        let max_scroll = (body_total_h - body_viewport_h).max(0.0).ceil();
        let sheet_top = (win_h - sheet_h).max(0.0).round();

        Some(PreparedRecordSheet {
            is_phone,
            close_sz,
            sheet_left,
            sheet_top,
            sheet_w,
            sheet_h,
            max_scroll,
            safe_bottom,
            title_raw,
            title_inner_w,
            title_h,
            title_card_h,
            title_layout,
            value_w,
            visible_rows,
            hidden_rows,
            hidden_expanded: sheet.hidden_expanded,
            scroll_y: sheet.scroll_y.clamp(0.0, max_scroll).round(),
        })
    }

    /// Exact `(sheet_left, sheet_top, sheet_w, sheet_h, max_scroll)` of the open record sheet,
    /// derived from `prepare_record_sheet` so gestures, scroll, and rendering share one source of truth.
    pub(crate) fn record_sheet_geometry(
        &self,
        window: &Window,
    ) -> Option<(f32, f32, f32, f32, f32)> {
        let p = self.prepare_record_sheet(&self.theme.palette(), window)?;
        Some((
            p.sheet_left,
            p.sheet_top,
            p.sheet_w,
            p.sheet_h,
            p.max_scroll,
        ))
    }
}
