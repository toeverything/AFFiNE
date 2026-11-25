//! Production frame-1 accessibility semantic tree builder, `PlatformAccessibility` bridge sink,
//! semantic action dispatcher, and structural validator.

mod actions;
mod explorer;
mod sheet;

pub(crate) use actions::perform_a11y_action_with_layout;
pub use actions::{
    A11yBoundsMap, InMemoryPlatformAccessibility, MobileA11yAction, a11y_bounds_probe,
    a11y_bounds_probe_border, apply_measured_bounds, derive_explorer_doc_origin,
    perform_a11y_action, perform_a11y_action_with_viewport, validate_accessibility_tree,
};

use std::collections::BTreeMap;

use affine_client::{
    AccessibilityBounds, AccessibilityNode, AccessibilityRole, AccessibilityState,
    AccessibilityTree, ContextState,
};
use ui_kit::{
    BreadcrumbBarConfig, BreadcrumbBarLayout, BreadcrumbItem, BreadcrumbItemKind,
    layout_breadcrumb_bar,
};

use crate::{
    state::{
        MobileAppState, MobileRoute, MobileSheet, MobileTab, SettingRowInteraction,
        SettingsGroupId, ThemePreference,
    },
    views::week_days_for_date,
};

use self::{explorer::insert_explorer_a11y_nodes, sheet::insert_sheet_a11y_nodes};

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
                value: Some(state.active_workspace().name.clone()),
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
                name: state.active_workspace().name.clone(),
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
    }

    if let MobileRoute::Journals = state.route {
        let week = week_days_for_date(&state.today_date);
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

        let has_entry = state.docs.iter().any(|d| {
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

    if let MobileRoute::Settings = state.route {
        let row_x = content_left + 14.0;
        let row_w = (content_w - 28.0).max(44.0);
        for (idx, group) in SettingsGroupId::ALL.iter().copied().enumerate() {
            if group.interaction() == SettingRowInteraction::Info {
                continue;
            }
            let row_id = format!("mobile.settings.row.{}", group.a11y_key());
            let val = match group {
                SettingsGroupId::Appearance => match state.settings.theme_preference {
                    ThemePreference::Light => strings.theme_light.to_string(),
                    ThemePreference::Dark => strings.theme_dark.to_string(),
                    ThemePreference::System => strings.theme_system.to_string(),
                },
                SettingsGroupId::Language => state.settings.locale.display_name().to_string(),
                SettingsGroupId::SyncOffline => if state.settings.offline_sync_enabled {
                    strings.toggle_on
                } else {
                    strings.toggle_off
                }
                .to_string(),
                SettingsGroupId::Notifications => if state.settings.push_notifications {
                    strings.toggle_on
                } else {
                    strings.toggle_off
                }
                .to_string(),
                _ => String::new(),
            };
            nodes.insert(
                row_id.clone(),
                AccessibilityNode {
                    id: row_id.clone(),
                    role: AccessibilityRole::Button,
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
        let derivation = state.derive_breadcrumb();
        if !derivation.should_hide_bar_on_mobile && !derivation.crumbs.is_empty() {
            let nav_bc_id = "app.nav.breadcrumb".to_string();
            let owned_layout;
            let layout = if let Some(pre) = measured_breadcrumb {
                pre
            } else {
                let items: Vec<BreadcrumbItem> = derivation
                    .crumbs
                    .iter()
                    .map(|c| {
                        let label = if c.is_switcher {
                            match &derivation.context {
                                ContextState::MultiLocation {
                                    count,
                                    owner_doc_id,
                                    owner_doc_title,
                                    ..
                                } if *owner_doc_id != doc_id => strings
                                    .compact_owner_multi_location_label(
                                        locale,
                                        owner_doc_title,
                                        *count,
                                    ),
                                ContextState::MultiLocation { count, .. } => {
                                    strings.multi_location_label(locale, *count)
                                }
                                _ => c.label.clone(),
                            }
                        } else if c.id == "root:trash" {
                            strings.trash.to_string()
                        } else if c.id == "root:journals" {
                            strings.tab_journals.to_string()
                        } else {
                            c.label.clone()
                        };
                        BreadcrumbItem {
                            id: c.id.clone(),
                            label,
                            kind: if c.is_current {
                                BreadcrumbItemKind::Current
                            } else if c.is_switcher {
                                BreadcrumbItemKind::Switcher
                            } else {
                                BreadcrumbItemKind::Segment
                            },
                            clickable: !c.is_current,
                        }
                    })
                    .collect();
                owned_layout = layout_breadcrumb_bar(
                    &items,
                    &BreadcrumbBarConfig::new(content_w, locale.direction())
                        .with_font_scale(state.font_scale),
                );
                &owned_layout
            };

            let mut bc_children = Vec::new();
            for slot in &layout.slots {
                let node_id = format!("breadcrumb.slot.{}", slot.id);
                let is_ellipsis = slot.kind == ui_kit::BreadcrumbSlotKind::Ellipsis;
                let a11y_name = if slot.kind == ui_kit::BreadcrumbSlotKind::Switcher {
                    match &derivation.context {
                        ContextState::MultiLocation {
                            count,
                            owner_doc_id,
                            owner_doc_title,
                            ..
                        } if *owner_doc_id != doc_id => {
                            strings.owner_multi_location_label(locale, owner_doc_title, *count)
                        }
                        _ => slot.full_title.clone(),
                    }
                } else {
                    slot.full_title.clone()
                };
                nodes.insert(
                    node_id.clone(),
                    AccessibilityNode {
                        id: node_id.clone(),
                        role: if is_ellipsis {
                            AccessibilityRole::Button
                        } else {
                            AccessibilityRole::Link
                        },
                        name: a11y_name,
                        value: None,
                        state: AccessibilityState {
                            current: slot.is_current,
                            expanded: if is_ellipsis
                                || slot.kind == ui_kit::BreadcrumbSlotKind::Switcher
                            {
                                Some(state.active_sheet == MobileSheet::LocationAndTrail)
                            } else {
                                None
                            },
                            ..AccessibilityState::default()
                        },
                        focused: false,
                        bounds: AccessibilityBounds {
                            x: content_left + slot.x,
                            y: safe_top + 52.0,
                            width: slot.width,
                            height: slot.height,
                        },
                        children: Vec::new(),
                    },
                );
                bc_children.push(node_id);
            }

            nodes.insert(
                nav_bc_id.clone(),
                AccessibilityNode {
                    id: nav_bc_id.clone(),
                    role: AccessibilityRole::Navigation,
                    name: "Breadcrumb".to_string(),
                    value: None,
                    state: AccessibilityState::default(),
                    focused: false,
                    bounds: AccessibilityBounds {
                        x: content_left,
                        y: safe_top + 52.0,
                        width: content_w,
                        height: layout.height,
                    },
                    children: bc_children,
                },
            );
            root_children.push(nav_bc_id);
        }

        let more_id = "mobile.page.more_btn".to_string();
        nodes.insert(
            more_id.clone(),
            AccessibilityNode {
                id: more_id.clone(),
                role: AccessibilityRole::Button,
                name: strings.location_trail_title.to_string(),
                value: None,
                state: AccessibilityState {
                    expanded: Some(state.active_sheet == MobileSheet::LocationAndTrail),
                    ..AccessibilityState::default()
                },
                focused: false,
                bounds: AccessibilityBounds {
                    x: if is_rtl {
                        content_left + 8.0
                    } else {
                        content_left + (content_w - 52.0).max(0.0)
                    },
                    y: safe_top + 4.0,
                    width: 44.0,
                    height: 44.0,
                },
                children: Vec::new(),
            },
        );
        main_children.push(more_id);

        let doc_exists = state.doc_by_id(&doc_id).is_some();
        let ws_id = state.active_workspace_id().to_string();

        if !doc_exists {
            let nf_id = "mobile.page.not_found_back_btn".to_string();
            nodes.insert(
                nf_id.clone(),
                AccessibilityNode {
                    id: nf_id.clone(),
                    role: AccessibilityRole::Button,
                    name: strings.back_label.to_string(),
                    value: None,
                    state: AccessibilityState::default(),
                    focused: false,
                    bounds: AccessibilityBounds {
                        x: content_left + (content_w - 120.0).max(0.0) * 0.5,
                        y: safe_top + 200.0,
                        width: 120.0,
                        height: 44.0,
                    },
                    children: Vec::new(),
                },
            );
            main_children.push(nf_id);
        } else {
            if derivation.in_trash {
                let scoped = crate::encode_scoped_doc_target(&ws_id, &doc_id);
                let restore_id = format!("mobile.page.trash_restore_btn.{scoped}");
                nodes.insert(
                    restore_id.clone(),
                    AccessibilityNode {
                        id: restore_id.clone(),
                        role: AccessibilityRole::Button,
                        name: strings.restore_doc_label.to_string(),
                        value: None,
                        state: AccessibilityState::default(),
                        focused: false,
                        bounds: AccessibilityBounds {
                            x: content_left + 16.0,
                            y: safe_top + 114.0,
                            width: 72.0,
                            height: 44.0,
                        },
                        children: Vec::new(),
                    },
                );
                main_children.push(restore_id);

                let delete_id = format!("mobile.page.trash_delete_btn.{scoped}");
                nodes.insert(
                    delete_id.clone(),
                    AccessibilityNode {
                        id: delete_id.clone(),
                        role: AccessibilityRole::Button,
                        name: strings.delete_permanently_label.to_string(),
                        value: None,
                        state: AccessibilityState::default(),
                        focused: false,
                        bounds: AccessibilityBounds {
                            x: content_left + 96.0,
                            y: safe_top + 114.0,
                            width: 120.0,
                            height: 44.0,
                        },
                        children: Vec::new(),
                    },
                );
                main_children.push(delete_id);
            }

            let backlinks_id = "page.backlinks.pill".to_string();
            let bl = state.backlinks_for(&doc_id);
            nodes.insert(
                backlinks_id.clone(),
                AccessibilityNode {
                    id: backlinks_id.clone(),
                    role: AccessibilityRole::Button,
                    name: strings.backlinks_pill_label(
                        locale,
                        bl.items.len(),
                        bl.completeness == affine_client::BacklinkCompleteness::Ready,
                    ),
                    value: None,
                    state: AccessibilityState {
                        expanded: Some(state.active_sheet == MobileSheet::Backlinks),
                        ..AccessibilityState::default()
                    },
                    focused: false,
                    bounds: AccessibilityBounds {
                        x: content_left + 16.0,
                        y: safe_top + 108.0,
                        width: (content_w - 32.0).max(44.0),
                        height: 44.0,
                    },
                    children: Vec::new(),
                },
            );
            main_children.push(backlinks_id);
        }
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
            value: Some(state.active_workspace().name.clone()),
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
