//! Unified UTF-16 + IME text buffer bridge for desktop `affine:database` authoring fields
//! (column rename, in-place cell editor, select picker filter, and Filter rule draft).

use blocksuite_editor::{database::ActiveToolbarPanel, inline_input::Utf16ImeBuffer};
use ui::{Bounds, Context, Pixels, Window, point, px, size};

use crate::PlaygroundView;

/// Which text-accepting database authoring field currently owns IME/text input.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum DatabaseInputTarget {
    ColumnRename {
        block_id: String,
        column_id: String,
    },
    Cell {
        block_id: String,
        row_id: String,
        column_id: String,
        is_select_filter: bool,
    },
    FilterDraft {
        block_id: String,
    },
}

impl DatabaseInputTarget {
    pub(crate) fn block_id(&self) -> &str {
        match self {
            Self::ColumnRename { block_id, .. }
            | Self::Cell { block_id, .. }
            | Self::FilterDraft { block_id } => block_id,
        }
    }
}

/// Active UTF-16 + IME text buffer for a desktop database authoring field.
#[derive(Clone, Debug)]
pub(crate) struct DatabaseInputBuffer {
    pub(crate) target: DatabaseInputTarget,
    pub(crate) input: Utf16ImeBuffer,
}

impl PlaygroundView {
    /// Return the block id of whichever database currently has an open text-accepting authoring
    /// control (column rename input, in-place cell editor, select picker search, or filter draft).
    pub(crate) fn active_database_authoring_block(&self) -> Option<String> {
        self.desired_database_input()
            .map(|(target, _)| target.block_id().to_string())
    }

    pub(super) fn desired_database_input(&self) -> Option<(DatabaseInputTarget, String)> {
        if self.is_database_write_readonly() {
            return None;
        }
        self.flow
            .database_state
            .ui_states
            .iter()
            .find_map(|(block_id, st)| {
                let auth = &st.authoring;
                if let Some(menu) = &auth.column_menu {
                    return Some((
                        DatabaseInputTarget::ColumnRename {
                            block_id: block_id.clone(),
                            column_id: menu.column_id.clone(),
                        },
                        menu.rename_draft.clone(),
                    ));
                }
                if let Some(cell) = &auth.active_cell {
                    let is_select = matches!(cell.col_type.as_str(), "select" | "multi-select");
                    let draft = if is_select {
                        cell.select_filter.clone()
                    } else {
                        cell.draft.clone()
                    };
                    return Some((
                        DatabaseInputTarget::Cell {
                            block_id: block_id.clone(),
                            row_id: cell.row_id.clone(),
                            column_id: cell.column_id.clone(),
                            is_select_filter: is_select,
                        },
                        draft,
                    ));
                }
                if auth.toolbar_panel == Some(ActiveToolbarPanel::Filter) {
                    return Some((
                        DatabaseInputTarget::FilterDraft {
                            block_id: block_id.clone(),
                        },
                        auth.filter_draft.value.clone(),
                    ));
                }
                None
            })
    }

    /// Synchronize [`Self::database_input`] with the active database authoring text field and
    /// clear any outside paragraph selection/preedit so IME never leaks into body text.
    pub(crate) fn sync_database_authoring_input(
        &mut self,
        window: Option<&mut Window>,
        cx: &mut Context<Self>,
    ) {
        let Some((target, draft)) = self.desired_database_input() else {
            if self.database_input.take().is_some()
                && let Some(w) = window
            {
                w.notify_text_input_changed(&self.editor_focus);
            }
            return;
        };
        self.editor.selection = None;
        self.editor.block_selection.clear();
        self.editor.preedit = None;
        if self
            .database_input
            .as_ref()
            .is_none_or(|d| d.target != target)
        {
            self.database_input = Some(DatabaseInputBuffer {
                target,
                input: Utf16ImeBuffer::new(draft, false),
            });
            if let Some(w) = window {
                w.notify_text_input_changed(&self.editor_focus);
            }
            cx.notify();
        }
    }

    /// Apply an IME/text mutation to [`Self::database_input`] and mirror `display_text()` into
    /// the active database authoring draft so preedit and committed text paint live.
    pub(crate) fn database_authoring_input_edit<R>(
        &mut self,
        window: &mut Window,
        cx: &mut Context<Self>,
        f: impl FnOnce(&mut Utf16ImeBuffer) -> R,
    ) -> Option<R> {
        let db_in = self.database_input.as_mut()?;
        let out = f(&mut db_in.input);
        let displayed = db_in.input.display_text();
        let target = db_in.target.clone();
        match target {
            DatabaseInputTarget::ColumnRename { block_id, .. } => {
                if let Some(menu) = self
                    .flow
                    .database_state
                    .authoring_mut(&block_id)
                    .column_menu
                    .as_mut()
                {
                    menu.rename_draft = displayed;
                }
            }
            DatabaseInputTarget::Cell {
                block_id,
                is_select_filter,
                ..
            } => {
                if let Some(cell) = self
                    .flow
                    .database_state
                    .authoring_mut(&block_id)
                    .active_cell
                    .as_mut()
                {
                    if is_select_filter {
                        cell.select_filter = displayed;
                    } else {
                        cell.draft = displayed;
                        cell.error = None;
                    }
                }
            }
            DatabaseInputTarget::FilterDraft { block_id } => {
                self.flow
                    .database_state
                    .authoring_mut(&block_id)
                    .filter_draft
                    .value = displayed;
            }
        }
        self.env_rev += 1;
        window.notify_text_input_changed(&self.editor_focus);
        cx.notify();
        Some(out)
    }

    /// Screen bounds of the active database authoring field for OS IME candidate placement.
    pub(crate) fn database_authoring_input_bounds(&self, w: &Window) -> Option<Bounds<Pixels>> {
        let block_id = self.database_input.as_ref()?.target.block_id();
        let layout = self.flow_layout()?;
        let block = layout.block(block_id)?;
        let geom = crate::page_geometry(f32::from(w.viewport_size().width));
        Some(Bounds::new(
            point(
                px(geom.column_x + block.x + 12.0),
                px(crate::TOPBAR_HEIGHT + block.y - self.scroll_y + 44.0),
            ),
            size(px(220.0), px(28.0)),
        ))
    }
}
