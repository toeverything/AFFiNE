//! Inline label editor overlay painting and RichParagraph layout for Edgeless.

use std::collections::BTreeMap;

use ui::{AnyElement, Bounds, Pixels, Point, canvas, div, point, prelude::*, px, size};
use y_octo::{Any, TextDeltaOp, TextInsert};

use crate::{
    rich_text::{CaretPosition, RichParagraph, RichParagraphStyle, WrapAffinity},
    theme::{FONT_SANS, Palette, PlaygroundTheme},
};

use super::{EDGELESS_VIEWPORT_ID, EdgelessCamera, EdgelessLabelEditor, utf16_to_byte};

/// Build the screen-space inline label editor overlay element when a label editor is active.
#[allow(clippy::too_many_arguments)]
pub(super) fn build_inline_label_editor_overlay(
    editor: &EdgelessLabelEditor,
    camera: EdgelessCamera,
    vp_origin: Point<Pixels>,
    viewport_width: f32,
    viewport_height: f32,
    palette: &Palette,
    theme: PlaygroundTheme,
    window: &ui::Window,
) -> Option<AnyElement> {
    let in_place = editor.target.rotates_in_place();
    let eff_rotate = editor.effective_rotate_deg();
    let (box_x, box_y, box_w, box_h, layout_x, layout_y, layout_w, layout_h) =
        super::label_editor_screen_box(
            editor,
            camera,
            vp_origin,
            viewport_width,
            viewport_height,
            theme,
            window,
        );
    if box_w <= 0.0 || box_h <= 0.0 {
        return None;
    }

    let display = editor.display_text();
    let (sel, reversed) = editor.shown_selection();
    let selection_color = palette.brand.opacity(0.22);
    let caret_color = palette.brand;
    let bg = palette.panel;
    let border = palette.brand;
    let zoom = camera.zoom;
    let editor_clone = editor.clone();

    let mut el = div()
        .absolute()
        .left(px(box_x))
        .top(px(box_y))
        .w(px(box_w))
        .h(px(box_h))
        .overflow_hidden();
    if !in_place {
        el = el.rounded(px(4.0)).bg(bg).border_2().border_color(border);
    }
    let el = el
        .snapshot("edgeless.inline_edit", Some(EDGELESS_VIEWPORT_ID))
        .snapshot_text(display)
        .child(
            canvas(
                |_, _, _| (),
                move |bounds, _, window, cx| {
                    if let Some(laid_out) =
                        layout_label_editor_paragraph(&editor_clone, layout_w, zoom, theme, window)
                    {
                        let (ox, oy) = label_editor_text_origin(
                            &editor_clone,
                            layout_h,
                            f32::from(laid_out.size().height),
                            zoom,
                        );
                        let mut selections = Vec::new();
                        if sel.start != sel.end {
                            selections.push((sel.start as u64..sel.end as u64, selection_color));
                        }
                        let focus = if reversed { sel.start } else { sel.end };
                        let carets = [(
                            CaretPosition {
                                utf16_offset: focus as u64,
                                affinity: WrapAffinity::Upstream,
                            },
                            caret_color,
                        )];
                        let shape_x = f32::from(bounds.origin.x) + layout_x - box_x;
                        let shape_y = f32::from(bounds.origin.y) + layout_y - box_y;
                        let origin_pt = point(px(shape_x + ox), px(shape_y + oy));
                        if in_place {
                            let pad_x = editor_clone
                                .shape_style
                                .as_ref()
                                .map_or(0.0, |st| st.padding[1] * zoom);
                            let inner_w = (layout_w - 2.0 * pad_x).max(0.0);
                            if inner_w > 0.0 && layout_h > 0.0 {
                                let cx_win = shape_x + layout_w * 0.5;
                                let cy_win = shape_y + layout_h * 0.5;
                                let rot = if eff_rotate.abs() > 1e-4 {
                                    ui::TransformationMatrix::unit()
                                        .translate(point(
                                            ui::ScaledPixels(cx_win),
                                            ui::ScaledPixels(cy_win),
                                        ))
                                        .rotate(ui::radians(eff_rotate.to_radians()))
                                        .translate(point(
                                            ui::ScaledPixels(-cx_win),
                                            ui::ScaledPixels(-cy_win),
                                        ))
                                } else {
                                    ui::TransformationMatrix::unit()
                                };
                                let mask_bleed = if matches!(
                                    editor_clone.target,
                                    super::LabelTarget::SurfaceText { .. }
                                ) {
                                    2.0
                                } else {
                                    0.0
                                };
                                let mask = Bounds::new(
                                    point(
                                        px(shape_x + pad_x - mask_bleed),
                                        px(shape_y - mask_bleed),
                                    ),
                                    size(
                                        px(inner_w + 2.0 * mask_bleed),
                                        px(layout_h + 2.0 * mask_bleed),
                                    ),
                                );
                                window.with_paint_transformation(rot, |window| {
                                    window.with_local_paint_mask(
                                        ui::ContentMask { bounds: mask },
                                        |window| {
                                            laid_out.paint_at(
                                                origin_pt,
                                                &selections,
                                                &carets,
                                                None,
                                                window,
                                                cx,
                                            );
                                        },
                                    );
                                });
                            }
                        } else {
                            laid_out.paint_at(origin_pt, &selections, &carets, None, window, cx);
                        }
                    }
                },
            )
            .size_full(),
        );
    Some(el.into_any_element())
}

