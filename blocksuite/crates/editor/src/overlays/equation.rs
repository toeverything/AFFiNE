use ui::{
    AnyElement, ClickEvent, Context, FontWeight, Hsla, MouseButton, MouseDownEvent, ShapedLine,
    SharedString, TextRun, Window, canvas, div, point, prelude::*, px,
};

use crate::{
    block_flow::FlowRect,
    inline_input::{Utf16ImeBuffer, utf16_len},
    theme::{FONT_CODE, FONT_SANS, Palette, TYPOGRAPHY},
};

use super::*;

const EQUATION_FIELD_WIDTH: f32 = 280.0;
const EQUATION_FIELD_PAD_X: f32 = 10.0;
const EQUATION_FIELD_PAD_Y: f32 = 4.0;
const EQUATION_LINE_HEIGHT: f32 = 20.0;
const EQUATION_FIELD_MAX_HEIGHT: f32 = 400.0;
const EQUATION_DONE_SIZE: f32 = 24.0;
const EQUATION_POPOVER_PAD: f32 = 8.0;
const EQUATION_GAP: f32 = 8.0;
const EQUATION_HINT_TOP: f32 = 6.0;
const EQUATION_HINT_HEIGHT: f32 = 16.0;

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

/// Cached visual soft-wrap line geometry for `Up`/`Down` navigation and pointer hit-testing.
#[derive(Clone, Debug, PartialEq)]
pub(super) struct VisualLatexLine {
    pub(super) start_u16: usize,
    pub(super) end_u16: usize,
    /// `true` when the next visual line starts at the same UTF-16 offset (soft wrap without `\n`).
    pub(super) soft_wrapped_next: bool,
    /// `(utf16_offset, x_px)` stops across this visual line, ordered by `utf16_offset`.
    pub(super) stops: Vec<(usize, f32)>,
}

impl VisualLatexLine {
    fn x_for_u16(&self, u16_off: usize) -> f32 {
        let clamped = u16_off.clamp(self.start_u16, self.end_u16);
        self.stops
            .iter()
            .find(|&&(off, _)| off >= clamped)
            .or_else(|| self.stops.last())
            .map_or(0.0, |&(_, x)| x)
    }

    fn nearest_u16_for_x(&self, target_x: f32) -> usize {
        let max_off = if self.soft_wrapped_next && self.end_u16 > self.start_u16 {
            self.end_u16 - 1
        } else {
            self.end_u16
        };
        let mut best_off = self.start_u16;
        let mut best_dist = f32::INFINITY;
        for &(off, x) in &self.stops {
            if off > max_off {
                break;
            }
            let dist = (x - target_x).abs();
            if dist < best_dist {
                best_dist = dist;
                best_off = off;
            }
        }
        best_off
    }
}

impl EquationEditor {
    /// Returns the `(start_u16, end_u16)` span of each laid-out visual row (including soft wraps).
    pub fn visual_line_ranges(&self) -> Vec<(usize, usize)> {
        self.visual_lines
            .iter()
            .map(|l| (l.start_u16, l.end_u16))
            .collect()
    }
}

/// Multiline auto-wrapping LaTeX equation editor popover anchored to a block or inline formula
/// (matching BlockSuite `latex-editor-menu.ts`).
#[derive(Clone, Debug, PartialEq)]
pub struct EquationEditor {
    pub target: EquationTarget,
    pub input: LinkBar,
    pub(super) initial_latex: String,
    pub(super) presence: Presence,
    pub(super) rect: Option<FlowRect>,
    pub(super) scroll_y: f32,
    pub(super) visual_lines: Vec<VisualLatexLine>,
}

impl EquationEditor {
    /// Committed draft text (excluding any in-flight IME preedit so half-typed pinyin never
    /// flashes `"Error equation"` in the live preview).
    pub fn committed_draft(&self) -> &str {
        self.input.url()
    }

    fn visual_line_index_for_u16(&self, u16_off: usize) -> usize {
        for (idx, line) in self.visual_lines.iter().enumerate() {
            let at_soft_wrap_end = line.soft_wrapped_next && u16_off == line.end_u16;
            if u16_off >= line.start_u16 && u16_off <= line.end_u16 && !at_soft_wrap_end {
                return idx;
            }
        }
        self.visual_lines.len().saturating_sub(1)
    }

