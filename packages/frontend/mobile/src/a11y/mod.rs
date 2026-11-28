//! Production frame-1 accessibility semantic tree builder, `PlatformAccessibility` bridge sink,
//! semantic action dispatcher, and structural validator.

mod actions;
mod explorer;
mod page;
mod sheet;

pub(crate) use actions::perform_a11y_action_with_layout;
pub use actions::{
    A11yBoundsMap, InMemoryPlatformAccessibility, MobileA11yAction, a11y_bounds_probe,
    a11y_bounds_probe_border, apply_measured_bounds, derive_explorer_doc_origin,
    perform_a11y_action, perform_a11y_action_with_viewport,
};

use std::collections::{BTreeMap, HashSet};

use affine_client::{
    AccessibilityBounds, AccessibilityNode, AccessibilityRole, AccessibilityState,
    AccessibilityTree,
};
use ui_kit::BreadcrumbBarLayout;

use crate::{
    state::{
        MobileAppState, MobileRoute, MobileSheet, MobileTab, SettingRowInteraction,
        SettingsGroupId, ThemePreference,
    },
    views::week_days_for_date,
};

use self::{
    explorer::insert_explorer_a11y_nodes, page::insert_page_a11y_nodes,
    sheet::insert_sheet_a11y_nodes,
};

/// Four-edge physical safe-area insets in logical points for accessibility geometry alignment.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct SafeAreaMetrics {
    pub left: f32,
    pub top: f32,
    pub right: f32,
    pub bottom: f32,
}

/// Build the production accessibility tree for the current mobile shell state and viewport.
pub fn build_accessibility_tree(
    state: &mut MobileAppState,
    viewport_width: f32,
    viewport_height: f32,
) -> AccessibilityTree {
    build_accessibility_tree_with_layout(
        state,
        viewport_width,
        viewport_height,
        SafeAreaMetrics::default(),
        None,
    )
}

