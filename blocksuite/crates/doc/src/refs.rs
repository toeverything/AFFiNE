//! Pure read-only extraction of outbound document references from a [`DocSnapshot`].
//!
//! Matches Web `reader.ts`: covers inline `@` mentions (`attributes.reference.pageId`,
//! including both `"LinkedPage"` and `"Subpage"`), `affine:embed-linked-doc`,
//! `affine:embed-synced-doc`, and `affine:database` title/cell rich-text references
//! while stripping self-references, empty IDs, and in-page `affine:surface-ref` blocks.

use std::collections::HashSet;

use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use y_octo::{Any, TextDeltaOp};

use crate::read::{BlockContent, BlockNode, PageSnapshot, RichText};

/// Read-only document snapshot alias accepted by [`extract_outbound_doc_refs`].
pub type DocSnapshot = PageSnapshot;

/// Structural source of an outbound document reference edge.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash, Ord, PartialOrd, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum OutboundRefKind {
    InlineMention,
    EmbedLinkedDoc,
    EmbedSyncedDoc,
    DatabaseCell,
}

/// One deduplicated outbound link from a block inside `source_doc_id` to `target_doc_id`.
#[derive(Clone, Debug, Eq, PartialEq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocRefEdge {
    pub source_doc_id: String,
    pub target_doc_id: String,
    pub source_block_id: String,
    pub kind: OutboundRefKind,
}

/// Extract all outbound document references from `snapshot` without mutating any CRDT state.
///
/// Self-references (`target_doc_id == source_doc_id`), empty `pageId` values, and
/// `affine:surface-ref` blocks are excluded. Duplicate `(source_block_id, target_doc_id, kind)`
/// edges are removed while preserving first-seen document traversal order.
pub fn extract_outbound_doc_refs(snapshot: &DocSnapshot) -> Vec<DocRefEdge> {
    let source_doc_id = snapshot.doc_id.as_str();
    let mut edges = Vec::new();
    let mut seen: HashSet<(String, String, OutboundRefKind)> = HashSet::new();

    for root in snapshot.root.iter().chain(snapshot.detached.iter()) {
        for node in root.walk() {
            extract_block_refs(source_doc_id, node, &mut edges, &mut seen);
        }
    }

    edges
}

fn push_edge(
    source_doc_id: &str,
    source_block_id: &str,
    target_doc_id: &str,
    kind: OutboundRefKind,
    edges: &mut Vec<DocRefEdge>,
    seen: &mut HashSet<(String, String, OutboundRefKind)>,
) {
    let target = target_doc_id.trim();
    if target.is_empty() || target == source_doc_id {
        return;
    }
    let key = (source_block_id.to_string(), target.to_string(), kind);
    if seen.insert(key) {
        edges.push(DocRefEdge {
            source_doc_id: source_doc_id.to_string(),
            target_doc_id: target.to_string(),
            source_block_id: source_block_id.to_string(),
            kind,
        });
    }
}

fn extract_block_refs(
    source_doc_id: &str,
    node: &BlockNode,
    edges: &mut Vec<DocRefEdge>,
    seen: &mut HashSet<(String, String, OutboundRefKind)>,
) {
    match node.flavour.as_str() {
        // In-page canvas element reference, never an inter-document link.
        "affine:surface-ref" => {}
        "affine:embed-linked-doc" => {
            if let Some(page_id) = node.props.get("prop:pageId").and_then(JsonValue::as_str) {
                push_edge(
                    source_doc_id,
                    &node.id,
                    page_id,
                    OutboundRefKind::EmbedLinkedDoc,
                    edges,
                    seen,
                );
            }
        }
        "affine:embed-synced-doc" => {
            if let Some(page_id) = node.props.get("prop:pageId").and_then(JsonValue::as_str) {
                push_edge(
                    source_doc_id,
                    &node.id,
                    page_id,
                    OutboundRefKind::EmbedSyncedDoc,
                    edges,
                    seen,
                );
            }
        }
        "affine:database" => {
            if let Some(title_val) = node.props.get("prop:title") {
                extract_json_text_refs(
                    source_doc_id,
                    &node.id,
                    title_val,
                    OutboundRefKind::InlineMention,
                    edges,
                    seen,
                );
            }
            if let Some(cells_val) = node.props.get("prop:cells") {
                extract_database_cells_refs(source_doc_id, &node.id, cells_val, edges, seen);
            }
        }
        _ => {
            let mut scanned_typed_text = false;
            match &node.content {
                BlockContent::Page { title } | BlockContent::Frame { title, .. } => {
                    extract_rich_text_refs(
                        source_doc_id,
                        &node.id,
                        title,
                        OutboundRefKind::InlineMention,
                        edges,
                        seen,
                    );
                    scanned_typed_text = true;
                }
                BlockContent::Paragraph { text, .. } | BlockContent::List { text, .. } => {
                    extract_rich_text_refs(
                        source_doc_id,
                        &node.id,
                        text,
                        OutboundRefKind::InlineMention,
                        edges,
                        seen,
                    );
                    scanned_typed_text = true;
                }
                _ => {}
            }

            if !scanned_typed_text {
                for key in ["prop:text", "prop:title", "prop:caption"] {
                    if let Some(val) = node.props.get(key) {
                        extract_json_text_refs(
                            source_doc_id,
                            &node.id,
                            val,
                            OutboundRefKind::InlineMention,
                            edges,
                            seen,
                        );
                    }
                }
            }
        }
    }
}

