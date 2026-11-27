//! Document selection, preedit, and text-input core shared across editor hosts.

use std::{collections::BTreeMap, ops::Range};

use blocksuite_playground_doc::{
    DocResult,
    read::{BlockContent, BlockNode, PageSnapshot},
    session::{PageDocSession, SelectionSnapshot},
};
#[cfg(target_family = "wasm")]
use unicode_segmentation::UnicodeSegmentation;
use y_octo::{Any, SessionCommit};

use crate::{
    block_flow::FlowLayout,
    rich_text::{CaretPosition, TextBiIndex, WrapAffinity},
};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DocPoint {
    pub block_id: String,
    pub caret: CaretPosition,
}

impl DocPoint {
    pub fn new(block_id: impl Into<String>, offset: u64) -> Self {
        Self {
            block_id: block_id.into(),
            caret: CaretPosition {
                utf16_offset: offset,
                affinity: WrapAffinity::Downstream,
            },
        }
    }

    pub fn offset(&self) -> u64 {
        self.caret.utf16_offset
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DocumentSelection {
    pub anchor: DocPoint,
    pub focus: DocPoint,
}

impl DocumentSelection {
    pub fn caret(point: DocPoint) -> Self {
        Self {
            anchor: point.clone(),
            focus: point,
        }
    }

    pub fn empty(&self) -> bool {
        self.anchor.block_id == self.focus.block_id && self.anchor.offset() == self.focus.offset()
    }

    pub fn snapshot(&self, page: &PageDocSession) -> DocResult<SelectionSnapshot> {
        page.capture_selection_snapshot(
            &self.anchor.block_id,
            self.anchor.offset(),
            &self.focus.block_id,
            self.focus.offset(),
        )
    }

    pub fn ordered<'a>(
        &'a self,
        layout: &FlowLayout,
    ) -> Option<(&'a DocPoint, &'a DocPoint, usize, usize, bool)> {
        let index = |p: &DocPoint| layout.blocks.iter().position(|b| b.block_id == p.block_id);
        let a = index(&self.anchor)?;
        let f = index(&self.focus)?;
        Some(if (a, self.anchor.offset()) <= (f, self.focus.offset()) {
            (&self.anchor, &self.focus, a, f, false)
        } else {
            (&self.focus, &self.anchor, f, a, true)
        })
    }
}

#[derive(Default)]
pub struct RangeBlocks {
    pub intermediate: Vec<String>,
    pub survivors: Vec<String>,
}

/// Root content blocks of Page-mode notes, in document order.
pub fn page_content_roots(root: &BlockNode) -> impl DoubleEndedIterator<Item = &BlockNode> {
    root.children
        .iter()
        .filter(|note| note.is_page_visible_note())
        .flat_map(|note| &note.children)
}

impl RangeBlocks {
    pub fn between(snapshot: &PageSnapshot, start: &str, end: &str) -> Option<Self> {
        if start == end {
            return Some(Self::default());
        }
        let root = snapshot.root.as_ref()?;
        let mut pending: Vec<_> = page_content_roots(root)
            .rev()
            .map(|node| (node, false))
            .collect();
        let mut intermediate = Vec::new();
        let mut after_start = root.id == start;
        // Each pending subtree records whether its parent belongs to the deletion.
        // At the endpoint the stack holds its children, then later siblings up the ancestor chain.
        while let Some((node, _)) = pending.pop() {
            pending.extend(node.children.iter().rev().map(|child| (child, after_start)));
            if after_start {
                if node.id == end {
                    let survivors = pending
                        .into_iter()
                        .rev()
                        .filter(|(_, parent_removed)| *parent_removed)
                        .map(|(child, _)| child.id.clone())
                        .collect();
                    return Some(Self {
                        intermediate,
                        survivors,
                    });
                }
                intermediate.push(node.id.clone());
            } else if node.id == start {
                after_start = true;
            }
        }
        None
    }
}

pub struct Preedit {
    pub replacement: SelectionSnapshot,
    pub backward: bool,
    pub text: String,
    pub selected: Range<usize>,
}

#[derive(Default)]
pub struct EditorSession {
    pub selection: Option<DocumentSelection>,
    /// Selected whole-block IDs in document order (entered via `Escape` or second `Mod-a`).
    pub block_selection: Vec<String>,
    pub goal_x: Option<f32>,
    pub preedit: Option<Preedit>,
    pub relative_selection: Option<SelectionSnapshot>,
    pub pending_marks: BTreeMap<String, Option<Any>>,
    pub last_typing: Option<u64>,
    pub reveal: bool,
    /// The primary button is held and extends the selection.
    pub dragging: bool,
    /// The `/` that opened the slash menu from typed text: its block and a relative
    /// position naming that character.
    pub slash_trigger: Option<(String, SelectionSnapshot)>,
    /// The `@` that opened the linked-document menu from typed text: its block, a relative
    /// position naming that `@`, and a stable idempotency intent id for creating from it.
    pub linked_doc_trigger: Option<(String, SelectionSnapshot, String)>,
    pub next_id: u64,
}

impl EditorSession {
    /// Whether an input method composition is in progress.
    pub fn composing(&self) -> bool {
        self.preedit.is_some()
    }

