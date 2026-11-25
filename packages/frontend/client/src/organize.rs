//! Read-only sanitized folder forest (`db$folders`) with `revision`-keyed caching.
//!
//! Enforces strict graph hygiene:
//! - Returns [`FolderForestState::Unresolved`] whenever `!folders_resolved`.
//! - Walks ancestor chains with per-path `visited` sets and depth cap [`MAX_FOLDER_DEPTH`] (`64`).
//! - Drops entire corrupted branches (cycles, dangling `parent_id`, non-`"folder"` ancestors,
//!   or tombstoned breaks) so they never inflate a document's valid placement count `M`.
//! - Deduplicates duplicate leaf links pointing to the same `doc_id` under the same `parent_id`,
//!   while preserving distinct folders with different IDs even when they share a name.

use std::{
    collections::{BTreeMap, HashMap, HashSet},
    sync::Arc,
};

use affine_store::workspace_db::FolderRow;
use serde::{Deserialize, Serialize};

/// Hard depth limit when walking folder ancestor chains.
pub const MAX_FOLDER_DEPTH: usize = 64;

/// One folder segment along a sanitized ancestor chain.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderSegment {
    pub folder_id: String,
    pub name: String,
    pub index: String,
}

/// One valid placement of a document inside the sanitized folder forest.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderPlacement {
    /// Stable `db$folders` leaf row ID (`type == "doc"`).
    pub link_id: String,
    pub doc_id: String,
    /// Root-to-direct-parent folder chain (non-empty for folder-mounted docs; empty for root-mounted leaf).
    pub ancestors: Vec<FolderSegment>,
    pub leaf_index: String,
}

impl FolderPlacement {
    /// Human-readable path preview joined by ` / ` (for location menus and sheets).
    pub fn display_path(&self) -> String {
        if self.ancestors.is_empty() {
            "Root".to_string()
        } else {
            self.ancestors
                .iter()
                .map(|seg| seg.name.as_str())
                .collect::<Vec<_>>()
                .join(" / ")
        }
    }

    fn sort_key(&self) -> Vec<(&str, &str)> {
        let mut key: Vec<(&str, &str)> = self
            .ancestors
            .iter()
            .map(|seg| (seg.index.as_str(), seg.folder_id.as_str()))
            .collect();
        key.push((self.leaf_index.as_str(), self.link_id.as_str()));
        key
    }
}

/// Sanitized read-only folder forest built from a `db$folders` snapshot.
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct FolderForest {
    revision: u64,
    folders: BTreeMap<String, FolderRow>,
    folder_chains: BTreeMap<String, Vec<FolderSegment>>,
    placements_by_doc: BTreeMap<String, Vec<FolderPlacement>>,
    placements_by_link: BTreeMap<String, FolderPlacement>,
}

/// Readiness-aware folder forest projection backed by `Arc` to avoid per-frame clones.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum FolderForestState {
    Unresolved,
    Ready(Arc<FolderForest>),
}

