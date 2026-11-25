//! Mobile `Search` tab screen with UTF-16 highlight span rendering and clear button.

use affine_client::{DirectKind, Origin};
use ui::{
    Context, Direction, ElementInputHandler, FocusHandle, Hsla, InteractiveElement, IntoElement,
    ParentElement, StatefulInteractiveElement, Styled, canvas, div, px, svg,
};
use ui_kit::LogicalStyled;

use crate::{state::MobileAppState, strings::MobileStrings};

use super::{CLOSE_ICON_SVG, MobileFlexExt, MobilePalette, MobileShellView, SEARCH_ICON_SVG};

fn row_dir(dir: Direction) -> ui::Div {
    let d = div().flex().flex_row().items_center();
    if dir.is_rtl() {
        d.dir_rtl()
    } else {
        d.dir_ltr()
    }
}

#[allow(clippy::too_many_arguments)]
pub(super) fn render_search(
    state: &MobileAppState,
    search_focus: FocusHandle,
    viewport_h: f32,
    palette: MobilePalette,
    dir: Direction,
    strings: &'static MobileStrings,
    cx: &mut Context<MobileShellView>,
) -> impl IntoElement {
    let hits = state.search_hits();
    let max_hits = if viewport_h < 460.0 { 3 } else { hits.len() };
    let search_entity = cx.entity();

    let mut search_bar = row_dir(dir)
        .id("mobile.search.input")
        .snapshot("mobile.search.input", Some("mobile.shell.root"))
        .relative()
        .w_full()
        .h(px(44.0))
        .rounded(px(10.0))
        .bg(palette.bg_surface)
        .border_1()
        .border_color(palette.accent)
        .ps(px(12.0), dir)
        .pe(px(4.0), dir)
        .justify_between()
        .on_click(cx.listener(|this, _, window, cx| {
            window.focus(&this.search_focus, cx);
            cx.notify();
        }))
        .child(
            canvas(
                |_, _, _| (),
                move |bounds, (), window, cx| {
                    window.handle_input(
                        &search_focus,
                        ElementInputHandler::new(bounds, search_entity.clone()),
                        cx,
                    );
                },
            )
            .absolute()
            .inset_0(),
        )
        .child(
            row_dir(dir)
                .gap(px(8.0))
                .child(
                    svg()
                        .data(SEARCH_ICON_SVG)
                        .mirror_in_rtl(true)
                        .w(px(16.0))
                        .h(px(16.0))
                        .text_color(palette.text_muted),
                )
                .child(
                    div()
                        .text_size(px(14.0))
                        .text_color(if state.search_query.is_empty() {
                            palette.text_muted
                        } else {
                            palette.text_primary
                        })
                        .child(if state.search_query.is_empty() {
                            strings.search_placeholder.to_string()
                        } else {
                            state.search_query.clone()
                        }),
                ),
        );

    if !state.search_query.is_empty() {
        search_bar = search_bar.child(
            div()
                .id("mobile.search.clear_btn")
                .snapshot("mobile.search.clear_btn", Some("mobile.shell.root"))
                .w(px(44.0))
                .h(px(44.0))
                .flex()
                .items_center()
                .justify_center()
                .on_click(cx.listener(|this, _, _, cx| {
                    this.state.search_query.clear();
                    cx.notify();
                }))
                .child(
                    svg()
                        .data(CLOSE_ICON_SVG)
                        .w(px(14.0))
                        .h(px(14.0))
                        .text_color(palette.text_secondary),
                ),
        );
    }

    let mut list = div()
        .w_full()
        .rounded(px(12.0))
        .bg(palette.bg_surface)
        .border_1()
        .border_color(palette.border)
        .flex()
        .flex_col()
        .overflow_hidden();

    for (idx, hit) in hits.iter().take(max_hits).enumerate() {
        let doc_id = hit.doc_id.clone();
        let body_preview = state
            .doc_by_id(&doc_id)
            .map(|d| d.body_preview.clone())
            .unwrap_or_default();
        let mut row = div()
            .id(format!("mobile.search.hit.{doc_id}"))
            .snapshot(
                format!("mobile.search.hit.{doc_id}"),
                Some("mobile.shell.root"),
            )
            .w_full()
            .min_h(px(64.0))
            .p(px(12.0))
            .flex()
            .flex_col()
            .gap(px(4.0))
            .overflow_hidden()
            .on_click(cx.listener(move |this, _, _, cx| {
                this.state
                    .open_doc(&doc_id, Origin::Direct(DirectKind::Search));
                cx.notify();
            }));
        if idx > 0 {
            row = row.border_t(px(1.0)).border_color(palette.border);
        }
        let title_spans: Vec<(usize, usize)> = hit
            .title_highlights
            .iter()
            .map(|s| (s.start, s.end))
            .collect();
        let body_spans: Vec<(usize, usize)> = hit
            .body_highlights
            .iter()
            .map(|s| (s.start, s.end))
            .collect();
        let (snippet_text, snippet_spans) = snippet_window_utf16(&body_preview, &body_spans, 44);
        row = row
            .child(render_highlighted_line(
                &hit.title,
                &title_spans,
                14.0,
                palette.text_primary,
                palette.accent,
                palette.accent_soft,
                dir,
            ))
            .child(render_highlighted_line(
                &snippet_text,
                &snippet_spans,
                12.0,
                palette.text_secondary,
                palette.accent,
                palette.accent_soft,
                dir,
            ));
        list = list.child(row);
    }

    div()
        .size_full()
        .flex()
        .flex_col()
        .p(px(16.0))
        .gap(px(12.0))
        .overflow_hidden()
        .child(search_bar)
        .child(list)
}

