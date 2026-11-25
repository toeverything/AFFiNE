//! In-memory incremental forward/reverse document link graph (`LinkGraph`).
//!
//! Consumes pure read-only [`extract_outbound_doc_refs`] edges, removes edges immediately
//! when a source document is trashed or deleted, reports honest [`BacklinkCompleteness`],
//! and merges read-only cloud `aggregate` hits so up-to-date local snapshots always
//! override stale cloud responses. Never touches `<spaceId>.db` `idx_snapshots`/`indexer_sync`.

use std::collections::{BTreeMap, BTreeSet};

use blocksuite_playground_doc::refs::{
    DocRefEdge, DocSnapshot, OutboundRefKind, extract_outbound_doc_refs,
};
use serde::{Deserialize, Serialize};

/// Completeness honesty indicator for backlink queries.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BacklinkCompleteness {
    /// Every live root document has been indexed locally at `indexed_clock == current_clock`.
    Ready,
    /// At least one live document is unindexed or behind `current_clock`.
    Partial,
}

/// One resolved incoming backlink pointing to a target document.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BacklinkItem {
    pub source_doc_id: String,
    pub source_block_id: String,
    pub kind: OutboundRefKind,
    pub from_cloud_supplement: bool,
}

/// Optional read-only cloud `aggregate` backlink hit merged as a union supplement.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudBacklinkHit {
    pub source_doc_id: String,
    pub source_block_id: String,
    pub kind: OutboundRefKind,
    pub source_version: u64,
}

/// Result of querying incoming backlinks for a target document.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BacklinksResult {
    pub items: Vec<BacklinkItem>,
    pub completeness: BacklinkCompleteness,
}

/// Incremental in-memory forward and reverse reference graph.
#[derive(Clone, Debug, Default)]
pub struct LinkGraph {
    forward: BTreeMap<String, Vec<DocRefEdge>>,
    reverse: BTreeMap<String, Vec<DocRefEdge>>,
    indexed_clocks: BTreeMap<String, u64>,
}

impl LinkGraph {
    pub fn new() -> Self {
        Self::default()
    }

    /// Incrementally index `snapshot` at `doc_clock` with zero writeback.
    pub fn index_doc(&mut self, snapshot: &DocSnapshot, doc_clock: u64) {
        let edges = extract_outbound_doc_refs(snapshot);
        self.replace_edges(&snapshot.doc_id, edges, doc_clock);
    }

    /// Replace outbound edges for `source_doc_id` at `doc_clock`.
    ///
    /// Ignores stale out-of-order snapshots (`doc_clock < indexed_clock`) so deleted edges
    /// are never resurrected and revision clocks never move backward.
    pub fn replace_edges(&mut self, source_doc_id: &str, edges: Vec<DocRefEdge>, doc_clock: u64) {
        if self
            .indexed_clocks
            .get(source_doc_id)
            .is_some_and(|&prev| doc_clock < prev)
        {
            return;
        }
        self.remove_outbound_only(source_doc_id);
        for edge in &edges {
            self.reverse
                .entry(edge.target_doc_id.clone())
                .or_default()
                .push(edge.clone());
        }
        self.forward.insert(source_doc_id.to_string(), edges);
        self.indexed_clocks
            .insert(source_doc_id.to_string(), doc_clock);
    }

    /// Immediately detach all outbound edges when a document moves to Trash.
    pub fn mark_trashed(&mut self, doc_id: &str) {
        self.remove_doc(doc_id);
    }

    /// Immediately remove a deleted/revoked document from both forward and reverse indices.
    pub fn remove_doc(&mut self, doc_id: &str) {
        self.remove_outbound_only(doc_id);
        self.indexed_clocks.remove(doc_id);
    }

    pub fn outbound_edges(&self, source_doc_id: &str) -> &[DocRefEdge] {
        self.forward
            .get(source_doc_id)
            .map(Vec::as_slice)
            .unwrap_or(&[])
    }

    pub fn indexed_clock(&self, doc_id: &str) -> Option<u64> {
        self.indexed_clocks.get(doc_id).copied()
    }