impl FolderForest {
    /// Build a sanitized [`FolderForest`] from a read-only slice of live (non-deleted) [`FolderRow`]s.
    pub fn from_rows(rows: &[FolderRow], revision: u64) -> Self {
        let by_id: HashMap<&str, &FolderRow> = rows.iter().map(|r| (r.id.as_str(), r)).collect();

        // First validate every `"folder"` row's root-to-self chain.
        let mut folders = BTreeMap::new();
        let mut folder_chains = BTreeMap::new();
        for row in rows {
            if row.folder_type != "folder" {
                continue;
            }
            if let Some(chain) = resolve_folder_chain(row.id.as_str(), &by_id) {
                folders.insert(row.id.clone(), row.clone());
                folder_chains.insert(row.id.clone(), chain);
            }
        }

        // Collect valid `"doc"` leaf links, deduplicating identical `(parent_id, doc_id)` pairs.
        let mut doc_rows: Vec<&FolderRow> = rows
            .iter()
            .filter(|r| r.folder_type == "doc" && !r.data.trim().is_empty())
            .collect();
        doc_rows.sort_by(|a, b| {
            a.parent_id
                .cmp(&b.parent_id)
                .then_with(|| a.index.cmp(&b.index))
                .then_with(|| a.id.cmp(&b.id))
        });

        let mut seen_parent_doc: HashSet<(Option<String>, String)> = HashSet::new();
        let mut placements_by_doc: BTreeMap<String, Vec<FolderPlacement>> = BTreeMap::new();
        let mut placements_by_link: BTreeMap<String, FolderPlacement> = BTreeMap::new();

        for row in doc_rows {
            let ancestors = match row.parent_id.as_deref() {
                None => Vec::new(),
                Some(parent_id) => {
                    // Dangling parent, cycle, non-folder parent, or depth overflow -> drop branch.
                    let Some(chain) = folder_chains.get(parent_id) else {
                        continue;
                    };
                    if chain.len() >= MAX_FOLDER_DEPTH {
                        continue;
                    }
                    chain.clone()
                }
            };

            let dedup_key = (row.parent_id.clone(), row.data.clone());
            if !seen_parent_doc.insert(dedup_key) {
                continue;
            }

            let placement = FolderPlacement {
                link_id: row.id.clone(),
                doc_id: row.data.clone(),
                ancestors,
                leaf_index: row.index.clone(),
            };
            placements_by_link.insert(placement.link_id.clone(), placement.clone());
            placements_by_doc
                .entry(placement.doc_id.clone())
                .or_default()
                .push(placement);
        }

        for list in placements_by_doc.values_mut() {
            list.sort_by(|a, b| a.sort_key().cmp(&b.sort_key()));
        }

        Self {
            revision,
            folders,
            folder_chains,
            placements_by_doc,
            placements_by_link,
        }
    }

    pub fn revision(&self) -> u64 {
        self.revision
    }

    /// Valid sanitized placements of `doc_id`, sorted by tree `(index, id)` order.
    pub fn placements_for_doc(&self, doc_id: &str) -> &[FolderPlacement] {
        self.placements_by_doc
            .get(doc_id)
            .map(Vec::as_slice)
            .unwrap_or(&[])
    }

    /// Look up one valid placement by its stable `db$folders` leaf row ID.
    pub fn placement_by_link(&self, link_id: &str) -> Option<&FolderPlacement> {
        self.placements_by_link.get(link_id)
    }

    /// Root-to-self folder chain for a valid folder ID.
    pub fn folder_chain(&self, folder_id: &str) -> Option<&[FolderSegment]> {
        self.folder_chains.get(folder_id).map(Vec::as_slice)
    }

    /// Return all valid folder rows in deterministic `(parent_id, index, id)` order.
    pub fn list_valid_folders(&self) -> Vec<&FolderRow> {
        let mut out: Vec<&FolderRow> = self.folders.values().collect();
        out.sort_by(|a, b| {
            a.parent_id
                .cmp(&b.parent_id)
                .then_with(|| a.index.cmp(&b.index))
                .then_with(|| a.id.cmp(&b.id))
        });
        out
    }

    /// Return direct child folders of `parent_id` (`None` for root folders) sorted by `(index, id)`.
    pub fn child_folders(&self, parent_id: Option<&str>) -> Vec<&FolderRow> {
        let mut children: Vec<&FolderRow> = self
            .folders
            .values()
            .filter(|r| r.parent_id.as_deref() == parent_id)
            .collect();
        children.sort_by(|a, b| a.index.cmp(&b.index).then_with(|| a.id.cmp(&b.id)));
        children
    }

