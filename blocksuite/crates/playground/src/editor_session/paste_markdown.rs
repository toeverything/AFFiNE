//! Plain-text URL linkification, URL-over-selection linking, and Markdown paste helpers.

use blocksuite_playground_doc::{DocResult, read::BlockContent};
use serde_json::Value;
use y_octo::{Any, TextAttributes};

use super::*;
use crate::block_flow::FlowKind;

/// Return a sanitized `http://` or `https://` URL when `raw` is a single URL with no whitespace.
pub(crate) fn single_http_url(raw: &str) -> Option<String> {
    if raw.is_empty() || raw.chars().any(char::is_whitespace) {
        return None;
    }
    let rest = raw
        .strip_prefix("https://")
        .or_else(|| raw.strip_prefix("http://"))?;
    let host = rest.split(['/', '?', '#']).next()?;
    if host.is_empty() {
        return None;
    }
    crate::clipboard::sanitize::sanitize_url(raw)
}

/// True when `raw` contains block/inline Markdown syntax or a bare `http(s)://` URL.
fn looks_like_markdown_or_url(raw: &str) -> bool {
    if raw.contains("http://") || raw.contains("https://") {
        return true;
    }
    for line in raw.lines() {
        let t = line.trim();
        if t.starts_with("```")
            || t == "$$"
            || t.starts_with("> ")
            || t.starts_with("- ")
            || t.starts_with("* ")
            || t.starts_with("+ ")
            || t.starts_with("|")
            || matches!(t, "---" | "***" | "___")
        {
            return true;
        }
        let hashes = t.bytes().take_while(|&b| b == b'#').count();
        if (1..=6).contains(&hashes) && t[hashes..].starts_with(' ') {
            return true;
        }
        let digits = t.bytes().take_while(u8::is_ascii_digit).count();
        if digits > 0 && t[digits..].starts_with(". ") {
            return true;
        }
    }
    raw.contains("**")
        || raw.contains("~~")
        || raw.contains("](")
        || raw.contains('`')
        || has_paired_single_star(raw)
}

fn has_paired_single_star(s: &str) -> bool {
    let mut rest = s;
    while let Some(idx) = rest.find('*') {
        let after = &rest[idx + 1..];
        if let Some(stripped) = after.strip_prefix('*') {
            rest = stripped;
            continue;
        }
        if let Some((body, _)) = after.split_once('*')
            && !body.is_empty()
            && !body.contains('\n')
        {
            return true;
        }
        rest = after;
    }
    false
}

/// Parse plain clipboard text into a `Slice` with URL linkification and Markdown structure
/// when applicable. Returns `None` when `raw` is ordinary plain text.
pub(crate) fn plain_text_paste_slice(raw: &str) -> Option<(crate::clipboard::Slice, bool)> {
    if let Some(url) = single_http_url(raw) {
        let slice = crate::clipboard::Slice::from_markdown(&url)?;
        return Some((slice, false));
    }
    if !looks_like_markdown_or_url(raw) {
        return None;
    }
    let slice = crate::clipboard::Slice::from_markdown(raw)?;
    let has_block_structure = slice.content.iter().any(|b| {
        b.flavour != "affine:paragraph"
            || b.props.get("type").and_then(Value::as_str) != Some("text")
            || !b.children.is_empty()
    });
    Some((slice, has_block_structure))
}

fn clipboard_has_snapshot(item: &ui::ClipboardItem) -> bool {
    item.metadata()
        .is_some_and(|s| s.contains(crate::clipboard::SNAPSHOT_MIME))
}

impl PlaygroundView {
    /// Shared body-selection paste entry used by both `Cmd+V` and the context menu:
    /// applies URL-over-selection linking and plain-text Markdown/URL parsing when applicable.
    pub(crate) fn paste_body_clipboard_item(
        &mut self,
        item: &ui::ClipboardItem,
        w: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.begin_input();
        match self.try_paste_url_as_link(item, w, cx) {
            Ok(true) => return,
            Ok(false) => {}
            Err(e) => {
                eprintln!("clipboard url link paste: {e}");
                return;
            }
        }
        if let Some((mut slice, mut rich)) = crate::clipboard::read_slice(item) {
            if !rich
                && self.selection_accepts_markdown_paste()
                && let Some(raw) = item.text()
                && let Some((md_slice, md_rich)) = plain_text_paste_slice(&raw)
            {
                slice = md_slice;
                rich = md_rich;
            }
            if let Err(e) = self.paste_slice(slice, rich, w, cx) {
                eprintln!("clipboard paste: {e}");
            }
        }
    }