    /// Query incoming backlinks to `target_doc_id` with honest completeness and authoritative
    /// local-over-stale-cloud merging.
    ///
    /// When `workspace_index_seeded` is `false`, returns [`BacklinkCompleteness::Partial`] even
    /// if `live_doc_clocks` is empty so an uninitialized workspace never claims `"No backlinks"`.
    pub fn backlinks(
        &self,
        target_doc_id: &str,
        live_doc_clocks: &BTreeMap<String, u64>,
        workspace_index_seeded: bool,
        cloud_aggregate: Option<&[CloudBacklinkHit]>,
    ) -> BacklinksResult {
        let is_ready = workspace_index_seeded
            && live_doc_clocks.iter().all(|(doc_id, current_clock)| {
                self.indexed_clocks
                    .get(doc_id)
                    .is_some_and(|indexed| indexed == current_clock)
            });

        let mut items: Vec<BacklinkItem> = Vec::new();
        let mut seen: BTreeSet<(String, String, OutboundRefKind)> = BTreeSet::new();

        if let Some(edges) = self.reverse.get(target_doc_id) {
            for edge in edges {
                if !live_doc_clocks.contains_key(&edge.source_doc_id) {
                    continue;
                }
                let key = (
                    edge.source_doc_id.clone(),
                    edge.source_block_id.clone(),
                    edge.kind,
                );
                if seen.insert(key) {
                    items.push(BacklinkItem {
                        source_doc_id: edge.source_doc_id.clone(),
                        source_block_id: edge.source_block_id.clone(),
                        kind: edge.kind,
                        from_cloud_supplement: false,
                    });
                }
            }
        }

        // Merge read-only cloud aggregate hits only for live sources whose local index is
        // missing or older than the cloud hit. An up-to-date local snapshot (even empty after
        // deleting the last `@`) authoritatively overrides stale cloud results.
        if let Some(cloud_hits) = cloud_aggregate {
            for hit in cloud_hits {
                let Some(&live_clock) = live_doc_clocks.get(&hit.source_doc_id) else {
                    continue;
                };
                if hit.source_doc_id == target_doc_id {
                    continue;
                }
                if let Some(&local_clock) = self.indexed_clocks.get(&hit.source_doc_id)
                    && (local_clock >= live_clock || local_clock >= hit.source_version)
                {
                    continue;
                }
                let key = (
                    hit.source_doc_id.clone(),
                    hit.source_block_id.clone(),
                    hit.kind,
                );
                if seen.insert(key) {
                    items.push(BacklinkItem {
                        source_doc_id: hit.source_doc_id.clone(),
                        source_block_id: hit.source_block_id.clone(),
                        kind: hit.kind,
                        from_cloud_supplement: true,
                    });
                }
            }
        }

        items.sort_by(|a, b| {
            a.source_doc_id
                .cmp(&b.source_doc_id)
                .then_with(|| a.source_block_id.cmp(&b.source_block_id))
                .then_with(|| a.kind.cmp(&b.kind))
        });

        BacklinksResult {
            items,
            completeness: if is_ready {
                BacklinkCompleteness::Ready
            } else {
                BacklinkCompleteness::Partial
            },
        }
    }