    pub fn clear_preedit_state(&mut self) {
        self.preedit = None;
    }

    pub fn preedit_nonce(&self) -> u64 {
        self.preedit.as_ref().map_or(0u64, |pre| {
            use std::hash::{Hash, Hasher};
            let mut hasher = std::collections::hash_map::DefaultHasher::new();
            pre.text.hash(&mut hasher);
            pre.selected.hash(&mut hasher);
            pre.backward.hash(&mut hasher);
            hasher.finish().max(1)
        })
    }
}

/// Select the word boundary span (in UTF-16 code units) containing `offset`.
///
/// Uses the browser's native `Intl.Segmenter` (`granularity: "word"`) on WebAssembly (zero
/// bundle-size cost and exact parity with browser `contenteditable`), and ICU's compiled
/// dictionary segmenter (`icu_segmenter::WordSegmenter::try_new_dictionary`) on native targets.
/// When `offset` lands on inter-word whitespace, snaps to the nearest adjacent word.
pub fn word_range(text: &str, offset: u64) -> Range<u64> {
    if text.is_empty() {
        return 0..0;
    }
    let segments = word_segments(text);
    let total = text.encode_utf16().count() as u64;
    pick_word_segment(&segments, offset.min(total))
}

/// Step backward from `offset` (UTF-16) to the start of the previous word using the same
/// locale-aware word segmentation as [`word_range`], skipping pure whitespace and punctuation
/// runs so CJK, Latin, and mixed sentences step one word at a time.
pub fn prev_word_start_utf16(text: &str, offset: u64) -> u64 {
    let total = text.encode_utf16().count() as u64;
    let clamped = offset.min(total);
    if clamped == 0 {
        return 0;
    }
    let segments = word_segments(text);
    let Some(mut idx) = segments.iter().rposition(|s| s.0 < clamped) else {
        return 0;
    };
    if segments[idx].4 && segments[idx].1 == clamped {
        return segments[idx].0;
    }
    loop {
        let (start, end, _, is_word, is_nl) = segments[idx];
        if is_nl {
            return if end == clamped { start } else { end };
        }
        if is_word {
            return start;
        }
        if idx == 0 {
            return 0;
        }
        idx -= 1;
    }
}

/// Step forward from `offset` (UTF-16) to the end of the next word using the same
/// locale-aware word segmentation as [`word_range`], skipping pure whitespace and punctuation.
pub fn next_word_end_utf16(text: &str, offset: u64) -> u64 {
    let total = text.encode_utf16().count() as u64;
    let clamped = offset.min(total);
    if clamped >= total {
        return total;
    }
    let segments = word_segments(text);
    let Some(mut idx) = segments.iter().position(|s| s.1 > clamped) else {
        return total;
    };
    if segments[idx].4 && segments[idx].0 == clamped {
        return segments[idx].1;
    }
    while idx < segments.len() {
        let (start, end, _, is_word, is_nl) = segments[idx];
        if is_nl {
            return if start == clamped { end } else { start };
        }
        if is_word {
            return end;
        }
        idx += 1;
    }
    total
}

/// Segment tuple: `(start_utf16, end_utf16, is_whitespace, is_word_like, is_newline)`.
type WordSegment = (u64, u64, bool, bool, bool);

fn classify_segment(start: u64, end: u64, seg: &str) -> WordSegment {
    let is_nl = seg == "\n" || seg == "\r\n" || seg == "\r";
    let is_ws = seg.chars().all(char::is_whitespace);
    let is_word = seg.chars().any(|c| c.is_alphanumeric() || c == '_');
    (start, end, is_ws, is_word, is_nl)
}

fn word_segments(text: &str) -> Vec<WordSegment> {
    #[cfg(target_family = "wasm")]
    {
        if let Some(segs) = wasm_intl_word_segments(text) {
            return segs;
        }
        return uax29_word_segments(text);
    }
    #[cfg(not(target_family = "wasm"))]
    {
        icu_word_segments(text)
    }
}

fn pick_word_segment(segments: &[WordSegment], offset: u64) -> Range<u64> {
    if segments.is_empty() {
        return 0..0;
    }
    let hit_idx = segments
        .iter()
        .position(|&(_, end, _, _, _)| end > offset)
        .unwrap_or(segments.len() - 1);
    let chosen = if !segments[hit_idx].2 {
        segments[hit_idx]
    } else {
        let prev = segments[..hit_idx].iter().rev().find(|s| !s.2).copied();
        let next = segments[hit_idx + 1..].iter().find(|s| !s.2).copied();
        match (prev, next) {
            (Some(p), Some(n)) => {
                let dist_prev = offset.saturating_sub(p.1);
                let dist_next = n.0.saturating_sub(offset);
                if dist_prev < dist_next { p } else { n }
            }
            (Some(p), None) => p,
            (None, Some(n)) => n,
            (None, None) => segments[hit_idx],
        }
    };
    chosen.0..chosen.1
}

#[cfg(not(target_family = "wasm"))]
fn icu_word_segments(text: &str) -> Vec<WordSegment> {
    let index = TextBiIndex::new(text);
    thread_local! {
        static SEGMENTER: icu_segmenter::WordSegmenter =
            icu_segmenter::WordSegmenter::try_new_dictionary(Default::default())
                .expect("compiled word segmenter dictionary");
    }
    let bounds: Vec<usize> = SEGMENTER.with(|seg| seg.as_borrowed().segment_str(text).collect());
    bounds
        .windows(2)
        .filter(|w| w[0] < w[1])
        .map(|w| {
            classify_segment(
                index.utf8_to_utf16(w[0]),
                index.utf8_to_utf16(w[1]),
                &text[w[0]..w[1]],
            )
        })
        .collect()
}

#[cfg(target_family = "wasm")]
fn wasm_intl_word_segments(text: &str) -> Option<Vec<WordSegment>> {
    use wasm_bindgen::JsValue;

    thread_local! {
        static INTL_SEGMENTER: Option<JsValue> = {
            let intl = js_sys::Reflect::get(&js_sys::global(), &JsValue::from_str("Intl")).ok()?;
            let ctor = js_sys::Reflect::get(&intl, &JsValue::from_str("Segmenter")).ok()?;
            let ctor_fn: js_sys::Function = ctor.try_into().ok()?;
            let opts = js_sys::Object::new();
            js_sys::Reflect::set(
                &opts,
                &JsValue::from_str("granularity"),
                &JsValue::from_str("word"),
            )
            .ok()?;
            let args = js_sys::Array::of2(&JsValue::UNDEFINED, &opts.into());
            js_sys::Reflect::construct(&ctor_fn, &args).ok()
        };
    }
    let seg_obj = INTL_SEGMENTER.with(|cell| cell.clone())?;
    let segment_fn: js_sys::Function =
        js_sys::Reflect::get(&seg_obj, &JsValue::from_str("segment"))
            .ok()?
            .try_into()
            .ok()?;
    let iterable = segment_fn.call1(&seg_obj, &JsValue::from_str(text)).ok()?;
    let iter = js_sys::try_iter(&iterable).ok()??;
    let mut segments: Vec<WordSegment> = Vec::new();
    for item in iter {
        let entry = item.ok()?;
        let start = js_sys::Reflect::get(&entry, &JsValue::from_str("index"))
            .ok()?
            .as_f64()? as u64;
        let seg_str = js_sys::Reflect::get(&entry, &JsValue::from_str("segment"))
            .ok()?
            .as_string()?;
        let len = seg_str.encode_utf16().count() as u64;
        if len > 0 {
            segments.push(classify_segment(start, start + len, &seg_str));
        }
    }
    (!segments.is_empty()).then_some(segments)
}

#[cfg(target_family = "wasm")]
fn uax29_word_segments(text: &str) -> Vec<WordSegment> {
    let index = TextBiIndex::new(text);
    text.split_word_bound_indices()
        .map(|(start, word)| {
            classify_segment(
                index.utf8_to_utf16(start),
                index.utf8_to_utf16(start + word.len()),
                word,
            )
        })
        .collect()
}

/// Plan line-level `Tab` / `Shift+Tab` indent or outdent splices for a code block.
///
/// Returns `(splices_descending, new_start, new_end)` where each splice is
/// `(utf16_offset, delete_utf16_len, insert_str)` ordered from highest offset to lowest
/// so applying them sequentially in one `structural_edit` preserves earlier offsets.
pub fn code_block_indent_plan(
    text: &str,
    sel_start: u64,
    sel_end: u64,
    outdent: bool,
) -> (Vec<(u64, u64, &'static str)>, u64, u64) {
    const INDENT: &str = "  ";
    let units: Vec<u16> = text.encode_utf16().collect();
    let len = units.len() as u64;
    let start = sel_start.min(len);
    let end = sel_end.min(len).max(start);

    let first_line_start = units[..start as usize]
        .iter()
        .rposition(|&u| u == b'\n' as u16)
        .map_or(0u64, |i| i as u64 + 1);

    let mut line_starts = vec![first_line_start];
    for (idx, &u) in units[start as usize..end as usize].iter().enumerate() {
        if u == b'\n' as u16 {
            line_starts.push(start + idx as u64 + 1);
        }
    }

    if !outdent {
        let splices: Vec<(u64, u64, &'static str)> = line_starts
            .iter()
            .rev()
            .map(|&ls| (ls, 0u64, INDENT))
            .collect();
        let new_start = start + 2;
        let new_end = end + 2 * line_starts.len() as u64;
        return (splices, new_start, new_end);
    }

    let mut removals: Vec<(u64, u64)> = Vec::new();
    let mut start_shift = 0u64;
    let mut end_shift = 0u64;
    for (i, &ls) in line_starts.iter().enumerate() {
        let rem = &units[ls as usize..];
        let count = if rem.starts_with(&[b' ' as u16, b' ' as u16]) {
            2u64
        } else {
            0u64
        };
        if count > 0 {
            removals.push((ls, count));
            if i == 0 {
                start_shift = start.saturating_sub(ls).min(count);
            }
            end_shift += end.saturating_sub(ls).min(count);
        }
    }
    let splices: Vec<(u64, u64, &'static str)> = removals
        .into_iter()
        .rev()
        .map(|(ls, count)| (ls, count, ""))
        .collect();
    let new_start = start.saturating_sub(start_shift);
    let new_end = end.saturating_sub(end_shift).max(new_start);
    (splices, new_start, new_end)
}

#[cfg(test)]
mod tests {
    use super::{code_block_indent_plan, word_range};

    fn apply_plan(text: &str, splices: &[(u64, u64, &str)]) -> String {
        let mut units: Vec<u16> = text.encode_utf16().collect();
        for &(offset, del_len, insert) in splices {
            let ins: Vec<u16> = insert.encode_utf16().collect();
            let start = offset as usize;
            let end = (start + del_len as usize).min(units.len());
            units.splice(start..end, ins);
        }
        String::from_utf16(&units).unwrap()
    }

    #[test]
    fn word_range_handles_mixed_ltr_arabic_hebrew_cjk_and_whitespace_snap() {
        let text =
            "Hello \u{05E9}\u{05DC}\u{05D5}\u{05DD} \u{0645}\u{0631}\u{062D}\u{0628}\u{0627} world";
        let slice_u16 = |s: &str, range: std::ops::Range<u64>| -> String {
            let units: Vec<u16> = s.encode_utf16().collect();
            String::from_utf16(&units[range.start as usize..range.end as usize]).unwrap()
        };
        assert_eq!(slice_u16(text, word_range(text, 1)), "Hello");
        // Pressing on whitespace snaps to the nearest word (offset 5 touches end of "Hello").
        assert_eq!(slice_u16(text, word_range(text, 5)), "Hello");
        assert_eq!(word_range("Hello   world", 5), 0..5);
        assert_eq!(word_range("Hello   world", 7), 8..13);
        assert_eq!(
            slice_u16(text, word_range(text, 7)),
            "\u{05E9}\u{05DC}\u{05D5}\u{05DD}"
        );
        assert_eq!(
            slice_u16(text, word_range(text, 13)),
            "\u{0645}\u{0631}\u{062D}\u{0628}\u{0627}"
        );
        assert_eq!(slice_u16(text, word_range(text, 18)), "world");

        let zh = "中文测试文本在这里";
        for (offset, expected) in [
            (0, "中文"),
            (1, "中文"),
            (2, "测试"),
            (3, "测试"),
            (4, "文本"),
            (5, "文本"),
            (6, "在"),
            (7, "这里"),
            (8, "这里"),
        ] {
            assert_eq!(
                slice_u16(zh, word_range(zh, offset)),
                expected,
                "offset {offset}"
            );
        }

        // Everyday non-technical Chinese sentences must also segment into real compounds.
        let daily = "今天天气非常不错，苹果手机很好用";
        for (offset, expected) in [
            (0, "今天"),
            (2, "天气"),
            (4, "非常"),
            (6, "不错"),
            (9, "苹果"),
            (11, "手机"),
            (13, "很好"),
        ] {
            assert_eq!(
                slice_u16(daily, word_range(daily, offset)),
                expected,
                "daily offset {offset}"
            );
        }
    }

    #[test]
    fn code_block_indent_plan_handles_single_and_multiline_tab_and_shift_tab() {
        let cases: &[(&str, u64, u64, bool, &str, u64, u64)] = &[
            // Multi-line selection Tab indents every covered line and keeps selection.
            ("a()\nb()\nc()", 1, 9, false, "  a()\n  b()\n  c()", 3, 15),
            // Caret mid-line Tab indents line start and shifts caret by 2.
            ("y()", 2, 2, false, "  y()", 4, 4),
            // Caret mid-line Shift+Tab removes 2 leading spaces and shifts caret by 2.
            ("  y()", 4, 4, true, "y()", 2, 2),
            // Multi-line Shift+Tab only strips a full 2-space INDENT_SYMBOL (0.27.5 parity).
            (" a\n  b", 0, 6, true, " a\nb", 0, 4),
            ("  a\n b\nc", 0, 8, true, "a\n b\nc", 0, 6),
            // Shift+Tab with no leading spaces is a no-op.
            ("abc", 1, 1, true, "abc", 1, 1),
        ];
        for &(text, start, end, outdent, want_text, want_start, want_end) in cases {
            let (splices, new_start, new_end) = code_block_indent_plan(text, start, end, outdent);
            assert_eq!(apply_plan(text, &splices), want_text);
            assert_eq!((new_start, new_end), (want_start, want_end));
        }
    }
}

pub fn text_content(node: &BlockNode) -> Option<&str> {
    match &node.content {
        BlockContent::Page { title } => Some(&title.plain),
        BlockContent::Paragraph { text, .. } | BlockContent::List { text, .. } => Some(&text.plain),
        BlockContent::Code { text, .. } => Some(text),
        _ => None,
    }
}

pub fn node_mut<'a>(node: &'a mut BlockNode, id: &str) -> Option<&'a mut BlockNode> {
    if node.id == id {
        return Some(node);
    }
    node.children
        .iter_mut()
        .find_map(|child| node_mut(child, id))
}

pub fn parent_of<'a>(snapshot: &'a PageSnapshot, id: &str) -> Option<(&'a BlockNode, usize)> {
    snapshot.root.as_ref()?.walk().find_map(|node| {
        node.children
            .iter()
            .position(|c| c.id == id)
            .map(|pos| (node, pos))
    })
}

pub type Commit = SessionCommit<SelectionSnapshot>;