fn render_highlighted_line(
    text: &str,
    utf16_spans: &[(usize, usize)],
    font_size: f32,
    normal_color: Hsla,
    hi_color: Hsla,
    hi_bg: Hsla,
    dir: Direction,
) -> impl IntoElement {
    let segments = split_utf16_highlights(text, utf16_spans);
    let mut row = row_dir(dir).w_full().overflow_hidden();
    for (seg, highlighted) in segments {
        if highlighted {
            row = row.child(
                div()
                    .rounded(px(3.0))
                    .bg(hi_bg)
                    .text_size(px(font_size))
                    .text_color(hi_color)
                    .child(seg),
            );
        } else {
            row = row.child(
                div()
                    .text_size(px(font_size))
                    .text_color(normal_color)
                    .child(seg),
            );
        }
    }
    row
}

fn utf16_to_byte_offset(text: &str, utf16_target: usize) -> usize {
    let mut units = 0usize;
    for (byte_idx, ch) in text.char_indices() {
        if units >= utf16_target {
            return byte_idx;
        }
        units += ch.len_utf16();
    }
    text.len()
}

fn byte_to_utf16_offset(text: &str, byte_target: usize) -> usize {
    text[..byte_target.min(text.len())].encode_utf16().count()
}

/// Crops a long body preview to a UTF-16 window of at most `max_utf16` code units centered
/// around the first match span, adding leading/trailing `"…"` ellipses and rebasing spans.
pub(crate) fn snippet_window_utf16(
    text: &str,
    spans: &[(usize, usize)],
    max_utf16: usize,
) -> (String, Vec<(usize, usize)>) {
    let total_utf16: usize = text.encode_utf16().count();
    if total_utf16 <= max_utf16 || max_utf16 == 0 {
        return (text.to_string(), spans.to_vec());
    }

    let first_hit = spans.iter().copied().min_by_key(|(s, _)| *s);
    let (raw_start, raw_end) = if let Some((hs, he)) = first_hit {
        let lead = (max_utf16 / 2).min(24);
        let mut s = hs.saturating_sub(lead);
        let mut e = (s + max_utf16).min(total_utf16);
        if e < he.min(total_utf16) {
            e = he.min(total_utf16);
            s = e.saturating_sub(max_utf16);
        }
        if e == total_utf16 {
            s = total_utf16.saturating_sub(max_utf16);
        }
        (s, e)
    } else {
        (0, max_utf16.min(total_utf16))
    };

    let mut b_start = utf16_to_byte_offset(text, raw_start);
    let mut b_end = utf16_to_byte_offset(text, raw_end);

    // Avoid cutting ASCII words in half when a nearby space boundary keeps the first hit intact.
    let hit_b_start = first_hit.map(|(hs, _)| utf16_to_byte_offset(text, hs));
    let hit_b_end = first_hit.map(|(_, he)| utf16_to_byte_offset(text, he));
    if b_start > 0 {
        if let Some(rel) = text[b_start..b_end].find(' ') {
            let candidate = b_start + rel + 1;
            if hit_b_start.is_none_or(|hs| candidate <= hs) && candidate < b_end {
                b_start = candidate;
            }
        }
    }
    if b_end < text.len() {
        if let Some(rel) = text[b_start..b_end].rfind(' ') {
            let candidate = b_start + rel;
            if hit_b_end.is_none_or(|he| candidate >= he) && candidate > b_start {
                b_end = candidate;
            }
        }
    }

    let win_start = byte_to_utf16_offset(text, b_start);
    let win_end = byte_to_utf16_offset(text, b_end);
    let has_prefix = win_start > 0;
    let has_suffix = win_end < total_utf16;
    let prefix_utf16 = usize::from(has_prefix);

    let mut out = String::new();
    if has_prefix {
        out.push('…');
    }
    out.push_str(&text[b_start..b_end]);
    if has_suffix {
        out.push('…');
    }

    let shifted = spans
        .iter()
        .filter_map(|&(s, e)| {
            let cs = s.max(win_start);
            let ce = e.min(win_end);
            (ce > cs).then_some((cs - win_start + prefix_utf16, ce - win_start + prefix_utf16))
        })
        .collect();
    (out, shifted)
}

