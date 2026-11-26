//! `PlatformAccessibility` bridge sink, semantic action dispatcher, and structural validator.

use std::{
    cell::RefCell,
    collections::{HashMap, HashSet},
    rc::Rc,
    sync::{Arc, Mutex},
};

use affine_client::{
    AccessibilityBounds, AccessibilityTree, BreadcrumbAction, ContextState, DirectKind,
    FolderForestState, LocationChoice, NavTarget, Origin, PlatformAccessibility,
};
use ui::{IntoElement, Styled, canvas};

use crate::state::{
    MobileAppState, MobileBackCoordinator, MobileRoute, MobileSheet, MobileTab, SettingsGroupId,
};

/// Shared per-frame map from accessibility node ID to real post-layout painted bounds.
pub type A11yBoundsMap = Rc<RefCell<HashMap<String, AccessibilityBounds>>>;

/// Zero-paint prepaint probe that records its parent container's real bounds for `id`.
pub fn a11y_bounds_probe(id: impl Into<String>, map: A11yBoundsMap) -> impl IntoElement {
    a11y_bounds_probe_border(id, map, 0.0)
}

/// Zero-paint prepaint probe expanding recorded bounds by `border` pixels on each edge.
pub fn a11y_bounds_probe_border(
    id: impl Into<String>,
    map: A11yBoundsMap,
    border: f32,
) -> impl IntoElement {
    let id = id.into();
    canvas(
        move |bounds, _, _| {
            let x: f32 = bounds.origin.x.into();
            let y: f32 = bounds.origin.y.into();
            let w: f32 = bounds.size.width.into();
            let h: f32 = bounds.size.height.into();
            map.borrow_mut().insert(
                id.clone(),
                AccessibilityBounds {
                    x: x - border,
                    y: y - border,
                    width: w + border * 2.0,
                    height: h + border * 2.0,
                },
            );
        },
        |_, _, _, _| {},
    )
    .absolute()
    .inset_0()
}

/// Semantic action invoked by a screen reader or platform accessibility bridge.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MobileA11yAction {
    Activate,
    Dismiss,
    ScrollForward,
    ScrollBackward,
}

/// Thread-safe in-memory [`PlatformAccessibility`] sink for hosts and integration tests.
#[derive(Clone, Debug, Default)]
pub struct InMemoryPlatformAccessibility {
    latest: Arc<Mutex<Option<AccessibilityTree>>>,
    publish_count: Arc<Mutex<usize>>,
    announcements: Arc<Mutex<Vec<(String, bool)>>>,
}

impl InMemoryPlatformAccessibility {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn latest_tree(&self) -> Option<AccessibilityTree> {
        self.latest.lock().ok().and_then(|g| g.clone())
    }

    pub fn publish_count(&self) -> usize {
        self.publish_count.lock().map(|g| *g).unwrap_or(0)
    }

    pub fn announcements(&self) -> Vec<(String, bool)> {
        self.announcements
            .lock()
            .map(|g| g.clone())
            .unwrap_or_default()
    }
}

impl PlatformAccessibility for InMemoryPlatformAccessibility {
    fn publish_tree(&mut self, tree: &AccessibilityTree) {
        if let Ok(mut slot) = self.latest.lock() {
            *slot = Some(tree.clone());
        }
        if let Ok(mut count) = self.publish_count.lock() {
            *count += 1;
        }
    }

    fn announce(&mut self, message: &str, polite: bool) {
        if let Ok(mut log) = self.announcements.lock() {
            log.push((message.to_string(), polite));
        }
    }
}

/// Overwrite semantic bounds in `tree` with real post-layout painted rectangles.
pub fn apply_measured_bounds(
    tree: &mut AccessibilityTree,
    measured: &HashMap<String, AccessibilityBounds>,
) {
    for (id, node) in &mut tree.nodes {
        if let Some(bounds) = measured.get(id) {
            node.bounds = *bounds;
        }
    }
}

