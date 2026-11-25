//! Side-effect-free `derive` pure function implementing all 7 Breadcrumb A+B laws.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::organize::{FolderForestState, FolderPlacement};

use super::{LocationChoice, LocationRef, NavEntry, NavHistory, NavTarget, Origin};

/// Read-only document metadata snapshot consumed by [`derive`].
#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocMetaSnapshot {
    pub title: String,
    pub trashed: bool,
    pub journal_date: Option<String>,
    /// True when the document has been permanently deleted or access was revoked.
    pub revoked_or_deleted: bool,
}

/// Read-only workspace snapshot consumed by [`derive`].
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WorkspaceBreadcrumbSnapshot {
    pub folders_resolved: bool,
    pub forest: FolderForestState,
    pub docs: BTreeMap<String, DocMetaSnapshot>,
    pub collections: BTreeMap<String, String>,
    pub tags: BTreeMap<String, String>,
}

/// Action triggered when a user activates a breadcrumb item.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BreadcrumbAction {
    NavigateHistoryAnchor { anchor_seq: u64 },
    OpenFolder { folder_id: String },
    OpenTarget { target: NavTarget },
    OpenLocationSheet { owner_seq: u64 },
    None,
}

/// One derived breadcrumb item ready for L2 layout and L4 rendering.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BreadcrumbCrumb {
    pub id: String,
    pub label: String,
    pub action: BreadcrumbAction,
    pub is_current: bool,
    pub is_switcher: bool,
    pub in_trash: bool,
}

/// One selectable placement shown in the Location & Trail sheet.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocationOption {
    pub location: LocationRef,
    pub label: String,
    pub selected: bool,
}

/// One step in the current provenance trail shown in the Location & Trail sheet.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrailEntry {
    pub seq: u64,
    pub doc_id: String,
    pub title: String,
    pub in_trash: bool,
    pub is_current: bool,
}

/// Derived context state of the chain head `d0`.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ContextState {
    Loading,
    Unfiled,
    SinglePath,
    MultiLocation {
        count: usize,
        owner_doc_id: String,
        owner_doc_title: String,
        owner_seq: u64,
        options: Vec<LocationOption>,
    },
    TrashRoot,
    JournalsRoot,
    CollectionRoot,
    TagRoot,
}

/// Complete side-effect-free output of [`derive`].
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BreadcrumbDerivation {
    pub crumbs: Vec<BreadcrumbCrumb>,
    pub context: ContextState,
    pub in_trash: bool,
    /// True on Mobile when a non-journal unfiled doc was opened directly with no trail.
    pub should_hide_bar_on_mobile: bool,
    /// Current loop-erased provenance trail (always populated for the sheet).
    pub trail: Vec<TrailEntry>,
    /// True when `cur` was reached via a valid same-scope `DocLink` and currently has a
    /// `Location(_)` override pick, so the sheet can restore the original provenance trail.
    pub can_return_to_trail: bool,
    /// Full provenance trail recovered by ignoring `cur.pick` when `can_return_to_trail` is true.
    pub recoverable_trail: Vec<TrailEntry>,
    /// All valid locations of the current document itself (always populated for the sheet).
    pub current_doc_locations: Vec<LocationOption>,
    /// Sequence ID of chain head `d0` that owns the context prefix.
    pub chain_head_seq: Option<u64>,
}

fn doc_title(snapshot: &WorkspaceBreadcrumbSnapshot, doc_id: &str) -> String {
    match snapshot.docs.get(doc_id) {
        Some(meta) if !meta.revoked_or_deleted && !meta.title.trim().is_empty() => {
            meta.title.clone()
        }
        _ => "Untitled".to_string(),
    }
}

fn doc_is_trashed(snapshot: &WorkspaceBreadcrumbSnapshot, doc_id: &str) -> bool {
    snapshot
        .docs
        .get(doc_id)
        .is_some_and(|meta| meta.trashed && !meta.revoked_or_deleted)
}