fn extract_rich_text_refs(
    source_doc_id: &str,
    source_block_id: &str,
    rich: &RichText,
    kind: OutboundRefKind,
    edges: &mut Vec<DocRefEdge>,
    seen: &mut HashSet<(String, String, OutboundRefKind)>,
) {
    for op in &rich.delta {
        let TextDeltaOp::Insert {
            format: Some(attrs),
            ..
        } = op
        else {
            continue;
        };
        let Some(Any::Object(reference)) = attrs.get("reference") else {
            continue;
        };
        if let Some(Any::String(page_id)) = reference.get("pageId") {
            push_edge(source_doc_id, source_block_id, page_id, kind, edges, seen);
        }
    }
}

fn extract_database_cells_refs(
    source_doc_id: &str,
    source_block_id: &str,
    cells_val: &JsonValue,
    edges: &mut Vec<DocRefEdge>,
    seen: &mut HashSet<(String, String, OutboundRefKind)>,
) {
    let Some(rows) = cells_val.as_object() else {
        return;
    };
    for row in rows.values() {
        let Some(cols) = row.as_object() else {
            continue;
        };
        for cell in cols.values() {
            if let Some(cell_val) = cell.get("value") {
                extract_json_text_refs(
                    source_doc_id,
                    source_block_id,
                    cell_val,
                    OutboundRefKind::DatabaseCell,
                    edges,
                    seen,
                );
            } else {
                extract_json_text_refs(
                    source_doc_id,
                    source_block_id,
                    cell,
                    OutboundRefKind::DatabaseCell,
                    edges,
                    seen,
                );
            }
        }
    }
}

fn extract_json_text_refs(
    source_doc_id: &str,
    source_block_id: &str,
    value: &JsonValue,
    kind: OutboundRefKind,
    edges: &mut Vec<DocRefEdge>,
    seen: &mut HashSet<(String, String, OutboundRefKind)>,
) {
    match value {
        JsonValue::Array(ops) => {
            for op in ops {
                extract_json_delta_op_ref(source_doc_id, source_block_id, op, kind, edges, seen);
            }
        }
        JsonValue::Object(map) => {
            if let Some(delta) = map.get("delta") {
                extract_json_text_refs(source_doc_id, source_block_id, delta, kind, edges, seen);
            }
            if let Some(y_text) = map.get("yText") {
                extract_json_text_refs(source_doc_id, source_block_id, y_text, kind, edges, seen);
            }
        }
        _ => {}
    }
}

fn extract_json_delta_op_ref(
    source_doc_id: &str,
    source_block_id: &str,
    op: &JsonValue,
    kind: OutboundRefKind,
    edges: &mut Vec<DocRefEdge>,
    seen: &mut HashSet<(String, String, OutboundRefKind)>,
) {
    let Some(reference) = op
        .get("attributes")
        .and_then(|attrs| attrs.get("reference"))
        .and_then(JsonValue::as_object)
    else {
        return;
    };
    if let Some(page_id) = reference.get("pageId").and_then(JsonValue::as_str) {
        push_edge(source_doc_id, source_block_id, page_id, kind, edges, seen);
    }
}
