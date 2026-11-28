//! Shared database block header (title, view tabs, mobile read-only notice) and view dispatcher.

use std::rc::Rc;

use blocksuite_playground_doc::read::{DatabaseData, DatabaseRow, DatabaseView, DatabaseViewMode};
use ui::{Hsla, Window};

use crate::{
    block_flow::{
        CodeScroll, FlowRect, InlineAlign, InlineBaseline, InlineLayout, InlineStyle, layout_inline,
    },
    theme::{FONT_SANS, IconPaint, Palette, PlaygroundTheme, TYPOGRAPHY},
};

use super::{
    DatabaseAuthoringHit, DatabaseHitKind, DatabaseHitTarget, DatabaseUiState, InlineAxis,
    MOBILE_DATABASE_READONLY_NOTICE, eval_database_filter, filter_sort_bar, render_calendar,
    render_kanban, render_table, sort_database_rows,
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
    pub authoring_hits: Vec<DatabaseAuthoringHit>,
    pub view_tabs_scroll_px: i32,
    pub view_tabs_max_scroll_px: i32,
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
    pub form_factor: crate::block_flow::FormFactor,
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
    form_factor: crate::block_flow::FormFactor,
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

    // 2. View switcher tabs (single-row horizontal scroll on Phone/Tablet with fade hint;
    //    inline + `"N More"` overflow dropdown on Desktop). Zero CRDT writeback.
    let views_to_show: Vec<&DatabaseView> = if data.views.is_empty() {
        vec![active_view]
    } else {
        data.views.iter().collect()
    };
    let is_touch = form_factor.is_touch_form_factor();
    let tab_h = if is_touch { 34.0_f32 } else { 28.0_f32 };
    let tab_gap = 6.0_f32;
    let strip_left = 8.0_f32;
    let strip_right = (width - 8.0).max(strip_left + 1.0);
    let strip_w = (strip_right - strip_left).max(1.0);
    let max_tab_w = (width - 16.0).clamp(64.0, 180.0);

    fn tab_label_for(view: &DatabaseView) -> &str {
        if view.name.is_empty() {
            match view.mode {
                DatabaseViewMode::Table => "Table View",
                DatabaseViewMode::Kanban => "Kanban View",
                DatabaseViewMode::Calendar => "Calendar View",
                DatabaseViewMode::Unknown(ref s) => s.as_str(),
            }
        } else {
            view.name.as_str()
        }
    }
    let icon_for = |mode: &DatabaseViewMode| match mode {
        DatabaseViewMode::Table => "SquareIcon",
        DatabaseViewMode::Kanban => "FrameIcon",
        DatabaseViewMode::Calendar => "PageIcon",
        DatabaseViewMode::Unknown(_) => "SquareIcon",
    };

    struct MeasuredTab<'a> {
        view: &'a DatabaseView,
        label: &'a str,
        is_active: bool,
        w: f32,
        layout: Rc<InlineLayout>,
    }

    let mut measured_tabs = Vec::with_capacity(views_to_show.len());
    for view in &views_to_show {
        let is_active = view.id == active_view.id;
        let label = tab_label_for(view);
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
            label,
            &tab_style,
            f32::MAX,
            tab_h,
            InlineBaseline::Of(&tab_style),
            InlineAlign::Left,
            window,
        );
        let tab_w = (measured.content_width().ceil() + 34.0).clamp(64.0, max_tab_w);
        let text_w = (tab_w - 34.0).max(1.0);
        let layout = if measured.content_width() <= text_w + 0.25 {
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
                form_factor,
                width,
                mobile_readonly,
                now_ms,
                offset_at_ms,
                window,
            };
            dummy_ctx.truncate_text(label, tab_style, text_w, tab_h).1
        };
        measured_tabs.push(MeasuredTab {
            view,
            label,
            is_active,
            w: tab_w,
            layout,
        });
    }

    let mut emit_tab =
        |tab: &MeasuredTab<'_>, logical_x: f32, row_y: f32, clip_strip: Option<FlowRect>| {
            let logical_rect = FlowRect::new(logical_x, row_y, tab.w, tab_h);
            let visual_rect = axis.map_rect(logical_rect);
            if let Some(clip) = clip_strip {
                if visual_rect.right() <= clip.x || visual_rect.x >= clip.right() {
                    return;
                }
            }
            let draw_rect = if let Some(clip) = clip_strip {
                let x0 = visual_rect.x.max(clip.x);
                let x1 = visual_rect.right().min(clip.right());
                FlowRect::new(x0, visual_rect.y, (x1 - x0).max(0.0), visual_rect.h)
            } else {
                visual_rect
            };
            prims.push(DatabasePrim::Quad {
                rect: draw_rect,
                fill: Some(if tab.is_active {
                    palette.hover
                } else {
                    palette.background_secondary
                }),
                border: Some(if tab.is_active {
                    palette.brand.opacity(0.6)
                } else {
                    palette.border
                }),
                radius: 6.0,
                dashed: false,
            });
            let icon_x = if direction.is_rtl() {
                visual_rect.right() - 22.0
            } else {
                visual_rect.x + 8.0
            };
            let icon_visible =
                clip_strip.is_none_or(|c| icon_x >= c.x && icon_x + 14.0 <= c.right());
            if icon_visible {
                prims.push(DatabasePrim::Icon {
                    rect: FlowRect::new(icon_x, visual_rect.y + (tab_h - 14.0) * 0.5, 14.0, 14.0),
                    icon: IconPaint::named(icon_for(&tab.view.mode)),
                    color: if tab.is_active {
                        palette.brand
                    } else {
                        palette.icon
                    },
                });
            }
            let text_x = if direction.is_rtl() {
                visual_rect.x + 8.0
            } else {
                visual_rect.x + 26.0
            };
            let text_w = (visual_rect.w - 34.0).max(1.0);
            let raw_clip = FlowRect::new(text_x, visual_rect.y, text_w, tab_h);
            let text_clip = if let Some(clip) = clip_strip {
                let cx0 = raw_clip.x.max(clip.x);
                let cx1 = raw_clip.right().min(clip.right());
                FlowRect::new(cx0, raw_clip.y, (cx1 - cx0).max(0.0), raw_clip.h)
            } else {
                raw_clip
            };
            if text_clip.w > 1.0 {
                prims.push(DatabasePrim::Text {
                    x: text_x,
                    y: visual_rect.y,
                    layout: tab.layout.clone(),
                    clip: Some(text_clip),
                });
            }
            hits.push(DatabaseHitTarget {
                rect: draw_rect,
                kind: DatabaseHitKind::SwitchView {
                    view_id: tab.view.id.clone(),
                },
                scrolls_x: false,
            });
        };

    let mut overflow_tabs: Vec<usize> = Vec::new();
    let mut view_tabs_scroll_px = 0_i32;
    let mut view_tabs_max_scroll_px = 0_i32;
    if is_touch {
        // Phone / Tablet: single-row horizontal scroll strip with clean clipping;
        // auto-scroll into view runs only when `reveal_active_tab` is set by a view switch
        // so manual horizontal scrolling can freely browse distant inactive tabs.
        let total_w: f32 = measured_tabs.iter().map(|t| t.w).sum::<f32>()
            + measured_tabs.len().saturating_sub(1) as f32 * tab_gap;
        let max_scroll = (total_w - strip_w).max(0.0);
        view_tabs_max_scroll_px = max_scroll.ceil() as i32;
        let mut scroll_x = (ui_state.view_tabs_scroll_px as f32).clamp(0.0, max_scroll);
        if ui_state.reveal_active_tab {
            let mut tab_offset = 0.0_f32;
            for tab in &measured_tabs {
                if tab.is_active {
                    let tab_end = tab_offset + tab.w;
                    if tab_end > scroll_x + strip_w {
                        scroll_x = (tab_end - strip_w).clamp(0.0, max_scroll);
                    } else if tab_offset < scroll_x {
                        scroll_x = tab_offset.clamp(0.0, max_scroll);
                    }
                    break;
                }
                tab_offset += tab.w + tab_gap;
            }
        }
        view_tabs_scroll_px = scroll_x.round() as i32;
        let clip_rect = axis.map_rect(FlowRect::new(strip_left, y, strip_w, tab_h));
        let mut cursor = strip_left - scroll_x;
        for tab in &measured_tabs {
            let tab_right = cursor + tab.w;
            if tab_right > strip_left + 1.0 && cursor < strip_right - 1.0 {
                emit_tab(tab, cursor, y, Some(clip_rect));
            }
            cursor += tab.w + tab_gap;
        }
    } else {
        // Desktop: inline tabs that fit; overflow collapses into `"N More"` button + dropdown.
        let more_reserve = 78.0_f32;
        let mut cursor = strip_left;
        for (idx, tab) in measured_tabs.iter().enumerate() {
            let remaining = measured_tabs.len() - idx - 1;
            let limit = if remaining > 0 {
                strip_right - more_reserve - tab_gap
            } else {
                strip_right
            };
            if cursor + tab.w <= limit || idx == 0 {
                emit_tab(tab, cursor, y, None);
                cursor += tab.w + tab_gap;
            } else {
                overflow_tabs.push(idx);
            }
        }
        if !overflow_tabs.is_empty() {
            let more_label = format!("{} More", overflow_tabs.len());
            let more_w = 72.0_f32.min((strip_right - cursor).max(52.0));
            let more_rect = axis.map_rect(FlowRect::new(cursor, y, more_w, tab_h));
            prims.push(DatabasePrim::Quad {
                rect: more_rect,
                fill: Some(if ui_state.more_views_open {
                    palette.hover
                } else {
                    palette.background_secondary
                }),
                border: Some(palette.border),
                radius: 6.0,
                dashed: false,
            });
            let more_style = InlineStyle::new(
                FONT_SANS,
                TYPOGRAPHY.font_xs_px + 1.0,
                500.0,
                palette.text_secondary,
            );
            let more_layout = Rc::new(layout_inline(
                &more_label,
                &more_style,
                (more_w - 12.0).max(1.0),
                tab_h,
                InlineBaseline::Of(&more_style),
                InlineAlign::Center,
                window,
            ));
            prims.push(DatabasePrim::Text {
                x: more_rect.x + 6.0,
                y: more_rect.y,
                layout: more_layout,
                clip: Some(more_rect),
            });
            hits.push(DatabaseHitTarget {
                rect: more_rect,
                kind: DatabaseHitKind::ToggleMoreViews,
                scrolls_x: false,
            });
        }
    }
    y += tab_h + 10.0;

    if !is_touch && ui_state.more_views_open && !overflow_tabs.is_empty() {
        let menu_w = 180.0_f32.min(strip_w);
        let item_h = 30.0_f32;
        let menu_h = overflow_tabs.len() as f32 * item_h + 8.0;
        let menu_rect = axis.map_rect(FlowRect::new(
            (strip_right - menu_w).max(strip_left),
            y - 4.0,
            menu_w,
            menu_h,
        ));
        prims.push(DatabasePrim::Quad {
            rect: menu_rect,
            fill: Some(palette.panel),
            border: Some(palette.border),
            radius: 8.0,
            dashed: false,
        });
        for (row_idx, &tab_idx) in overflow_tabs.iter().enumerate() {
            let tab = &measured_tabs[tab_idx];
            let item_rect = FlowRect::new(
                menu_rect.x + 4.0,
                menu_rect.y + 4.0 + row_idx as f32 * item_h,
                (menu_rect.w - 8.0).max(1.0),
                item_h,
            );
            if tab.is_active {
                prims.push(DatabasePrim::Quad {
                    rect: item_rect,
                    fill: Some(palette.hover),
                    border: None,
                    radius: 4.0,
                    dashed: false,
                });
            }
            let row_style = InlineStyle::new(
                FONT_SANS,
                TYPOGRAPHY.font_xs_px + 1.0,
                if tab.is_active { 500.0 } else { 400.0 },
                if tab.is_active {
                    palette.text_primary
                } else {
                    palette.text_secondary
                },
            );
            let row_layout = Rc::new(layout_inline(
                tab.label,
                &row_style,
                (item_rect.w - 16.0).max(1.0),
                item_h,
                InlineBaseline::Of(&row_style),
                InlineAlign::Left,
                window,
            ));
            prims.push(DatabasePrim::Text {
                x: item_rect.x + 8.0,
                y: item_rect.y,
                layout: row_layout,
                clip: Some(item_rect),
            });
            hits.push(DatabaseHitTarget {
                rect: item_rect,
                kind: DatabaseHitKind::SwitchView {
                    view_id: tab.view.id.clone(),
                },
                scrolls_x: false,
            });
        }
        y += menu_h + 6.0;
    }

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
        form_factor,
        width,
        mobile_readonly,
        now_ms,
        offset_at_ms,
        window,
    };

    // 4b. Desktop/writable view control bar (Filter / Sort / Group by + active chips + open panel).
    let mut authoring_hits = Vec::new();
    let y =
        filter_sort_bar::render_view_toolbar(&ctx, active_view, y, &mut prims, &mut authoring_hits);

    // 5. Render active view content starting at `y`.
    let content_top = y;
    let (content_h, content_max_x, view_prims, view_hits, view_auth_hits, popover_anchor) =
        match active_view.mode {
            DatabaseViewMode::Table => render_table::render_table_view(&ctx, content_top),
            DatabaseViewMode::Kanban => render_kanban::render_kanban_view(&ctx, content_top),
            DatabaseViewMode::Calendar => render_calendar::render_calendar_view(&ctx, content_top),
            DatabaseViewMode::Unknown(_) => render_table::render_table_view(&ctx, content_top),
        };

    prims.extend(view_prims);
    hits.extend(view_hits);
    authoring_hits.extend(view_auth_hits);

    // 6. Topmost floating popovers (column menu, select/multi-select picker).
    let popover_bottom = super::authoring::render_active_popover(
        &ctx,
        content_top,
        content_h,
        popover_anchor,
        &mut prims,
        &mut authoring_hits,
    );

    let total_height = (popover_bottom + 10.0).ceil();
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

    let initial_x = if direction.is_rtl() && active_view.mode != DatabaseViewMode::Calendar {
        content_max_x
    } else {
        0.0
    };
    let scroll_h = (popover_bottom - content_top).max(content_h);
    let code_scroll = (content_max_x > 0.0).then(|| CodeScroll {
        area: FlowRect::new(8.0, content_top, (width - 16.0).max(1.0), scroll_h),
        max_x: content_max_x,
        initial_x,
    });

    let active_mode_label = active_view.mode.as_str();
    let (cal_y, cal_m) = render_calendar::resolve_calendar_display_month(
        active_view,
        data,
        &ordered_rows,
        ui_state,
        form_factor,
        now_ms,
        offset_at_ms,
    );
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
        authoring_hits,
        view_tabs_scroll_px,
        view_tabs_max_scroll_px,
    }
}
