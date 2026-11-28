use crate::block_flow::{CodeScroll, FlowLayout, ScrolledCode};

use super::Overlays;

pub(super) fn push_toggle_code_wrap(
    block_id: String,
    scene: Option<&super::OverlayScene<'_>>,
    effects: &mut super::OverlayEffects,
) {
    if let Some(scene) = scene
        && let Some(blocksuite_playground_doc::read::BlockContent::Code { wrap, .. }) =
            scene.snapshot.block(&block_id).map(|node| &node.content)
    {
        effects.edits.push(super::DocEdit::SetProp {
            block_id,
            key: "prop:wrap",
            value: if *wrap {
                y_octo::Any::False
            } else {
                y_octo::Any::True
            },
        });
        effects.redraw = true;
    }
}

pub(super) fn normalize_code_language(language: &str) -> y_octo::Any {
    let trimmed = language.trim();
    if trimmed.is_empty()
        || trimmed.eq_ignore_ascii_case("plain")
        || trimmed.eq_ignore_ascii_case("plain text")
    {
        y_octo::Any::Null
    } else {
        y_octo::Any::String(trimmed.to_string())
    }
}

impl Overlays {
    /// Sideways scroll of a code/table/database block.
    pub fn code_scroll_x(&self, block_id: &str) -> f32 {
        self.code_scroll.get(block_id).copied().unwrap_or(0.0)
    }

    /// Effective sideways scroll of a block, falling back to `code.initial_x` until the user
    /// scrolls it manually.
    pub fn code_scroll_x_for(&self, block_id: &str, code: CodeScroll) -> f32 {
        self.code_scroll
            .get(block_id)
            .copied()
            .unwrap_or(code.initial_x)
    }

    /// The code blocks of `layout` that are scrolled sideways.
    pub fn scrolled_code(&self, layout: &FlowLayout) -> Vec<ScrolledCode> {
        self.code_scroll
            .iter()
            .filter_map(|(block_id, scroll)| {
                ScrolledCode::of_block(layout.block(block_id)?, *scroll)
            })
            .collect()
    }

    /// Scroll a code block sideways so the caret at `caret_x` (relative to its code area,
    /// unscrolled) is in view.
    pub fn reveal_code_x(&mut self, block_id: &str, caret_x: f32, code: CodeScroll) {
        let current = self.code_scroll_x(block_id);
        let next = if caret_x < current {
            caret_x
        } else if caret_x > current + code.area.w - 2.0 {
            caret_x - code.area.w + 2.0
        } else {
            current
        };
        let next = next.clamp(0.0, code.max_x).round();
        if next > 0.0 {
            self.code_scroll.insert(block_id.to_string(), next);
        } else {
            self.code_scroll.remove(block_id);
        }
    }

    /// Scroll a wide table sideways so the active cell `[cell_left, cell_right]` and its
    /// caret at `caret_x` (all relative to `code.area.x`, unscrolled) stay inside the viewport.
    pub fn reveal_table_cell_x(
        &mut self,
        block_id: &str,
        cell_left: f32,
        cell_right: f32,
        caret_x: f32,
        code: CodeScroll,
    ) {
        let current = self.code_scroll_x_for(block_id, code);
        let view_w = code.area.w;
        let mut next = current;
        if cell_right - cell_left <= view_w {
            if cell_left < next {
                next = cell_left;
            } else if cell_right > next + view_w {
                next = cell_right - view_w;
            }
        } else if caret_x < next + 8.0 {
            next = (caret_x - 8.0).max(0.0);
        } else if caret_x > next + view_w - 8.0 {
            next = caret_x - view_w + 8.0;
        }
        let next = next.clamp(0.0, code.max_x).round();
        if next > 0.0 {
            self.code_scroll.insert(block_id.to_string(), next);
        } else {
            self.code_scroll.remove(block_id);
        }
    }

