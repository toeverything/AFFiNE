//! In-place edits of the containers a block already owns.
//!
//! A CRDT update is only mergeable at the granularity of the containers it touches. Replacing a
//! block's `sys:children` with a brand new `Y.Array`, or its `prop:text` with a brand new
//! `Y.Text`, makes the CLI's update authoritative for the whole container: anything the app put
//! inside the old container after the CLI read the doc still exists, but is no longer reachable,
//! because the map key now points at a different type. The BlockSuite editor never does that - it
//! splices the existing array and applies a text delta to the existing text - so this module does
//! the same, and the CLI only creates a container when the block does not have one yet.

use std::collections::{BTreeMap, HashSet};

use y_octo::{Any, Doc, Map, Text, TextDeltaOp, TextInsert};

use super::{
    super::{blocksuite::collect_child_ids, schema::SYS_CHILDREN},
    builder::{insert_children, insert_text},
    *,
};

/// Cap on the LCS matrix for a child-order diff. Well above `MAX_BLOCKS`, so it only ever trips
/// on a doc the structural diff already refused.
const MAX_CHILDREN_DIFF_CELLS: usize = 1_000_000;
/// Cap on the LCS matrix for a text diff, in units (one unit is one `char` or one embed). Two
/// 1000-unit paragraphs still diff precisely; beyond that the delta degrades to a whole-content
/// replacement, which is still applied to the EXISTING `Y.Text`.
const MAX_TEXT_DIFF_CELLS: usize = 1_000_000;

type Attrs = BTreeMap<String, Any>;

/// Longest common subsequence of `old` and `new` under `eq`, as matched index pairs in ascending
/// order. `None` when the DP matrix would exceed `max_cells`, so callers can fall back instead of
/// allocating an unbounded matrix. Same dynamic program as the block-level diff in `update.rs`,
/// lifted to any pair of slices so the children order and the text content can reuse it.
pub(super) fn lcs_pairs<T, U>(
    old: &[T],
    new: &[U],
    max_cells: usize,
    eq: impl Fn(&T, &U) -> bool,
) -> Option<Vec<(usize, usize)>> {
    let old_len = old.len();
    let new_len = new.len();
    if old_len.checked_mul(new_len)? > max_cells {
        return None;
    }
    if old_len == 0 || new_len == 0 {
        return Some(Vec::new());
    }

    let mut lcs = vec![vec![0u32; new_len + 1]; old_len + 1];
    for i in 1..=old_len {
        for j in 1..=new_len {
            lcs[i][j] = if eq(&old[i - 1], &new[j - 1]) {
                lcs[i - 1][j - 1] + 1
            } else {
                std::cmp::max(lcs[i - 1][j], lcs[i][j - 1])
            };
        }
    }

    let mut pairs = Vec::new();
    let (mut i, mut j) = (old_len, new_len);
    while i > 0 && j > 0 {
        if eq(&old[i - 1], &new[j - 1]) {
            pairs.push((i - 1, j - 1));
            i -= 1;
            j -= 1;
        } else if lcs[i][j - 1] >= lcs[i - 1][j] {
            j -= 1;
        } else {
            i -= 1;
        }
    }
    pairs.reverse();
    Some(pairs)
}

/// Bring `block`'s `sys:children` to `children`, splicing the EXISTING array when there is one.
/// Only a block that has no children array yet gets a new one.
pub(super) fn write_children(doc: &Doc, block: &mut Map, children: &[String]) -> Result<(), ParseError> {
    let Some(mut array) = block.get(SYS_CHILDREN).and_then(|value| value.to_array()) else {
        return insert_children(doc, block, children);
    };

    let current = collect_child_ids(block);
    if current.len() as u64 != array.len() {
        // A non-string entry sits in the array, so `current`'s indices do not address it. Nothing
        // the CLI or the app writes produces one; replace the array rather than splice blindly.
        return insert_children(doc, block, children);
    }
    if current == children {
        return Ok(());
    }

    let Some(pairs) = lcs_pairs(&current, children, MAX_CHILDREN_DIFF_CELLS, |old, new| old == new) else {
        return insert_children(doc, block, children);
    };

    let keep_old: HashSet<usize> = pairs.iter().map(|(old, _)| *old).collect();
    for index in (0..current.len()).rev() {
        if !keep_old.contains(&index) {
            array.remove(index as u64, 1)?;
        }
    }

    // After the removals the array holds exactly the matched ids, in target order, so each
    // unmatched target index can be filled left to right at its final position.
    let keep_new: HashSet<usize> = pairs.iter().map(|(_, new)| *new).collect();
    for (index, child_id) in children.iter().enumerate() {
        if !keep_new.contains(&index) {
            array.insert(index as u64, child_id.as_str())?;
        }
    }

    Ok(())
}

