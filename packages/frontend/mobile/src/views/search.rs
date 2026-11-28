//! Mobile `Search` tab screen with UTF-16 highlight span rendering, focus caret,
//! IME preedit underline, matched tag badges, vertical scroll, and clear button.

use affine_client::{DirectKind, Origin};
use ui::{
    Context, Direction, ElementInputHandler, FocusHandle, Hsla, InteractiveElement, IntoElement,
    ParentElement, StatefulInteractiveElement, Styled, canvas, div, px, svg,
};
use ui_kit::LogicalStyled;

use crate::{state::MobileAppState, strings::MobileStrings};

use super::{
    A11yBoundsMap, CLOSE_ICON_SVG, MobileFlexExt, MobilePalette, MobileShellView, SEARCH_ICON_SVG,
    a11y_bounds_probe,
};

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
    state: &mut MobileAppState,
    search_focus: FocusHandle,
    is_focused: bool,
    viewport_h: f32,
    palette: MobilePalette,
    dir: Direction,
    strings: &'static MobileStrings,
    a11y_bounds: &A11yBoundsMap,
    cx: &mut Context<MobileShellView>,
) -> impl IntoElement {
    let hits = state.search_hits();
    let search_entity = cx.entity();

    let mut input_text = row_dir(dir)
        .flex_1()
        .min_w(px(0.0))
        .overflow_hidden()
        .gap(px(1.0));
    if state.search_query.is_empty() {
        if is_focused {
            input_text = input_text.child(
                div()
                    .w(px(2.0))
                    .h(px(18.0))
                    .flex_shrink(0.0)
                    .rounded(px(1.0))
                    .bg(palette.accent),
            );
        }
        input_text = input_text.child(
            div()
                .flex_1()
                .min_w(px(0.0))
                .overflow_hidden()
                .text_size(px(14.0))
                .text_color(palette.text_muted)
                .align_start_for(dir)
                .child(strings.search_placeholder),
        );
    } else if let Some(pre) = state.search_preedit.clone() {
        let total = state.search_query.encode_utf16().count();
        let s = utf16_to_byte_offset(&state.search_query, pre.start.min(total));
        let e = utf16_to_byte_offset(
            &state.search_query,
            pre.end.min(total).max(pre.start.min(total)),
        );
        if s > 0 {
            input_text = input_text.child(
                div()
                    .text_size(px(14.0))
                    .text_color(palette.text_primary)
                    .child(state.search_query[..s].to_string()),
            );
        }
        if e > s {
            input_text = input_text.child(
                div()
                    .border_b_1()
                    .border_color(palette.accent)
                    .text_size(px(14.0))
                    .text_color(palette.text_primary)
                    .child(state.search_query[s..e].to_string()),
            );
        }
        if e < state.search_query.len() {
            input_text = input_text.child(
                div()
                    .text_size(px(14.0))
                    .text_color(palette.text_primary)
                    .child(state.search_query[e..].to_string()),
            );
        }
    } else {
        input_text = input_text.child(
            div()
                .min_w(px(0.0))
                .overflow_hidden()
                .text_size(px(14.0))
                .text_color(palette.text_primary)
                .align_start_for(dir)
                .child(state.search_query.clone()),
        );
        if is_focused {
            input_text = input_text.child(
                div()
                    .w(px(2.0))
                    .h(px(18.0))
                    .flex_shrink(0.0)
                    .rounded(px(1.0))
                    .bg(palette.accent),
            );
        }
    }

    let mut search_bar = row_dir(dir)
        .id("mobile.search.input")
        .snapshot("mobile.search.input", Some("mobile.shell.root"))
        .relative()
        .w_full()
        .h(px(46.0))
        .flex_shrink(0.0)
        .rounded(px(10.0))
        .bg(palette.bg_surface)
        .border_1()
        .border_color(palette.accent)
        .ps(px(12.0), dir)
        .pe(px(4.0), dir)
        .gap(px(4.0))
        .justify_between()
        .overflow_hidden()
        .on_click(cx.listener(|this, _, window, cx| {
            window.focus(&this.search_focus, cx);
            cx.notify();
        }))
        .child(a11y_bounds_probe(
            "mobile.search.input",
            a11y_bounds.clone(),
        ))
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
                .flex_1()
                .min_w(px(0.0))
                .overflow_hidden()
                .gap(px(8.0))
                .child(
                    svg()
                        .data(SEARCH_ICON_SVG)
                        .mirror_in_rtl(true)
                        .w(px(16.0))
                        .h(px(16.0))
                        .flex_shrink(0.0)
                        .text_color(palette.text_muted),
                )
                .child(input_text),
        );

    if !state.search_query.is_empty() {
        search_bar = search_bar.child(
            div()
                .id("mobile.search.clear_btn")
                .snapshot("mobile.search.clear_btn", Some("mobile.shell.root"))
                .relative()
                .w(px(44.0))
                .h(px(44.0))
                .flex_shrink(0.0)
                .flex()
                .items_center()
                .justify_center()
                .on_click(cx.listener(|this, _, _, cx| {
                    this.state.search_query.clear();
                    this.state.search_preedit = None;
                    this.state.search_selection = 0..0;
                    cx.notify();
                }))
                .child(a11y_bounds_probe(
                    "mobile.search.clear_btn",
                    a11y_bounds.clone(),
                ))
                .child(
                    svg()
                        .data(CLOSE_ICON_SVG)
                        .w(px(14.0))
                        .h(px(14.0))
                        .text_color(palette.text_secondary),
                ),
        );
    }

    let mut root = div()
        .size_full()
        .flex()
        .flex_col()
        .p(px(16.0))
        .gap(px(12.0))
        .overflow_hidden()
        .child(search_bar);

    if !hits.is_empty() {
        let avail_h = (viewport_h - 64.0 - 32.0 - 44.0 - 12.0).max(60.0);
        let content_h = (hits.len() as f32) * 76.0 + 4.0;
        let max_scroll = (content_h - avail_h).max(0.0);
        state.search_scroll_y = state.search_scroll_y.clamp(0.0, max_scroll);
        let scroll_y = state.search_scroll_y;

        let mut list = div()
            .id("mobile.search.results")
            .snapshot("mobile.search.results", Some("mobile.shell.root"))
            .w_full()
            .rounded(px(12.0))
            .bg(palette.bg_surface)
            .border_1()
            .border_color(palette.border)
            .flex()
            .flex_col()
            .overflow_hidden();

        for (idx, hit) in hits.iter().enumerate() {
            let doc_id = hit.doc_id.clone();
            let hit_id = format!("mobile.search.hit.{doc_id}");
            let body_preview = state
                .doc_by_id(&doc_id)
                .map(|d| d.body_preview.clone())
                .unwrap_or_default();
            let mut row = div()
                .id(hit_id.clone())
                .snapshot(hit_id.clone(), Some("mobile.shell.root"))
                .relative()
                .w_full()
                .min_h(px(64.0))
                .flex_shrink(0.0)
                .p(px(12.0))
                .flex()
                .flex_col()
                .gap(px(4.0))
                .overflow_hidden()
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.state
                        .open_doc(&doc_id, Origin::Direct(DirectKind::Search));
                    cx.notify();
                }))
                .child(a11y_bounds_probe(hit_id, a11y_bounds.clone()));
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
            let (snippet_text, snippet_spans) =
                snippet_window_utf16(&body_preview, &body_spans, 44);
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
            if !hit.matched_tags.is_empty() {
                let mut tags_row = row_dir(dir).w_full().gap(px(6.0)).overflow_hidden();
                for tag in hit.matched_tags.iter().take(4) {
                    tags_row = tags_row.child(
                        div()
                            .px(px(6.0))
                            .py(px(2.0))
                            .rounded(px(6.0))
                            .bg(palette.accent_soft)
                            .text_size(px(11.0))
                            .text_color(palette.accent)
                            .child(format!("#{tag}")),
                    );
                }
                row = row.child(tags_row);
            }
            list = list.child(row);
        }

        let scroll_box = div()
            .id("mobile.search.scroll_viewport")
            .flex_1()
            .min_h(px(0.0))
            .w_full()
            .relative()
            .overflow_hidden()
            .on_scroll(cx.listener(move |this, event: &ui::ScrollEvent, _, cx| {
                let dy: f32 = event.delta.pixel_delta(px(24.0)).y.into();
                if dy.abs() > 0.01 {
                    this.state.search_scroll_y =
                        (this.state.search_scroll_y - dy).clamp(0.0, max_scroll);
                    cx.notify();
                }
            }))
            .child(div().w_full().mt(px(-scroll_y)).child(list));
        root = root.child(scroll_box);
    } else if !state.search_query.is_empty() {
        root = root.child(
            div()
                .id("mobile.search.empty_state")
                .snapshot("mobile.search.empty_state", Some("mobile.shell.root"))
                .flex_1()
                .w_full()
                .flex()
                .flex_col()
                .items_center()
                .justify_center()
                .gap(px(10.0))
                .child(
                    svg()
                        .data(SEARCH_ICON_SVG)
                        .mirror_in_rtl(true)
                        .w(px(28.0))
                        .h(px(28.0))
                        .text_color(palette.text_muted),
                )
                .child(
                    div()
                        .text_size(px(14.0))
                        .text_color(palette.text_secondary)
                        .child(strings.search_no_results),
                ),
        );
    }

    root
}

