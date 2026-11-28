//! Desktop interactive mouse, drag, keyboard, and IME wiring between [`PlaygroundView`]
//! and `blocksuite_editor::database` authoring controllers.

mod input;
#[cfg(test)]
mod tests;

pub(crate) use input::DatabaseInputBuffer;

use blocksuite_editor::database::{
    self, CalendarDragState, ColumnResizePreview, DatabaseAuthoringHitKind, DatabaseAuthoringKey,
    DatabaseAuthoringState, ProgressScrubPreview,
};
use blocksuite_playground_doc::read::{BlockContent, DatabaseData};
use ui::{Context, KeyDownEvent, MouseButton, MouseMoveEvent, Window};

use crate::PlaygroundView;

/// Active pointer drag inside a writable desktop `affine:database` block.
#[derive(Clone, Debug)]
pub(crate) enum DatabaseDragState {
    ColumnResize {
        block_id: String,
        column_id: String,
        start_x: f32,
        start_width: f32,
    },
    ProgressScrub {
        block_id: String,
        row_id: String,
        column_id: String,
        bar_x: f32,
        bar_w: f32,
        scrolls_x: bool,
    },
    CalendarReschedule {
        block_id: String,
        row_id: String,
        origin_day: i64,
        target_day: i64,
    },
}

impl PlaygroundView {
    /// Unified read-only gate for all `affine:database` write and authoring controls:
    /// true when either database-level readonly (mobile Stage-1) or Page-level readonly is active.
    pub(crate) fn is_database_write_readonly(&self) -> bool {
        self.database_readonly
            || self.flow.database_state.mobile_readonly
            || (self.mode == crate::PlaygroundMode::Page && self.page_readonly)
    }

    /// Mutate the transient desktop authoring state for `block_id` and schedule a repaint.
    pub fn update_database_authoring(
        &mut self,
        block_id: &str,
        f: impl FnOnce(&mut DatabaseAuthoringState),
        cx: &mut Context<Self>,
    ) {
        f(self.flow.database_state.authoring_mut(block_id));
        self.env_rev += 1;
        cx.notify();
    }

    /// Dismiss open database popovers and drag previews on every database block except `keep_block`.
    pub(crate) fn dismiss_all_database_authoring(
        &mut self,
        keep_block: Option<&str>,
        cx: &mut Context<Self>,
    ) {
        let mut changed = false;
        let ids: Vec<String> = self
            .flow
            .database_state
            .ui_states
            .keys()
            .filter(|id| keep_block != Some(id.as_str()))
            .cloned()
            .collect();
        for id in ids {
            let st = self.flow.database_state.state_for(&id);
            let a = &st.authoring;
            if a.column_menu.is_some()
                || a.active_cell.is_some()
                || a.toolbar_panel.is_some()
                || a.calendar_drag.is_some()
                || a.column_resize.is_some()
                || a.progress_preview.is_some()
            {
                let auth = self.flow.database_state.authoring_mut(&id);
                auth.dismiss_popovers();
                auth.calendar_drag = None;
                auth.column_resize = None;
                auth.progress_preview = None;
                changed = true;
            }
        }
        if keep_block.is_none() {
            if self.database_drag.take().is_some() {
                changed = true;
            }
            if self.database_input.take().is_some() {
                changed = true;
            }
        } else if self
            .database_input
            .as_ref()
            .is_some_and(|d| Some(d.target.block_id()) != keep_block)
        {
            self.database_input = None;
            changed = true;
        }
        if changed {
            self.env_rev += 1;
            cx.notify();
        }
    }

    fn database_snapshot_data(&self, block_id: &str) -> Option<DatabaseData> {
        let snap = self.snapshot.as_ref()?;
        match &snap.block(block_id)?.content {
            BlockContent::Database(db) => Some(db.clone()),
            _ => None,
        }
    }

    fn database_block_local_coords(
        &self,
        block_id: &str,
        pos_x: f32,
        pos_y: f32,
        window: &Window,
    ) -> Option<(f32, f32)> {
        let layout = self.flow_layout()?;
        let geometry = crate::page_geometry(f32::from(window.viewport_size().width));
        let world_x = pos_x - geometry.column_x;
        let world_y = pos_y - crate::TOPBAR_HEIGHT + self.scroll_y;
        let block = layout.block(block_id)?;
        let r = block.rect();
        Some((world_x - r.x, world_y - r.y))
    }