/// Bring `block[key]` to `ops`, applying a text delta to the EXISTING `Y.Text` when there is one.
/// Only a block that has no text at `key` yet gets a new one.
pub(super) fn write_text(doc: &Doc, block: &mut Map, key: &str, ops: &[TextDeltaOp]) -> Result<(), ParseError> {
    match block.get(key).and_then(|value| value.to_text()) {
        Some(mut text) => sync_text(&mut text, ops),
        None => insert_text(doc, block, key, ops),
    }
}

fn sync_text(text: &mut Text, target: &[TextDeltaOp]) -> Result<(), ParseError> {
    let current_units = flatten_units(&text.to_delta());
    let target_units = flatten_units(target);
    if current_units == target_units {
        return Ok(());
    }

    let delta = match lcs_pairs(&current_units, &target_units, MAX_TEXT_DIFF_CELLS, |old, new| {
        old.content == new.content
    }) {
        Some(pairs) => diff_delta(&current_units, &target_units, &pairs),
        None => replace_delta(&current_units, &target_units),
    };

    if !delta.is_empty() {
        text.apply_delta(&delta)?;
    }
    Ok(())
}

#[derive(Clone, PartialEq, Debug)]
enum UnitContent {
    Char(char),
    Embed(Any),
}

#[derive(Clone, PartialEq, Debug)]
struct Unit {
    content: UnitContent,
    attrs: Attrs,
}

impl Unit {
    /// Length in the index space y-octo and yjs share for text: UTF-16 code units, one per embed.
    fn len(&self) -> u64 {
        match &self.content {
            UnitContent::Char(value) => value.len_utf16() as u64,
            UnitContent::Embed(_) => 1,
        }
    }
}

/// Split an insert-only delta into one unit per addressable position. Retain and delete ops
/// cannot appear in a block spec's text or in `Text::to_delta`, so they carry no content to diff.
fn flatten_units(ops: &[TextDeltaOp]) -> Vec<Unit> {
    let mut units = Vec::new();
    for op in ops {
        let TextDeltaOp::Insert { insert, format } = op else {
            continue;
        };
        let attrs = format.clone().unwrap_or_default();
        match insert {
            TextInsert::Text(value) => units.extend(value.chars().map(|value| Unit {
                content: UnitContent::Char(value),
                attrs: attrs.clone(),
            })),
            TextInsert::Embed(values) => units.extend(values.iter().map(|value| Unit {
                content: UnitContent::Embed(value.clone()),
                attrs: attrs.clone(),
            })),
        }
    }
    units
}

/// The attribute changes that turn `old` into `new`. A key `new` drops is set to `Any::Null`,
/// which is how both y-octo and yjs erase a format.
fn attr_delta(old: &Attrs, new: &Attrs) -> Attrs {
    let mut delta = Attrs::new();
    for (key, value) in new {
        if old.get(key) != Some(value) {
            delta.insert(key.clone(), value.clone());
        }
    }
    for key in old.keys() {
        if !new.contains_key(key) {
            delta.insert(key.clone(), Any::Null);
        }
    }
    delta
}

/// A retain/insert/delete delta transforming `old` into `new`, keeping every unit the LCS matched.
/// A matched unit whose attributes changed becomes a `Retain` carrying the attribute delta, so
/// formatting is re-applied over the existing characters rather than replacing them.
fn diff_delta(old: &[Unit], new: &[Unit], pairs: &[(usize, usize)]) -> Vec<TextDeltaOp> {
    let mut builder = DeltaBuilder::default();
    let (mut old_idx, mut new_idx) = (0usize, 0usize);

    for &(old_match, new_match) in pairs {
        builder.delete(old[old_idx..old_match].iter().map(Unit::len).sum());
        builder.insert(&new[new_idx..new_match]);

        let unit = &new[new_match];
        let attrs = attr_delta(&old[old_match].attrs, &unit.attrs);
        builder.retain(unit.len(), attrs);

        old_idx = old_match + 1;
        new_idx = new_match + 1;
    }

    builder.delete(old[old_idx..].iter().map(Unit::len).sum());
    builder.insert(&new[new_idx..]);
    builder.finish()
}