/// Local `(x, y)` origin for the laid-out text inside an open [`EdgelessLabelEditor`] box.
pub fn label_editor_text_origin(
    editor: &EdgelessLabelEditor,
    box_height: f32,
    text_height: f32,
    zoom: f32,
) -> (f32, f32) {
    if let Some(st) = &editor.shape_style {
        let py = st.padding[0] * zoom;
        let pad_x = st.padding[1] * zoom;
        let top = match st.vertical_align {
            blocksuite_playground_doc::read::VerticalAlign::Top => py,
            blocksuite_playground_doc::read::VerticalAlign::Center => {
                ((box_height - text_height) * 0.5).max(py)
            }
            blocksuite_playground_doc::read::VerticalAlign::Bottom => box_height - py - text_height,
        };
        (pad_x, top)
    } else {
        (6.0, 6.0)
    }
}

/// Lay out an open [`EdgelessLabelEditor`]'s display text (including IME underline marks)
/// for both overlay painting and inside-label pointer hit-testing.
pub fn layout_label_editor_paragraph(
    editor: &EdgelessLabelEditor,
    width: f32,
    zoom: f32,
    theme: PlaygroundTheme,
    window: &ui::Window,
) -> Option<crate::rich_text::LaidOutRichParagraph> {
    let pad_x = editor
        .shape_style
        .as_ref()
        .map_or(6.0, |st| st.padding[1] * zoom);
    let min_wrap = if editor.shape_style.is_some() {
        zoom.max(0.25)
    } else {
        20.0
    };
    let wrap_w = (width - 2.0 * pad_x).max(min_wrap);
    let display = editor.display_text();
    let marked = editor.marked_range();
    let mut delta = Vec::new();
    if let Some(m) = &marked {
        let (sel, _) = editor.shown_selection();
        let b0 = utf16_to_byte(&display, m.start);
        let b1 = utf16_to_byte(&display, m.end);
        let s0 = utf16_to_byte(&display, sel.start).clamp(b0, b1);
        let s1 = utf16_to_byte(&display, sel.end).clamp(s0, b1);
        if b0 > 0 {
            delta.push(TextDeltaOp::Insert {
                insert: TextInsert::Text(display[..b0].to_string()),
                format: None,
            });
        }
        if s0 > b0 {
            delta.push(TextDeltaOp::Insert {
                insert: TextInsert::Text(display[b0..s0].to_string()),
                format: Some(BTreeMap::from([("underline".to_string(), Any::True)])),
            });
        }
        if s1 > s0 {
            delta.push(TextDeltaOp::Insert {
                insert: TextInsert::Text(display[s0..s1].to_string()),
                format: Some(BTreeMap::from([
                    ("underline".to_string(), Any::True),
                    (
                        "background".to_string(),
                        Any::String("var(--affine-text-highlight-blue)".into()),
                    ),
                ])),
            });
        }
        if b1 > s1 {
            delta.push(TextDeltaOp::Insert {
                insert: TextInsert::Text(display[s1..b1].to_string()),
                format: Some(BTreeMap::from([("underline".to_string(), Any::True)])),
            });
        }
        if b1 < display.len() {
            delta.push(TextDeltaOp::Insert {
                insert: TextInsert::Text(display[b1..].to_string()),
                format: None,
            });
        }
    } else if !display.is_empty() {
        delta.push(TextDeltaOp::Insert {
            insert: TextInsert::Text(display),
            format: None,
        });
    }
    if let Some(st) = &editor.shape_style
        && matches!(st.font_style.as_str(), "italic" | "oblique")
    {
        for op in &mut delta {
            if let TextDeltaOp::Insert { format, .. } = op {
                format
                    .get_or_insert_with(Default::default)
                    .entry("italic".into())
                    .or_insert(Any::True);
            }
        }
    }
    let style = if let Some(st) = &editor.shape_style {
        let color_str = match &st.color {
            blocksuite_playground_doc::read::ColorValue::Single(v) => v.as_str(),
            blocksuite_playground_doc::read::ColorValue::Themed { light, dark } => {
                if theme == PlaygroundTheme::Light {
                    light.as_str()
                } else {
                    dark.as_str()
                }
            }
        };
        let text_color = theme
            .css_color(color_str)
            .or_else(|| theme.css_var(color_str))
            .unwrap_or_else(|| theme.palette().text_primary);
        let font_family: ui::SharedString = if st.font_family.is_empty() {
            FONT_SANS.into()
        } else {
            st.font_family
                .trim_start_matches("blocksuite:surface:")
                .to_string()
                .into()
        };
        let font_size = (st.font_size * zoom).max(0.5);
        let base_weight = ui::FontWeight(st.font_weight);
        let ts = window.text_system();
        let mut face = ui::font(font_family.clone());
        face.weight = base_weight;
        face.fallbacks = Some(crate::default_font_fallbacks());
        let font_id = ts.resolve_font(&face);
        let font_px = px(font_size);
        let ascent = f32::from(ts.ascent(font_id, font_px));
        let descent = f32::from(ts.descent(font_id, font_px)).abs();
        RichParagraphStyle {
            font_family,
            font_size,
            base_weight,
            line_height: (ascent + descent).max(0.5),
            baseline_offset: Some(ascent),
            text_color,
            align: match st.text_align {
                blocksuite_playground_doc::read::TextAlign::Left => ui::TextAlign::Left,
                blocksuite_playground_doc::read::TextAlign::Center => ui::TextAlign::Center,
                blocksuite_playground_doc::read::TextAlign::Right => ui::TextAlign::Right,
            },
            gfx_per_delta_rtl: true,
            ..RichParagraphStyle::from_theme(theme.mode())
        }
    } else {
        let is_frame_title = matches!(editor.target, super::LabelTarget::FrameTitle { .. });
        RichParagraphStyle {
            font_family: FONT_SANS.into(),
            font_size: 14.0,
            base_weight: if is_frame_title {
                ui::FontWeight(500.0)
            } else {
                ui::FontWeight::NORMAL
            },
            line_height: 20.0,
            text_color: theme.palette().text_primary,
            gfx_per_delta_rtl: !is_frame_title,
            ..RichParagraphStyle::from_theme(theme.mode())
        }
    };
    let para = RichParagraph::from_delta(delta).ok()?;
    Some(para.layout(window.text_system(), &style, wrap_w))
}