    /// When the editor has a non-empty formattable body selection (excluding Title and Code)
    /// and the clipboard holds a single `http(s)://` URL (not a BlockSuite snapshot),
    /// apply that URL as a `link` mark across the selection in one undo step instead of
    /// replacing the selected text.
    pub(crate) fn try_paste_url_as_link(
        &mut self,
        item: &ui::ClipboardItem,
        w: &mut Window,
        cx: &mut Context<Self>,
    ) -> DocResult<bool> {
        if clipboard_has_snapshot(item) {
            return Ok(false);
        }
        let Some(sel) = self.editor.selection.clone() else {
            return Ok(false);
        };
        if sel.empty() {
            return Ok(false);
        }
        let Some(raw) = item.text() else {
            return Ok(false);
        };
        let Some(url) = single_http_url(&raw) else {
            return Ok(false);
        };
        let Some(layout) = self.current_flow_layout(w) else {
            return Ok(false);
        };
        let Some((start, end, a, b, _)) = sel.ordered(&layout) else {
            return Ok(false);
        };
        let mut ranges: Vec<(String, u64, u64)> = Vec::new();
        for block in &layout.blocks[a..=b] {
            let from = if block.block_id == start.block_id {
                start.offset()
            } else {
                0
            };
            let to = if block.block_id == end.block_id {
                end.offset()
            } else {
                block.body.plain.encode_utf16().count() as u64
            };
            if !block.editable() || to <= from {
                continue;
            }
            if !matches!(block.body.kind, FlowKind::Paragraph(_) | FlowKind::List(_)) {
                return Ok(false);
            }
            ranges.push((block.block_id.clone(), from, to - from));
        }
        if ranges.is_empty() {
            return Ok(false);
        }
        let now = self.now_ms(cx) as u64;
        let page = self.page_mut()?;
        let before = sel.snapshot(page)?;
        page.stop_capturing()?;
        let link_url = url.clone();
        let commit = page.structural_edit(now, |page| {
            for (id, from, len) in &ranges {
                page.format_text(
                    id,
                    "prop:text",
                    *from,
                    *len,
                    TextAttributes::from([("link".into(), Any::String(link_url.clone()))]),
                    now,
                )?;
            }
            Ok(())
        })?;
        if commit.is_some() {
            page.set_undo_selection_snapshot(before)?;
        }
        self.editor.last_typing = None;
        let dirty = (a == b).then_some(start.block_id.as_str());
        self.did_edit(commit, dirty, w, cx);
        Ok(true)
    }

    /// True when the current text selection starts in a non-Code, non-Title body block.
    pub(crate) fn selection_accepts_markdown_paste(&self) -> bool {
        let Some(sel) = self.editor.selection.as_ref() else {
            return false;
        };
        let Some(snapshot) = self.page_snapshot() else {
            return false;
        };
        let Some(node) = snapshot.block(&sel.focus.block_id) else {
            return false;
        };
        !matches!(
            node.content,
            BlockContent::Page { .. } | BlockContent::Code { .. }
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn single_url_and_markdown_plain_text_detection_table() {
        assert_eq!(
            single_http_url("https://affine.pro/docs").as_deref(),
            Some("https://affine.pro/docs")
        );
        assert_eq!(single_http_url("https://affine.pro with space"), None);
        assert_eq!(single_http_url("javascript:alert(1)"), None);

        let (url_slice, rich) = plain_text_paste_slice("https://example.org").unwrap();
        assert!(!rich);
        assert_eq!(url_slice.content[0].plain(), "https://example.org");
        assert_eq!(
            url_slice.content[0].props["text"]["delta"][0]["attributes"]["link"],
            "https://example.org"
        );

        let (md_slice, md_rich) =
            plain_text_paste_slice("# Title\n- item with **bold** and https://affine.pro").unwrap();
        assert!(md_rich);
        assert_eq!(md_slice.content.len(), 2);
        assert_eq!(md_slice.content[0].props["type"], "h1");
        assert_eq!(md_slice.content[1].flavour, "affine:list");

        assert!(plain_text_paste_slice("plain line\nsecond line").is_none());
    }
}