    fn sync_after_database_mutation(&mut self, before_sv: Option<Vec<u8>>, cx: &mut Context<Self>) {
        if let Some(sv) = before_sv
            && let Some(page_id) = self.page_id.clone()
            && let Some(page) = self.page()
            && let Ok(diff) = page.encode_diff_v1(&sv)
            && !diff.is_empty()
        {
            self.send_page_update(&page_id, diff);
        }
        self.refresh_document();
        self.env_rev += 1;
        cx.notify();
    }

    /// Dispatch a desktop writable click `(local_x, local_y)` against `block_id`'s authoring hit
    /// targets. Returns `true` when an authoring control consumed the click.
    pub(crate) fn try_click_database_authoring(
        &mut self,
        block_id: &str,
        local_x: f32,
        local_y: f32,
        window: Option<&mut Window>,
        cx: &mut Context<Self>,
    ) -> bool {
        if self.is_database_write_readonly() {
            return false;
        }
        let hits = self.flow.database_authoring_hits(block_id);
        if hits.is_empty() {
            return false;
        }
        let code_scroll = self
            .flow_layout()
            .and_then(|l| l.block(block_id).and_then(|b| b.body.code_scroll));
        let scroll_x = code_scroll.map_or(0.0, |cs| self.overlays.code_scroll_x_for(block_id, cs));
        let hit = hits
            .iter()
            .rev()
            .find(|h| {
                if matches!(
                    h.kind,
                    DatabaseAuthoringHitKind::CalendarDayDropTarget { .. }
                ) && self.database_drag.is_none()
                {
                    return false;
                }
                if h.scrolls_x
                    && let Some(cs) = code_scroll
                    && !cs.area.contains(local_x, local_y)
                {
                    return false;
                }
                let test_x = if h.scrolls_x {
                    local_x + scroll_x
                } else {
                    local_x
                };
                h.rect.contains(test_x, local_y)
            })
            .cloned();

        let Some(hit) = hit else {
            // Clicking an empty region inside the database dismisses open popovers cleanly.
            let st = self.flow.database_state.state_for(block_id);
            if st.authoring.column_menu.is_some()
                || st.authoring.active_cell.is_some()
                || st.authoring.toolbar_panel.is_some()
            {
                self.flow
                    .database_state
                    .authoring_mut(block_id)
                    .dismiss_popovers();
                self.sync_database_authoring_input(window, cx);
                self.env_rev += 1;
                cx.notify();
            }
            return false;
        };

        let click_x = if hit.scrolls_x {
            local_x + scroll_x
        } else {
            local_x
        };

        // Start interactive drags directly on pointer down (zero CRDT writes until pointer up).
        match &hit.kind {
            DatabaseAuthoringHitKind::ResizeColumnHandle {
                column_id,
                current_width_px,
            } => {
                self.database_drag = Some(DatabaseDragState::ColumnResize {
                    block_id: block_id.to_string(),
                    column_id: column_id.clone(),
                    start_x: click_x,
                    start_width: *current_width_px as f32,
                });
                self.flow
                    .database_state
                    .authoring_mut(block_id)
                    .column_resize = Some(ColumnResizePreview {
                    column_id: column_id.clone(),
                    preview_width_px: *current_width_px,
                });
                self.env_rev += 1;
                if let Some(w) = window {
                    self.editor_focus.focus(w, cx);
                }
                cx.notify();
                return true;
            }
            DatabaseAuthoringHitKind::CalendarDragEventStart { row_id, day_index } => {
                self.database_drag = Some(DatabaseDragState::CalendarReschedule {
                    block_id: block_id.to_string(),
                    row_id: row_id.clone(),
                    origin_day: *day_index,
                    target_day: *day_index,
                });
                self.flow
                    .database_state
                    .authoring_mut(block_id)
                    .calendar_drag = Some(CalendarDragState {
                    row_id: row_id.clone(),
                    origin_day: *day_index,
                    target_day: *day_index,
                });
                self.env_rev += 1;
                if let Some(w) = window {
                    self.editor_focus.focus(w, cx);
                }
                cx.notify();
                return true;
            }
            DatabaseAuthoringHitKind::CalendarDayDropTarget { .. } => {
                if self.database_drag.is_none() {
                    return false;
                }
            }
            DatabaseAuthoringHitKind::SetProgress { row_id, column_id } => {
                let value = database::progress_from_bar_x(click_x, hit.rect.x, hit.rect.w);
                self.database_drag = Some(DatabaseDragState::ProgressScrub {
                    block_id: block_id.to_string(),
                    row_id: row_id.clone(),
                    column_id: column_id.clone(),
                    bar_x: hit.rect.x,
                    bar_w: hit.rect.w,
                    scrolls_x: hit.scrolls_x,
                });
                self.flow
                    .database_state
                    .authoring_mut(block_id)
                    .progress_preview = Some(ProgressScrubPreview {
                    row_id: row_id.clone(),
                    column_id: column_id.clone(),
                    value,
                });
                self.env_rev += 1;
                if let Some(w) = window {
                    self.editor_focus.focus(w, cx);
                }
                cx.notify();
                return true;
            }
            _ => {}
        }

        let Some(db_data) = self.database_snapshot_data(block_id) else {
            return false;
        };
        let now_ms = self.now_ms(cx) as u64;
        let offset_at = self.utc_offset_resolver();
        let before_sv = self.page().and_then(|p| p.encode_state_vector_v1().ok());
        let outcome = {
            let Some(page) = self
                .page_id
                .as_deref()
                .and_then(|id| self.state.workspace.page_mut(id))
            else {
                return false;
            };
            let _ = page.stop_capturing();
            let res = database::handle_authoring_hit(
                page,
                &mut self.flow.database_state,
                block_id,
                &db_data,
                &hit,
                click_x,
                &offset_at,
                now_ms,
            );
            let _ = page.stop_capturing();
            res
        };
        match outcome {
            Ok(res) if res.handled => {
                let mut window = window;
                if let Some(w) = window.as_deref_mut() {
                    self.editor_focus.focus(w, cx);
                }
                if res.doc_mutated {
                    self.sync_after_database_mutation(before_sv, cx);
                } else {
                    self.env_rev += 1;
                    cx.notify();
                }
                self.sync_database_authoring_input(window, cx);
                true
            }
            _ => false,
        }
    }

