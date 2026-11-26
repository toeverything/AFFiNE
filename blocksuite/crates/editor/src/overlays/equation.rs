use ui::{
    AnyElement, ClickEvent, Context, FontWeight, Hsla, MouseDownEvent, SharedString, TextRun,
    Window, div, prelude::*, px,
};

use crate::{
    block_flow::FlowRect,
    theme::{FONT_CODE, FONT_SANS, Palette, TYPOGRAPHY},
};

use super::*;

const EQUATION_POPOVER_WIDTH: f32 = 304.0;
const EQUATION_DONE_WIDTH: f32 = 52.0;

/// Target block or inline equation edited by [`EquationEditor`].
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum EquationTarget {
    /// Block-level `affine:latex` block (`prop:latex`).
    Block { block_id: String },
    /// Inline latex embed space at `utf16_offset` inside `block_id`.
    Inline { block_id: String, utf16_offset: u64 },
}

impl EquationTarget {
    pub fn block_id(&self) -> &str {
        match self {
            Self::Block { block_id } | Self::Inline { block_id, .. } => block_id,
        }
    }
}

/// Lightweight single-line LaTeX equation editor popover anchored to a block or inline formula.
#[derive(Clone, Debug, PartialEq)]
pub struct EquationEditor {
    pub target: EquationTarget,
    pub input: LinkBar,
    pub(super) initial_latex: String,
    pub(super) presence: Presence,
    pub(super) rect: Option<FlowRect>,
}

impl Overlays {
    /// Active equation editor popover, if open (not closing).
    pub fn equation_editor(&self) -> Option<&EquationEditor> {
        self.equation
            .as_ref()
            .filter(|editor| !editor.presence.closing)
    }

    /// Mutable access to the open equation editor popover.
    pub fn equation_editor_mut(&mut self) -> Option<&mut EquationEditor> {
        self.equation
            .as_mut()
            .filter(|editor| !editor.presence.closing)
    }

    /// Open and focus the single-line equation editor for `target`.
    pub fn open_equation_editor(&mut self, target: EquationTarget, initial: String, now_ms: f64) {
        self.close_slash(now_ms);
        self.close_linked_doc(now_ms);
        self.close_link_field();
        let presence = match self.equation.take() {
            Some(existing) => existing.presence.reopened(now_ms),
            None => Presence::opening(now_ms),
        };
        self.equation = Some(EquationEditor {
            target,
            initial_latex: initial.clone(),
            input: LinkBar::new(initial),
            presence,
            rect: None,
        });
    }

    /// Close the equation editor without committing (immediate drop).
    pub fn close_equation_editor(&mut self) {
        self.equation = None;
    }

    /// Close the equation editor with a 150 ms fade-out transition.
    pub fn close_equation_editor_at(&mut self, now_ms: f64) -> bool {
        match self.equation_editor_mut() {
            Some(editor) => {
                editor.presence.close(now_ms);
                true
            }
            None => false,
        }
    }

    pub(super) fn apply_equation(&mut self, now_ms: f64, effects: &mut OverlayEffects) {
        let Some(editor) = self.equation_editor_mut() else {
            return;
        };
        let latex = editor.input.clone().into_committed_text();
        if latex != editor.initial_latex {
            effects.edits.push(DocEdit::Equation {
                target: editor.target.clone(),
                latex,
            });
        }
        editor.presence.close(now_ms);
        effects.redraw = true;
    }

