//! Pure multi-level tree drag-and-drop target resolution (`TreeDropTarget`) and shared
//! parent-child nesting legality predicate used by both drag-and-drop and `Tab` indentation.

use std::collections::{HashMap, HashSet};

use blocksuite_playground_doc::{
    read::{BlockContent, BlockNode},
    schema::ParagraphType,
};

use crate::block_flow::{CHILD_INDENT, FlowKind, FlowRect};

use super::{OverlayScene, find_parent};

/// Minimum pointer displacement (logical px) from drag-handle mouse-down before a handle
/// press transitions from a click (block menu) into a drag gesture.
pub const DRAG_START_THRESHOLD_PX: f32 = 4.0;

/// Single source of truth for whether a content block may accept nested child blocks.
///
/// Reused identically by `Tab` indentation (`indent_or_outdent_blocks`) and multi-level
/// tree drag-and-drop (`TreeDropTarget`).
pub fn can_accept_nested_child(node: &BlockNode) -> bool {
    matches!(
        node.content,
        BlockContent::List { .. } | BlockContent::Paragraph { .. }
    )
}

/// Returns `true` when `target_parent_id` is a valid drop/reparent container for `dragged_ids`
/// (must be a Page-visible `Note` or satisfy [`can_accept_nested_child`], and must not be one
/// of `dragged_ids` or any descendant of them).
pub fn is_valid_reparent_target(
    root: &BlockNode,
    dragged_ids: &[String],
    target_parent_id: &str,
) -> bool {
    let Some(target) = root.walk().find(|n| n.id == target_parent_id) else {
        return false;
    };
    if !(target.is_page_visible_note() || can_accept_nested_child(target)) {
        return false;
    }
    for dragged in dragged_ids {
        if dragged == target_parent_id {
            return false;
        }
        if let Some(node) = root.walk().find(|n| n.id == *dragged)
            && node.walk().any(|sub| sub.id == target_parent_id)
        {
            return false;
        }
    }
    true
}

/// Resolved multi-level drop destination computed from pointer `(world_x, world_y)`.
#[derive(Clone, Debug, PartialEq)]
pub struct TreeDropTarget {
    pub parent_id: String,
    /// Raw child index in `parent_id.children` to insert before (with dragged blocks still in place).
    pub insert_index: usize,
    /// Logical nesting depth (`0` = direct child of Note, `1` = first nested level, ...).
    pub depth: usize,
    /// World y of the drop indicator line's center.
    pub indicator_world_y: f32,
    /// World x of the drop indicator line's left end (aligned with target depth indent).
    pub indicator_world_x: f32,
    /// World width of the target level column spanned by the indicator line.
    pub indicator_world_width: f32,
}

impl TreeDropTarget {
    /// Returns `true` when dropping `dragged_ids` at this target would leave the tree unchanged.
    pub fn is_noop_for(&self, root: &BlockNode, dragged_ids: &[String]) -> bool {
        if dragged_ids.is_empty() {
            return true;
        }
        let Some(parent) = root.walk().find(|n| n.id == self.parent_id) else {
            return true;
        };
        if dragged_ids.len() == 1 {
            let Some((cur_parent, old_index)) = find_parent(root, &dragged_ids[0]) else {
                return true;
            };
            return cur_parent.id == self.parent_id
                && (self.insert_index == old_index || self.insert_index == old_index + 1);
        }
        // Multi-block: check if every dragged block is already in `parent_id` in the exact
        // contiguous range touching `insert_index`.
        let mut indices = Vec::with_capacity(dragged_ids.len());
        for cid in dragged_ids {
            let Some(pos) = parent.children.iter().position(|c| c.id == *cid) else {
                return false;
            };
            indices.push(pos);
        }
        let first = indices[0];
        let contiguous = indices.iter().enumerate().all(|(i, &pos)| pos == first + i);
        contiguous && self.insert_index >= first && self.insert_index <= first + indices.len()
    }
}

/// Backward-compatible alias for [`TreeDropTarget`].
pub type DropSlot = TreeDropTarget;

#[derive(Clone, Debug)]
struct VisualRow<'a> {
    node: &'a BlockNode,
    parent_id: String,
    child_index: usize,
    depth: usize,
    rect: FlowRect,
}

fn heading_level(node: &BlockNode) -> Option<u8> {
    let BlockContent::Paragraph { kind, .. } = &node.content else {
        return None;
    };
    match kind {
        ParagraphType::H1 => Some(1),
        ParagraphType::H2 => Some(2),
        ParagraphType::H3 => Some(3),
        ParagraphType::H4 => Some(4),
        ParagraphType::H5 => Some(5),
        ParagraphType::H6 => Some(6),
        _ => None,
    }
}

/// Child index immediately after `parent.children[slot]`, skipping any hidden siblings
/// belonging to a collapsed heading so a drop below a collapsed heading lands after its section.
fn slot_after_node(parent: &BlockNode, slot: usize) -> usize {
    let mut idx = slot + 1;
    if let Some(node) = parent.children.get(slot)
        && matches!(
            node.content,
            BlockContent::Paragraph {
                collapsed: true,
                ..
            }
        )
        && let Some(level) = heading_level(node)
    {
        while let Some(sib) = parent.children.get(idx) {
            if heading_level(sib).is_some_and(|next| next <= level) {
                break;
            }
            idx += 1;
        }
    }
    idx
}