    /// Begin dragging one or more blocks from a gutter drag handle (or clicking to open the block menu).
    pub fn start_drag(&mut self, block_id: String, dragged_ids: Vec<String>, now_ms: f64) {
        self.start_drag_with_anchor(block_id, dragged_ids, None, now_ms);
    }

    /// Begin a drag-handle press at optional screen-space `anchor`. When `anchor` is `Some`,
    /// releasing before moving [`super::DRAG_START_THRESHOLD_PX`] opens the block action menu.
    pub fn start_drag_with_anchor(
        &mut self,
        block_id: String,
        dragged_ids: Vec<String>,
        anchor: Option<(f32, f32)>,
        now_ms: f64,
    ) {
        self.close_slash(now_ms);
        self.close_link_field();
        self.close_block_menu(now_ms);
        let ids = if dragged_ids.is_empty() {
            vec![block_id.clone()]
        } else {
            dragged_ids
        };
        self.drag = Some(super::BlockDrag {
            block_id,
            dragged_ids: ids,
            start_screen: anchor,
            moved: anchor.is_none(),
            slot: None,
        });
    }

    /// Whether database creation/editing is restricted (e.g. mobile read-only mode).
    pub fn set_database_readonly(&mut self, readonly: bool) {
        self.database_readonly = readonly;
    }

    /// Whether a block's disclosure chevron is turning between its two states.
    pub fn chevron_turning(&self, block_id: &str) -> bool {
        self.chevrons.contains_key(block_id)
    }

    /// Code block whose copy button currently reads `Copied`.
    pub fn copied_block(&self) -> Option<&str> {
        self.copied.as_ref().map(|(block_id, _)| block_id.as_str())
    }

    /// The `Copied` timer of `generation` ran out. Returns whether a label went away.
    pub fn copied_expired(&mut self, generation: u64) -> bool {
        if self
            .copied
            .as_ref()
            .is_some_and(|(_, current)| *current == generation)
        {
            self.copied = None;
            return true;
        }
        false
    }

    /// Whether a to-do checkbox radial pulse is currently in flight for `block_id`.
    pub fn todo_pulse_active(&self, block_id: &str) -> bool {
        self.todo_pulses.contains_key(block_id)
    }

    /// Drop every popover, hover and gesture at once, e.g. when the page is hidden or
    /// replaced.
    pub fn reset(&mut self) {
        self.hovered = None;
        self.handle_hot = false;
        self.slash = None;
        self.toolbar = None;
        self.drag = None;
        self.chevrons.clear();
        self.todo_pulses.clear();
        self.linked_doc = None;
        self.equation = None;
        self.bookmark = None;
        self.context_menu = None;
        self.block_menu = None;
        self.context_toast = None;
        self.keyboard_toolbar.close_transient();
        self.format_cache = None;
    }

    pub(super) fn in_flight(&self, now_ms: f64) -> bool {
        !self.chevrons.is_empty()
            || !self.todo_pulses.is_empty()
            || self
                .slash
                .as_ref()
                .is_some_and(|menu| menu.presence.in_flight(now_ms) || menu.presence.closing)
            || self
                .linked_doc
                .as_ref()
                .is_some_and(|menu| menu.presence.in_flight(now_ms) || menu.presence.closing)
            || self.toolbar.as_ref().is_some_and(|toolbar| {
                toolbar.presence.in_flight(now_ms) || toolbar.presence.closing
            })
            || self
                .equation
                .as_ref()
                .is_some_and(|editor| editor.presence.in_flight(now_ms) || editor.presence.closing)
            || self
                .bookmark
                .as_ref()
                .is_some_and(|prompt| prompt.presence.in_flight(now_ms) || prompt.presence.closing)
            || self
                .context_menu
                .as_ref()
                .is_some_and(|menu| menu.presence.in_flight(now_ms) || menu.presence.closing)
            || self
                .block_menu
                .as_ref()
                .is_some_and(|menu| menu.presence.in_flight(now_ms) || menu.presence.closing)
    }
}
