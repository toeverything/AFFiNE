//! Explorer route accessibility tree builder covering root and all drill-down sub-views.

use std::collections::BTreeMap;

use affine_client::{
    AccessibilityBounds, AccessibilityNode, AccessibilityRole, AccessibilityState,
    FolderForestState, NavTarget,
};

use crate::state::MobileAppState;

use super::SafeAreaMetrics;

/// Publish visible Explorer controls (drill-down back button and list rows) into `main_children`.
pub(super) fn insert_explorer_a11y_nodes(
    state: &mut MobileAppState,
    viewport_width: f32,
    viewport_height: f32,
    safe: SafeAreaMetrics,
    is_rtl: bool,
    nodes: &mut BTreeMap<String, AccessibilityNode>,
    main_children: &mut Vec<String>,
) {
    let content_left = safe.left;
    let content_w = (viewport_width - safe.left - safe.right).max(44.0);
    let safe_top = safe.top;
    let effective_h = (viewport_height - safe.top - safe.bottom).max(160.0);
    let avail_h = (effective_h - 56.0 - 64.0).max(44.0);
    let locale = state.locale();
    let strings = locale.strings();
    let ws_id = state.active_workspace_id().to_string();
    let scroll_y = state.explorer_scroll_y.max(0.0);

    if let Some(back_name) = explorer_back_label(state) {
        let back_id = "mobile.explorer.back_btn".to_string();
        let back_w = 88.0_f32;
        nodes.insert(
            back_id.clone(),
            AccessibilityNode {
                id: back_id.clone(),
                role: AccessibilityRole::Button,
                name: back_name,
                value: None,
                state: AccessibilityState::default(),
                focused: false,
                bounds: AccessibilityBounds {
                    x: if is_rtl {
                        content_left + (content_w - 8.0 - back_w).max(0.0)
                    } else {
                        content_left + 8.0
                    },
                    y: safe_top + 6.0,
                    width: back_w,
                    height: 44.0,
                },
                children: Vec::new(),
            },
        );
        main_children.push(back_id);
    }

    let cur_target = state
        .active_workspace()
        .history
        .current()
        .map(|e| e.target.clone())
        .unwrap_or(NavTarget::AllDocs);

    if matches!(cur_target, NavTarget::AllDocs | NavTarget::Folder(_)) {
        let new_doc_id = "mobile.explorer.new_doc_btn".to_string();
        nodes.insert(
            new_doc_id.clone(),
            AccessibilityNode {
                id: new_doc_id.clone(),
                role: AccessibilityRole::Button,
                name: strings.new_doc_label.to_string(),
                value: None,
                state: AccessibilityState::default(),
                focused: false,
                bounds: AccessibilityBounds {
                    x: if is_rtl {
                        content_left + 12.0
                    } else {
                        content_left + (content_w - 56.0).max(0.0)
                    },
                    y: safe_top + 6.0,
                    width: 44.0,
                    height: 44.0,
                },
                children: Vec::new(),
            },
        );
        main_children.push(new_doc_id);
    }

    let mut rows: Vec<(String, String, f32, f32)> = Vec::new();
    match cur_target {
        NavTarget::Folder(folder_id) => {
            if let FolderForestState::Ready(forest) = state.forest_state() {
                let subs: Vec<(String, String)> = forest
                    .child_folders(Some(&folder_id))
                    .into_iter()
                    .map(|f| (format!("mobile.explorer.folder.{}", f.id), f.data.clone()))
                    .collect();
                let doc_ids: Vec<String> = forest
                    .doc_links_in_folder(&folder_id)
                    .into_iter()
                    .map(|p| p.doc_id.clone())
                    .collect();
                let mut idx = 0usize;
                for (id, name) in subs {
                    rows.push((id, name, 17.0 + (idx as f32) * 46.0, 46.0));
                    idx += 1;
                }
                for doc_id in doc_ids {
                    if let Some(doc) = state.doc_by_id(&doc_id)
                        && !doc.trashed
                    {
                        rows.push((
                            format!(
                                "mobile.explorer.doc.{}",
                                crate::encode_scoped_doc_target(&ws_id, &doc.id)
                            ),
                            doc.display_title(locale),
                            17.0 + (idx as f32) * 46.0,
                            46.0,
                        ));
                        idx += 1;
                    }
                }
            }
        }
        NavTarget::Collection(col_id) if col_id.is_empty() => {
            for (idx, col) in state.active_workspace().collections.iter().enumerate() {
                rows.push((
                    format!("mobile.explorer.collection.{}", col.id),
                    col.name.clone(),
                    17.0 + (idx as f32) * 46.0,
                    46.0,
                ));
            }
        }
        NavTarget::Collection(col_id) => {
            if let Some(col) = state
                .active_workspace()
                .collections
                .iter()
                .find(|c| c.id == col_id)
            {
                let member_ids = col.doc_ids.clone();
                let mut idx = 0usize;
                for doc in &state.active_workspace().docs {
                    if !doc.trashed && member_ids.iter().any(|id| id == &doc.id) {
                        rows.push((
                            format!(
                                "mobile.explorer.doc.{}",
                                crate::encode_scoped_doc_target(&ws_id, &doc.id)
                            ),
                            doc.display_title(locale),
                            17.0 + (idx as f32) * 46.0,
                            46.0,
                        ));
                        idx += 1;
                    }
                }
            }
        }
        NavTarget::Tag(tag_id) if tag_id.is_empty() => {
            for (idx, (tag_id, tag_name)) in state.active_workspace().tags.iter().enumerate() {
                rows.push((
                    format!("mobile.explorer.tag.{tag_id}"),
                    format!("#{tag_name}"),
                    17.0 + (idx as f32) * 46.0,
                    46.0,
                ));
            }
        }
        NavTarget::Tag(tag_id) => {
            let mut idx = 0usize;
            for doc in &state.active_workspace().docs {
                if !doc.trashed && doc.tags.iter().any(|t| t == &tag_id) {
                    rows.push((
                        format!(
                            "mobile.explorer.doc.{}",
                            crate::encode_scoped_doc_target(&ws_id, &doc.id)
                        ),
                        doc.display_title(locale),
                        17.0 + (idx as f32) * 46.0,
                        46.0,
                    ));
                    idx += 1;
                }
            }
        }
        NavTarget::Trash => {
            let mut idx = 0usize;
            for doc in &state.active_workspace().docs {
                if doc.trashed {
                    rows.push((
                        format!(
                            "mobile.explorer.doc.{}",
                            crate::encode_scoped_doc_target(&ws_id, &doc.id)
                        ),
                        doc.display_title(locale),
                        17.0 + (idx as f32) * 46.0,
                        46.0,
                    ));
                    idx += 1;
                }
            }
        }
        _ => {
            let compact = effective_h < 460.0;
            let tight_portrait = !compact && effective_h < 620.0;
            let row_h = if compact || tight_portrait {
                44.0
            } else {
                46.0
            };
            let pad = if compact || tight_portrait {
                10.0
            } else {
                16.0
            };
            let gap = if tight_portrait { 8.0 } else { 12.0 };
            let heading_h = 16.0;
            let folder_top = if compact {
                pad + 1.0
            } else {
                pad + heading_h + gap + 1.0
            };
            let mut folder_count = 0usize;
            if let FolderForestState::Ready(forest) = state.forest_state() {
                for (idx, (folder, _)) in forest.dfs_folders().into_iter().enumerate() {
                    rows.push((
                        format!("mobile.explorer.folder.{}", folder.id),
                        folder.data.clone(),
                        folder_top + (idx as f32) * row_h,
                        row_h,
                    ));
                    folder_count += 1;
                }
            }
            let folder_h = (folder_count as f32) * row_h + 2.0;
            let org_top = if compact {
                pad + 1.0
            } else {
                pad + heading_h + gap + folder_h + gap + 1.0
            };
            let org_h = if tight_portrait {
                44.0 + 2.0
            } else {
                3.0 * row_h + 2.0
            };
            rows.push((
                "mobile.explorer.collections".to_string(),
                strings.collections.to_string(),
                org_top,
                row_h,
            ));
            rows.push((
                "mobile.explorer.tags".to_string(),
                strings.tags.to_string(),
                if tight_portrait {
                    org_top
                } else {
                    org_top + row_h
                },
                row_h,
            ));
            rows.push((
                "mobile.explorer.trash".to_string(),
                strings.trash.to_string(),
                if tight_portrait {
                    org_top
                } else {
                    org_top + row_h * 2.0
                },
                row_h,
            ));
            let docs_top = if compact {
                pad + 1.0
            } else {
                pad + heading_h + gap + folder_h + gap + org_h + gap + heading_h + gap + 1.0
            };
            let mut doc_idx = 0usize;
            for doc in &state.active_workspace().docs {
                if !doc.trashed {
                    rows.push((
                        format!(
                            "mobile.explorer.doc.{}",
                            crate::encode_scoped_doc_target(&ws_id, &doc.id)
                        ),
                        doc.display_title(locale),
                        docs_top + (doc_idx as f32) * row_h,
                        row_h,
                    ));
                    doc_idx += 1;
                }
            }
        }
    }

    let (_, max_scroll) = explorer_scroll_metrics(state, viewport_height, safe);
    let clamped_scroll = scroll_y.clamp(0.0, max_scroll);
    let row_x = content_left + 16.0;
    let row_w = (content_w - 32.0).max(44.0);
    let mut viewport_children = Vec::new();
    for (id, name, top_in_content, h) in rows {
        let vis_top = top_in_content - clamped_scroll;
        if vis_top < -1.0 || vis_top + h > avail_h + 1.0 {
            continue;
        }
        nodes.insert(
            id.clone(),
            AccessibilityNode {
                id: id.clone(),
                role: AccessibilityRole::Button,
                name,
                value: None,
                state: AccessibilityState::default(),
                focused: false,
                bounds: AccessibilityBounds {
                    x: row_x,
                    y: safe_top + 56.0 + vis_top,
                    width: row_w,
                    height: h,
                },
                children: Vec::new(),
            },
        );
        viewport_children.push(id);
    }

    let viewport_id = "mobile.explorer.scroll_viewport".to_string();
    nodes.insert(
        viewport_id.clone(),
        AccessibilityNode {
            id: viewport_id.clone(),
            role: AccessibilityRole::Region,
            name: strings.tab_explorer.to_string(),
            value: (max_scroll > 0.5).then(|| format!("{clamped_scroll:.0}/{max_scroll:.0}")),
            state: AccessibilityState::default(),
            focused: false,
            bounds: AccessibilityBounds {
                x: content_left,
                y: safe_top + 56.0,
                width: content_w,
                height: avail_h,
            },
            children: viewport_children,
        },
    );
    main_children.push(viewport_id);
}