fn collect_doc_locations(
    doc_id: &str,
    snapshot: &WorkspaceBreadcrumbSnapshot,
    selected: Option<&LocationRef>,
) -> Vec<LocationOption> {
    let mut options = Vec::new();
    if let FolderForestState::Ready(forest) = &snapshot.forest {
        for placement in forest.placements_for_doc(doc_id) {
            let loc = LocationRef::FolderLink(placement.link_id.clone());
            options.push(LocationOption {
                selected: selected == Some(&loc),
                location: loc,
                label: placement.display_path(),
            });
        }
    }
    if let Some(meta) = snapshot.docs.get(doc_id)
        && !meta.revoked_or_deleted
        && let Some(date) = &meta.journal_date
    {
        let loc = LocationRef::JournalDate(date.clone());
        options.push(LocationOption {
            selected: selected == Some(&loc),
            location: loc,
            label: format!("Journals / {date}"),
        });
    }
    options
}

fn folder_crumbs_from_placement(placement: &FolderPlacement) -> Vec<BreadcrumbCrumb> {
    placement
        .ancestors
        .iter()
        .map(|seg| BreadcrumbCrumb {
            id: format!("folder:{}", seg.folder_id),
            label: seg.name.clone(),
            action: BreadcrumbAction::OpenFolder {
                folder_id: seg.folder_id.clone(),
            },
            is_current: false,
            is_switcher: false,
            in_trash: false,
        })
        .collect()
}

/// Collect the causal `DocLink` chain ending at `cur`, then apply loop erasure by `DocId`
/// while preserving the first entry's `(origin, pick)` context at chain head `d0`.
fn walk_and_erase_loops<'a>(
    history: &'a NavHistory,
    cur: &'a NavEntry,
    ignore_cur_pick: bool,
) -> Vec<&'a NavEntry> {
    let mut chain_rev = vec![cur];
    let mut cursor = cur;

    while let Origin::DocLink { parent_seq, .. } = &cursor.origin {
        let skip_pick = ignore_cur_pick && cursor.seq == cur.seq;
        if !skip_pick && matches!(cursor.pick, Some(LocationChoice::Location(_))) {
            break;
        }
        let Some(parent) = history.entry_by_seq(*parent_seq) else {
            break;
        };
        if parent.scope != cur.scope || parent.target.doc_id().is_none() {
            break;
        }
        if chain_rev.iter().any(|seen| seen.seq == parent.seq) {
            break;
        }
        chain_rev.push(parent);
        cursor = parent;
    }

    chain_rev.reverse();

    // Loop erasure: if a DocId appears multiple times in `[d0, ..., cur]`, erase the loop segment
    // between its first and most recent occurrence while retaining the earlier entry's context
    // when the erased head is `d0`.
    let mut erased: Vec<&'a NavEntry> = Vec::with_capacity(chain_rev.len());
    for entry in chain_rev {
        if let Some(doc_id) = entry.target.doc_id()
            && let Some(pos) = erased
                .iter()
                .position(|prev| prev.target.doc_id() == Some(doc_id))
        {
            // Keep the first occurrence (which carries the original `(origin, pick)` context)
            // and drop everything strictly after `pos` so `F -> A1 -> B -> C -> A2` becomes `F -> A1`
            // and `F -> A -> B1 -> C -> B2` becomes `F -> A -> B1`.
            erased.truncate(pos + 1);
            continue;
        }
        erased.push(entry);
    }

    erased
}

fn trail_entries_from_chain(
    chain: &[&NavEntry],
    snapshot: &WorkspaceBreadcrumbSnapshot,
) -> Vec<TrailEntry> {
    chain
        .iter()
        .enumerate()
        .filter_map(|(idx, entry)| {
            let doc_id = entry.target.doc_id()?;
            Some(TrailEntry {
                seq: entry.seq,
                doc_id: doc_id.to_string(),
                title: doc_title(snapshot, doc_id),
                in_trash: doc_is_trashed(snapshot, doc_id),
                is_current: idx + 1 == chain.len(),
            })
        })
        .collect()
}