/// Fallback for text too long to diff: delete everything this client can see and insert the new
/// content. Still an edit of the existing `Y.Text`, so units a concurrent client inserted are not
/// covered by the delete set and survive.
fn replace_delta(old: &[Unit], new: &[Unit]) -> Vec<TextDeltaOp> {
    let mut builder = DeltaBuilder::default();
    builder.delete(old.iter().map(Unit::len).sum());
    builder.insert(new);
    builder.finish()
}

#[derive(Default)]
struct DeltaBuilder {
    ops: Vec<TextDeltaOp>,
}

impl DeltaBuilder {
    fn delete(&mut self, len: u64) {
        if len == 0 {
            return;
        }
        if let Some(TextDeltaOp::Delete { delete }) = self.ops.last_mut() {
            *delete += len;
            return;
        }
        self.ops.push(TextDeltaOp::Delete { delete: len });
    }

    fn retain(&mut self, len: u64, attrs: Attrs) {
        if len == 0 {
            return;
        }
        let format = if attrs.is_empty() { None } else { Some(attrs) };
        if let Some(TextDeltaOp::Retain {
            retain,
            format: previous,
        }) = self.ops.last_mut()
            && *previous == format
        {
            *retain += len;
            return;
        }
        self.ops.push(TextDeltaOp::Retain { retain: len, format });
    }

    fn insert(&mut self, units: &[Unit]) {
        for unit in units {
            let format = if unit.attrs.is_empty() {
                None
            } else {
                Some(unit.attrs.clone())
            };
            match &unit.content {
                UnitContent::Char(value) => {
                    if let Some(TextDeltaOp::Insert {
                        insert: TextInsert::Text(text),
                        format: previous,
                    }) = self.ops.last_mut()
                        && *previous == format
                    {
                        text.push(*value);
                        continue;
                    }
                    self.ops.push(TextDeltaOp::Insert {
                        insert: TextInsert::Text(value.to_string()),
                        format,
                    });
                }
                UnitContent::Embed(value) => self.ops.push(TextDeltaOp::Insert {
                    insert: TextInsert::Embed(vec![value.clone()]),
                    format,
                }),
            }
        }
    }

    /// Drop a trailing plain retain: it moves the cursor past content nothing follows, so it only
    /// costs a struct split in the encoded update.
    fn finish(mut self) -> Vec<TextDeltaOp> {
        while let Some(TextDeltaOp::Retain { format: None, .. }) = self.ops.last() {
            self.ops.pop();
        }
        self.ops
    }
}

#[cfg(test)]
mod tests {
    use y_octo::{Any, Doc, TextDeltaOp, TextInsert};

    use super::{super::builder::text_ops_from_plain, *};

    fn text_with(doc: &Doc, ops: &[TextDeltaOp]) -> Text {
        let mut text = doc.create_text().expect("create text");
        text.apply_delta(ops).expect("apply delta");
        text
    }

    fn bold(value: bool) -> Attrs {
        let mut attrs = Attrs::new();
        attrs.insert("bold".to_string(), if value { Any::True } else { Any::False });
        attrs
    }

    #[test]
    fn test_sync_text_emits_minimal_delta() {
        let doc = Doc::default();
        let mut text = text_with(&doc, &text_ops_from_plain("Hello world"));
        sync_text(&mut text, &text_ops_from_plain("Hello brave new world")).expect("sync");
        assert_eq!(text.to_string(), "Hello brave new world");
    }

    #[test]
    fn test_diff_delta_reuses_common_prefix_and_suffix() {
        let old = flatten_units(&text_ops_from_plain("Hello world"));
        let new = flatten_units(&text_ops_from_plain("Hello brave world"));
        let pairs = lcs_pairs(&old, &new, MAX_TEXT_DIFF_CELLS, |a, b| a.content == b.content).expect("lcs");
        let delta = diff_delta(&old, &new, &pairs);

        // One retain over the shared prefix and one insert; no delete, because the whole old
        // content is still present in the new one.
        assert_eq!(
            delta,
            vec![
                TextDeltaOp::Retain {
                    retain: 5,
                    format: None
                },
                TextDeltaOp::Insert {
                    insert: TextInsert::Text(" brave".to_string()),
                    format: None,
                },
            ]
        );
    }

    #[test]
    fn test_sync_text_no_change_emits_nothing() {
        let doc = Doc::default();
        let mut block = doc.create_map().expect("create map");
        insert_text(&doc, &mut block, "prop:text", &text_ops_from_plain("stable")).expect("insert");
        // A write of any kind bumps the doc clock, so an unchanged state vector proves the
        // unchanged text produced no structs at all.
        let before = doc.get_state_vector();

        write_text(&doc, &mut block, "prop:text", &text_ops_from_plain("stable")).expect("write");

        assert_eq!(doc.get_state_vector(), before, "an unchanged text must not write");
    }

