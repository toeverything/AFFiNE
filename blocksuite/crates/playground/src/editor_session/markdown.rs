use blocksuite_playground_doc::{
    DocResult,
    read::BlockContent,
    schema::{BlockSpec, ListType, ParagraphType},
};
use ui::{Context, Window};
use y_octo::{Any, TextAttributes, TextDeltaOp, TextInsert};

use super::*;
use crate::rich_text::TextBiIndex;

pub(super) fn markdown_block(input: &str) -> Option<BlockSpec> {
    let trimmed = input.strip_suffix([' ', '\n'])?;
    let spec = match trimmed {
        "#" => ParagraphType::H1,
        "##" => ParagraphType::H2,
        "###" => ParagraphType::H3,
        "####" => ParagraphType::H4,
        "#####" => ParagraphType::H5,
        "######" => ParagraphType::H6,
        ">" => ParagraphType::Quote,
        "-" | "*" | "+" => return Some(list(ListType::Bulleted, false, None)),
        s if s.ends_with('.') => {
            let digits = s.strip_suffix('.')?;
            if digits.is_empty() || !digits.bytes().all(|c| c.is_ascii_digit()) {
                return None;
            }
            let order = digits.parse::<i32>().ok().filter(|n| *n >= 0)?;
            return Some(list(ListType::Numbered, false, Some(order)));
        }
        "[]" | "[ ]" => return Some(list(ListType::Todo, false, None)),
        "[x]" => return Some(list(ListType::Todo, true, None)),
        s if s.len() >= 3
            && matches!(s.as_bytes()[0], b'-' | b'*' | b'_')
            && s.bytes().all(|b| b == s.as_bytes()[0]) =>
        {
            return Some(BlockSpec::Divider);
        }
        s if s.starts_with("```") => {
            let language = &s[3..];
            if !language
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '+' | '#' | '.' | '-'))
            {
                return None;
            }
            return Some(BlockSpec::Code {
                text: String::new(),
                language: (!language.is_empty()).then(|| language.into()),
                caption: String::new(),
            });
        }
        _ => return None,
    };
    Some(BlockSpec::Paragraph {
        paragraph_type: spec,
        text: String::new(),
    })
}

struct InlineMatch {
    /// Byte offset of the match start within `line`.
    start_byte: usize,
    /// Opening delimiter byte length.
    open_bytes: usize,
    /// Inner target byte length.
    target_bytes: usize,
    /// Closing delimiter byte length.
    close_bytes: usize,
    /// Attributes to apply.
    attrs: TextAttributes,
    /// If true, replaces the whole match with a single `" "` carrying `attrs` (inline latex).
    replace_with_embed_space: bool,
}

fn match_delimited(line: &str, delim: &str, ch: char) -> Option<(usize, usize)> {
    let before_close = line.strip_suffix(delim)?;
    let mut search_end = before_close.len();
    while let Some(open) = before_close[..search_end].rfind(delim) {
        let preceded_by_same = before_close[..open].ends_with(ch);
        if !preceded_by_same {
            let target = &before_close[open + delim.len()..];
            if !target.is_empty() && !target.contains(ch) {
                let first = target.chars().next()?;
                let last = target.chars().next_back()?;
                if !first.is_whitespace() && first != ch && !last.is_whitespace() && last != ch {
                    return Some((open, target.len()));
                }
            }
        }
        if open == 0 {
            break;
        }
        search_end = open;
    }
    None
}

fn match_inline_link(line: &str) -> Option<InlineMatch> {
    let without_close = line.strip_suffix(')')?;
    let sep = without_close.rfind("](")?;
    let url = &without_close[sep + 2..];
    if url.is_empty() || url.contains(')') {
        return None;
    }
    let before_sep = &without_close[..sep];
    let open = before_sep.rfind('[')?;
    let label = &before_sep[open + 1..];
    if label.is_empty() || label.contains('[') || label.contains(']') {
        return None;
    }
    Some(InlineMatch {
        start_byte: open,
        open_bytes: 1,
        target_bytes: label.len(),
        close_bytes: 2 + url.len() + 1,
        attrs: TextAttributes::from([("link".into(), Any::String(url.to_string()))]),
        replace_with_embed_space: false,
    })
}

