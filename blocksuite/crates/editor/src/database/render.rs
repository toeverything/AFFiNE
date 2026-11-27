//! Shared database block header (title, view tabs, mobile read-only notice) and view dispatcher.

use std::rc::Rc;

use blocksuite_playground_doc::read::{DatabaseData, DatabaseRow, DatabaseView, DatabaseViewMode};
use ui::{Hsla, Window};

use crate::{
    block_flow::{
        CodeScroll, FlowRect, InlineAlign, InlineBaseline, InlineLayout, InlineStyle,
        civil_from_days, layout_inline,
    },
    theme::{FONT_SANS, IconPaint, Palette, PlaygroundTheme, TYPOGRAPHY},
};

use super::{
    DatabaseHitKind, DatabaseHitTarget, DatabaseUiState, InlineAxis,
    MOBILE_DATABASE_READONLY_NOTICE, eval_database_filter, render_calendar, render_kanban,
    render_table, sort_database_rows,
};

/// Paint primitives emitted by the database renderer and converted into `block_flow::Prim`.
#[derive(Clone)]
pub enum DatabasePrim {
    Quad {
        rect: FlowRect,
        fill: Option<Hsla>,
        border: Option<Hsla>,
        radius: f32,
        dashed: bool,
    },
    Text {
        x: f32,
        y: f32,
        layout: Rc<InlineLayout>,
        clip: Option<FlowRect>,
    },
    Icon {
        rect: FlowRect,
        icon: IconPaint,
        color: Hsla,
    },
    Chevron {
        rect: FlowRect,
        collapsed: bool,
        color: Hsla,
    },
}

/// Complete laid-out database block ready to wrap in `BlockBody`.
pub struct DatabaseLayoutOutput {
    pub height: f32,
    pub plain: String,
    pub prims: Vec<DatabasePrim>,
    pub code_scroll: Option<CodeScroll>,
    pub hits: Vec<DatabaseHitTarget>,
}

/// Shared rendering context passed into Table / Kanban / Calendar view painters.
pub(super) struct DbRenderCtx<'a> {
    pub data: &'a DatabaseData,
    pub view: &'a DatabaseView,
    pub rows: &'a [DatabaseRow],
    pub ui_state: &'a DatabaseUiState,
    pub theme: PlaygroundTheme,
    pub palette: Palette,
    pub direction: ui::Direction,
    pub width: f32,
    pub mobile_readonly: bool,
    pub now_ms: i64,
    pub offset_at_ms: &'a dyn Fn(i64) -> i32,
    pub window: &'a Window,
}

impl DbRenderCtx<'_> {
    pub(super) fn inline(
        &self,
        text: &str,
        style: InlineStyle,
        max_width: f32,
        line_height: f32,
        align: InlineAlign,
    ) -> Rc<InlineLayout> {
        Rc::new(layout_inline(
            text,
            &style,
            max_width.max(1.0),
            line_height,
            InlineBaseline::Of(&style),
            align,
            self.window,
        ))
    }

    /// Truncate `text` to fit within `max_width`, appending `…` (trimming trailing whitespace
    /// before `…`) while preserving any outer `\u{2066}...\u{2069}` `BidiIsolation::LtrIsolate`
    /// wrapper.
    pub(super) fn truncate_text(
        &self,
        text: &str,
        style: InlineStyle,
        max_width: f32,
        line_height: f32,
    ) -> (String, Rc<InlineLayout>) {
        let max_width = max_width.max(1.0);
        let full = self.inline(
            text,
            style.clone(),
            f32::MAX,
            line_height,
            InlineAlign::Left,
        );
        if full.content_width() <= max_width + 0.25 {
            return (text.to_string(), full);
        }
        let (is_isolated, inner) = match text
            .strip_prefix('\u{2066}')
            .and_then(|s| s.strip_suffix('\u{2069}'))
        {
            Some(stripped) => (true, stripped),
            None => (false, text),
        };
        let wrap = |candidate: &str| {
            if is_isolated {
                format!("\u{2066}{candidate}\u{2069}")
            } else {
                candidate.to_string()
            }
        };
        let boundaries: Vec<usize> = inner.char_indices().map(|(i, _)| i).collect();
        let (mut lo, mut hi) = (0usize, boundaries.len());
        let mut best_text = wrap("\u{2026}");
        let mut best_layout = self.inline(
            &best_text,
            style.clone(),
            f32::MAX,
            line_height,
            InlineAlign::Left,
        );
        while lo < hi {
            let mid = (lo + hi).div_ceil(2);
            let cut = if mid == boundaries.len() {
                inner.len()
            } else {
                boundaries[mid]
            };
            let prefix = inner[..cut].trim_end();
            let candidate = wrap(&format!("{prefix}\u{2026}"));
            let layout = self.inline(
                &candidate,
                style.clone(),
                f32::MAX,
                line_height,
                InlineAlign::Left,
            );
            if layout.content_width() <= max_width + 0.25 {
                best_text = candidate;
                best_layout = layout;
                lo = mid;
            } else {
                hi = mid - 1;
            }
        }
        (best_text, best_layout)
    }

    pub(super) fn single_line_clipped(
        &self,
        text: &str,
        style: InlineStyle,
        x: f32,
        y: f32,
        max_width: f32,
        line_height: f32,
        align: InlineAlign,
    ) -> DatabasePrim {
        let (_, layout) = self.truncate_text(text, style, max_width, line_height);
        let draw_x = match align {
            InlineAlign::Left => x,
            InlineAlign::Center => x + ((max_width - layout.content_width()).max(0.0) * 0.5),
            InlineAlign::Right => x + (max_width - layout.content_width()).max(0.0),
        };
        DatabasePrim::Text {
            x: draw_x,
            y,
            layout,
            clip: Some(FlowRect::new(x, y, max_width.max(1.0), line_height)),
        }
    }
}