    #[test]
    fn test_sync_text_applies_format_over_existing_characters() {
        let doc = Doc::default();
        let mut text = text_with(&doc, &text_ops_from_plain("abc"));
        sync_text(
            &mut text,
            &[
                TextDeltaOp::Insert {
                    insert: TextInsert::Text("a".to_string()),
                    format: Some(bold(true)),
                },
                TextDeltaOp::Insert {
                    insert: TextInsert::Text("bc".to_string()),
                    format: None,
                },
            ],
        )
        .expect("sync");

        assert_eq!(text.to_string(), "abc");
        assert_eq!(
            text.to_delta(),
            vec![
                TextDeltaOp::Insert {
                    insert: TextInsert::Text("a".to_string()),
                    format: Some(bold(true)),
                },
                TextDeltaOp::Insert {
                    insert: TextInsert::Text("bc".to_string()),
                    format: None,
                },
            ]
        );
    }

    #[test]
    fn test_sync_text_clears_a_dropped_attribute() {
        let doc = Doc::default();
        let mut text = text_with(
            &doc,
            &[TextDeltaOp::Insert {
                insert: TextInsert::Text("abc".to_string()),
                format: Some(bold(true)),
            }],
        );
        sync_text(&mut text, &text_ops_from_plain("abc")).expect("sync");

        assert_eq!(text.to_string(), "abc");
        assert_eq!(
            text.to_delta(),
            vec![TextDeltaOp::Insert {
                insert: TextInsert::Text("abc".to_string()),
                format: None,
            }]
        );
    }

    #[test]
    fn test_attr_delta_nulls_dropped_keys() {
        let delta = attr_delta(&bold(true), &Attrs::new());
        assert_eq!(delta.get("bold"), Some(&Any::Null));
    }

    #[test]
    fn test_flatten_units_counts_utf16_length() {
        let units = flatten_units(&text_ops_from_plain("a😀"));
        assert_eq!(units.len(), 2);
        assert_eq!(units[0].len(), 1);
        assert_eq!(units[1].len(), 2);
    }

    #[test]
    fn test_lcs_pairs_refuses_oversized_matrix() {
        let old = vec![0u8; 2000];
        let new = vec![0u8; 2000];
        assert!(lcs_pairs(&old, &new, 1000, |a, b| a == b).is_none());
    }

    #[test]
    fn test_replace_delta_deletes_then_inserts() {
        let old = flatten_units(&text_ops_from_plain("old"));
        let new = flatten_units(&text_ops_from_plain("new"));
        assert_eq!(
            replace_delta(&old, &new),
            vec![
                TextDeltaOp::Delete { delete: 3 },
                TextDeltaOp::Insert {
                    insert: TextInsert::Text("new".to_string()),
                    format: None,
                },
            ]
        );
    }

    #[test]
    fn test_write_children_splices_existing_array() {
        let doc = Doc::default();
        let mut block = doc.create_map().expect("create map");
        insert_children(&doc, &mut block, &["a".into(), "b".into(), "c".into()]).expect("insert");
        let array_before = block
            .get(SYS_CHILDREN)
            .and_then(|value| value.to_array())
            .expect("array");

        write_children(&doc, &mut block, &["c".into(), "a".into(), "d".into()]).expect("write");

        let array_after = block
            .get(SYS_CHILDREN)
            .and_then(|value| value.to_array())
            .expect("array");
        assert_eq!(array_before.id(), array_after.id(), "the array must be edited in place");
        assert_eq!(collect_child_ids(&block), vec!["c", "a", "d"]);
    }

    #[test]
    fn test_write_text_keeps_the_existing_text_type() {
        let doc = Doc::default();
        let mut block = doc.create_map().expect("create map");
        insert_text(&doc, &mut block, "prop:text", &text_ops_from_plain("before")).expect("insert");
        let before = block.get("prop:text").and_then(|value| value.to_text()).expect("text");

        write_text(&doc, &mut block, "prop:text", &text_ops_from_plain("after")).expect("write");

        let after = block.get("prop:text").and_then(|value| value.to_text()).expect("text");
        assert_eq!(before.to_string(), "after", "the original handle must see the edit");
        assert_eq!(after.to_string(), "after");
    }
}