/// Derive the navigation [`Origin`] for opening `doc_id` from the current Explorer context.
///
/// Shared by both visual Explorer row clicks and semantic `perform_a11y_action` activations so
/// folder placements, collections, tags, and All Docs / Trash produce identical breadcrumbs.
pub fn derive_explorer_doc_origin(state: &mut MobileAppState, doc_id: &str) -> Origin {
    let target = state
        .history
        .current()
        .map(|e| e.target.clone())
        .unwrap_or(NavTarget::AllDocs);
    match target {
        NavTarget::Folder(folder_id) => {
            if let FolderForestState::Ready(forest) = state.forest_state()
                && let Some(placement) = forest
                    .doc_links_in_folder(&folder_id)
                    .into_iter()
                    .find(|p| p.doc_id == doc_id)
            {
                return Origin::Placement {
                    link_id: placement.link_id.clone(),
                };
            }
            Origin::Direct(DirectKind::AllDocs)
        }
        NavTarget::Collection(col_id) if !col_id.is_empty() => Origin::Collection(col_id),
        NavTarget::Tag(tag_id) if !tag_id.is_empty() => Origin::Tag(tag_id),
        _ => Origin::Direct(DirectKind::AllDocs),
    }
}

/// Dispatch a semantic accessibility action against `node_id` on `state` using the default
/// `390x844` mobile viewport and zero safe-area insets.
///
/// While any modal sheet is open (`state.active_sheet != MobileSheet::None`), background nodes
/// outside the active sheet are rejected so screen-reader actions cannot leak behind a modal.
pub fn perform_a11y_action(
    state: &mut MobileAppState,
    node_id: &str,
    action: MobileA11yAction,
    now_ms: f64,
) -> bool {
    perform_a11y_action_with_viewport(
        state,
        node_id,
        action,
        now_ms,
        390.0,
        844.0,
        super::SafeAreaMetrics::default(),
    )
}