/// Compute `(avail_h, max_scroll)` for the active Explorer sub-view matching visual layout.
pub(super) fn explorer_scroll_metrics(
    state: &mut MobileAppState,
    viewport_height: f32,
    safe: SafeAreaMetrics,
) -> (f32, f32) {
    let effective_h = (viewport_height - safe.top - safe.bottom).max(160.0);
    let avail_h = (effective_h - 56.0 - 64.0).max(44.0);
    let cur_target = state
        .active_workspace()
        .history
        .current()
        .map(|e| e.target.clone())
        .unwrap_or(NavTarget::AllDocs);

    let content_h = match cur_target {
        NavTarget::Folder(folder_id) => {
            let total_rows = match state.forest_state() {
                FolderForestState::Ready(forest) => {
                    let subs = forest.child_folders(Some(&folder_id)).len();
                    let docs = forest
                        .doc_links_in_folder(&folder_id)
                        .into_iter()
                        .filter(|p| state.doc_by_id(&p.doc_id).is_some_and(|d| !d.trashed))
                        .count();
                    subs + docs
                }
                FolderForestState::Unresolved => 0,
            };
            32.0 + (total_rows as f32) * 46.0 + 2.0
        }
        NavTarget::Collection(col_id) if col_id.is_empty() => {
            32.0 + (state.active_workspace().collections.len() as f32) * 46.0 + 2.0
        }
        NavTarget::Collection(col_id) => {
            let count = state
                .active_workspace()
                .collections
                .iter()
                .find(|c| c.id == col_id)
                .map(|c| {
                    state
                        .active_workspace()
                        .docs
                        .iter()
                        .filter(|d| !d.trashed && c.doc_ids.iter().any(|id| id == &d.id))
                        .count()
                })
                .unwrap_or(0);
            32.0 + (count as f32) * 46.0 + 2.0
        }
        NavTarget::Tag(tag_id) if tag_id.is_empty() => {
            32.0 + (state.active_workspace().tags.len() as f32) * 46.0 + 2.0
        }
        NavTarget::Tag(tag_id) => {
            let count = state
                .active_workspace()
                .docs
                .iter()
                .filter(|d| !d.trashed && d.tags.iter().any(|t| t == &tag_id))
                .count();
            32.0 + (count as f32) * 46.0 + 2.0
        }
        NavTarget::Trash => {
            let count = state
                .active_workspace()
                .docs
                .iter()
                .filter(|d| d.trashed)
                .count();
            32.0 + (count as f32) * 46.0 + 2.0
        }
        _ => {
            let compact = effective_h < 460.0;
            let tight_portrait = !compact && effective_h < 620.0;
            let row_h = if compact || tight_portrait {
                44.0
            } else {
                46.0
            };
            let pad = if compact || tight_portrait {
                10.0
            } else {
                16.0
            };
            let gap = if tight_portrait { 8.0 } else { 12.0 };
            let heading_h = 16.0;
            let folder_count = match state.forest_state() {
                FolderForestState::Ready(forest) => forest.dfs_folders().len(),
                FolderForestState::Unresolved => 0,
            };
            let active_docs = state
                .active_workspace()
                .docs
                .iter()
                .filter(|d| !d.trashed)
                .count();
            let folder_h = (folder_count as f32) * row_h + 2.0;
            let org_h = if tight_portrait {
                44.0 + 2.0
            } else {
                3.0 * row_h + 2.0
            };
            let docs_h = if active_docs == 0 {
                0.0
            } else {
                (active_docs as f32) * row_h + 2.0
            };
            if compact {
                pad * 2.0 + folder_h.max(org_h).max(docs_h)
            } else if active_docs == 0 {
                pad * 2.0 + heading_h + gap + folder_h + gap + org_h
            } else {
                pad * 2.0
                    + heading_h
                    + gap
                    + folder_h
                    + gap
                    + org_h
                    + gap
                    + heading_h
                    + gap
                    + docs_h
            }
        }
    };
    (avail_h, (content_h - avail_h).max(0.0))
}

fn explorer_back_label(state: &mut MobileAppState) -> Option<String> {
    let strings = state.locale().strings();
    let target = state
        .active_workspace()
        .history
        .current()
        .map(|e| e.target.clone())?;
    match target {
        NavTarget::Folder(folder_id) => {
            if let FolderForestState::Ready(forest) = state.forest_state()
                && let Some(chain) = forest.folder_chain(&folder_id)
                && chain.len() >= 2
            {
                return Some(chain[chain.len() - 2].name.clone());
            }
            Some(strings.tab_explorer.to_string())
        }
        NavTarget::Collection(id) if !id.is_empty() => Some(strings.collections.to_string()),
        NavTarget::Tag(id) if !id.is_empty() => Some(strings.tags.to_string()),
        NavTarget::Collection(_) | NavTarget::Tag(_) | NavTarget::Trash => {
            Some(strings.tab_explorer.to_string())
        }
        _ => None,
    }
}