/// Derive the breadcrumb bar and Location & Trail sheet state from `history` and `snapshot`.
pub fn derive(
    history: &NavHistory,
    snapshot: &WorkspaceBreadcrumbSnapshot,
) -> BreadcrumbDerivation {
    let Some(cur) = history.current() else {
        return BreadcrumbDerivation {
            crumbs: Vec::new(),
            context: ContextState::Unfiled,
            in_trash: false,
            should_hide_bar_on_mobile: true,
            trail: Vec::new(),
            can_return_to_trail: false,
            recoverable_trail: Vec::new(),
            current_doc_locations: Vec::new(),
            chain_head_seq: None,
        };
    };

    let Some(cur_doc_id) = cur.target.doc_id() else {
        return derive_non_doc_target(cur, snapshot);
    };

    let cur_in_trash = doc_is_trashed(snapshot, cur_doc_id);
    let chain = walk_and_erase_loops(history, cur, false);
    let has_trail = chain.len() > 1;
    let d0 = chain[0];
    let d0_doc_id = d0.target.doc_id().unwrap_or(cur_doc_id);
    let d0_title = doc_title(snapshot, d0_doc_id);

    let (can_return_to_trail, recoverable_trail) = if matches!(cur.origin, Origin::DocLink { .. })
        && matches!(cur.pick, Some(LocationChoice::Location(_)))
    {
        let recovered = walk_and_erase_loops(history, cur, true);
        if recovered.len() > 1 {
            (true, trail_entries_from_chain(&recovered, snapshot))
        } else {
            (false, Vec::new())
        }
    } else {
        (false, Vec::new())
    };

    let active_pick = match &cur.pick {
        Some(LocationChoice::Location(loc)) => Some(loc),
        _ => match &d0.pick {
            Some(LocationChoice::Location(loc)) => Some(loc),
            _ => None,
        },
    };
    let current_doc_locations = collect_doc_locations(cur_doc_id, snapshot, active_pick);
    let trail = trail_entries_from_chain(&chain, snapshot);

    // Law 4: direct visit to a trashed document with no trail shows `Trash › Doc`.
    if cur_in_trash && !has_trail {
        let crumbs = vec![
            BreadcrumbCrumb {
                id: "root:trash".into(),
                label: "Trash".into(),
                action: BreadcrumbAction::OpenTarget {
                    target: NavTarget::Trash,
                },
                is_current: false,
                is_switcher: false,
                in_trash: false,
            },
            BreadcrumbCrumb {
                id: format!("doc:{cur_doc_id}"),
                label: doc_title(snapshot, cur_doc_id),
                action: BreadcrumbAction::None,
                is_current: true,
                is_switcher: false,
                in_trash: true,
            },
        ];
        return BreadcrumbDerivation {
            crumbs,
            context: ContextState::TrashRoot,
            in_trash: true,
            should_hide_bar_on_mobile: false,
            trail,
            can_return_to_trail,
            recoverable_trail,
            current_doc_locations,
            chain_head_seq: Some(d0.seq),
        };
    }

    // Derive prefix context for chain head `d0`.
    let (mut prefix_crumbs, context) = derive_head_context(d0, d0_doc_id, &d0_title, snapshot);

    // Append chain entries (`d0 .. cur`).
    for (idx, entry) in chain.iter().enumerate() {
        let Some(doc_id) = entry.target.doc_id() else {
            continue;
        };
        let is_current = idx + 1 == chain.len();
        prefix_crumbs.push(BreadcrumbCrumb {
            id: format!("doc:{doc_id}"),
            label: doc_title(snapshot, doc_id),
            action: if is_current {
                BreadcrumbAction::None
            } else {
                BreadcrumbAction::NavigateHistoryAnchor {
                    anchor_seq: entry.seq,
                }
            },
            is_current,
            is_switcher: false,
            in_trash: doc_is_trashed(snapshot, doc_id),
        });
    }

    let should_hide_bar_on_mobile =
        !has_trail && matches!(context, ContextState::Unfiled) && !cur_in_trash;

    BreadcrumbDerivation {
        crumbs: prefix_crumbs,
        context,
        in_trash: cur_in_trash,
        should_hide_bar_on_mobile,
        trail,
        can_return_to_trail,
        recoverable_trail,
        current_doc_locations,
        chain_head_seq: Some(d0.seq),
    }
}