    /// True pre-order DFS traversal of the sanitized folder tree with exact depth (`0, 1, 2, ...`).
    pub fn dfs_folders(&self) -> Vec<(&FolderRow, usize)> {
        fn walk<'a>(
            forest: &'a FolderForest,
            parent_id: Option<&str>,
            depth: usize,
            out: &mut Vec<(&'a FolderRow, usize)>,
        ) {
            for row in forest.child_folders(parent_id) {
                out.push((row, depth));
                walk(forest, Some(row.id.as_str()), depth + 1, out);
            }
        }
        let mut out = Vec::with_capacity(self.folders.len());
        walk(self, None, 0, &mut out);
        out
    }

    /// Return all valid document placements whose direct parent folder is `folder_id`.
    pub fn doc_links_in_folder(&self, folder_id: &str) -> Vec<&FolderPlacement> {
        let mut out: Vec<&FolderPlacement> = self
            .placements_by_link
            .values()
            .filter(|p| {
                p.ancestors
                    .last()
                    .is_some_and(|seg| seg.folder_id == folder_id)
            })
            .collect();
        out.sort_by(|a, b| {
            a.leaf_index
                .cmp(&b.leaf_index)
                .then_with(|| a.link_id.cmp(&b.link_id))
        });
        out
    }
}

/// Revision-keyed cache avoiding redundant forest sanitization when `db$folders` has not changed.
#[derive(Clone, Debug, Default)]
pub struct FolderForestCache {
    cached_revision: Option<u64>,
    cached: Option<Arc<FolderForest>>,
}

impl FolderForestCache {
    pub fn new() -> Self {
        Self::default()
    }

    /// Return [`FolderForestState::Unresolved`] if `!folders_resolved`, otherwise return
    /// an `Arc`-shared cached or freshly sanitized [`FolderForest`] for `revision`.
    pub fn resolve(
        &mut self,
        folders_resolved: bool,
        revision: u64,
        rows: &[FolderRow],
    ) -> FolderForestState {
        if !folders_resolved {
            return FolderForestState::Unresolved;
        }
        if self.cached_revision == Some(revision)
            && let Some(forest) = &self.cached
        {
            return FolderForestState::Ready(Arc::clone(forest));
        }
        let forest = Arc::new(FolderForest::from_rows(rows, revision));
        self.cached_revision = Some(revision);
        self.cached = Some(Arc::clone(&forest));
        FolderForestState::Ready(forest)
    }
}

