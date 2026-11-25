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
    safe: SafeAreaMetrics,
    is_rtl: bool,
    nodes: &mut BTreeMap<String, AccessibilityNode>,
    main_children: &mut Vec<String>,
) {
    let content_left = safe.left;
    let content_w = (viewport_width - safe.left - safe.right).max(44.0);
    let safe_top = safe.top;
    let strings = state.locale().strings();

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
        .history
        .current()
        .map(|e| e.target.clone())
        .unwrap_or(NavTarget::AllDocs);

    let mut rows: Vec<(String, String)> = Vec::new();
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
                rows.extend(subs);
                for doc_id in doc_ids {
                    if let Some(doc) = state.doc_by_id(&doc_id)
                        && !doc.trashed
                    {
                        rows.push((format!("mobile.explorer.doc.{}", doc.id), doc.title.clone()));
                    }
                }
            }
        }
        NavTarget::Collection(col_id) if col_id.is_empty() => {
            for col in &state.collections {
                rows.push((
                    format!("mobile.explorer.collection.{}", col.id),
                    col.name.clone(),
                ));
            }
        }
        NavTarget::Collection(col_id) => {
            if let Some(col) = state.collections.iter().find(|c| c.id == col_id) {
                let member_ids = col.doc_ids.clone();
                for doc in &state.docs {
                    if !doc.trashed && member_ids.iter().any(|id| id == &doc.id) {
                        rows.push((format!("mobile.explorer.doc.{}", doc.id), doc.title.clone()));
                    }
                }
            }
        }
        NavTarget::Tag(tag_id) if tag_id.is_empty() => {
            for (tag_id, tag_name) in &state.tags {
                rows.push((
                    format!("mobile.explorer.tag.{tag_id}"),
                    format!("#{tag_name}"),
                ));
            }
        }
        NavTarget::Tag(tag_id) => {
            for doc in &state.docs {
                if !doc.trashed && doc.tags.iter().any(|t| t == &tag_id) {
                    rows.push((format!("mobile.explorer.doc.{}", doc.id), doc.title.clone()));
                }
            }
        }
        NavTarget::Trash => {
            for doc in &state.docs {
                if doc.trashed {
                    rows.push((format!("mobile.explorer.doc.{}", doc.id), doc.title.clone()));
                }
            }
        }
        _ => {
            if let FolderForestState::Ready(forest) = state.forest_state() {
                for (folder, _) in forest.dfs_folders() {
                    rows.push((
                        format!("mobile.explorer.folder.{}", folder.id),
                        folder.data.clone(),
                    ));
                }
            }
            rows.push((
                "mobile.explorer.collections".to_string(),
                strings.collections.to_string(),
            ));
            rows.push(("mobile.explorer.tags".to_string(), strings.tags.to_string()));
            rows.push((
                "mobile.explorer.trash".to_string(),
                strings.trash.to_string(),
            ));
        }
    }

    let row_x = content_left + 16.0;
    let row_w = (content_w - 32.0).max(44.0);
    let mut y = safe_top + 72.0;
    for (id, name) in rows {
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
                    y,
                    width: row_w,
                    height: 46.0,
                },
                children: Vec::new(),
            },
        );
        main_children.push(id);
        y += 46.0;
    }
}

fn explorer_back_label(state: &mut MobileAppState) -> Option<String> {
    let strings = state.locale().strings();
    let target = state.history.current().map(|e| e.target.clone())?;
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