fn derive_head_context(
    d0: &NavEntry,
    d0_doc_id: &str,
    d0_title: &str,
    snapshot: &WorkspaceBreadcrumbSnapshot,
) -> (Vec<BreadcrumbCrumb>, ContextState) {
    // Explicit user pick on `d0` takes precedence (strictly validated against `d0_doc_id`).
    if let Some(LocationChoice::Location(picked)) = &d0.pick {
        match picked {
            LocationRef::FolderLink(link_id) => {
                if let FolderForestState::Ready(forest) = &snapshot.forest
                    && let Some(placement) = forest
                        .placement_by_link(link_id)
                        .filter(|p| p.doc_id == d0_doc_id)
                {
                    return (
                        folder_crumbs_from_placement(placement),
                        ContextState::SinglePath,
                    );
                }
            }
            LocationRef::JournalDate(_) => {
                return (
                    vec![BreadcrumbCrumb {
                        id: "root:journals".into(),
                        label: "Journals".into(),
                        action: BreadcrumbAction::OpenTarget {
                            target: NavTarget::Journals,
                        },
                        is_current: false,
                        is_switcher: false,
                        in_trash: false,
                    }],
                    ContextState::JournalsRoot,
                );
            }
        }
    }

    // Explicit non-direct origins on `d0`.
    match &d0.origin {
        Origin::Collection(col_id) => {
            let label = snapshot
                .collections
                .get(col_id)
                .cloned()
                .unwrap_or_else(|| "Collection".to_string());
            return (
                vec![BreadcrumbCrumb {
                    id: format!("collection:{col_id}"),
                    label,
                    action: BreadcrumbAction::OpenTarget {
                        target: NavTarget::Collection(col_id.clone()),
                    },
                    is_current: false,
                    is_switcher: false,
                    in_trash: false,
                }],
                ContextState::CollectionRoot,
            );
        }
        Origin::Tag(tag_id) => {
            let label = snapshot
                .tags
                .get(tag_id)
                .cloned()
                .unwrap_or_else(|| format!("#{tag_id}"));
            return (
                vec![BreadcrumbCrumb {
                    id: format!("tag:{tag_id}"),
                    label,
                    action: BreadcrumbAction::OpenTarget {
                        target: NavTarget::Tag(tag_id.clone()),
                    },
                    is_current: false,
                    is_switcher: false,
                    in_trash: false,
                }],
                ContextState::TagRoot,
            );
        }
        Origin::Journal => {
            return (
                vec![BreadcrumbCrumb {
                    id: "root:journals".into(),
                    label: "Journals".into(),
                    action: BreadcrumbAction::OpenTarget {
                        target: NavTarget::Journals,
                    },
                    is_current: false,
                    is_switcher: false,
                    in_trash: false,
                }],
                ContextState::JournalsRoot,
            );
        }
        Origin::Placement { link_id } => {
            if !snapshot.folders_resolved {
                return (Vec::new(), ContextState::Loading);
            }
            if let FolderForestState::Ready(forest) = &snapshot.forest
                && let Some(placement) = forest
                    .placement_by_link(link_id)
                    .filter(|p| p.doc_id == d0_doc_id)
            {
                return (
                    folder_crumbs_from_placement(placement),
                    ContextState::SinglePath,
                );
            }
        }
        Origin::Direct(_) | Origin::Backlink { .. } | Origin::DocLink { .. } => {}
    }

    // Law 2: table readiness guard.
    if !snapshot.folders_resolved {
        return (Vec::new(), ContextState::Loading);
    }
    let FolderForestState::Ready(forest) = &snapshot.forest else {
        return (Vec::new(), ContextState::Loading);
    };

    let placements = forest.placements_for_doc(d0_doc_id);
    let journal_date = snapshot
        .docs
        .get(d0_doc_id)
        .filter(|m| !m.revoked_or_deleted)
        .and_then(|m| m.journal_date.as_deref());

    match placements.len() {
        0 => {
            if journal_date.is_some() {
                (
                    vec![BreadcrumbCrumb {
                        id: "root:journals".into(),
                        label: "Journals".into(),
                        action: BreadcrumbAction::OpenTarget {
                            target: NavTarget::Journals,
                        },
                        is_current: false,
                        is_switcher: false,
                        in_trash: false,
                    }],
                    ContextState::JournalsRoot,
                )
            } else {
                (Vec::new(), ContextState::Unfiled)
            }
        }
        1 => {
            // D5b: 1 valid folder (even if also a journal) flattens the folder directly in the bar.
            (
                folder_crumbs_from_placement(&placements[0]),
                ContextState::SinglePath,
            )
        }
        _ => {
            // M >= 2 and no pick: NEVER default-promote first folder; render switcher crumb.
            let options = collect_doc_locations(d0_doc_id, snapshot, None);
            let total_count = options.len();
            let switcher = BreadcrumbCrumb {
                id: format!("switcher:{}", d0.seq),
                label: format!("In {total_count} locations"),
                action: BreadcrumbAction::OpenLocationSheet { owner_seq: d0.seq },
                is_current: false,
                is_switcher: true,
                in_trash: false,
            };
            (
                vec![switcher],
                ContextState::MultiLocation {
                    count: total_count,
                    owner_doc_id: d0_doc_id.to_string(),
                    owner_doc_title: d0_title.to_string(),
                    owner_seq: d0.seq,
                    options,
                },
            )
        }
    }
}