fn resolve_folder_chain(
    start_folder_id: &str,
    by_id: &HashMap<&str, &FolderRow>,
) -> Option<Vec<FolderSegment>> {
    let mut visited: HashSet<&str> = HashSet::new();
    let mut reversed: Vec<FolderSegment> = Vec::new();
    let mut cur_id = start_folder_id;

    loop {
        if reversed.len() >= MAX_FOLDER_DEPTH {
            return None;
        }
        if !visited.insert(cur_id) {
            // Cycle detected -> discard entire branch.
            return None;
        }
        let row = by_id.get(cur_id)?;
        if row.folder_type != "folder" {
            // Non-folder ancestor -> discard entire branch.
            return None;
        }
        reversed.push(FolderSegment {
            folder_id: row.id.clone(),
            name: row.data.clone(),
            index: row.index.clone(),
        });
        match row.parent_id.as_deref() {
            None => break,
            Some(parent_id) => {
                // Dangling parent -> discard entire branch.
                if !by_id.contains_key(parent_id) {
                    return None;
                }
                cur_id = parent_id;
            }
        }
    }

    reversed.reverse();
    Some(reversed)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn folder(id: &str, parent: Option<&str>, name: &str, index: &str) -> FolderRow {
        FolderRow {
            id: id.into(),
            parent_id: parent.map(str::to_string),
            data: name.into(),
            folder_type: "folder".into(),
            index: index.into(),
        }
    }

    fn doc_link(id: &str, parent: Option<&str>, doc_id: &str, index: &str) -> FolderRow {
        FolderRow {
            id: id.into(),
            parent_id: parent.map(str::to_string),
            data: doc_id.into(),
            folder_type: "doc".into(),
            index: index.into(),
        }
    }

    #[test]
    fn forest_drops_cycles_orphans_non_folder_parents_and_dedups_same_parent_leaves() {
        let rows = vec![
            // Valid two-folder tree with same-name distinct folders.
            folder("f-root-1", None, "Projects", "a0"),
            folder("f-root-2", None, "Projects", "a1"),
            folder("f-child", Some("f-root-1"), "Mobile", "a0"),
            // Cycle: c1 -> c2 -> c1.
            folder("f-cyc-1", Some("f-cyc-2"), "Cyc1", "a0"),
            folder("f-cyc-2", Some("f-cyc-1"), "Cyc2", "a1"),
            // Dangling orphan: parent missing.
            folder("f-orphan", Some("f-missing"), "Orphan", "a0"),
            // Non-folder parent row.
            FolderRow {
                id: "f-not-folder".into(),
                parent_id: None,
                data: "tag-x".into(),
                folder_type: "tag".into(),
                index: "a0".into(),
            },
            // Doc links for doc-1: two valid placements + duplicate in f-child + 3 corrupted branches.
            doc_link("link-a", Some("f-child"), "doc-1", "a0"),
            doc_link("link-a-dup", Some("f-child"), "doc-1", "a1"),
            doc_link("link-b", Some("f-root-2"), "doc-1", "a0"),
            doc_link("link-cyc", Some("f-cyc-1"), "doc-1", "a0"),
            doc_link("link-orphan", Some("f-orphan"), "doc-1", "a0"),
            doc_link("link-bad-parent", Some("f-not-folder"), "doc-1", "a0"),
        ];

        let mut cache = FolderForestCache::new();
        assert_eq!(
            cache.resolve(false, 1, &rows),
            FolderForestState::Unresolved
        );

        let FolderForestState::Ready(forest) = cache.resolve(true, 1, &rows) else {
            panic!("expected Ready forest");
        };
        let placements = forest.placements_for_doc("doc-1");
        assert_eq!(
            placements.len(),
            2,
            "corrupt branches and duplicates must be excluded from M"
        );
        assert_eq!(placements[0].link_id, "link-a");
        assert_eq!(placements[0].display_path(), "Projects / Mobile");
        assert_eq!(placements[1].link_id, "link-b");
        assert_eq!(placements[1].display_path(), "Projects");
    }

    #[test]
    fn forest_enforces_max_depth_64() {
        let mut rows = Vec::new();
        for i in 0..70 {
            let parent = if i == 0 {
                None
            } else {
                Some(format!("f-{}", i - 1))
            };
            rows.push(FolderRow {
                id: format!("f-{i}"),
                parent_id: parent,
                data: format!("Level {i}"),
                folder_type: "folder".into(),
                index: "a0".into(),
            });
        }
        rows.push(doc_link("l-deep", Some("f-68"), "doc-deep", "a0"));
        rows.push(doc_link("l-ok", Some("f-10"), "doc-ok", "a0"));

        let forest = FolderForest::from_rows(&rows, 5);
        assert!(forest.placements_for_doc("doc-deep").is_empty());
        assert_eq!(forest.placements_for_doc("doc-ok").len(), 1);
    }

    #[test]
    fn dfs_folders_emits_true_preorder_hierarchy_and_depths() {
        let rows = vec![
            folder("f-eng", None, "Engineering", "a0"),
            folder("f-prod", None, "Product Specs", "a1"),
            folder("f-mobile", Some("f-eng"), "Mobile Rust", "a0"),
            folder("f-core", Some("f-mobile"), "Core", "a0"),
        ];
        let forest = FolderForest::from_rows(&rows, 2);
        let dfs: Vec<(&str, usize)> = forest
            .dfs_folders()
            .into_iter()
            .map(|(r, d)| (r.id.as_str(), d))
            .collect();
        assert_eq!(
            dfs,
            vec![("f-eng", 0), ("f-mobile", 1), ("f-core", 2), ("f-prod", 0),]
        );
    }
}