fn contains_arabic(text: &str) -> bool {
    text.chars()
        .any(|c| matches!(c, '\u{0600}'..='\u{06FF}' | '\u{0750}'..='\u{077F}' | '\u{08A0}'..='\u{08FF}'))
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
    let preserve_words = dir.is_rtl() || contains_arabic(text);
    let segments = split_utf16_highlights_mode(text, utf16_spans, preserve_words);
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

fn split_utf16_highlights_mode(
    text: &str,
    spans: &[(usize, usize)],
    expand_to_word_boundaries: bool,
) -> Vec<(String, bool)> {
    if spans.is_empty() {
        return vec![(text.to_string(), false)];
    }
    let mut byte_spans: Vec<(usize, usize)> = spans
        .iter()
        .map(|&(u_start, u_end)| {
            let mut b_start = utf16_to_byte_offset(text, u_start);
            let mut b_end = utf16_to_byte_offset(text, u_end).max(b_start);
            if expand_to_word_boundaries && b_end > b_start {
                b_start = text[..b_start]
                    .rfind(char::is_whitespace)
                    .map(|idx| idx + text[idx..].chars().next().map_or(1, char::len_utf8))
                    .unwrap_or(0);
                b_end = text[b_end..]
                    .find(char::is_whitespace)
                    .map(|rel| b_end + rel)
                    .unwrap_or(text.len());
            }
            (b_start, b_end)
        })
        .collect();
    byte_spans.sort_by_key(|(s, _)| *s);

    let mut merged: Vec<(usize, usize)> = Vec::new();
    for (s, e) in byte_spans {
        if let Some(last) = merged.last_mut()
            && s <= last.1
        {
            last.1 = last.1.max(e);
            continue;
        }
        merged.push((s, e));
    }

    let mut out = Vec::new();
    let mut cursor = 0usize;
    for (b_start, b_end) in merged {
        let s = b_start.max(cursor);
        let e = b_end.max(s);
        if s > cursor {
            out.push((text[cursor..s].to_string(), false));
        }
        if e > s {
            out.push((text[s..e].to_string(), true));
        }
        cursor = e;
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
        let runs = split_utf16_highlights_mode("Offline Sync Protocol v1", &[(8, 12)], false);
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
    fn arabic_highlight_expands_to_whole_word_preserving_ligatures() {
        let text = "بروتوكول المزامنة دون اتصال";
        let match_byte = text.find("زامن").expect("substring present");
        let start_u16 = byte_to_utf16_offset(text, match_byte);
        let end_u16 = byte_to_utf16_offset(text, match_byte + "زامن".len());
        let runs = split_utf16_highlights_mode(text, &[(start_u16, end_u16)], true);
        assert!(
            runs.iter().any(|(seg, hi)| *hi && seg == "المزامنة"),
            "Arabic highlight must keep whole cursive word intact, got {runs:?}"
        );
    }

    #[test]
    fn snippet_window_centers_deep_match_with_ellipses_and_shifted_spans() {
        let body = "This document describes the architecture of the local storage layer, the deterministic event queue, and the SpaceSync engine used for zero-loss mobile upgrades.";
        let hit_byte = body.find("Sync").expect("Sync present");
        let hit_u16 = body[..hit_byte].encode_utf16().count();
        assert!(hit_u16 > 80);

        let (snippet, spans) = snippet_window_utf16(body, &[(hit_u16, hit_u16 + 4)], 44);
        assert!(snippet.starts_with('…'));
        assert!(snippet.ends_with('…'));
        assert_eq!(spans.len(), 1);
        let runs = split_utf16_highlights_mode(&snippet, &spans, false);
        assert!(runs.iter().any(|(seg, hi)| *hi && seg == "Sync"));
    }
}