fn derive_non_doc_target(
    cur: &NavEntry,
    snapshot: &WorkspaceBreadcrumbSnapshot,
) -> BreadcrumbDerivation {
    let mut crumbs = Vec::new();
    let context = match &cur.target {
        NavTarget::Folder(folder_id) => {
            if let FolderForestState::Ready(forest) = &snapshot.forest
                && let Some(chain) = forest.folder_chain(folder_id)
            {
                for (idx, seg) in chain.iter().enumerate() {
                    let is_current = idx + 1 == chain.len();
                    crumbs.push(BreadcrumbCrumb {
                        id: format!("folder:{}", seg.folder_id),
                        label: seg.name.clone(),
                        action: if is_current {
                            BreadcrumbAction::None
                        } else {
                            BreadcrumbAction::OpenFolder {
                                folder_id: seg.folder_id.clone(),
                            }
                        },
                        is_current,
                        is_switcher: false,
                        in_trash: false,
                    });
                }
            }
            ContextState::SinglePath
        }
        NavTarget::Trash => ContextState::TrashRoot,
        NavTarget::Journals => ContextState::JournalsRoot,
        _ => ContextState::Unfiled,
    };

    BreadcrumbDerivation {
        crumbs,
        context,
        in_trash: matches!(cur.target, NavTarget::Trash),
        should_hide_bar_on_mobile: true,
        trail: Vec::new(),
        can_return_to_trail: false,
        recoverable_trail: Vec::new(),
        current_doc_locations: Vec::new(),
        chain_head_seq: Some(cur.seq),
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use affine_store::workspace_db::FolderRow;

    use crate::organize::FolderForest;

    use super::*;
    use crate::nav::{DirectKind, NAV_HISTORY_CAPACITY, Scope};

    fn scope() -> Scope {
        Scope::new("u1", "https://app.affine.pro", "ws-1")
    }

    fn sample_snapshot(folders_resolved: bool) -> WorkspaceBreadcrumbSnapshot {
        let rows = vec![
            FolderRow {
                id: "f-eng".into(),
                parent_id: None,
                data: "Engineering".into(),
                folder_type: "folder".into(),
                index: "a0".into(),
            },
            FolderRow {
                id: "f-prod".into(),
                parent_id: None,
                data: "Product".into(),
                folder_type: "folder".into(),
                index: "a1".into(),
            },
            FolderRow {
                id: "l-a-eng".into(),
                parent_id: Some("f-eng".into()),
                data: "doc-a".into(),
                folder_type: "doc".into(),
                index: "a0".into(),
            },
            FolderRow {
                id: "l-m-eng".into(),
                parent_id: Some("f-eng".into()),
                data: "doc-multi".into(),
                folder_type: "doc".into(),
                index: "a1".into(),
            },
            FolderRow {
                id: "l-m-prod".into(),
                parent_id: Some("f-prod".into()),
                data: "doc-multi".into(),
                folder_type: "doc".into(),
                index: "a0".into(),
            },
        ];
        let forest = if folders_resolved {
            FolderForestState::Ready(std::sync::Arc::new(FolderForest::from_rows(&rows, 1)))
        } else {
            FolderForestState::Unresolved
        };
        let docs = BTreeMap::from([
            (
                "doc-a".into(),
                DocMetaSnapshot {
                    title: "Doc A".into(),
                    trashed: false,
                    journal_date: Some("2026-11-25".into()),
                    revoked_or_deleted: false,
                },
            ),
            (
                "doc-b".into(),
                DocMetaSnapshot {
                    title: "Doc B".into(),
                    trashed: false,
                    journal_date: None,
                    revoked_or_deleted: false,
                },
            ),
            (
                "doc-c".into(),
                DocMetaSnapshot {
                    title: "Doc C".into(),
                    trashed: false,
                    journal_date: None,
                    revoked_or_deleted: false,
                },
            ),
            (
                "doc-multi".into(),
                DocMetaSnapshot {
                    title: "Shared Spec".into(),
                    trashed: false,
                    journal_date: None,
                    revoked_or_deleted: false,
                },
            ),
            (
                "doc-trash".into(),
                DocMetaSnapshot {
                    title: "Archived Draft".into(),
                    trashed: true,
                    journal_date: None,
                    revoked_or_deleted: false,
                },
            ),
        ]);
        WorkspaceBreadcrumbSnapshot {
            folders_resolved,
            forest,
            docs,
            collections: BTreeMap::new(),
            tags: BTreeMap::new(),
        }
    }

    #[test]
    fn law1_causal_walk_and_loop_erasure_preserve_chronological_back() {
        let snap = sample_snapshot(true);
        let mut hist = NavHistory::new();
        let s = scope();

        // F -> A1 -> B -> C -> A2
        let a1 = hist.push(
            s.clone(),
            NavTarget::Doc("doc-a".into()),
            Origin::Placement {
                link_id: "l-a-eng".into(),
            },
            None,
        );
        let b1 = hist.push(
            s.clone(),
            NavTarget::Doc("doc-b".into()),
            Origin::DocLink {
                parent_seq: a1,
                block_id: None,
            },
            None,
        );
        let c1 = hist.push(
            s.clone(),
            NavTarget::Doc("doc-c".into()),
            Origin::DocLink {
                parent_seq: b1,
                block_id: None,
            },
            None,
        );
        hist.push(
            s.clone(),
            NavTarget::Doc("doc-a".into()),
            Origin::DocLink {
                parent_seq: c1,
                block_id: None,
            },
            None,
        );

        let d = derive(&hist, &snap);
        let labels: Vec<&str> = d.crumbs.iter().map(|c| c.label.as_str()).collect();
        assert_eq!(labels, vec!["Engineering", "Doc A"]);

        // Chronological Back from A2 still returns to C!
        let prev = hist.back().unwrap();
        assert_eq!(prev.target, NavTarget::Doc("doc-c".into()));

        // Also verify F -> A -> B1 -> C -> B2 => F › A › B.
        hist.push(
            s,
            NavTarget::Doc("doc-b".into()),
            Origin::DocLink {
                parent_seq: c1,
                block_id: None,
            },
            None,
        );
        let d2 = derive(&hist, &snap);
        let labels2: Vec<&str> = d2.crumbs.iter().map(|c| c.label.as_str()).collect();
        assert_eq!(labels2, vec!["Engineering", "Doc A", "Doc B"]);
    }

    #[test]
    fn law2_loading_unfiled_d5b_and_honest_multi_location_owner_pick() {
        let mut hist = NavHistory::new();
        let s = scope();

        // Unresolved table => Loading (never Unfiled).
        hist.push(
            s.clone(),
            NavTarget::Doc("doc-multi".into()),
            Origin::Direct(DirectKind::Home),
            None,
        );
        assert_eq!(
            derive(&hist, &sample_snapshot(false)).context,
            ContextState::Loading
        );

        // Ready table, M = 2, no pick => MultiLocation (never default-promotes first).
        let snap = sample_snapshot(true);
        let m_seq = hist.current().unwrap().seq;
        let d_multi = derive(&hist, &snap);
        assert!(matches!(
            d_multi.context,
            ContextState::MultiLocation { count: 2, owner_seq, .. } if owner_seq == m_seq
        ));

        // Direct(doc-multi) -> DocLink(doc-b): owner_doc is still doc-multi and Pick writes back to m_seq.
        hist.push(
            s.clone(),
            NavTarget::Doc("doc-b".into()),
            Origin::DocLink {
                parent_seq: m_seq,
                block_id: None,
            },
            None,
        );
        let d_child = derive(&hist, &snap);
        assert!(matches!(
            &d_child.context,
            ContextState::MultiLocation { owner_doc_id, owner_seq, .. }
                if owner_doc_id == "doc-multi" && *owner_seq == m_seq
        ));
        assert!(hist.pick_location(
            m_seq,
            Some(LocationChoice::Location(LocationRef::FolderLink(
                "l-m-prod".into()
            )))
        ));
        let d_picked = derive(&hist, &snap);
        let labels: Vec<&str> = d_picked.crumbs.iter().map(|c| c.label.as_str()).collect();
        assert_eq!(labels, vec!["Product", "Shared Spec", "Doc B"]);

        // D5b: doc-a has 1 folder + journal -> flattens folder directly, sheet lists 2 locations.
        hist.push(
            s.clone(),
            NavTarget::Doc("doc-a".into()),
            Origin::Direct(DirectKind::Home),
            None,
        );
        let d_a = derive(&hist, &snap);
        assert_eq!(d_a.context, ContextState::SinglePath);
        assert_eq!(d_a.current_doc_locations.len(), 2);

        // Unfiled direct doc hides bar on mobile.
        hist.push(
            s,
            NavTarget::Doc("doc-b".into()),
            Origin::Direct(DirectKind::Home),
            None,
        );
        let d_unfiled = derive(&hist, &snap);
        assert_eq!(d_unfiled.context, ContextState::Unfiled);
        assert!(d_unfiled.should_hide_bar_on_mobile);
    }

    #[test]
    fn law3_click_ancestor_always_pushes_and_law4_trash_consistency() {
        let snap = sample_snapshot(true);
        let mut hist = NavHistory::new();
        let s = scope();

        let a_seq = hist.push(
            s.clone(),
            NavTarget::Doc("doc-a".into()),
            Origin::Direct(DirectKind::Home),
            None,
        );
        hist.push(
            s.clone(),
            NavTarget::Doc("doc-trash".into()),
            Origin::DocLink {
                parent_seq: a_seq,
                block_id: None,
            },
            None,
        );

        // Law 4: A -> trashed B keeps A › B with in_trash = true.
        let d_trail_trash = derive(&hist, &snap);
        assert!(d_trail_trash.in_trash);
        let labels: Vec<&str> = d_trail_trash
            .crumbs
            .iter()
            .map(|c| c.label.as_str())
            .collect();
        assert_eq!(labels, vec!["Engineering", "Doc A", "Archived Draft"]);

        // Law 3: clicking immediate parent (Doc A, k = 1) MUST push; one Back returns to doc-trash.
        let doc_a_action = d_trail_trash.crumbs[1].action.clone();
        let len_before = hist.len();
        hist.click_breadcrumb_ancestor(&doc_a_action, s.clone())
            .unwrap();
        assert_eq!(hist.len(), len_before + 1);
        let truncated = derive(&hist, &snap);
        let truncated_labels: Vec<&str> =
            truncated.crumbs.iter().map(|c| c.label.as_str()).collect();
        assert_eq!(truncated_labels, vec!["Engineering", "Doc A"]);
        assert_eq!(
            hist.back().unwrap().target,
            NavTarget::Doc("doc-trash".into())
        );

        // Direct to trashed doc shows Trash › Archived Draft.
        hist.push(
            s,
            NavTarget::Doc("doc-trash".into()),
            Origin::Direct(DirectKind::Home),
            None,
        );
        let d_direct_trash = derive(&hist, &snap);
        assert_eq!(d_direct_trash.context, ContextState::TrashRoot);
        assert_eq!(d_direct_trash.crumbs[0].label, "Trash");
    }

    #[test]
    fn history_caps_at_128_and_web_state_degrades_safely() {
        let mut hist = NavHistory::new();
        let s = scope();
        for i in 0..150 {
            hist.push(
                s.clone(),
                NavTarget::Doc(format!("d-{i}")),
                Origin::Direct(DirectKind::AllDocs),
                None,
            );
        }
        assert_eq!(hist.len(), NAV_HISTORY_CAPACITY);

        let corrupt = NavHistory::decode_web_state_json(
            "{not-valid-json",
            s.clone(),
            NavTarget::Doc("fallback".into()),
            &HashSet::new(),
        );
        assert_eq!(corrupt.origin, Origin::Direct(DirectKind::External));

        hist.push(
            s.clone(),
            NavTarget::Doc("doc-a".into()),
            Origin::Placement {
                link_id: "stale-link".into(),
            },
            None,
        );
        let encoded = hist.encode_current_web_state_json().unwrap();
        let downgraded = NavHistory::decode_web_state_json(
            &encoded,
            s,
            NavTarget::Doc("doc-a".into()),
            &HashSet::new(),
        );
        assert_eq!(downgraded.origin, Origin::Direct(DirectKind::External));
    }
}
