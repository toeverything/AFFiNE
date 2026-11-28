//! Calendar view authoring helpers for `affine:database`:
//! create a new row pre-populated with a day cell's local midnight timestamp, and reschedule
//! single-day or multi-day events across days while preserving duration.

use blocksuite_playground_doc::{
    DocResult,
    read::{DatabaseCellValue, DatabaseData, DatabaseView},
    schema::DatabaseCellSpec,
    session::PageDocSession,
};

use crate::block_flow::FlowRect;

use super::{
    DatabaseAuthoringHit, DatabaseAuthoringHitKind, local_day_index,
    render::{DatabasePrim, DbRenderCtx},
};

/// Render the desktop writable Calendar day-cell `+` button and drop-target hit regions.
pub(super) fn render_calendar_day_controls(
    ctx: &DbRenderCtx<'_>,
    cell_rect: FlowRect,
    day_index: i64,
    prims: &mut Vec<DatabasePrim>,
    authoring_hits: &mut Vec<DatabaseAuthoringHit>,
) {
    if ctx.mobile_readonly {
        return;
    }
    let plus_x = if ctx.direction.is_rtl() {
        cell_rect.right() - 22.0
    } else {
        cell_rect.x + 4.0
    };
    let plus_rect = FlowRect::new(plus_x, cell_rect.y + 3.0, 18.0, 18.0);
    prims.push(DatabasePrim::Quad {
        rect: plus_rect,
        fill: Some(ctx.palette.background_secondary),
        border: Some(ctx.palette.border),
        radius: 4.0,
        dashed: false,
    });
    prims.push(DatabasePrim::Icon {
        rect: FlowRect::new(plus_rect.x + 3.0, plus_rect.y + 3.0, 12.0, 12.0),
        icon: crate::theme::IconPaint::named("PlusIcon"),
        color: ctx.palette.icon,
    });
    authoring_hits.push(DatabaseAuthoringHit {
        rect: cell_rect,
        kind: DatabaseAuthoringHitKind::CalendarDayDropTarget { day_index },
        scrolls_x: false,
    });
    authoring_hits.push(DatabaseAuthoringHit {
        rect: plus_rect,
        kind: DatabaseAuthoringHitKind::CalendarAddRowOnDay { day_index },
        scrolls_x: false,
    });
}

/// Compute local midnight UTC epoch milliseconds for civil `day_index` using `offset_at_ms`.
pub fn day_index_to_local_midnight_ms(day_index: i64, offset_at_ms: &dyn Fn(i64) -> i32) -> i64 {
    let utc_midnight = day_index.saturating_mul(86_400_000);
    let offset_min = offset_at_ms(utc_midnight);
    utc_midnight.saturating_sub(i64::from(offset_min) * 60_000)
}

/// Resolve `(start_column_id, end_column_id)` for a Calendar view.
pub fn resolve_calendar_date_columns<'a>(
    view: &'a DatabaseView,
    data: &'a DatabaseData,
) -> (Option<&'a str>, Option<&'a str>) {
    let start_col = view
        .date
        .as_ref()
        .and_then(|d| d.start_column_id.as_deref())
        .filter(|id| {
            data.columns
                .iter()
                .any(|c| c.id == *id && c.column_type == "date")
        });
    let end_col = view
        .date
        .as_ref()
        .and_then(|d| d.end_column_id.as_deref())
        .filter(|id| {
            data.columns
                .iter()
                .any(|c| c.id == *id && c.column_type == "date")
        });
    (start_col, end_col)
}

/// Create a new database row on Calendar `day_index` with its mapped `start_column_id`
/// pre-populated to that day's local midnight timestamp in one tracked undo step.
#[allow(clippy::too_many_arguments)]
pub fn create_calendar_row_on_day(
    page: &mut PageDocSession,
    block_id: &str,
    view: &DatabaseView,
    data: &DatabaseData,
    row_id: &str,
    title: &str,
    day_index: i64,
    offset_at_ms: &dyn Fn(i64) -> i32,
    now_ms: u64,
) -> DocResult<bool> {
    let (Some(start_col), _) = resolve_calendar_date_columns(view, data) else {
        return Ok(false);
    };
    let ts_ms = day_index_to_local_midnight_ms(day_index, offset_at_ms);
    let commit = page.add_database_row_with_cells(
        block_id,
        row_id,
        title,
        vec![(start_col.to_string(), DatabaseCellSpec::Integer(ts_ms))],
        now_ms,
    )?;
    Ok(commit.is_some())
}

/// Reschedule a Calendar row to `target_day_index`, preserving any multi-day `end_column_id`
/// duration in one tracked undo step.
#[allow(clippy::too_many_arguments)]
pub fn reschedule_calendar_row_to_day(
    page: &mut PageDocSession,
    block_id: &str,
    view: &DatabaseView,
    data: &DatabaseData,
    row_id: &str,
    target_day_index: i64,
    offset_at_ms: &dyn Fn(i64) -> i32,
    now_ms: u64,
) -> DocResult<bool> {
    let (Some(start_col), end_col) = resolve_calendar_date_columns(view, data) else {
        return Ok(false);
    };
    let old_start_ms = data
        .cells
        .get(&(row_id.to_string(), start_col.to_string()))
        .and_then(DatabaseCellValue::as_i64);
    let new_start_ms = day_index_to_local_midnight_ms(target_day_index, offset_at_ms);
    let new_end_ms = end_col.and_then(|eid| {
        let old_end = data
            .cells
            .get(&(row_id.to_string(), eid.to_string()))
            .and_then(DatabaseCellValue::as_i64)?;
        let old_start = old_start_ms?;
        let old_start_day = local_day_index(old_start, offset_at_ms);
        let old_end_day = local_day_index(old_end, offset_at_ms);
        let span_days = (old_end_day - old_start_day).max(0);
        Some(day_index_to_local_midnight_ms(
            target_day_index + span_days,
            offset_at_ms,
        ))
    });
    let commit = page.reschedule_database_calendar_row(
        block_id,
        row_id,
        start_col,
        end_col,
        new_start_ms,
        new_end_ms,
        now_ms,
    )?;
    Ok(commit.is_some())
}