fn match_inline_markdown(line: &str) -> Option<InlineMatch> {
    if let Some((open, target_len)) = match_delimited(line, "***", '*') {
        return Some(InlineMatch {
            start_byte: open,
            open_bytes: 3,
            target_bytes: target_len,
            close_bytes: 3,
            attrs: TextAttributes::from([("bold".into(), Any::True), ("italic".into(), Any::True)]),
            replace_with_embed_space: false,
        });
    }
    if let Some((open, target_len)) = match_delimited(line, "**", '*') {
        return Some(InlineMatch {
            start_byte: open,
            open_bytes: 2,
            target_bytes: target_len,
            close_bytes: 2,
            attrs: TextAttributes::from([("bold".into(), Any::True)]),
            replace_with_embed_space: false,
        });
    }
    if let Some((open, target_len)) = match_delimited(line, "*", '*') {
        return Some(InlineMatch {
            start_byte: open,
            open_bytes: 1,
            target_bytes: target_len,
            close_bytes: 1,
            attrs: TextAttributes::from([("italic".into(), Any::True)]),
            replace_with_embed_space: false,
        });
    }
    if let Some((open, target_len)) = match_delimited(line, "~~", '~') {
        return Some(InlineMatch {
            start_byte: open,
            open_bytes: 2,
            target_bytes: target_len,
            close_bytes: 2,
            attrs: TextAttributes::from([("strike".into(), Any::True)]),
            replace_with_embed_space: false,
        });
    }
    if let Some((open, target_len)) = match_delimited(line, "~", '~') {
        return Some(InlineMatch {
            start_byte: open,
            open_bytes: 1,
            target_bytes: target_len,
            close_bytes: 1,
            attrs: TextAttributes::from([("underline".into(), Any::True)]),
            replace_with_embed_space: false,
        });
    }
    if let Some((open, target_len)) = match_delimited(line, "`", '`') {
        return Some(InlineMatch {
            start_byte: open,
            open_bytes: 1,
            target_bytes: target_len,
            close_bytes: 1,
            attrs: TextAttributes::from([("code".into(), Any::True)]),
            replace_with_embed_space: false,
        });
    }
    if let Some(link) = match_inline_link(line) {
        return Some(link);
    }
    for delim in ["$$", "$"] {
        if let Some((open, target_len)) = match_delimited(line, delim, '$') {
            let content = &line[open + delim.len()..open + delim.len() + target_len];
            return Some(InlineMatch {
                start_byte: open,
                open_bytes: delim.len(),
                target_bytes: target_len,
                close_bytes: delim.len(),
                attrs: TextAttributes::from([("latex".into(), Any::String(content.to_string()))]),
                replace_with_embed_space: true,
            });
        }
    }
    None
}