    fn remove_outbound_only(&mut self, source_doc_id: &str) {
        if let Some(old_edges) = self.forward.remove(source_doc_id) {
            for edge in old_edges {
                if let Some(rev) = self.reverse.get_mut(&edge.target_doc_id) {
                    rev.retain(|e| e.source_doc_id != source_doc_id);
                    if rev.is_empty() {
                        self.reverse.remove(&edge.target_doc_id);
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use blocksuite_playground_doc::read::{BlockContent, BlockNode, PageSnapshot, RichText};
    use y_octo::{AHashMap, Any, HashMapExt, TextDeltaOp, TextInsert};

    use super::*;

    fn snapshot_with_link(source_id: &str, target_id: Option<&str>) -> PageSnapshot {
        let delta = match target_id {
            Some(target) => {
                let mut r = AHashMap::new();
                r.insert("type".to_string(), Any::String("LinkedPage".into()));
                r.insert("pageId".to_string(), Any::String(target.into()));
                let mut attrs = BTreeMap::new();
                attrs.insert("reference".to_string(), Any::Object(Box::new(r)));
                vec![TextDeltaOp::Insert {
                    insert: TextInsert::Text(" ".into()),
                    format: Some(attrs),
                }]
            }
            None => Vec::new(),
        };
        PageSnapshot {
            doc_id: source_id.into(),
            root: Some(BlockNode {
                id: "b-p1".into(),
                flavour: "affine:paragraph".into(),
                version: Some(1),
                content: BlockContent::Paragraph {
                    kind: blocksuite_playground_doc::schema::ParagraphType::Text,
                    text: RichText {
                        plain: String::new(),
                        delta,
                    },
                    collapsed: false,
                    text_align: None,
                },
                props: BTreeMap::new(),
                children: Vec::new(),
            }),
            detached: Vec::new(),
        }
    }

    #[test]
    fn link_graph_honest_completeness_trash_removal_and_local_overrides_stale_cloud() {
        let mut graph = LinkGraph::new();
        let live_clocks = BTreeMap::from([
            ("doc-a".to_string(), 2_u64),
            ("doc-b".to_string(), 1_u64),
            ("doc-target".to_string(), 1_u64),
        ]);

        // Only doc-a indexed so far -> Partial.
        graph.index_doc(&snapshot_with_link("doc-a", Some("doc-target")), 2);
        let partial = graph.backlinks("doc-target", &live_clocks, true, None);
        assert_eq!(partial.completeness, BacklinkCompleteness::Partial);
        assert_eq!(partial.items.len(), 1);

        // Cloud supplements unindexed doc-b.
        let cloud = vec![
            CloudBacklinkHit {
                source_doc_id: "doc-b".into(),
                source_block_id: "b-cloud".into(),
                kind: OutboundRefKind::InlineMention,
                source_version: 1,
            },
            CloudBacklinkHit {
                source_doc_id: "doc-a".into(),
                source_block_id: "b-p1".into(),
                kind: OutboundRefKind::InlineMention,
                source_version: 1,
            },
        ];
        let with_cloud = graph.backlinks("doc-target", &live_clocks, true, Some(&cloud));
        assert_eq!(with_cloud.items.len(), 2);
        assert!(
            with_cloud
                .items
                .iter()
                .any(|i| i.source_doc_id == "doc-b" && i.from_cloud_supplement)
        );

        // Now delete the last `@` in doc-a locally at clock 2: stale cloud MUST NOT resurrect it!
        graph.index_doc(&snapshot_with_link("doc-a", None), 2);
        graph.index_doc(&snapshot_with_link("doc-b", Some("doc-target")), 1);
        graph.index_doc(&snapshot_with_link("doc-target", None), 1);

        // Out-of-order stale snapshot at clock 1 MUST be ignored (no edge resurrection, no rev rollback).
        graph.index_doc(&snapshot_with_link("doc-a", Some("doc-target")), 1);
        assert_eq!(graph.indexed_clock("doc-a"), Some(2));

        let ready = graph.backlinks("doc-target", &live_clocks, true, Some(&cloud));
        assert_eq!(ready.completeness, BacklinkCompleteness::Ready);
        assert_eq!(ready.items.len(), 1);
        assert_eq!(ready.items[0].source_doc_id, "doc-b");
        assert!(!ready.items[0].from_cloud_supplement);

        // Moving doc-b to Trash immediately removes its edge.
        graph.mark_trashed("doc-b");
        let after_trash = graph.backlinks(
            "doc-target",
            &BTreeMap::from([("doc-a".into(), 2), ("doc-target".into(), 1)]),
            true,
            Some(&cloud),
        );
        assert_eq!(after_trash.completeness, BacklinkCompleteness::Ready);
        assert!(after_trash.items.is_empty());

        // Unseeded empty workspace MUST report Partial instead of claiming "No backlinks".
        let unseeded = graph.backlinks("doc-target", &BTreeMap::new(), false, None);
        assert_eq!(unseeded.completeness, BacklinkCompleteness::Partial);
    }
}