/// Lay out an `affine:database` block with its header, view-switcher tabs, optional mobile
/// read-only banner, and active view (`Table`, `Kanban`, or `Calendar`).
#[allow(clippy::too_many_arguments)]
pub fn layout_database_block(
    data: &DatabaseData,
    ui_state: &DatabaseUiState,
    width: f32,
    theme: PlaygroundTheme,
    direction: ui::Direction,
    mobile_readonly: bool,
    now_ms: i64,
    offset_at_ms: &dyn Fn(i64) -> i32,
    window: &Window,
) -> DatabaseLayoutOutput {
    let palette = theme.palette();
    let axis = InlineAxis::new(direction, width);
    let mut prims = Vec::new();
    let mut hits = Vec::new();

    // Resolve active view (fallback to first view, or synthesize a default Table view).
    let fallback_view = DatabaseView {
        id: "default-table".to_string(),
        name: "Table View".to_string(),
        mode: DatabaseViewMode::Table,
        columns: Vec::new(),
        filter: None,
        sort: None,
        group_by: None,
        group_properties: Vec::new(),
        header: None,
        date: None,
        card: None,
        ui: None,
        extra: Default::default(),
    };
    let active_view = ui_state
        .active_view_id
        .as_deref()
        .and_then(|id| data.views.iter().find(|v| v.id == id))
        .or_else(|| data.views.first())
        .unwrap_or(&fallback_view);

    // 1. Database title row (`databaseTitleRowStyles`).
    let mut y = 8.0_f32;
    let title_text = if data.title.plain.trim().is_empty() {
        "Untitled Database"
    } else {
        data.title.plain.trim()
    };
    let title_style = InlineStyle::new(
        FONT_SANS,
        TYPOGRAPHY.font_base_px + 2.0,
        600.0,
        palette.text_primary,
    );
    let title_align = if direction.is_rtl() {
        InlineAlign::Right
    } else {
        InlineAlign::Left
    };
    let title_layout = Rc::new(layout_inline(
        title_text,
        &title_style,
        (width - 16.0).max(1.0),
        26.0,
        InlineBaseline::Of(&title_style),
        title_align,
        window,
    ));
    prims.push(DatabasePrim::Text {
        x: 8.0,
        y,
        layout: title_layout,
        clip: Some(FlowRect::new(8.0, y, (width - 16.0).max(1.0), 26.0)),
    });
    y += 32.0;

    // 2. View switcher tabs (`Table` / `Kanban` / `Calendar`, zero CRDT writeback).
    let views_to_show: Vec<&DatabaseView> = if data.views.is_empty() {
        vec![active_view]
    } else {
        data.views.iter().collect()
    };
    let tab_h = 28.0_f32;
    let mut tab_cursor = 8.0_f32;
    let tab_gap = 6.0_f32;
    for view in &views_to_show {
        let is_active = view.id == active_view.id;
        let tab_label = if view.name.is_empty() {
            match view.mode {
                DatabaseViewMode::Table => "Table View",
                DatabaseViewMode::Kanban => "Kanban View",
                DatabaseViewMode::Calendar => "Calendar View",
                DatabaseViewMode::Unknown(ref s) => s.as_str(),
            }
        } else {
            view.name.as_str()
        };
        let tab_ink = if is_active {
            palette.text_primary
        } else {
            palette.text_secondary
        };
        let tab_style = InlineStyle::new(
            FONT_SANS,
            TYPOGRAPHY.font_xs_px + 1.0,
            if is_active { 500.0 } else { 400.0 },
            tab_ink,
        );
        let measured = layout_inline(
            tab_label,
            &tab_style,
            f32::MAX,
            tab_h,
            InlineBaseline::Of(&tab_style),
            InlineAlign::Left,
            window,
        );
        let max_tab_w = (width - 16.0).clamp(64.0, 180.0);
        let tab_w = (measured.content_width().ceil() + 34.0).clamp(64.0, max_tab_w);
        if tab_cursor + tab_w > width - 8.0 && tab_cursor > 8.0 {
            // Wrap tabs cleanly on narrow mobile viewports instead of overflowing.
            tab_cursor = 8.0;
            y += tab_h + 4.0;
        }
        let logical_rect = FlowRect::new(tab_cursor, y, tab_w, tab_h);
        let visual_rect = axis.map_rect(logical_rect);
        prims.push(DatabasePrim::Quad {
            rect: visual_rect,
            fill: Some(if is_active {
                palette.hover
            } else {
                palette.background_secondary
            }),
            border: Some(if is_active {
                palette.brand.opacity(0.6)
            } else {
                palette.border
            }),
            radius: 6.0,
            dashed: false,
        });
        let icon_name = match view.mode {
            DatabaseViewMode::Table => "SquareIcon",
            DatabaseViewMode::Kanban => "FrameIcon",
            DatabaseViewMode::Calendar => "PageIcon",
            DatabaseViewMode::Unknown(_) => "SquareIcon",
        };
        let icon_x = if direction.is_rtl() {
            visual_rect.right() - 22.0
        } else {
            visual_rect.x + 8.0
        };
        prims.push(DatabasePrim::Icon {
            rect: FlowRect::new(icon_x, visual_rect.y + 7.0, 14.0, 14.0),
            icon: IconPaint::named(icon_name),
            color: if is_active {
                palette.brand
            } else {
                palette.icon
            },
        });
        let text_x = if direction.is_rtl() {
            visual_rect.x + 8.0
        } else {
            visual_rect.x + 26.0
        };
        let text_w = (visual_rect.w - 34.0).max(1.0);
        let tab_layout = if measured.content_width() <= text_w + 0.25 {
            Rc::new(measured)
        } else {
            let dummy_ctx = DbRenderCtx {
                data,
                view: active_view,
                rows: &[],
                ui_state,
                theme,
                palette,
                direction,
                width,
                mobile_readonly,
                now_ms,
                offset_at_ms,
                window,
            };
            dummy_ctx
                .truncate_text(tab_label, tab_style, text_w, tab_h)
                .1
        };
        prims.push(DatabasePrim::Text {
            x: text_x,
            y: visual_rect.y,
            layout: tab_layout,
            clip: Some(FlowRect::new(text_x, visual_rect.y, text_w, tab_h)),
        });
        hits.push(DatabaseHitTarget {
            rect: visual_rect,
            kind: DatabaseHitKind::SwitchView {
                view_id: view.id.clone(),
            },
            scrolls_x: false,
        });
        tab_cursor += tab_w + tab_gap;
    }
    y += tab_h + 10.0;

    // 3. Optional mobile read-only notice banner.
    if mobile_readonly && ui_state.mobile_readonly_notice {
        let banner_h = 34.0;
        let banner_rect = FlowRect::new(8.0, y, (width - 16.0).max(1.0), banner_h);
        let warn_bg = theme
            .css_var("--affine-v2-layer-background-error")
            .or_else(|| theme.css_var("--affine-tag-yellow"))
            .unwrap_or(palette.background_secondary);
        prims.push(DatabasePrim::Quad {
            rect: banner_rect,
            fill: Some(warn_bg),
            border: Some(palette.border),
            radius: 6.0,
            dashed: false,
        });
        let notice_style = InlineStyle::new(
            FONT_SANS,
            TYPOGRAPHY.font_xs_px,
            500.0,
            palette.text_primary,
        );
        let notice_layout = Rc::new(layout_inline(
            MOBILE_DATABASE_READONLY_NOTICE,
            &notice_style,
            (banner_rect.w - 16.0).max(1.0),
            16.0,
            InlineBaseline::Of(&notice_style),
            title_align,
            window,
        ));
        let notice_h = (notice_layout.height() + 12.0).max(banner_h);
        if let Some(DatabasePrim::Quad { rect, .. }) = prims.last_mut() {
            rect.h = notice_h;
        }
        prims.push(DatabasePrim::Text {
            x: banner_rect.x + 8.0,
            y: banner_rect.y + 6.0,
            layout: notice_layout,
            clip: Some(FlowRect::new(
                banner_rect.x + 8.0,
                banner_rect.y + 4.0,
                (banner_rect.w - 16.0).max(1.0),
                notice_h - 8.0,
            )),
        });
        y += notice_h + 8.0;
    }

    // 4. Filter and sort rows for the active view.
    let filtered_rows: Vec<DatabaseRow> = data
        .rows
        .iter()
        .filter(|row| {
            active_view
                .filter
                .as_ref()
                .is_none_or(|f| eval_database_filter(f, data, row))
        })
        .cloned()
        .collect();
    let ordered_rows = sort_database_rows(&filtered_rows, active_view.sort.as_ref(), data);

    let ctx = DbRenderCtx {
        data,
        view: active_view,
        rows: &ordered_rows,
        ui_state,
        theme,
        palette,
        direction,
        width,
        mobile_readonly,
        now_ms,
        offset_at_ms,
        window,
    };

    // 5. Render active view content starting at `y`.
    let content_top = y;
    let (content_h, content_max_x, view_prims, view_hits) = match active_view.mode {
        DatabaseViewMode::Table => render_table::render_table_view(&ctx, content_top),
        DatabaseViewMode::Kanban => render_kanban::render_kanban_view(&ctx, content_top),
        DatabaseViewMode::Calendar => render_calendar::render_calendar_view(&ctx, content_top),
        DatabaseViewMode::Unknown(_) => render_table::render_table_view(&ctx, content_top),
    };

    let total_height = (content_top + content_h + 10.0).ceil();
    // Outer database container card (`databaseBlockStyles`).
    prims.insert(
        0,
        DatabasePrim::Quad {
            rect: FlowRect::new(0.0, 0.0, width, total_height),
            fill: Some(palette.background),
            border: Some(palette.border),
            radius: 8.0,
            dashed: false,
        },
    );
    prims.extend(view_prims);
    hits.extend(view_hits);

    let initial_x = if direction.is_rtl() && active_view.mode != DatabaseViewMode::Calendar {
        content_max_x
    } else {
        0.0
    };
    let code_scroll = (content_max_x > 0.0).then(|| CodeScroll {
        area: FlowRect::new(8.0, content_top, (width - 16.0).max(1.0), content_h),
        max_x: content_max_x,
        initial_x,
    });

    let active_mode_label = active_view.mode.as_str();
    let (now_y, now_m, _) = civil_from_days(
        (now_ms.saturating_add(i64::from(offset_at_ms(now_ms)) * 60_000)).div_euclid(86_400_000),
    );
    let (cal_y, cal_m) = ui_state.calendar_month.unwrap_or_else(|| {
        let start_col_id = active_view
            .date
            .as_ref()
            .and_then(|d| d.start_column_id.as_deref())
            .filter(|id| {
                data.columns
                    .iter()
                    .any(|c| c.id == *id && c.column_type == "date")
            });
        if let Some(col_id) = start_col_id
            && let Some(first_ts) = ordered_rows.iter().find_map(|row| {
                data.cells
                    .get(&(row.row_id.clone(), col_id.to_string()))
                    .and_then(blocksuite_playground_doc::read::DatabaseCellValue::as_i64)
            })
        {
            let day = (first_ts.saturating_add(i64::from(offset_at_ms(first_ts)) * 60_000))
                .div_euclid(86_400_000);
            let (ey, em, _) = civil_from_days(day);
            (ey as i32, em)
        } else {
            (now_y as i32, now_m)
        }
    });
    let mut plain_parts = vec![format!(
        "{title_text} [{active_mode_label}: {}]",
        active_view.name
    )];
    if active_view.mode == DatabaseViewMode::Calendar {
        plain_parts.push(format!("{cal_y:04}-{cal_m:02}"));
    }
    if mobile_readonly && ui_state.mobile_readonly_notice {
        plain_parts.push(MOBILE_DATABASE_READONLY_NOTICE.to_string());
    }
    for row in &ordered_rows {
        if !row.title.plain.is_empty() {
            plain_parts.push(row.title.plain.clone());
        }
    }

    DatabaseLayoutOutput {
        height: total_height,
        plain: plain_parts.join(" | "),
        prims,
        code_scroll,
        hits,
    }
}