fn split_utf16_highlights(text: &str, spans: &[(usize, usize)]) -> Vec<(String, bool)> {
    if spans.is_empty() {
        return vec![(text.to_string(), false)];
    }
    let mut sorted: Vec<(usize, usize)> = spans.to_vec();
    sorted.sort_by_key(|(s, _)| *s);
    let mut out = Vec::new();
    let mut cursor = 0usize;
    for (u_start, u_end) in sorted {
        let b_start = utf16_to_byte_offset(text, u_start).max(cursor);
        let b_end = utf16_to_byte_offset(text, u_end).max(b_start);
        if b_start > cursor {
            out.push((text[cursor..b_start].to_string(), false));
        }
        if b_end > b_start {
            out.push((text[b_start..b_end].to_string(), true));
        }
        cursor = b_end;
    }
    if cursor < text.len() {
        out.push((text[cursor..].to_string(), false));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn utf16_highlight_splitter_slices_exact_match_runs() {
        let runs = split_utf16_highlights("Offline Sync Protocol v1", &[(8, 12)]);
        assert_eq!(
            runs,
            vec![
                ("Offline ".to_string(), false),
                ("Sync".to_string(), true),
                (" Protocol v1".to_string(), false),
            ]
        );
    }

    #[test]
    fn snippet_window_centers_deep_match_with_ellipses_and_shifted_spans() {
        let body = "This document describes the architecture of the local storage layer, the deterministic event queue, and the SpaceSync engine used for zero-loss mobile upgrades.";
        let hit_byte = body.find("Sync").expect("Sync present");
        let hit_u16 = body[..hit_byte].encode_utf16().count();
        assert!(
            hit_u16 > 80,
            "match must be deep in body (offset {hit_u16})"
        );

        let (snippet, spans) = snippet_window_utf16(body, &[(hit_u16, hit_u16 + 4)], 44);
        assert!(
            snippet.starts_with('…'),
            "expected leading ellipsis: {snippet}"
        );
        assert!(
            snippet.ends_with('…'),
            "expected trailing ellipsis: {snippet}"
        );
        assert_eq!(spans.len(), 1);
        let runs = split_utf16_highlights(&snippet, &spans);
        assert!(
            runs.iter().any(|(seg, hi)| *hi && seg == "Sync"),
            "expected shifted highlight on `Sync`, got {runs:?}"
        );
    }
}