    pub(super) fn render_equation<V: OverlayHost>(
        &mut self,
        scene: &OverlayScene<'_>,
        palette: &Palette,
        now_ms: f64,
        window: &mut Window,
        cx: &mut Context<V>,
    ) -> Option<AnyElement> {
        let editor = self.equation.as_mut()?;
        editor.rect = None;
        let progress = editor.presence.progress(now_ms);
        if editor.presence.closing && progress <= 0.0 {
            return None;
        }
        let interactive = !editor.presence.closing;
        let progress = if interactive {
            progress.max(0.01)
        } else {
            progress
        };
        let anchor_world = match &editor.target {
            EquationTarget::Block { block_id } => scene.layout.block(block_id).map(|b| b.rect()),
            EquationTarget::Inline {
                block_id,
                utf16_offset,
            } => caret_world_rect(scene.layout, block_id, *utf16_offset as usize),
        }?;
        if !scene.page_viewport().intersects(&anchor_world) {
            return None;
        }
        let anchor = scene.world_to_screen(&anchor_world);
        let viewport = scene.popover_viewport();
        let width = EQUATION_POPOVER_WIDTH
            .min(viewport.w - 2.0 * POPOVER_EDGE_MARGIN)
            .max(120.0)
            .floor();
        let chrome = 2.0 * (TOOLBAR_PADDING + POPOVER_BORDER);
        let height = TOOLBAR_BUTTON + chrome;
        let placed = place_popover(
            anchor,
            (width, height),
            viewport,
            Placement::BelowStart,
            POPOVER_GAP,
            POPOVER_EDGE_MARGIN,
        );
        editor.rect = Some(placed.rect);

        let inner_width = (width - chrome).max(60.0);
        let field_width = (inner_width - EQUATION_DONE_WIDTH - LINK_GAP).max(40.0);
        let inset = POPOVER_BORDER + TOOLBAR_PADDING;
        editor.input.bounds = Some(FlowRect::new(
            placed.rect.x + inset,
            placed.rect.y + inset,
            field_width,
            TOOLBAR_BUTTON,
        ));

        let radius = TOOLBAR_RADIUS - TOOLBAR_PADDING;
        let text_room = (field_width - 2.0 * (8.0 + POPOVER_BORDER)).max(1.0);
        let inner_height = TOOLBAR_BUTTON - 2.0 * POPOVER_BORDER;
        let caret_height = 16.0;
        let caret_top = (inner_height - caret_height) / 2.0;
        let text = editor.input.text();
        let (selection, reversed) = editor.input.shown_selection();
        let marked = editor.input.marked_range();
        let mut font = ui::font(FONT_CODE);
        font.weight = FontWeight::NORMAL;
        let shown = SharedString::from(text.clone());
        let latex_hl = crate::highlight::highlight_line(
            crate::highlight::LanguageId::Latex,
            &text,
            crate::highlight::LineState::Normal,
        );
        let theme_mode = palette.theme.mode();
        let latex_runs: Vec<TextRun> = if latex_hl.spans.is_empty() {
            vec![TextRun {
                len: shown.len(),
                font: font.clone(),
                color: palette.text_primary,
                background_color: None,
                underline: None,
                strikethrough: None,
            }]
        } else {
            latex_hl
                .spans
                .iter()
                .filter(|s| s.bytes.end > s.bytes.start)
                .map(|s| TextRun {
                    len: s.bytes.end - s.bytes.start,
                    font: font.clone(),
                    color: crate::highlight::syntax_color(s.kind, theme_mode),
                    background_color: None,
                    underline: None,
                    strikethrough: None,
                })
                .collect()
        };
        let line = window.text_system().shape_line(
            shown.clone(),
            px(TYPOGRAPHY.font_xs_px),
            &latex_runs,
            None,
        );
        let x_at = |offset: usize| f32::from(line.x_for_index(utf16_to_byte(&text, offset)));
        let text_width = f32::from(line.width());
        let caret_x = x_at(if reversed {
            selection.start
        } else {
            selection.end
        });
        let scroll = if text_width + 1.0 <= text_room {
            0.0
        } else {
            (caret_x + 1.0 - text_room)
                .clamp(0.0, text_width + 1.0 - text_room)
                .round()
        };
        let mut inner = div()
            .relative()
            .flex_none()
            .w(px(text_room))
            .h(px(inner_height))
            .overflow_hidden();
        let make_strip = |x0: f32, x1: f32, top: f32, height: f32, color: Hsla| {
            div()
                .absolute()
                .left(px((x0 - scroll).round()))
                .top(px(top))
                .w(px((x1 - x0).round().max(1.0)))
                .h(px(height))
                .bg(color)
        };
        let sel_span = (marked.is_none() && !selection.is_empty())
            .then(|| (x_at(selection.start), x_at(selection.end)));
        let marked_span = marked.as_ref().map(|m| (x_at(m.start), x_at(m.end)));
        if let Some((x0, x1)) = sel_span {
            inner = inner.child(make_strip(
                x0,
                x1,
                caret_top,
                caret_height,
                palette.brand.opacity(0.22),
            ));
        }
        if text.is_empty() {
            inner = inner.child(
                div()
                    .absolute()
                    .left(px(1.0))
                    .top(px(0.0))
                    .h(px(inner_height))
                    .flex()
                    .items_center()
                    .whitespace_nowrap()
                    .font_family(FONT_SANS)
                    .text_color(palette.placeholder)
                    .child("Enter LaTeX equation"),
            );
        } else {
            let line_h = px(inner_height);
            inner = inner.child(
                ui::canvas(
                    |_, _, _| (),
                    move |bounds, _, window, cx| {
                        let origin = ui::point(bounds.origin.x - px(scroll), bounds.origin.y);
                        let _ = line.paint(origin, line_h, ui::TextAlign::Left, None, window, cx);
                    },
                )
                .absolute()
                .size_full(),
            );
        }
        if let Some((x0, x1)) = marked_span {
            inner = inner.child(make_strip(
                x0,
                x1,
                caret_top + caret_height - 1.0,
                1.0,
                palette.text_secondary,
            ));
        }
        inner = inner.child(
            div()
                .absolute()
                .left(px((caret_x - scroll).round()))
                .top(px(caret_top))
                .w(px(1.0))
                .h(px(caret_height))
                .bg(palette.text_primary),
        );
        let field = div()
            .flex_none()
            .w(px(field_width))
            .h(px(TOOLBAR_BUTTON))
            .px(px(8.0))
            .rounded(px(radius))
            .bg(palette.background)
            .border_1()
            .border_color(palette.brand)
            .flex()
            .items_center()
            .overflow_hidden()
            .text_size(px(TYPOGRAPHY.font_xs_px))
            .snapshot(
                "overlay.equation_editor.input",
                Some("overlay.equation_editor"),
            )
            .snapshot_focused(true)
            .snapshot_text(text)
            .child(inner);
        let mut done = div()
            .id("equation_apply")
            .flex_none()
            .w(px(EQUATION_DONE_WIDTH))
            .h(px(TOOLBAR_BUTTON))
            .rounded(px(radius))
            .bg(palette.brand)
            .text_color(palette.on_accent)
            .flex()
            .items_center()
            .justify_center()
            .text_size(px(TYPOGRAPHY.font_xs_px))
            .font_weight(FontWeight::MEDIUM)
            .snapshot(
                "overlay.equation_editor.done",
                Some("overlay.equation_editor"),
            )
            .snapshot_text("Done")
            .child("Done");
        if interactive {
            done = done
                .cursor_pointer()
                .on_click(emit(cx, |_: &ClickEvent| OverlayEvent::EquationApply));
        }
        let mut root = place(placed.rect)
            .id("equation-editor")
            .flex()
            .items_center()
            .gap(px(LINK_GAP))
            .p(px(TOOLBAR_PADDING))
            .rounded(px(TOOLBAR_RADIUS))
            .bg(palette.panel)
            .border_1()
            .border_color(palette.border)
            .shadow(palette.theme.shadows("--affine-toolbar-shadow").into())
            .opacity(progress)
            .snapshot("overlay.equation_editor", Some("root.canvas"))
            .snapshot_focused(interactive)
            .child(field)
            .child(done);
        if interactive {
            root = root
                .occlude()
                .on_mouse_down_out(emit(cx, |_: &MouseDownEvent| OverlayEvent::EquationApply));
        }
        Some(root.into_any_element())
    }
}