impl PlaygroundView {
    pub(super) fn apply_markdown(
        &mut self,
        sel: &DocumentSelection,
        typed: &str,
        w: &mut Window,
        cx: &mut Context<Self>,
    ) -> DocResult<bool> {
        if !sel.empty()
            || self.editor.preedit.is_some()
            || (!typed.ends_with(' ') && !typed.ends_with('\n'))
        {
            return Ok(false);
        }
        let is_enter = typed.ends_with('\n');
        let typed_body = &typed[..typed.len() - 1];
        let Some(snapshot) = self.snapshot.as_ref().cloned() else {
            return Ok(false);
        };
        let id = &sel.focus.block_id;
        let Some(node) = snapshot.block(id) else {
            return Ok(false);
        };
        let (rich, paragraph_kind, is_list) = match &node.content {
            BlockContent::Paragraph { kind, text, .. } => (text, Some(*kind), false),
            BlockContent::List { text, .. } => (text, None, true),
            _ => return Ok(false),
        };
        let offset = sel.focus.offset();
        let index = TextBiIndex::new(&rich.plain);
        let byte = index.utf16_to_utf8_clamped(offset);
        let before_caret = &rich.plain[..byte];

        // 1. Block-level Markdown prefix (only on the first line of the block).
        if !before_caret.contains('\n') && !typed_body.contains('\n') {
            let mut prefix = before_caret.to_owned();
            prefix.push_str(typed);
            if let Some(spec) = markdown_block(&prefix) {
                let allowed = if is_list {
                    matches!(
                        spec,
                        BlockSpec::Paragraph {
                            paragraph_type: ParagraphType::H1
                                | ParagraphType::H2
                                | ParagraphType::H3
                                | ParagraphType::H4
                                | ParagraphType::H5
                                | ParagraphType::H6
                                | ParagraphType::Quote,
                            ..
                        } | BlockSpec::Code { .. }
                    )
                } else if paragraph_kind == Some(ParagraphType::Quote) {
                    !matches!(
                        spec,
                        BlockSpec::Paragraph {
                            paragraph_type: ParagraphType::Quote,
                            ..
                        }
                    )
                } else {
                    !matches!(
                        spec,
                        BlockSpec::Paragraph { paragraph_type, .. }
                            if Some(paragraph_type) == paragraph_kind
                    )
                };
                if allowed && let Some((parent, slot)) = parent_of(&snapshot, id) {
                    let now = self.now_ms(cx) as u64;
                    let replacement = self.fresh_block_id();
                    let trailing = self.fresh_block_id();
                    let divider = matches!(spec, BlockSpec::Divider);
                    let code = matches!(spec, BlockSpec::Code { .. });
                    let focus = if divider || spec.flavour() == node.flavour {
                        id.clone()
                    } else {
                        replacement.clone()
                    };
                    let page = self.page_mut()?;
                    let before = sel.snapshot(page)?;
                    let commit = page.structural_edit(now, |page| {
                        if offset > 0 {
                            page.remove_text(id, "prop:text", 0, offset, now)?;
                        }
                        if divider || code {
                            page.add_block(
                                &replacement,
                                spec,
                                Some(&parent.id),
                                Some(slot as u64),
                                now,
                            )?;
                            if code {
                                let remaining = page.read_editable_text(id)?.0;
                                if !remaining.is_empty() {
                                    page.add_block(
                                        &trailing,
                                        paragraph(),
                                        Some(&parent.id),
                                        Some(slot as u64 + 1),
                                        now,
                                    )?;
                                    page.apply_text_delta(
                                        &trailing,
                                        "prop:text",
                                        &remaining.delta,
                                        now,
                                    )?;
                                }
                                page.remove_lifting_children(id, now)?;
                            }
                        } else {
                            page.convert_markdown_block(id, &replacement, spec, now)?;
                        }
                        Ok(())
                    })?;
                    if commit.is_some() {
                        page.set_undo_selection_snapshot(before)?;
                    }
                    self.editor.selection = Some(DocumentSelection::caret(DocPoint::new(focus, 0)));
                    self.editor.pending_marks.clear();
                    self.editor.last_typing = None;
                    self.did_edit(commit, None, w, cx);
                    return Ok(true);
                }
            }
        }

        // 2. Inline Markdown rules (ASCII space or Enter, outside inline code).
        let caret_marks = self.insertion_marks(&sel.focus)?;
        if caret_marks.get("code") == Some(&Any::True) {
            return Ok(false);
        }
        let mut combined = before_caret.to_owned();
        combined.push_str(typed_body);
        let combined_index = TextBiIndex::new(&combined);
        let line_start_byte = combined.rfind('\n').map_or(0, |pos| pos + 1);
        let line = &combined[line_start_byte..];
        let Some(matched) = match_inline_markdown(line) else {
            return Ok(false);
        };
        let match_start_byte = line_start_byte + matched.start_byte;
        let match_start_utf16 = combined_index.utf8_to_utf16(match_start_byte);
        let open_utf16 = combined[match_start_byte..match_start_byte + matched.open_bytes]
            .encode_utf16()
            .count() as u64;
        let target_start_byte = match_start_byte + matched.open_bytes;
        let target_utf16 = combined[target_start_byte..target_start_byte + matched.target_bytes]
            .encode_utf16()
            .count() as u64;
        let close_start_byte = target_start_byte + matched.target_bytes;
        let close_utf16 = combined[close_start_byte..close_start_byte + matched.close_bytes]
            .encode_utf16()
            .count() as u64;

        let mut outer_marks =
            self.insertion_marks(&DocPoint::new(id, match_start_utf16.min(offset)))?;
        for key in matched.attrs.keys() {
            outer_marks.remove(key);
        }

        let now = self.now_ms(cx) as u64;
        let pre_insert = if is_enter { typed_body } else { typed };
        let pre_insert_utf16 = pre_insert.encode_utf16().count() as u64;

        // Commit any newly typed characters (and trailing ASCII space) before `stop_capturing`,
        // so one Undo restores the raw markdown with its trailing space (e.g. `**bold** `),
        // and the trailing space already carries `outer_marks` without the newly added mark.
        if !pre_insert.is_empty() {
            let page = self.page_mut()?;
            let mut pre_delta = Vec::new();
            if offset > 0 {
                pre_delta.push(TextDeltaOp::Retain {
                    retain: offset,
                    format: None,
                });
            }
            pre_delta.push(TextDeltaOp::Insert {
                insert: TextInsert::Text(pre_insert.into()),
                format: (!outer_marks.is_empty()).then(|| outer_marks.clone()),
            });
            let pre_commit = page.apply_text_delta(id, "prop:text", &pre_delta, now)?;
            if let (Some(c), Some(page_id)) = (pre_commit, self.page_id.clone()) {
                self.send_page_update(&page_id, c.update);
            }
        }

        let page = self.page_mut()?;
        let undo_sel = page.capture_selection_snapshot(
            id,
            offset + pre_insert_utf16,
            id,
            offset + pre_insert_utf16,
        )?;
        page.stop_capturing()?;

        let mut delta = Vec::new();
        if match_start_utf16 > 0 {
            delta.push(TextDeltaOp::Retain {
                retain: match_start_utf16,
                format: None,
            });
        }
        let new_caret = if matched.replace_with_embed_space {
            let total_del = open_utf16 + target_utf16 + close_utf16;
            delta.push(TextDeltaOp::Delete { delete: total_del });
            delta.push(TextDeltaOp::Insert {
                insert: TextInsert::Text(" ".into()),
                format: Some(matched.attrs.clone()),
            });
            match_start_utf16 + 1 + u64::from(!is_enter)
        } else {
            delta.push(TextDeltaOp::Delete { delete: open_utf16 });
            delta.push(TextDeltaOp::Retain {
                retain: target_utf16,
                format: Some(matched.attrs.clone()),
            });
            delta.push(TextDeltaOp::Delete {
                delete: close_utf16,
            });
            match_start_utf16 + target_utf16 + u64::from(!is_enter)
        };

        let commit = page.apply_text_delta(id, "prop:text", &delta, now)?;
        if commit.is_some() {
            page.set_undo_selection_snapshot(undo_sel)?;
        }
        page.stop_capturing()?;

        self.editor.selection = Some(DocumentSelection::caret(DocPoint::new(id, new_caret)));
        self.editor.pending_marks.clear();
        if is_enter {
            for key in matched.attrs.keys() {
                self.editor.pending_marks.insert(key.clone(), None);
            }
        }
        self.editor.last_typing = None;
        self.did_edit(commit, Some(id), w, cx);
        Ok(true)
    }
}