/// Dispatch a semantic accessibility action against `node_id` on `state` using the given
/// viewport dimensions and four-edge safe-area insets.
pub fn perform_a11y_action_with_viewport(
    state: &mut MobileAppState,
    node_id: &str,
    action: MobileA11yAction,
    now_ms: f64,
    viewport_width: f32,
    viewport_height: f32,
    safe_area: super::SafeAreaMetrics,
) -> bool {
    perform_a11y_action_with_layout(
        state,
        node_id,
        action,
        now_ms,
        viewport_width,
        viewport_height,
        safe_area,
        None,
    )
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn perform_a11y_action_with_layout(
    state: &mut MobileAppState,
    node_id: &str,
    action: MobileA11yAction,
    now_ms: f64,
    viewport_width: f32,
    viewport_height: f32,
    safe_area: super::SafeAreaMetrics,
    measured_breadcrumb: Option<&ui_kit::BreadcrumbBarLayout>,
) -> bool {
    if action == MobileA11yAction::Dismiss {
        if state.active_sheet != MobileSheet::None {
            state.close_sheet(now_ms);
            return true;
        }
        return false;
    }

    if matches!(
        action,
        MobileA11yAction::ScrollForward | MobileA11yAction::ScrollBackward
    ) {
        if state.active_sheet != MobileSheet::None || state.route != MobileRoute::Explorer {
            return false;
        }
        let valid_scroll_target = node_id == "mobile.explorer.scroll_viewport"
            || node_id == "app.main"
            || node_id.starts_with("mobile.explorer.");
        if !valid_scroll_target
            || !super::build_accessibility_tree_with_layout(
                state,
                viewport_width,
                viewport_height,
                safe_area,
                measured_breadcrumb,
            )
            .nodes
            .contains_key(node_id)
        {
            return false;
        }
        let (avail_h, max_scroll) =
            super::explorer::explorer_scroll_metrics(state, viewport_height, safe_area);
        let step = (avail_h - 46.0).max(46.0);
        let prev = state.explorer_scroll_y.clamp(0.0, max_scroll);
        let delta = if action == MobileA11yAction::ScrollForward {
            step
        } else {
            -step
        };
        state.scroll_explorer_by(delta, max_scroll);
        return (state.explorer_scroll_y - prev).abs() > 0.5;
    }

    if state.active_sheet != MobileSheet::None {
        return perform_sheet_a11y_action(state, node_id, now_ms);
    }

    // Reject stale node IDs that are not present in the live semantic tree for the current
    // workspace, route, viewport, and measured breadcrumb layout.
    if !super::build_accessibility_tree_with_layout(
        state,
        viewport_width,
        viewport_height,
        safe_area,
        measured_breadcrumb,
    )
    .nodes
    .contains_key(node_id)
    {
        return false;
    }

    match node_id {
        "mobile.tab.home" => {
            state.switch_tab(MobileTab::Home, now_ms);
            true
        }
        "mobile.tab.explorer" => {
            state.switch_tab(MobileTab::Explorer, now_ms);
            true
        }
        "mobile.tab.journals" => {
            state.switch_tab(MobileTab::Journals, now_ms);
            true
        }
        "mobile.tab.search" => {
            state.switch_tab(MobileTab::Search, now_ms);
            true
        }
        "mobile.page.back_btn" | "mobile.settings.back_btn" | "mobile.page.not_found_back_btn" => {
            MobileBackCoordinator::handle_back(state, now_ms);
            true
        }
        "mobile.explorer.back_btn" => {
            let Some(parent_target) = explorer_back_parent_target(state) else {
                return false;
            };
            state.navigate_back_or_replace(parent_target, now_ms);
            true
        }
        "mobile.page.more_btn" => {
            state.open_sheet_from(
                MobileSheet::LocationAndTrail,
                Some("mobile.page.more_btn"),
                now_ms,
            );
            true
        }
        "mobile.home.workspace_btn" => {
            state.open_sheet_from(
                MobileSheet::WorkspaceSelector,
                Some("mobile.home.workspace_btn"),
                now_ms,
            );
            true
        }
        "mobile.home.new_doc_btn" => {
            state.create_doc(None, now_ms);
            true
        }
        "mobile.explorer.new_doc_btn" => {
            let folder_id = match state.history.current().map(|e| &e.target) {
                Some(NavTarget::Folder(fid)) => Some(fid.clone()),
                _ => None,
            };
            state.create_doc(folder_id.as_deref(), now_ms);
            true
        }
        "mobile.journals.create_btn" => {
            let date = state.selected_journal_date.clone();
            state.open_or_create_journal_for_date(&date, now_ms);
            true
        }
        _ if node_id.starts_with("mobile.page.trash_restore_btn.") => {
            let rest = &node_id["mobile.page.trash_restore_btn.".len()..];
            let Some((ws_id, doc_id)) = crate::decode_scoped_doc_target(rest) else {
                return false;
            };
            state.restore_doc_scoped(ws_id, doc_id)
        }
        _ if node_id.starts_with("mobile.page.trash_delete_btn.") => {
            let rest = &node_id["mobile.page.trash_delete_btn.".len()..];
            let Some((ws_id, doc_id)) = crate::decode_scoped_doc_target(rest) else {
                return false;
            };
            state.request_delete_doc_scoped(ws_id, doc_id, Some(node_id), now_ms)
        }
        _ if node_id.starts_with("mobile.settings.row.") => {
            let key = &node_id["mobile.settings.row.".len()..];
            let Some(group) = SettingsGroupId::ALL
                .iter()
                .copied()
                .find(|g| g.a11y_key() == key)
            else {
                return false;
            };
            state.activate_setting(group)
        }
        _ if node_id.starts_with("mobile.journals.day.") => {
            let date = &node_id["mobile.journals.day.".len()..];
            state.select_journal_date(date);
            true
        }
        "page.backlinks.pill" => {
            state.open_sheet_from(MobileSheet::Backlinks, Some("page.backlinks.pill"), now_ms);
            true
        }
        "mobile.explorer.collections" => {
            state.navigate_target(
                NavTarget::Collection(String::new()),
                Origin::Direct(DirectKind::AllDocs),
            );
            true
        }
        "mobile.explorer.tags" => {
            state.navigate_target(
                NavTarget::Tag(String::new()),
                Origin::Direct(DirectKind::AllDocs),
            );
            true
        }
        "mobile.explorer.trash" => {
            state.navigate_target(NavTarget::Trash, Origin::Direct(DirectKind::AllDocs));
            true
        }
        _ if node_id.starts_with("breadcrumb.slot.") => {
            perform_breadcrumb_a11y_action(state, &node_id["breadcrumb.slot.".len()..], now_ms)
        }
        _ if node_id.starts_with("mobile.explorer.folder.") => {
            let folder_id = node_id["mobile.explorer.folder.".len()..].to_string();
            state.navigate_target(
                NavTarget::Folder(folder_id),
                Origin::Direct(DirectKind::AllDocs),
            );
            true
        }
        _ if node_id.starts_with("mobile.explorer.collection.") => {
            let col_id = node_id["mobile.explorer.collection.".len()..].to_string();
            state.navigate_target(
                NavTarget::Collection(col_id),
                Origin::Direct(DirectKind::AllDocs),
            );
            true
        }
        _ if node_id.starts_with("mobile.explorer.tag.") => {
            let tag_id = node_id["mobile.explorer.tag.".len()..].to_string();
            state.navigate_target(NavTarget::Tag(tag_id), Origin::Direct(DirectKind::AllDocs));
            true
        }
        _ if node_id.starts_with("mobile.explorer.doc.") => {
            let rest = &node_id["mobile.explorer.doc.".len()..];
            let Some((ws_id, doc_id)) = crate::decode_scoped_doc_target(rest) else {
                return false;
            };
            if ws_id != state.active_workspace_id() {
                return false;
            }
            let origin = derive_explorer_doc_origin(state, doc_id);
            state.open_doc(doc_id, origin);
            true
        }
        _ => false,
    }
}

fn perform_sheet_a11y_action(state: &mut MobileAppState, node_id: &str, now_ms: f64) -> bool {
    match node_id {
        "app.sheet.dialog" => return true,
        "mobile.sheet.done_btn" => {
            if state.active_sheet == MobileSheet::ConfirmDeleteDoc {
                return false;
            }
            state.close_sheet(now_ms);
            return true;
        }
        _ => {}
    }

    match state.active_sheet {
        MobileSheet::WorkspaceSelector => {
            let Some(ws_id) = node_id.strip_prefix("mobile.sheet.ws.") else {
                return false;
            };
            let Some(idx) = state.workspaces.iter().position(|w| w.id == ws_id) else {
                return false;
            };
            state.select_workspace(idx, now_ms);
            true
        }
        MobileSheet::LocationAndTrail => {
            if node_id == "mobile.sheet.use_trail_btn" {
                let cur_seq = state.history.current().map(|e| e.seq).unwrap_or(0);
                state.pick_location(cur_seq, Some(LocationChoice::UseTrail), now_ms);
                return true;
            }
            if let Some(rest) = node_id.strip_prefix("mobile.sheet.trail.") {
                let Ok(idx) = rest.parse::<usize>() else {
                    return false;
                };
                let derivation = state.derive_breadcrumb();
                let trail = if derivation.can_return_to_trail {
                    &derivation.recoverable_trail
                } else {
                    &derivation.trail
                };
                let Some(step) = trail.get(idx) else {
                    return false;
                };
                let is_cur = step.is_current;
                let seq = step.seq;
                if !is_cur {
                    state.click_breadcrumb(
                        &BreadcrumbAction::NavigateHistoryAnchor { anchor_seq: seq },
                        now_ms,
                    );
                }
                state.close_sheet(now_ms);
                return true;
            }
            if let Some(rest) = node_id.strip_prefix("mobile.sheet.loc.") {
                let Ok(idx) = rest.parse::<usize>() else {
                    return false;
                };
                let cur_seq = state.history.current().map(|e| e.seq).unwrap_or(0);
                let derivation = state.derive_breadcrumb();
                let Some(opt) = derivation.current_doc_locations.get(idx) else {
                    return false;
                };
                state.pick_location(
                    cur_seq,
                    Some(LocationChoice::Location(opt.location.clone())),
                    now_ms,
                );
                return true;
            }
            if let Some(rest) = node_id.strip_prefix("mobile.sheet.owner_loc.") {
                let Ok(idx) = rest.parse::<usize>() else {
                    return false;
                };
                let derivation = state.derive_breadcrumb();
                let ContextState::MultiLocation {
                    owner_seq, options, ..
                } = derivation.context
                else {
                    return false;
                };
                let Some(opt) = options.get(idx) else {
                    return false;
                };
                state.pick_location(
                    owner_seq,
                    Some(LocationChoice::Location(opt.location.clone())),
                    now_ms,
                );
                return true;
            }
            false
        }
        MobileSheet::Backlinks => {
            let Some(rest) = node_id.strip_prefix("mobile.sheet.backlink.") else {
                return false;
            };
            let Ok(idx) = rest.parse::<usize>() else {
                return false;
            };
            let doc_id = match &state.route {
                MobileRoute::Page(id) => id.clone(),
                _ => return false,
            };
            let bl = state.backlinks_for(&doc_id);
            let Some(item) = bl.items.get(idx) else {
                return false;
            };
            let src_id = item.source_doc_id.clone();
            let block_id = item.source_block_id.clone();
            state.close_sheet(now_ms);
            state.open_doc(
                &src_id,
                Origin::Backlink {
                    source_doc_id: src_id.clone(),
                    block_id: Some(block_id),
                },
            );
            true
        }
        MobileSheet::ConfirmDeleteDoc => {
            if let Some(rest) = node_id.strip_prefix("app.sheet.delete_cancel.") {
                let Some((ws_id, doc_id)) = crate::decode_scoped_doc_target(rest) else {
                    return false;
                };
                if state
                    .pending_delete_target
                    .as_ref()
                    .is_some_and(|(w, d)| w == ws_id && d == doc_id)
                {
                    state.close_sheet(now_ms);
                    return true;
                }
                return false;
            }
            if let Some(rest) = node_id.strip_prefix("app.sheet.delete_confirm.") {
                let Some((ws_id, doc_id)) = crate::decode_scoped_doc_target(rest) else {
                    return false;
                };
                if state
                    .pending_delete_target
                    .as_ref()
                    .is_some_and(|(w, d)| w == ws_id && d == doc_id)
                {
                    return state.delete_doc_permanently_scoped(ws_id, doc_id, now_ms);
                }
                return false;
            }
            false
        }
        MobileSheet::None => false,
    }
}

fn perform_breadcrumb_a11y_action(state: &mut MobileAppState, slot_id: &str, now_ms: f64) -> bool {
    let derivation = state.derive_breadcrumb();
    let trigger = format!("breadcrumb.slot.{slot_id}");
    if slot_id == "ellipsis" || slot_id == "breadcrumb.ellipsis" {
        let owner_seq = derivation.chain_head_seq.unwrap_or(0);
        state.click_breadcrumb_from(
            &BreadcrumbAction::OpenLocationSheet { owner_seq },
            Some(&trigger),
            now_ms,
        );
        return true;
    }
    let Some(crumb) = derivation.crumbs.iter().find(|c| c.id == slot_id) else {
        return false;
    };
    if !matches!(crumb.action, BreadcrumbAction::None) {
        state.click_breadcrumb_from(&crumb.action, Some(&trigger), now_ms);
    }
    true
}

fn explorer_back_parent_target(state: &mut MobileAppState) -> Option<NavTarget> {
    let target = state.history.current().map(|e| e.target.clone())?;
    match target {
        NavTarget::Folder(folder_id) => {
            if let FolderForestState::Ready(forest) = state.forest_state()
                && let Some(chain) = forest.folder_chain(&folder_id)
                && chain.len() >= 2
            {
                return Some(NavTarget::Folder(chain[chain.len() - 2].folder_id.clone()));
            }
            Some(NavTarget::AllDocs)
        }
        NavTarget::Collection(id) if !id.is_empty() => Some(NavTarget::Collection(String::new())),
        NavTarget::Tag(id) if !id.is_empty() => Some(NavTarget::Tag(String::new())),
        NavTarget::Collection(_) | NavTarget::Tag(_) | NavTarget::Trash => Some(NavTarget::AllDocs),
        _ => None,
    }
}

/// Validate that `tree` has no orphaned nodes, no missing children, and at most one `current`
/// node inside the active navigation landmark.
pub fn validate_accessibility_tree(tree: &AccessibilityTree) -> Vec<String> {
    let mut errors = Vec::new();
    if !tree.nodes.contains_key(&tree.root_id) {
        errors.push(format!("missing root node {}", tree.root_id));
        return errors;
    }

    let mut reachable: HashSet<&str> = HashSet::new();
    let mut stack = vec![tree.root_id.as_str()];
    while let Some(id) = stack.pop() {
        if !reachable.insert(id) {
            continue;
        }
        if let Some(node) = tree.nodes.get(id) {
            for child in &node.children {
                if !tree.nodes.contains_key(child) {
                    errors.push(format!("node {id} references missing child {child}"));
                } else {
                    stack.push(child.as_str());
                }
            }
        }
    }

    for id in tree.nodes.keys() {
        if !reachable.contains(id.as_str()) {
            errors.push(format!("orphaned accessibility node {id}"));
        }
    }

    let current_count = tree.nodes.values().filter(|n| n.state.current).count();
    if current_count > 1 {
        errors.push(format!(
            "expected at most 1 aria-current node, found {current_count}"
        ));
    }

    errors
}