fn is_node_collapsed(
    node: &BlockNode,
    local_collapsed: &std::collections::BTreeSet<String>,
) -> bool {
    match &node.content {
        BlockContent::List { collapsed, .. } => *collapsed,
        BlockContent::Paragraph {
            kind: ParagraphType::Text | ParagraphType::Quote,
            ..
        } => !node.children.is_empty() && local_collapsed.contains(&node.id),
        BlockContent::Paragraph { collapsed, .. } => *collapsed,
        _ => false,
    }
}

/// Unique pure multi-level drop resolver shared by mouse single-block drag, multi-block
/// selection drag, touch long-press drag, and collapsed heading section migration.
///
/// Uses Scheme A (`+24px` horizontal stepped indentation): vertical pointer position picks the
/// nearest visual gap, and horizontal pointer offset in steps of [`CHILD_INDENT`] selects the
/// nesting depth within the gap's valid `[min_depth, max_depth]` range.
pub fn resolve_tree_drop_target(
    scene: &OverlayScene<'_>,
    dragged_ids: &[String],
    world_x: f32,
    world_y: f32,
) -> Option<TreeDropTarget> {
    let root = scene.snapshot.root.as_ref()?;
    if dragged_ids.is_empty() {
        return None;
    }

    // Index every laid-out non-title block's rect.
    let mut laid_out: HashMap<&str, FlowRect> = HashMap::new();
    for block in &scene.layout.blocks {
        if block.body.kind != FlowKind::Title {
            laid_out.insert(block.block_id.as_str(), block.rect());
        }
    }

    // Collect visual rows in pre-order along with their tree parent, child index, and depth.
    let mut rows: Vec<VisualRow<'_>> = Vec::new();
    fn collect_rows<'a>(
        parent: &'a BlockNode,
        depth: usize,
        laid_out: &HashMap<&str, FlowRect>,
        rows: &mut Vec<VisualRow<'a>>,
    ) {
        for (idx, child) in parent.children.iter().enumerate() {
            if let Some(&rect) = laid_out.get(child.id.as_str()) {
                rows.push(VisualRow {
                    node: child,
                    parent_id: parent.id.clone(),
                    child_index: idx,
                    depth,
                    rect,
                });
                collect_rows(child, depth + 1, laid_out, rows);
            }
        }
    }
    for note in &root.children {
        if note.is_page_visible_note() {
            collect_rows(note, 0, &laid_out, &mut rows);
        }
    }
    if rows.is_empty() {
        return None;
    }

    // Build all visual insertion gaps: before each row `i`, plus after the last row.
    let mut gaps: Vec<(Option<usize>, Option<usize>, f32)> = Vec::with_capacity(rows.len() + 1);
    for i in 0..rows.len() {
        let top = rows[i].rect.y;
        let above_bottom = if i > 0 {
            rows[i - 1].rect.bottom()
        } else {
            top
        };
        let gap_y = ((above_bottom + top) * 0.5).round();
        gaps.push((i.checked_sub(1), Some(i), gap_y));
    }
    let last_bottom = rows.last().unwrap().rect.bottom();
    gaps.push((
        Some(rows.len() - 1),
        None,
        ((last_bottom + last_bottom + 10.0) * 0.5).round(),
    ));

    let &(above_idx, below_idx, indicator_world_y) = gaps
        .iter()
        .min_by(|a, b| (a.2 - world_y).abs().total_cmp(&(b.2 - world_y).abs()))?;

    let min_depth = below_idx.map_or(0, |bi| rows[bi].depth);

    // Build candidate (depth, parent_id, insert_index) chain for this gap from shallowest to deepest.
    let mut candidates: Vec<(usize, String, usize)> = Vec::new();

    match above_idx {
        None => {
            // Top of document: insert before the first row.
            let first = &rows[below_idx?];
            if is_valid_reparent_target(root, dragged_ids, &first.parent_id) {
                candidates.push((first.depth, first.parent_id.clone(), first.child_index));
            }
        }
        Some(ai) => {
            let above = &rows[ai];

            // 1. Walk up from `above` down to `min_depth` for sibling / ancestor-sibling insertions.
            let mut cur_id = above.node.id.as_str();
            let mut cur_depth = above.depth;
            while let Some((parent, slot)) = find_parent(root, cur_id) {
                if cur_depth >= min_depth && is_valid_reparent_target(root, dragged_ids, &parent.id)
                {
                    let insert_index = slot_after_node(parent, slot);
                    candidates.push((cur_depth, parent.id.clone(), insert_index));
                }
                if cur_depth <= min_depth || cur_depth == 0 {
                    break;
                }
                cur_id = parent.id.as_str();
                cur_depth -= 1;
            }

            // 2. Deeper level: nest directly inside `above.node` if legal (reusing `Tab` predicate).
            if can_accept_nested_child(above.node)
                && is_valid_reparent_target(root, dragged_ids, &above.node.id)
            {
                let child_depth = above.depth + 1;
                if child_depth >= min_depth {
                    let collapsed = is_node_collapsed(above.node, scene.local_collapsed);
                    let insert_index = if collapsed || above.node.children.is_empty() {
                        above.node.children.len()
                    } else {
                        0
                    };
                    candidates.push((child_depth, above.node.id.clone(), insert_index));
                }
            }
        }
    }

    if candidates.is_empty() {
        return None;
    }
    // Sort shallowest -> deepest and deduplicate by depth.
    candidates.sort_by_key(|c| c.0);
    candidates.dedup_by_key(|c| c.0);

    // Map horizontal pointer offset to desired nesting depth in +24px steps.
    let logical_indent = match scene.direction {
        ui::Direction::Ltr => world_x,
        ui::Direction::Rtl => scene.layout.width - world_x,
    };
    let desired_depth = (logical_indent / CHILD_INDENT).floor().max(0.0) as usize;

    let min_avail = candidates.first().unwrap().0;
    let max_avail = candidates.last().unwrap().0;
    let clamped_depth = desired_depth.clamp(min_avail, max_avail);

    // Pick candidate matching `clamped_depth`, or nearest available depth.
    let (depth, parent_id, insert_index) = candidates
        .into_iter()
        .min_by_key(|(d, _, _)| d.abs_diff(clamped_depth))?;

    let indent_px = depth as f32 * CHILD_INDENT;
    let indicator_world_width = (scene.layout.width - indent_px).max(0.0);
    let indicator_world_x = match scene.direction {
        ui::Direction::Ltr => indent_px,
        ui::Direction::Rtl => 0.0,
    };

    // Guard against dropping an ancestor into its own dragged subtree (already checked above,
    // double-check dragged_set doesn't contain parent_id).
    let dragged_set: HashSet<&str> = dragged_ids.iter().map(String::as_str).collect();
    if dragged_set.contains(parent_id.as_str()) {
        return None;
    }

    Some(TreeDropTarget {
        parent_id,
        insert_index,
        depth,
        indicator_world_y,
        indicator_world_x,
        indicator_world_width,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use blocksuite_playground_doc::{
        read::RichText,
        schema::{ListType, ParagraphType},
    };
    use std::collections::BTreeMap;

    fn node(id: &str, content: BlockContent, children: Vec<BlockNode>) -> BlockNode {
        BlockNode {
            id: id.into(),
            flavour: match &content {
                BlockContent::Note { .. } => "affine:note",
                BlockContent::Paragraph { .. } => "affine:paragraph",
                BlockContent::List { .. } => "affine:list",
                BlockContent::Code { .. } => "affine:code",
                BlockContent::Divider => "affine:divider",
                _ => "affine:page",
            }
            .into(),
            version: Some(1),
            content,
            props: BTreeMap::new(),
            children,
        }
    }

    fn para(id: &str, children: Vec<BlockNode>) -> BlockNode {
        node(
            id,
            BlockContent::Paragraph {
                kind: ParagraphType::Text,
                text: RichText::default(),
                collapsed: false,
                text_align: None,
            },
            children,
        )
    }

    fn list(id: &str, children: Vec<BlockNode>) -> BlockNode {
        node(
            id,
            BlockContent::List {
                kind: ListType::Bulleted,
                text: RichText::default(),
                checked: false,
                collapsed: false,
                order: None,
                numbered_index: Some(1),
                text_align: None,
            },
            children,
        )
    }

    #[test]
    fn shared_nesting_predicate_and_cycle_detection() {
        let child = para("child", vec![]);
        let parent = list("parent", vec![child]);
        let code = node(
            "code",
            BlockContent::Code {
                language: String::new(),
                caption: String::new(),
                text: String::new(),
                wrap: false,
            },
            vec![],
        );
        let note = node(
            "note",
            BlockContent::Note {
                display_mode: blocksuite_playground_doc::read::NoteDisplayMode::Both,
                hidden: false,
                xywh: "[0,0,800,95]".into(),
                background: serde_json::Value::Null,
            },
            vec![parent, code],
        );
        let root = node(
            "page",
            BlockContent::Page {
                title: RichText::default(),
            },
            vec![note],
        );

        assert!(can_accept_nested_child(
            root.walk().find(|n| n.id == "parent").unwrap()
        ));
        assert!(can_accept_nested_child(
            root.walk().find(|n| n.id == "child").unwrap()
        ));
        assert!(!can_accept_nested_child(
            root.walk().find(|n| n.id == "code").unwrap()
        ));

        assert!(is_valid_reparent_target(&root, &["child".into()], "note"));
        assert!(!is_valid_reparent_target(&root, &["child".into()], "code"));
        assert!(!is_valid_reparent_target(
            &root,
            &["parent".into()],
            "parent"
        ));
        assert!(!is_valid_reparent_target(
            &root,
            &["parent".into()],
            "child"
        ));
    }
}