    /// Move the caret up or down one visual (soft-wrapped or `\n`-broken) line inside the
    /// multiline equation buffer.
    pub(super) fn move_vertical_line(&mut self, down: bool, shift: bool) {
        let focus = self.input.input.focus();
        if !self.visual_lines.is_empty() {
            let cur_idx = self.visual_line_index_for_u16(focus);
            let cur_x = self.visual_lines[cur_idx].x_for_u16(focus);
            let next_off = if down {
                if cur_idx + 1 < self.visual_lines.len() {
                    self.visual_lines[cur_idx + 1].nearest_u16_for_x(cur_x)
                } else {
                    self.visual_lines.last().map_or(0, |l| l.end_u16)
                }
            } else if cur_idx > 0 {
                self.visual_lines[cur_idx - 1].nearest_u16_for_x(cur_x)
            } else {
                0
            };
            self.input.input.move_caret(next_off, shift);
            return;
        }

        // Pre-first-frame fallback: split on explicit `\n` lines.
        let text = self.input.input.text();
        let mut lines: Vec<(usize, usize)> = Vec::new();
        let mut u16_pos = 0usize;
        for part in text.split('\n') {
            let len = utf16_len(part);
            lines.push((u16_pos, u16_pos + len));
            u16_pos += len + 1;
        }
        if lines.is_empty() {
            return;
        }
        let cur_idx = lines
            .iter()
            .position(|&(s, e)| focus >= s && focus <= e)
            .unwrap_or(lines.len() - 1);
        let col = focus.saturating_sub(lines[cur_idx].0);
        let next_off = if down {
            if cur_idx + 1 < lines.len() {
                let (ns, ne) = lines[cur_idx + 1];
                (ns + col).min(ne)
            } else {
                lines.last().map_or(0, |&(_, e)| e)
            }
        } else if cur_idx > 0 {
            let (ps, pe) = lines[cur_idx - 1];
            (ps + col).min(pe)
        } else {
            0
        };
        self.input.input.move_caret(next_off, shift);
    }

    /// Map a window-space point `(screen_x, screen_y)` inside the multiline equation field
    /// to its nearest UTF-16 character offset across wrapped visual rows.
    pub fn hit_test_point(&self, screen_x: f32, screen_y: f32) -> Option<usize> {
        let bounds = self.input.bounds?;
        if !bounds.contains(screen_x, screen_y) || self.visual_lines.is_empty() {
            return None;
        }
        let local_x = (screen_x - (bounds.x + EQUATION_FIELD_PAD_X + 1.0)).max(0.0);
        let local_y = (screen_y - (bounds.y + EQUATION_FIELD_PAD_Y + 1.0) + self.scroll_y).max(0.0);
        let row_idx = ((local_y / EQUATION_LINE_HEIGHT).floor() as usize)
            .min(self.visual_lines.len().saturating_sub(1));
        Some(self.visual_lines[row_idx].nearest_u16_for_x(local_x))
    }

    /// Place or extend the caret at `(screen_x, screen_y)` inside the multiline equation field.
    pub(super) fn click_at(&mut self, screen_x: f32, screen_y: f32, shift: bool) -> bool {
        let Some(bounds) = self.input.bounds else {
            return false;
        };
        let local_x = (screen_x - (bounds.x + EQUATION_FIELD_PAD_X + 1.0)).max(0.0);
        let local_y = (screen_y - (bounds.y + EQUATION_FIELD_PAD_Y + 1.0) + self.scroll_y).max(0.0);
        if self.visual_lines.is_empty() {
            return false;
        }
        if self.input.composing() {
            self.input.unmark();
        }
        let row_idx = ((local_y / EQUATION_LINE_HEIGHT).floor() as usize)
            .min(self.visual_lines.len().saturating_sub(1));
        let off = self.visual_lines[row_idx].nearest_u16_for_x(local_x);
        self.input.input.move_caret(off, shift);
        true
    }
}