    /// Continue an active database column resize, progress scrub, or calendar reschedule drag.
    pub(crate) fn database_authoring_mouse_move(
        &mut self,
        event: &MouseMoveEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> bool {
        if self.is_database_write_readonly() {
            self.database_drag = None;
            return false;
        }
        let Some(drag) = self.database_drag.clone() else {
            return false;
        };
        if event.pressed_button != Some(MouseButton::Left) {
            return self.database_authoring_mouse_up(window, cx);
        }
        let pos_x = f32::from(event.position.x);
        let pos_y = f32::from(event.position.y);
        match drag {
            DatabaseDragState::ColumnResize {
                block_id,
                column_id,
                start_x,
                start_width,
            } => {
                let Some((local_x, _)) =
                    self.database_block_local_coords(&block_id, pos_x, pos_y, window)
                else {
                    return true;
                };
                let scroll_x = self
                    .flow_layout()
                    .and_then(|l| l.block(&block_id).and_then(|b| b.body.code_scroll))
                    .map_or(0.0, |cs| self.overlays.code_scroll_x_for(&block_id, cs));
                let cur_x = local_x + scroll_x;
                let next_w = (start_width + (cur_x - start_x)).max(65.0).round() as i32;
                self.flow
                    .database_state
                    .authoring_mut(&block_id)
                    .column_resize = Some(ColumnResizePreview {
                    column_id,
                    preview_width_px: next_w,
                });
                self.env_rev += 1;
                cx.notify();
                true
            }
            DatabaseDragState::ProgressScrub {
                block_id,
                row_id,
                column_id,
                bar_x,
                bar_w,
                scrolls_x,
            } => {
                let Some((local_x, _)) =
                    self.database_block_local_coords(&block_id, pos_x, pos_y, window)
                else {
                    return true;
                };
                let scroll_x = if scrolls_x {
                    self.flow_layout()
                        .and_then(|l| l.block(&block_id).and_then(|b| b.body.code_scroll))
                        .map_or(0.0, |cs| self.overlays.code_scroll_x_for(&block_id, cs))
                } else {
                    0.0
                };
                let value = database::progress_from_bar_x(local_x + scroll_x, bar_x, bar_w);
                self.flow
                    .database_state
                    .authoring_mut(&block_id)
                    .progress_preview = Some(ProgressScrubPreview {
                    row_id,
                    column_id,
                    value,
                });
                self.env_rev += 1;
                cx.notify();
                true
            }
            DatabaseDragState::CalendarReschedule {
                block_id,
                row_id,
                origin_day,
                target_day,
            } => {
                let Some((local_x, local_y)) =
                    self.database_block_local_coords(&block_id, pos_x, pos_y, window)
                else {
                    return true;
                };
                let hovered_day = self
                    .flow
                    .database_authoring_hits(&block_id)
                    .iter()
                    .find_map(|h| match h.kind {
                        DatabaseAuthoringHitKind::CalendarDayDropTarget { day_index }
                            if h.rect.contains(local_x, local_y) =>
                        {
                            Some(day_index)
                        }
                        _ => None,
                    });
                if let Some(next_day) = hovered_day
                    && next_day != target_day
                {
                    self.database_drag = Some(DatabaseDragState::CalendarReschedule {
                        block_id: block_id.clone(),
                        row_id: row_id.clone(),
                        origin_day,
                        target_day: next_day,
                    });
                    self.flow
                        .database_state
                        .authoring_mut(&block_id)
                        .calendar_drag = Some(CalendarDragState {
                        row_id,
                        origin_day,
                        target_day: next_day,
                    });
                    self.env_rev += 1;
                    cx.notify();
                }
                true
            }
        }
    }

    /// Commit any active database drag on pointer release in a single CRDT undo step.
    pub(crate) fn database_authoring_mouse_up(
        &mut self,
        _window: &mut Window,
        cx: &mut Context<Self>,
    ) -> bool {
        let Some(drag) = self.database_drag.take() else {
            return false;
        };
        if self.is_database_write_readonly() {
            self.dismiss_all_database_authoring(None, cx);
            return false;
        }
        let now_ms = self.now_ms(cx) as u64;
        let offset_at = self.utc_offset_resolver();
        match drag {
            DatabaseDragState::ColumnResize {
                block_id,
                column_id,
                ..
            } => {
                let preview = self
                    .flow
                    .database_state
                    .state_for(&block_id)
                    .authoring
                    .column_resize
                    .map(|r| r.preview_width_px as f32);
                let Some(width_px) = preview else {
                    return true;
                };
                let Some(db_data) = self.database_snapshot_data(&block_id) else {
                    return true;
                };
                let before_sv = self.page().and_then(|p| p.encode_state_vector_v1().ok());
                let mutated = {
                    let Some(page) = self
                        .page_id
                        .as_deref()
                        .and_then(|id| self.state.workspace.page_mut(id))
                    else {
                        return true;
                    };
                    let _ = page.stop_capturing();
                    let res = database::commit_column_resize(
                        page,
                        &mut self.flow.database_state,
                        &block_id,
                        &db_data,
                        &column_id,
                        width_px,
                        now_ms,
                    )
                    .unwrap_or(false);
                    let _ = page.stop_capturing();
                    res
                };
                if mutated {
                    self.sync_after_database_mutation(before_sv, cx);
                } else {
                    self.env_rev += 1;
                    cx.notify();
                }
                true
            }
            DatabaseDragState::ProgressScrub { block_id, .. } => {
                let preview = self
                    .flow
                    .database_state
                    .authoring_mut(&block_id)
                    .progress_preview
                    .take();
                if let Some(p) = preview {
                    let before_sv = self.page().and_then(|pg| pg.encode_state_vector_v1().ok());
                    let mutated = if let Ok(page) = self.page_mut() {
                        let _ = page.stop_capturing();
                        let ok = page
                            .set_database_cell_value(
                                &block_id,
                                &p.row_id,
                                &p.column_id,
                                blocksuite_playground_doc::schema::DatabaseCellSpec::Integer(
                                    p.value,
                                ),
                                now_ms,
                            )
                            .ok()
                            .flatten()
                            .is_some();
                        let _ = page.stop_capturing();
                        ok
                    } else {
                        false
                    };
                    if mutated {
                        self.sync_after_database_mutation(before_sv, cx);
                    } else {
                        self.env_rev += 1;
                        cx.notify();
                    }
                }
                true
            }
            DatabaseDragState::CalendarReschedule {
                block_id,
                row_id,
                origin_day,
                target_day,
            } => {
                self.flow
                    .database_state
                    .authoring_mut(&block_id)
                    .calendar_drag = None;
                if target_day != origin_day
                    && let Some(db_data) = self.database_snapshot_data(&block_id)
                {
                    let ui_state = self.flow.database_state.state_for(&block_id);
                    let view = ui_state
                        .active_view_id
                        .as_deref()
                        .and_then(|id| db_data.views.iter().find(|v| v.id == id))
                        .or_else(|| db_data.views.first())
                        .cloned();
                    if let Some(view) = view {
                        let before_sv = self.page().and_then(|p| p.encode_state_vector_v1().ok());
                        let mutated = {
                            let Some(page) = self
                                .page_id
                                .as_deref()
                                .and_then(|id| self.state.workspace.page_mut(id))
                            else {
                                return true;
                            };
                            let _ = page.stop_capturing();
                            let res = database::reschedule_calendar_row_to_day(
                                page, &block_id, &view, &db_data, &row_id, target_day, &offset_at,
                                now_ms,
                            )
                            .unwrap_or(false);
                            let _ = page.stop_capturing();
                            res
                        };
                        if mutated {
                            self.sync_after_database_mutation(before_sv, cx);
                            return true;
                        }
                    }
                }
                self.env_rev += 1;
                cx.notify();
                true
            }
        }
    }

    /// Route control/navigation keys to an active database authoring input. Printable text and
    /// CJK IME composition enter exclusively via [`ui::EntityInputHandler`]. `Cmd/Ctrl+Z` /
    /// `Shift+Cmd/Ctrl+Z` dismiss popovers and pass through to native Undo/Redo.
    pub(crate) fn database_authoring_key_down(
        &mut self,
        event: &KeyDownEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> bool {
        let Some(block_id) = self.active_database_authoring_block() else {
            return false;
        };
        let m = event.keystroke.modifiers;
        let cmd = m.secondary(cx);
        let key = event.keystroke.key.as_str();
        if cmd && matches!(key, "z" | "y") {
            self.flow
                .database_state
                .authoring_mut(&block_id)
                .dismiss_popovers();
            self.database_input = None;
            self.env_rev += 1;
            return false;
        }
        if self
            .database_input
            .as_ref()
            .is_some_and(|d| d.input.composing())
        {
            if key == "escape" {
                let _ = self.database_authoring_input_edit(window, cx, |buf| buf.cancel_preedit());
                return true;
            }
            return false;
        }
        if cmd && key == "a" {
            return self
                .database_authoring_input_edit(window, cx, |buf| buf.select_all())
                .is_some();
        }
        if matches!(
            key,
            "backspace" | "delete" | "left" | "right" | "home" | "end" | "up" | "down"
        ) {
            return self
                .database_authoring_input_edit(window, cx, |buf| buf.key(key, m.shift, cmd))
                .flatten()
                .is_some();
        }
        let mapped = match key {
            "enter" => Some(DatabaseAuthoringKey::Enter),
            "escape" => Some(DatabaseAuthoringKey::Escape),
            "tab" if m.shift => Some(DatabaseAuthoringKey::ShiftTab),
            "tab" => Some(DatabaseAuthoringKey::Tab),
            _ => None,
        };
        let Some(auth_key) = mapped else {
            return false;
        };
        let handled = self.dispatch_database_authoring_key(&block_id, auth_key, cx);
        if handled {
            self.sync_database_authoring_input(Some(window), cx);
        }
        handled
    }

    fn dispatch_database_authoring_key(
        &mut self,
        block_id: &str,
        key: DatabaseAuthoringKey,
        cx: &mut Context<Self>,
    ) -> bool {
        let Some(db_data) = self.database_snapshot_data(block_id) else {
            return false;
        };
        let now_ms = self.now_ms(cx) as u64;
        let offset_at = self.utc_offset_resolver();
        let before_sv = self.page().and_then(|p| p.encode_state_vector_v1().ok());
        let outcome = {
            let Some(page) = self
                .page_id
                .as_deref()
                .and_then(|id| self.state.workspace.page_mut(id))
            else {
                return false;
            };
            let _ = page.stop_capturing();
            let res = database::handle_authoring_key(
                page,
                &mut self.flow.database_state,
                block_id,
                &db_data,
                key,
                &offset_at,
                now_ms,
            );
            let _ = page.stop_capturing();
            res
        };
        match outcome {
            Ok(res) if res.handled => {
                if res.doc_mutated {
                    self.sync_after_database_mutation(before_sv, cx);
                } else {
                    self.env_rev += 1;
                    cx.notify();
                }
                true
            }
            _ => false,
        }
    }
}