/// Build the production accessibility tree using actual four-edge safe-area insets and optional
/// measured [`BreadcrumbBarLayout`] so screen geometry and semantic bounds stay synchronized.
///
/// While a modal sheet is open (`state.active_sheet != MobileSheet::None`), background landmarks
/// and controls are pruned so screen readers interact exclusively with the active dialog.
pub fn build_accessibility_tree_with_layout(
    state: &mut MobileAppState,
    viewport_width: f32,
    viewport_height: f32,
    safe: SafeAreaMetrics,
    measured_breadcrumb: Option<&BreadcrumbBarLayout>,
) -> AccessibilityTree {
    let locale = state.locale();
    let strings = locale.strings();
    let mut nodes: BTreeMap<String, AccessibilityNode> = BTreeMap::new();
    let mut root_children: Vec<String> = Vec::new();
    let is_rtl = locale.direction().is_rtl();
    let content_left = safe.left;
    let content_w = (viewport_width - safe.left - safe.right).max(44.0);
    let safe_top = safe.top;
    let safe_bottom = safe.bottom;

    if state.active_sheet != MobileSheet::None {
        let sheet_id = insert_sheet_a11y_nodes(
            state,
            viewport_width,
            viewport_height,
            safe,
            is_rtl,
            &mut nodes,
        );
        root_children.push(sheet_id);

        let focus_target = state
            .focused_a11y_id
            .as_deref()
            .filter(|id| nodes.contains_key(*id))
            .unwrap_or("app.sheet.dialog")
            .to_string();
        if let Some(node) = nodes.get_mut(&focus_target) {
            node.focused = true;
        }

        let root_id = "app.root".to_string();
        nodes.insert(
            root_id.clone(),
            AccessibilityNode {
                id: root_id.clone(),
                role: AccessibilityRole::Application,
                name: "AFFiNE".to_string(),
                value: Some(state.active_workspace().summary.name.clone()),
                state: AccessibilityState::default(),
                focused: false,
                bounds: AccessibilityBounds {
                    x: 0.0,
                    y: 0.0,
                    width: viewport_width,
                    height: viewport_height,
                },
                children: root_children,
            },
        );
        return AccessibilityTree { root_id, nodes };
    }

    let main_id = "app.main".to_string();
    let mut main_children: Vec<String> = Vec::new();

    if let MobileRoute::Home = state.route {
        let ws_btn_id = "mobile.home.workspace_btn".to_string();
        nodes.insert(
            ws_btn_id.clone(),
            AccessibilityNode {
                id: ws_btn_id.clone(),
                role: AccessibilityRole::Button,
                name: state.active_workspace().summary.name.clone(),
                value: None,
                state: AccessibilityState {
                    expanded: Some(state.active_sheet == MobileSheet::WorkspaceSelector),
                    ..AccessibilityState::default()
                },
                focused: false,
                bounds: AccessibilityBounds {
                    x: if is_rtl {
                        content_left + (content_w - 180.0).max(0.0)
                    } else {
                        content_left + 16.0
                    },
                    y: safe_top + 6.0,
                    width: 164.0,
                    height: 44.0,
                },
                children: Vec::new(),
            },
        );
        main_children.push(ws_btn_id);

        let new_doc_id = "mobile.home.new_doc_btn".to_string();
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
                        content_left + 64.0
                    } else {
                        content_left + (content_w - 108.0).max(0.0)
                    },
                    y: safe_top + 6.0,
                    width: 44.0,
                    height: 44.0,
                },
                children: Vec::new(),
            },
        );
        main_children.push(new_doc_id);

        let settings_id = "mobile.home.settings_btn".to_string();
        nodes.insert(
            settings_id.clone(),
            AccessibilityNode {
                id: settings_id.clone(),
                role: AccessibilityRole::Button,
                name: strings.settings_title.to_string(),
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
        main_children.push(settings_id);

        for (idx, doc) in state
            .active_workspace()
            .docs
            .iter()
            .filter(|d| !d.trashed && d.is_favorite)
            .take(2)
            .enumerate()
        {
            let fav_id = format!("mobile.home.fav.{}", doc.id);
            let card_w = ((content_w - 42.0) * 0.5).max(80.0);
            nodes.insert(
                fav_id.clone(),
                AccessibilityNode {
                    id: fav_id.clone(),
                    role: AccessibilityRole::Button,
                    name: doc.display_title(locale),
                    value: None,
                    state: AccessibilityState::default(),
                    focused: false,
                    bounds: AccessibilityBounds {
                        x: content_left + 16.0 + (idx as f32) * (card_w + 10.0),
                        y: safe_top + 92.0,
                        width: card_w,
                        height: 80.0,
                    },
                    children: Vec::new(),
                },
            );
            main_children.push(fav_id);
        }

        for (idx, doc) in state
            .active_workspace()
            .docs
            .iter()
            .filter(|d| !d.trashed)
            .enumerate()
        {
            let doc_node_id = format!("mobile.home.doc.{}", doc.id);
            nodes.insert(
                doc_node_id.clone(),
                AccessibilityNode {
                    id: doc_node_id.clone(),
                    role: AccessibilityRole::Button,
                    name: doc.display_title(locale),
                    value: None,
                    state: AccessibilityState::default(),
                    focused: false,
                    bounds: AccessibilityBounds {
                        x: content_left + 16.0,
                        y: safe_top + 206.0 + (idx as f32) * 72.0,
                        width: (content_w - 32.0).max(44.0),
                        height: 72.0,
                    },
                    children: Vec::new(),
                },
            );
            main_children.push(doc_node_id);
        }
    }

    if let MobileRoute::Journals = state.route {
        if state.selected_journal_date != state.today_date {
            let today_id = "mobile.journals.today_btn".to_string();
            nodes.insert(
                today_id.clone(),
                AccessibilityNode {
                    id: today_id.clone(),
                    role: AccessibilityRole::Button,
                    name: strings.today_btn_label.to_string(),
                    value: None,
                    state: AccessibilityState::default(),
                    focused: false,
                    bounds: AccessibilityBounds {
                        x: content_left + (content_w - 224.0).max(0.0),
                        y: safe_top + 6.0,
                        width: 52.0,
                        height: 44.0,
                    },
                    children: Vec::new(),
                },
            );
            main_children.push(today_id);
        }
        for (btn_id, name, offset) in [
            ("mobile.journals.prev_week_btn", "<", 168.0_f32),
            ("mobile.journals.next_week_btn", ">", 52.0_f32),
        ] {
            nodes.insert(
                btn_id.to_string(),
                AccessibilityNode {
                    id: btn_id.to_string(),
                    role: AccessibilityRole::Button,
                    name: name.to_string(),
                    value: None,
                    state: AccessibilityState::default(),
                    focused: false,
                    bounds: AccessibilityBounds {
                        x: content_left + (content_w - offset).max(0.0),
                        y: safe_top + 6.0,
                        width: 44.0,
                        height: 44.0,
                    },
                    children: Vec::new(),
                },
            );
            main_children.push(btn_id.to_string());
        }

        let week = week_days_for_date(&state.selected_journal_date);
        let strip_w = (content_w - 32.0).max(44.0);
        let day_w = ((strip_w - 24.0) / 7.0).max(32.0);
        for (idx, (_, _, iso_date)) in week.iter().enumerate() {
            let day_id = format!("mobile.journals.day.{iso_date}");
            let day_x = if is_rtl {
                content_left + 16.0 + ((6 - idx) as f32) * (day_w + 4.0)
            } else {
                content_left + 16.0 + (idx as f32) * (day_w + 4.0)
            };
            nodes.insert(
                day_id.clone(),
                AccessibilityNode {
                    id: day_id.clone(),
                    role: AccessibilityRole::Button,
                    name: iso_date.clone(),
                    value: None,
                    state: AccessibilityState {
                        selected: iso_date == &state.selected_journal_date,
                        ..AccessibilityState::default()
                    },
                    focused: false,
                    bounds: AccessibilityBounds {
                        x: day_x,
                        y: safe_top + 72.0,
                        width: day_w,
                        height: 52.0,
                    },
                    children: Vec::new(),
                },
            );
            main_children.push(day_id);
        }

        let has_entry = state.active_workspace().docs.iter().any(|d| {
            !d.trashed && d.journal_date.as_deref() == Some(state.selected_journal_date.as_str())
        });
        let cta_id = "mobile.journals.create_btn".to_string();
        nodes.insert(
            cta_id.clone(),
            AccessibilityNode {
                id: cta_id.clone(),
                role: AccessibilityRole::Button,
                name: if has_entry {
                    strings.open_journal.to_string()
                } else {
                    strings.create_journal.to_string()
                },
                value: None,
                state: AccessibilityState::default(),
                focused: false,
                bounds: AccessibilityBounds {
                    x: content_left + 16.0,
                    y: safe_top + 250.0,
                    width: strip_w,
                    height: 46.0,
                },
                children: Vec::new(),
            },
        );
        main_children.push(cta_id);
    }

    if let MobileRoute::Explorer = state.route {
        insert_explorer_a11y_nodes(
            state,
            viewport_width,
            viewport_height,
            safe,
            is_rtl,
            &mut nodes,
            &mut main_children,
        );
    }

    if let MobileRoute::Search = state.route {
        let input_id = "mobile.search.input".to_string();
        nodes.insert(
            input_id.clone(),
            AccessibilityNode {
                id: input_id.clone(),
                role: AccessibilityRole::TextField,
                name: strings.search_placeholder.to_string(),
                value: Some(state.search_query.clone()),
                state: AccessibilityState::default(),
                focused: false,
                bounds: AccessibilityBounds {
                    x: content_left + 16.0,
                    y: safe_top + 16.0,
                    width: (content_w - 32.0).max(44.0),
                    height: 44.0,
                },
                children: Vec::new(),
            },
        );
        main_children.push(input_id);

        if !state.search_query.is_empty() {
            let clear_id = "mobile.search.clear_btn".to_string();
            nodes.insert(
                clear_id.clone(),
                AccessibilityNode {
                    id: clear_id.clone(),
                    role: AccessibilityRole::Button,
                    name: strings.close_label.to_string(),
                    value: None,
                    state: AccessibilityState::default(),
                    focused: false,
                    bounds: AccessibilityBounds {
                        x: if is_rtl {
                            content_left + 20.0
                        } else {
                            content_left + (content_w - 64.0).max(0.0)
                        },
                        y: safe_top + 16.0,
                        width: 44.0,
                        height: 44.0,
                    },
                    children: Vec::new(),
                },
            );
            main_children.push(clear_id);
        }

        for (idx, hit) in state.search_hits().iter().enumerate() {
            let hit_id = format!("mobile.search.hit.{}", hit.doc_id);
            nodes.insert(
                hit_id.clone(),
                AccessibilityNode {
                    id: hit_id.clone(),
                    role: AccessibilityRole::Button,
                    name: hit.title.clone(),
                    value: None,
                    state: AccessibilityState::default(),
                    focused: false,
                    bounds: AccessibilityBounds {
                        x: content_left + 16.0,
                        y: safe_top + 72.0 + (idx as f32) * 68.0,
                        width: (content_w - 32.0).max(44.0),
                        height: 64.0,
                    },
                    children: Vec::new(),
                },
            );
            main_children.push(hit_id);
        }
    }

    if let MobileRoute::Settings = state.route {
        let row_x = content_left + 14.0;
        let row_w = (content_w - 28.0).max(44.0);
        for (idx, group) in SettingsGroupId::ALL.iter().copied().enumerate() {
            let is_info = group.interaction() == SettingRowInteraction::Info;
            let row_id = if is_info {
                format!("mobile.settings.group.{idx}")
            } else {
                format!("mobile.settings.row.{}", group.a11y_key())
            };
            let val = match group {
                SettingsGroupId::Account => {
                    if state.settings.account_email.trim().is_empty() {
                        strings.sign_in_label.to_string()
                    } else {
                        state.settings.account_email.clone()
                    }
                }
                SettingsGroupId::Workspace => state.active_workspace().summary.name.clone(),
                SettingsGroupId::Appearance => match state.settings.theme_preference {
                    ThemePreference::Light => strings.theme_light.to_string(),
                    ThemePreference::Dark => strings.theme_dark.to_string(),
                    ThemePreference::System => strings.theme_system.to_string(),
                },
                SettingsGroupId::Language => state.settings.locale.display_name().to_string(),
                SettingsGroupId::Editor => format!("{}%", state.settings.editor_font_scale_pct),
                SettingsGroupId::SyncOffline => if state.settings.offline_sync_enabled {
                    strings.toggle_on
                } else {
                    strings.toggle_off
                }
                .to_string(),
                SettingsGroupId::Storage => format!("{} MB", state.settings.cache_size_mb),
                SettingsGroupId::Notifications => if state.settings.push_notifications {
                    strings.toggle_on
                } else {
                    strings.toggle_off
                }
                .to_string(),
                SettingsGroupId::Experimental => {
                    strings.flags_count(locale, state.settings.experimental_flags.len())
                }
                SettingsGroupId::About => {
                    format!(
                        "{} v{}",
                        strings.about_version_label, state.settings.app_version
                    )
                }
            };
            let role = if !is_info || group == SettingsGroupId::Workspace {
                AccessibilityRole::Button
            } else {
                AccessibilityRole::Region
            };
            nodes.insert(
                row_id.clone(),
                AccessibilityNode {
                    id: row_id.clone(),
                    role,
                    name: strings.settings_groups[idx].to_string(),
                    value: Some(val),
                    state: AccessibilityState::default(),
                    focused: false,
                    bounds: AccessibilityBounds {
                        x: row_x,
                        y: safe_top + 66.0 + (idx as f32) * 44.0,
                        width: row_w,
                        height: 44.0,
                    },
                    children: Vec::new(),
                },
            );
            main_children.push(row_id);
        }
    }

    if let MobileRoute::Page(doc_id) = state.route.clone() {
        insert_page_a11y_nodes(
            state,
            &doc_id,
            content_left,
            content_w,
            safe,
            is_rtl,
            measured_breadcrumb,
            &mut nodes,
            &mut root_children,
            &mut main_children,
        );
    }

    let main_name = match &state.route {
        MobileRoute::Home => strings.tab_home.to_string(),
        MobileRoute::Explorer => strings.tab_explorer.to_string(),
        MobileRoute::Journals => strings.tab_journals.to_string(),
        MobileRoute::Search => strings.tab_search.to_string(),
        MobileRoute::Settings => strings.settings_title.to_string(),
        MobileRoute::Page(id) => state
            .doc_by_id(id)
            .map(|d| d.display_title(locale))
            .unwrap_or_else(|| strings.untitled_doc.to_string()),
    };

    let show_tabbar = matches!(
        state.route,
        MobileRoute::Home | MobileRoute::Explorer | MobileRoute::Journals | MobileRoute::Search
    );

    if matches!(state.route, MobileRoute::Page(_) | MobileRoute::Settings) {
        let back_id = match state.route {
            MobileRoute::Page(_) => "mobile.page.back_btn".to_string(),
            _ => "mobile.settings.back_btn".to_string(),
        };
        let back_w = 72.0_f32;
        let back_x = if is_rtl {
            content_left + (content_w - 8.0 - back_w).max(0.0)
        } else {
            content_left + 8.0
        };
        nodes.insert(
            back_id.clone(),
            AccessibilityNode {
                id: back_id.clone(),
                role: AccessibilityRole::Button,
                name: strings.back_label.to_string(),
                value: None,
                state: AccessibilityState::default(),
                focused: false,
                bounds: AccessibilityBounds {
                    x: back_x,
                    y: safe_top + 4.0,
                    width: back_w,
                    height: 44.0,
                },
                children: Vec::new(),
            },
        );
        main_children.push(back_id);
    }

    let tabbar_h = if show_tabbar { 64.0 } else { 0.0 };
    nodes.insert(
        main_id.clone(),
        AccessibilityNode {
            id: main_id.clone(),
            role: AccessibilityRole::Main,
            name: main_name,
            value: None,
            state: AccessibilityState::default(),
            focused: false,
            bounds: AccessibilityBounds {
                x: content_left,
                y: safe_top,
                width: content_w,
                height: (viewport_height - safe_top - safe_bottom - tabbar_h).max(44.0),
            },
            children: main_children,
        },
    );
    root_children.push(main_id.clone());

    if show_tabbar {
        let tab_bar_id = "app.nav.tabbar".to_string();
        let tab_inner_w = (content_w - 16.0).max(44.0);
        let tab_w = (tab_inner_w / 4.0).max(44.0);
        let tab_bar_y = (viewport_height - safe_bottom - 64.0).max(0.0);
        let tab_y = tab_bar_y + 6.0;
        let mut tab_ids = Vec::with_capacity(4);
        for (idx, tab) in MobileTab::ALL.iter().enumerate() {
            let id = tab.id().to_string();
            let label = match tab {
                MobileTab::Home => strings.tab_home,
                MobileTab::Explorer => strings.tab_explorer,
                MobileTab::Journals => strings.tab_journals,
                MobileTab::Search => strings.tab_search,
            };
            let is_active = state.active_tab == *tab;
            let tab_x = if is_rtl {
                content_left + 8.0 + ((3 - idx) as f32) * tab_w
            } else {
                content_left + 8.0 + (idx as f32) * tab_w
            };
            nodes.insert(
                id.clone(),
                AccessibilityNode {
                    id: id.clone(),
                    role: AccessibilityRole::Tab,
                    name: label.to_string(),
                    value: None,
                    state: AccessibilityState {
                        selected: is_active,
                        current: is_active,
                        ..AccessibilityState::default()
                    },
                    focused: false,
                    bounds: AccessibilityBounds {
                        x: tab_x,
                        y: tab_y,
                        width: tab_w,
                        height: 52.0,
                    },
                    children: Vec::new(),
                },
            );
            tab_ids.push(id);
        }
        nodes.insert(
            tab_bar_id.clone(),
            AccessibilityNode {
                id: tab_bar_id.clone(),
                role: AccessibilityRole::TabList,
                name: "Bottom Tabs".to_string(),
                value: None,
                state: AccessibilityState::default(),
                focused: false,
                bounds: AccessibilityBounds {
                    x: content_left,
                    y: tab_bar_y,
                    width: content_w,
                    height: 64.0,
                },
                children: tab_ids,
            },
        );
        root_children.push(tab_bar_id);
    }

    let focus_target = state
        .focused_a11y_id
        .as_deref()
        .filter(|id| nodes.contains_key(*id))
        .unwrap_or(main_id.as_str())
        .to_string();
    if let Some(node) = nodes.get_mut(&focus_target) {
        node.focused = true;
    }

    let root_id = "app.root".to_string();
    nodes.insert(
        root_id.clone(),
        AccessibilityNode {
            id: root_id.clone(),
            role: AccessibilityRole::Application,
            name: "AFFiNE".to_string(),
            value: Some(state.active_workspace().summary.name.clone()),
            state: AccessibilityState::default(),
            focused: false,
            bounds: AccessibilityBounds {
                x: 0.0,
                y: 0.0,
                width: viewport_width,
                height: viewport_height,
            },
            children: root_children,
        },
    );

    AccessibilityTree { root_id, nodes }
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