struct WrappedLatexLine {
    shaped: ShapedLine,
    start_u16: usize,
    end_u16: usize,
    text: String,
}

fn shape_latex_segment(
    segment: &str,
    font: &ui::Font,
    theme_mode: crate::theme::ThemeMode,
    default_color: Hsla,
    window: &Window,
) -> ShapedLine {
    let shown = SharedString::from(segment.to_string());
    let hl = crate::highlight::highlight_line(
        crate::highlight::LanguageId::Latex,
        segment,
        crate::highlight::LineState::Normal,
    );
    let runs: Vec<TextRun> = if hl.spans.is_empty() {
        vec![TextRun {
            len: shown.len(),
            font: font.clone(),
            color: default_color,
            background_color: None,
            underline: None,
            strikethrough: None,
        }]
    } else {
        hl.spans
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
    window
        .text_system()
        .shape_line(shown, px(TYPOGRAPHY.font_sm_px), &runs, None)
}

fn wrap_latex_lines(
    text: &str,
    max_w: f32,
    font: &ui::Font,
    theme_mode: crate::theme::ThemeMode,
    default_color: Hsla,
    window: &Window,
) -> Vec<WrappedLatexLine> {
    let mut out = Vec::new();
    let mut base_u16 = 0usize;
    for raw_line in text.split('\n') {
        if raw_line.is_empty() {
            let shaped = shape_latex_segment("", font, theme_mode, default_color, window);
            out.push(WrappedLatexLine {
                shaped,
                start_u16: base_u16,
                end_u16: base_u16,
                text: String::new(),
            });
            base_u16 += 1;
            continue;
        }
        let mut rem = raw_line;
        let mut seg_u16 = base_u16;
        while !rem.is_empty() {
            let full = shape_latex_segment(rem, font, theme_mode, default_color, window);
            if f32::from(full.width()) <= max_w {
                let len_u16 = utf16_len(rem);
                out.push(WrappedLatexLine {
                    shaped: full,
                    start_u16: seg_u16,
                    end_u16: seg_u16 + len_u16,
                    text: rem.to_string(),
                });
                break;
            }
            let mut best_byte = 0usize;
            let mut last_space = 0usize;
            for (byte, ch) in rem.char_indices() {
                if byte == 0 {
                    continue;
                }
                let w = f32::from(full.x_for_index(byte));
                if w > max_w {
                    break;
                }
                best_byte = byte;
                if ch.is_whitespace() {
                    last_space = byte + ch.len_utf8();
                }
            }
            let split_at = if last_space > 0 && last_space <= best_byte {
                last_space
            } else if best_byte > 0 {
                best_byte
            } else {
                rem.chars().next().map_or(rem.len(), char::len_utf8)
            };
            let (head, tail) = rem.split_at(split_at);
            let len_u16 = utf16_len(head);
            let shaped = shape_latex_segment(head, font, theme_mode, default_color, window);
            out.push(WrappedLatexLine {
                shaped,
                start_u16: seg_u16,
                end_u16: seg_u16 + len_u16,
                text: head.to_string(),
            });
            seg_u16 += len_u16;
            rem = tail;
        }
        base_u16 += utf16_len(raw_line) + 1;
    }
    out
}

fn build_visual_lines(wrapped: &[WrappedLatexLine]) -> Vec<VisualLatexLine> {
    wrapped
        .iter()
        .enumerate()
        .map(|(idx, line)| {
            let soft_wrapped_next =
                idx + 1 < wrapped.len() && wrapped[idx + 1].start_u16 == line.end_u16;
            let mut stops = Vec::with_capacity(line.text.chars().count() + 1);
            let mut rel_u16 = 0usize;
            for (byte_idx, ch) in line.text.char_indices() {
                let x = f32::from(line.shaped.x_for_index(byte_idx));
                stops.push((line.start_u16 + rel_u16, x));
                rel_u16 += ch.len_utf16();
            }
            stops.push((line.end_u16, f32::from(line.shaped.width())));
            VisualLatexLine {
                start_u16: line.start_u16,
                end_u16: line.end_u16,
                soft_wrapped_next,
                stops,
            }
        })
        .collect()
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

    /// Open and focus the multiline equation editor for `target`.
    pub fn open_equation_editor(&mut self, target: EquationTarget, initial: String, now_ms: f64) {
        self.close_slash(now_ms);
        self.close_linked_doc(now_ms);
        self.close_link_field();
        self.close_bookmark_prompt_at(now_ms);
        let presence = match self.equation.take() {
            Some(existing) => existing.presence.reopened(now_ms),
            None => Presence::opening(now_ms),
        };
        self.equation = Some(EquationEditor {
            target,
            initial_latex: initial.clone(),
            input: LinkBar {
                input: Utf16ImeBuffer::new(initial, true),
                bounds: None,
            },
            presence,
            rect: None,
            scroll_y: 0.0,
            visual_lines: Vec::new(),
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
        let max_popover_w = (viewport.w - 2.0 * POPOVER_EDGE_MARGIN).max(160.0);
        let desired_popover_w = EQUATION_FIELD_WIDTH
            + EQUATION_GAP
            + EQUATION_DONE_SIZE
            + 2.0 * EQUATION_POPOVER_PAD
            + 1.0;
        let width = desired_popover_w.min(max_popover_w).floor();
        let field_width =
            (width - 2.0 * EQUATION_POPOVER_PAD - 1.0 - EQUATION_GAP - EQUATION_DONE_SIZE)
                .max(80.0);
        let text_room = (field_width - 2.0 * (EQUATION_FIELD_PAD_X + 1.0)).max(24.0);

        let text = editor.input.text();
        let (selection, reversed) = editor.input.shown_selection();
        let marked = editor.input.marked_range();
        let mut font = ui::font(FONT_CODE);
        font.weight = FontWeight::NORMAL;
        let theme_mode = palette.theme.mode();
        let wrapped = wrap_latex_lines(
            &text,
            text_room,
            &font,
            theme_mode,
            palette.text_primary,
            window,
        );
        editor.visual_lines = build_visual_lines(&wrapped);

        let content_h = (wrapped.len().max(1) as f32) * EQUATION_LINE_HEIGHT;
        let max_inner_h = EQUATION_FIELD_MAX_HEIGHT - 2.0 * (EQUATION_FIELD_PAD_Y + 1.0);
        let inner_h = content_h.clamp(EQUATION_LINE_HEIGHT, max_inner_h);
        let field_height = (inner_h + 2.0 * (EQUATION_FIELD_PAD_Y + 1.0)).round();
        let height = (2.0 * EQUATION_POPOVER_PAD
            + 1.0
            + field_height
            + EQUATION_HINT_TOP
            + EQUATION_HINT_HEIGHT)
            .round();

        let placed = place_popover(
            anchor,
            (width, height),
            viewport,
            Placement::BelowStart,
            POPOVER_GAP,
            POPOVER_EDGE_MARGIN,
        );
        editor.rect = Some(placed.rect);
        editor.input.bounds = Some(FlowRect::new(
            placed.rect.x + EQUATION_POPOVER_PAD,
            placed.rect.y + EQUATION_POPOVER_PAD,
            field_width,
            field_height,
        ));

        let caret_u16 = if reversed {
            selection.start
        } else {
            selection.end
        };
        let (caret_line_idx, caret_x) = wrapped
            .iter()
            .enumerate()
            .find(|(idx, line)| {
                caret_u16 >= line.start_u16
                    && (caret_u16 < line.end_u16
                        || (caret_u16 == line.end_u16
                            && (*idx + 1 == wrapped.len()
                                || wrapped[*idx + 1].start_u16 > line.end_u16)))
            })
            .map(|(idx, line)| {
                let rel = caret_u16.saturating_sub(line.start_u16);
                let bx = f32::from(line.shaped.x_for_index(utf16_to_byte(&line.text, rel)));
                (idx, bx)
            })
            .unwrap_or_else(|| {
                let last_idx = wrapped.len().saturating_sub(1);
                let bx = wrapped.last().map_or(0.0, |l| f32::from(l.shaped.width()));
                (last_idx, bx)
            });

        let caret_top_y = caret_line_idx as f32 * EQUATION_LINE_HEIGHT;
        let max_scroll_y = (content_h - inner_h).max(0.0);
        if caret_top_y < editor.scroll_y {
            editor.scroll_y = caret_top_y;
        } else if caret_top_y + EQUATION_LINE_HEIGHT > editor.scroll_y + inner_h {
            editor.scroll_y = caret_top_y + EQUATION_LINE_HEIGHT - inner_h;
        }
        editor.scroll_y = editor.scroll_y.clamp(0.0, max_scroll_y).round();
        let scroll_y = editor.scroll_y;

        let mut inner = div()
            .relative()
            .flex_none()
            .w(px(text_room))
            .h(px(inner_h))
            .overflow_hidden();

        for (idx, line) in wrapped.iter().enumerate() {
            let line_y = idx as f32 * EQUATION_LINE_HEIGHT - scroll_y;
            if line_y + EQUATION_LINE_HEIGHT <= 0.0 || line_y >= inner_h {
                continue;
            }
            if marked.is_none() && !selection.is_empty() {
                let s0 = selection.start.max(line.start_u16);
                let s1 = selection.end.min(line.end_u16);
                if s1 > s0 {
                    let x0 = f32::from(
                        line.shaped
                            .x_for_index(utf16_to_byte(&line.text, s0 - line.start_u16)),
                    );
                    let x1 = f32::from(
                        line.shaped
                            .x_for_index(utf16_to_byte(&line.text, s1 - line.start_u16)),
                    );
                    inner = inner.child(
                        div()
                            .absolute()
                            .left(px(x0.round()))
                            .top(px(line_y + 2.0))
                            .w(px((x1 - x0).round().max(1.0)))
                            .h(px(16.0))
                            .bg(palette.brand.opacity(0.22)),
                    );
                }
            }
            if let Some(m) = &marked {
                let m0 = m.start.max(line.start_u16);
                let m1 = m.end.min(line.end_u16);
                if m1 > m0 {
                    let x0 = f32::from(
                        line.shaped
                            .x_for_index(utf16_to_byte(&line.text, m0 - line.start_u16)),
                    );
                    let x1 = f32::from(
                        line.shaped
                            .x_for_index(utf16_to_byte(&line.text, m1 - line.start_u16)),
                    );
                    inner = inner.child(
                        div()
                            .absolute()
                            .left(px(x0.round()))
                            .top(px(line_y + 17.0))
                            .w(px((x1 - x0).round().max(1.0)))
                            .h(px(1.0))
                            .bg(palette.text_secondary),
                    );
                }
            }
            if !line.text.is_empty() {
                let shaped = line.shaped.clone();
                inner = inner.child(
                    ui::canvas(
                        |_, _, _| (),
                        move |bounds, _, window, cx| {
                            let origin = ui::point(bounds.origin.x, bounds.origin.y + px(line_y));
                            let _ = shaped.paint(
                                origin,
                                px(EQUATION_LINE_HEIGHT),
                                ui::TextAlign::Left,
                                None,
                                window,
                                cx,
                            );
                        },
                    )
                    .absolute()
                    .size_full(),
                );
            }
        }

        if text.is_empty() {
            inner = inner.child(
                div()
                    .absolute()
                    .left(px(1.0))
                    .top(px(0.0))
                    .h(px(EQUATION_LINE_HEIGHT))
                    .flex()
                    .items_center()
                    .whitespace_nowrap()
                    .font_family(FONT_SANS)
                    .text_color(palette.placeholder)
                    .child("Enter LaTeX equation"),
            );
        }

        let caret_y = caret_top_y - scroll_y + 2.0;
        if caret_y + 16.0 > 0.0 && caret_y < inner_h {
            inner = inner.child(
                div()
                    .absolute()
                    .left(px(caret_x.round()))
                    .top(px(caret_y))
                    .w(px(1.0))
                    .h(px(16.0))
                    .bg(palette.text_primary),
            );
        }

        let focus_border = palette
            .theme
            .css_var("--affine-blue-700")
            .unwrap_or(palette.brand);
        let overlay_bg = palette
            .theme
            .css_var("--affine-v2-layer-background-overlayPanel")
            .unwrap_or(palette.panel);
        let hover_bg = palette.hover;

        let mut field = div()
            .id("equation_input")
            .flex_none()
            .w(px(field_width))
            .h(px(field_height))
            .px(px(EQUATION_FIELD_PAD_X))
            .py(px(EQUATION_FIELD_PAD_Y))
            .rounded(px(4.0))
            .bg(palette.background)
            .border_1()
            .border_color(focus_border)
            .overflow_hidden()
            .text_size(px(TYPOGRAPHY.font_sm_px))
            .snapshot(
                "overlay.equation_editor.input",
                Some("overlay.equation_editor"),
            )
            .snapshot_focused(true)
            .snapshot_text(text)
            .child(inner);
        if interactive {
            field = field.cursor(ui::CursorStyle::IBeam).on_mouse_down(
                MouseButton::Left,
                emit(cx, |ev: &MouseDownEvent| OverlayEvent::EquationClick {
                    x: f32::from(ev.position.x),
                    y: f32::from(ev.position.y),
                    shift: ev.modifiers.shift,
                }),
            );
        }

        let icon_color = palette.icon;
        let done_glyph = canvas(
            |_, _, _| (),
            move |bounds, (), window, _| {
                let mut builder = ui::PathBuilder::stroke(px(1.75));
                let x = f32::from(bounds.origin.x);
                let y = f32::from(bounds.origin.y);
                let w = f32::from(bounds.size.width);
                let h = f32::from(bounds.size.height);
                builder.move_to(point(px(x + w * 0.22), px(y + h * 0.52)));
                builder.line_to(point(px(x + w * 0.42), px(y + h * 0.72)));
                builder.line_to(point(px(x + w * 0.78), px(y + h * 0.30)));
                if let Ok(path) = builder.build() {
                    window.paint_path(path, icon_color);
                }
            },
        )
        .w(px(20.0))
        .h(px(20.0));

        let mut done = div()
            .id("equation_apply")
            .flex_none()
            .w(px(EQUATION_DONE_SIZE))
            .h(px(EQUATION_DONE_SIZE))
            .rounded(px(4.0))
            .flex()
            .items_center()
            .justify_center()
            .snapshot(
                "overlay.equation_editor.done",
                Some("overlay.equation_editor"),
            )
            .snapshot_text("Done")
            .child(done_glyph);
        if interactive {
            done = done
                .cursor_pointer()
                .hover(move |style| style.bg(hover_bg))
                .on_click(emit(cx, |_: &ClickEvent| OverlayEvent::EquationApply));
        }

        let done_mt = (field_height - EQUATION_DONE_SIZE).max(0.0);
        let top_row = div()
            .flex()
            .gap(px(EQUATION_GAP))
            .child(field)
            .child(done.mt(px(done_mt)));

        let hint_row = div()
            .pt(px(EQUATION_HINT_TOP))
            .h(px(EQUATION_HINT_TOP + EQUATION_HINT_HEIGHT))
            .text_size(px(TYPOGRAPHY.font_xs_px))
            .line_height(px(EQUATION_HINT_HEIGHT))
            .text_color(palette.placeholder)
            .child("Shift Enter to line break");

        let mut root = place(placed.rect)
            .id("equation-editor")
            .flex()
            .flex_col()
            .p(px(EQUATION_POPOVER_PAD))
            .rounded(px(8.0))
            .bg(overlay_bg)
            .border(px(0.5))
            .border_color(palette.border)
            .shadow(palette.theme.shadows("--affine-toolbar-shadow").into())
            .opacity(progress)
            .snapshot("overlay.equation_editor", Some("root.canvas"))
            .snapshot_focused(interactive)
            .child(top_row)
            .child(hint_row);
        if interactive {
            root = root
                .occlude()
                .on_mouse_down_out(emit(cx, |_: &MouseDownEvent| OverlayEvent::EquationApply));
        }
        Some(root.into_any_element())
    }
}
