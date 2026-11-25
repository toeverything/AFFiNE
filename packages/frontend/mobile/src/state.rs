//! Deterministic mobile shell application state, isolated multi-workspace data slices,
//! 10-group settings, and `MobileBackCoordinator`.

use std::{collections::BTreeMap, ops::Range};

use affine_client::{
    BacklinksResult, BreadcrumbAction, BreadcrumbDerivation, DirectKind, DocMetaSnapshot,
    FolderForestCache, FolderForestState, LinkGraph, LocationChoice, NavHistory, NavTarget, Origin,
    Scope, SearchDocument, SearchHit, WeightedSearchEngine, WorkspaceBreadcrumbSnapshot,
    nav::breadcrumb,
};
use affine_store::workspace_db::FolderRow;
use serde::{Deserialize, Serialize};
use ui_kit::{MicroIconKind, Sheet};
use ui_tokens::ThemeMode;

use crate::strings::MobileLocale;

/// Top-level bottom tab bar slots (4-TabBar).
#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MobileTab {
    Home,
    Explorer,
    Journals,
    Search,
}

impl MobileTab {
    pub const ALL: [Self; 4] = [Self::Home, Self::Explorer, Self::Journals, Self::Search];

    pub const fn micro_icon(self) -> MicroIconKind {
        match self {
            Self::Home => MicroIconKind::Home,
            Self::Explorer => MicroIconKind::Explorer,
            Self::Journals => MicroIconKind::Journals,
            Self::Search => MicroIconKind::Search,
        }
    }

    pub const fn id(self) -> &'static str {
        match self {
            Self::Home => "mobile.tab.home",
            Self::Explorer => "mobile.tab.explorer",
            Self::Journals => "mobile.tab.journals",
            Self::Search => "mobile.tab.search",
        }
    }
}

/// Active screen route in the mobile shell.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MobileRoute {
    Home,
    Explorer,
    Journals,
    Search,
    Page(String),
    Settings,
}

/// Active modal bottom sheet presented above the mobile shell.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MobileSheet {
    None,
    WorkspaceSelector,
    LocationAndTrail,
    Backlinks,
}

/// Appearance mode preference in Settings.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ThemePreference {
    Light,
    Dark,
    System,
}

impl ThemePreference {
    pub const fn resolve(self, system_dark: bool) -> ThemeMode {
        match self {
            Self::Light => ThemeMode::Light,
            Self::Dark => ThemeMode::Dark,
            Self::System if system_dark => ThemeMode::Dark,
            Self::System => ThemeMode::Light,
        }
    }
}

/// The 10 mobile settings sections (Experimental intentionally omits `enable_editor_rtl`).
#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash)]
pub enum SettingsGroupId {
    Account,
    Workspace,
    Appearance,
    Language,
    Editor,
    SyncOffline,
    Storage,
    Notifications,
    Experimental,
    About,
}

impl SettingsGroupId {
    pub const ALL: [Self; 10] = [
        Self::Account,
        Self::Workspace,
        Self::Appearance,
        Self::Language,
        Self::Editor,
        Self::SyncOffline,
        Self::Storage,
        Self::Notifications,
        Self::Experimental,
        Self::About,
    ];
}

/// Full 10-group mobile settings model.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SettingsState {
    pub account_email: String,
    pub account_plan: String,
    pub theme_preference: ThemePreference,
    pub locale: MobileLocale,
    pub editor_font_scale_pct: u16,
    pub spell_check: bool,
    pub offline_sync_enabled: bool,
    pub cache_size_mb: u32,
    pub push_notifications: bool,
    pub experimental_flags: Vec<(&'static str, bool)>,
    pub app_version: &'static str,
}

impl Default for SettingsState {
    fn default() -> Self {
        Self {
            account_email: String::new(),
            account_plan: "Free".to_string(),
            theme_preference: ThemePreference::Light,
            locale: MobileLocale::En,
            editor_font_scale_pct: 100,
            spell_check: true,
            offline_sync_enabled: true,
            cache_size_mb: 0,
            push_notifications: true,
            // Controlled difference #5: `enable_editor_rtl` is NEVER exposed here.
            experimental_flags: vec![
                ("enable_mobile_keyboard_toolbar", true),
                ("enable_pdf_embed_preview", true),
            ],
            app_version: "0.27.5",
        }
    }
}

/// Workspace item shown in `WorkspaceSelector`.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WorkspaceSummary {
    pub id: String,
    pub name: String,
    pub doc_count: usize,
    pub is_cloud: bool,
}

/// Named collection with explicit member document IDs.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MobileCollection {
    pub id: String,
    pub name: String,
    pub doc_ids: Vec<String>,
}

/// Isolated per-workspace data slice swapped on `select_workspace`.
#[derive(Clone, Debug)]
pub struct WorkspaceData {
    pub summary: WorkspaceSummary,
    pub scope: Scope,
    pub folders_resolved: bool,
    pub folder_rows: Vec<FolderRow>,
    pub folder_revision: u64,
    pub folder_cache: FolderForestCache,
    pub docs: Vec<MobileDocRecord>,
    pub collections: Vec<MobileCollection>,
    pub tags: Vec<(String, String)>,
    pub link_graph: LinkGraph,
    pub workspace_index_seeded: bool,
    pub history: NavHistory,
}

/// Document record stored in the mobile shell view model.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MobileDocRecord {
    pub id: String,
    pub title: String,
    pub body_preview: String,
    pub tags: Vec<String>,
    pub updated_at_ms: i64,
    pub is_favorite: bool,
    pub trashed: bool,
    pub journal_date: Option<String>,
    pub clock: u64,
}

/// Result of dispatching a platform back gesture through [`MobileBackCoordinator`].
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum BackOutcome {
    ClosedSheet(MobileSheet),
    ClearedPageOverlay,
    NavigatedBack,
    YieldToHostExit,
}

/// Priority back-gesture coordinator:
/// 1. Dismiss open bottom sheet (`LocationAndTrail` / `Backlinks` / `WorkspaceSelector`).
/// 2. Dismiss in-page overlay or text selection.
/// 3. Step backward through `NavHistory::back()`.
/// 4. Yield to host platform to exit/background the app.
pub struct MobileBackCoordinator;

impl MobileBackCoordinator {
    pub fn handle_back(state: &mut MobileAppState, now_ms: f64) -> BackOutcome {
        if state.active_sheet != MobileSheet::None {
            let closed = state.active_sheet;
            state.close_sheet(now_ms);
            return BackOutcome::ClosedSheet(closed);
        }
        if state.page_overlay_active {
            state.page_overlay_active = false;
            return BackOutcome::ClearedPageOverlay;
        }
        if state.history.can_back() {
            state.history.back();
            state.sync_route_from_history();
            return BackOutcome::NavigatedBack;
        }
        BackOutcome::YieldToHostExit
    }
}

/// Complete deterministic state of the L4 mobile shell.
pub struct MobileAppState {
    pub scope: Scope,
    pub workspaces: Vec<WorkspaceSummary>,
    pub workspace_store: Vec<WorkspaceData>,
    pub active_workspace_idx: usize,
    pub active_tab: MobileTab,
    pub route: MobileRoute,
    pub active_sheet: MobileSheet,
    /// Retains the sheet kind while its closing transition finishes so content never flashes empty.
    pub closing_sheet: Option<MobileSheet>,
    /// Accessibility node ID of the control that opened the active sheet (restored on close).
    pub sheet_trigger_a11y_id: Option<String>,
    /// Active semantic focus target exported into `AccessibilityTree`.
    pub focused_a11y_id: Option<String>,
    pub sheet_motion: Sheet,
    pub tab_anim_start_ms: f64,
    pub page_overlay_active: bool,
    pub today_date: String,
    pub search_query: String,
    pub search_selection: Range<usize>,
    pub search_preedit: Option<Range<usize>>,
    pub search_engine: WeightedSearchEngine,
    pub settings: SettingsState,
    pub history: NavHistory,
    pub folders_resolved: bool,
    pub folder_rows: Vec<FolderRow>,
    pub folder_revision: u64,
    pub folder_cache: FolderForestCache,
    pub docs: Vec<MobileDocRecord>,
    pub collections: Vec<MobileCollection>,
    pub tags: Vec<(String, String)>,
    pub link_graph: LinkGraph,
    pub workspace_index_seeded: bool,
    pub system_dark: bool,
    pub font_scale: f32,
}

impl MobileAppState {
    pub fn resolved_theme(&self) -> ThemeMode {
        self.settings.theme_preference.resolve(self.system_dark)
    }

    pub fn locale(&self) -> MobileLocale {
        self.settings.locale
    }

    pub fn active_workspace(&self) -> &WorkspaceSummary {
        &self.workspaces[self.active_workspace_idx]
    }

    /// Switch to workspace `idx`, saving the outgoing workspace's isolated state and loading
    /// the incoming workspace's `scope`, `docs`, `folder_rows`, `link_graph`, and `history`.
    pub fn select_workspace(&mut self, idx: usize, now_ms: f64) {
        if idx >= self.workspace_store.len() || idx == self.active_workspace_idx {
            self.close_sheet(now_ms);
            return;
        }
        // Persist outgoing workspace slice.
        if let Some(prev) = self.workspace_store.get_mut(self.active_workspace_idx) {
            prev.scope = self.scope.clone();
            prev.folders_resolved = self.folders_resolved;
            prev.folder_rows = self.folder_rows.clone();
            prev.folder_revision = self.folder_revision;
            prev.docs = self.docs.clone();
            prev.collections = self.collections.clone();
            prev.tags = self.tags.clone();
            prev.link_graph = self.link_graph.clone();
            prev.workspace_index_seeded = self.workspace_index_seeded;
            prev.history = self.history.clone();
        }
        // Load incoming workspace slice.
        self.active_workspace_idx = idx;
        let next = self.workspace_store[idx].clone();
        self.scope = next.scope;
        self.folders_resolved = next.folders_resolved;
        self.folder_rows = next.folder_rows;
        self.folder_revision = next.folder_revision;
        self.folder_cache = FolderForestCache::new();
        self.docs = next.docs;
        self.collections = next.collections;
        self.tags = next.tags;
        self.link_graph = next.link_graph;
        self.workspace_index_seeded = next.workspace_index_seeded;
        self.history = next.history;
        self.search_query.clear();
        self.search_selection = 0..0;
        self.search_preedit = None;
        self.page_overlay_active = false;
        self.sync_route_from_history();
        self.close_sheet(now_ms);
    }

    /// Navigate backward to `parent_target` by popping the stack when `parent_target` is
    /// immediately behind the current entry (or replacing in-place when entered deeply),
    /// never pushing a duplicate entry onto `history`.
    pub fn navigate_back_or_replace(&mut self, parent_target: NavTarget, now_ms: f64) {
        if self.active_sheet != MobileSheet::None {
            self.close_sheet(now_ms);
            return;
        }
        if self
            .history
            .peek_back()
            .is_some_and(|prev| prev.target == parent_target && prev.scope == self.scope)
        {
            self.history.pop_back();
            self.sync_route_from_history();
        } else {
            self.history.replace_current(
                self.scope.clone(),
                parent_target,
                Origin::Direct(DirectKind::AllDocs),
                None,
            );
            self.sync_route_from_history();
        }
    }

    /// True while any sheet or tab micro-icon transition is mid-flight at `now_ms`.
    pub fn has_active_animation(&self, now_ms: f64) -> bool {
        let snap = self.sheet_motion.snapshot_at(now_ms);
        let sheet_animating = snap.is_open
            && ((self.active_sheet != MobileSheet::None && snap.progress < 1.0 - 1e-4)
                || (self.active_sheet == MobileSheet::None && snap.progress > 1e-4));
        let tab_animating = self.tab_anim_start_ms > 0.0
            && now_ms >= self.tab_anim_start_ms
            && (now_ms - self.tab_anim_start_ms) < 280.0;
        sheet_animating || tab_animating
    }

    /// Push `target` onto `history` unless it already sits at the top of the active scope.
    pub fn navigate_target(&mut self, target: NavTarget, origin: Origin) {
        if self
            .history
            .current()
            .is_some_and(|cur| cur.target == target && cur.scope == self.scope)
        {
            self.sync_route_from_history();
            return;
        }
        self.history.push(self.scope.clone(), target, origin, None);
        self.sync_route_from_history();
    }

    pub fn switch_tab(&mut self, tab: MobileTab, now_ms: f64) {
        self.active_tab = tab;
        self.tab_anim_start_ms = now_ms;
        let target = match tab {
            MobileTab::Home => NavTarget::Home,
            MobileTab::Explorer => NavTarget::AllDocs,
            MobileTab::Journals => NavTarget::Journals,
            MobileTab::Search => NavTarget::Search,
        };
        self.route = match tab {
            MobileTab::Home => MobileRoute::Home,
            MobileTab::Explorer => MobileRoute::Explorer,
            MobileTab::Journals => MobileRoute::Journals,
            MobileTab::Search => MobileRoute::Search,
        };
        let already_same_root = self
            .history
            .current()
            .is_some_and(|e| e.target == target && e.scope == self.scope);
        if already_same_root {
            return;
        }
        // Switching between top-level root tabs resets the root entry instead of piling up
        // unbounded duplicate tab history when at the root level.
        let at_single_root = self.history.len() <= 1
            && self.history.current().is_some_and(|e| {
                matches!(
                    e.target,
                    NavTarget::Home | NavTarget::AllDocs | NavTarget::Journals | NavTarget::Search
                )
            });
        if at_single_root {
            self.history = NavHistory::new();
        }
        self.history.push(
            self.scope.clone(),
            target,
            Origin::Direct(DirectKind::Home),
            None,
        );
    }

    pub fn open_doc(&mut self, doc_id: &str, origin: Origin) {
        self.navigate_target(NavTarget::Doc(doc_id.to_string()), origin);
    }

    pub fn open_settings(&mut self) {
        self.navigate_target(NavTarget::Settings, Origin::Direct(DirectKind::Home));
    }

    pub fn open_sheet(&mut self, sheet: MobileSheet, now_ms: f64) {
        self.open_sheet_from(sheet, None, now_ms);
    }

    pub fn open_sheet_from(
        &mut self,
        sheet: MobileSheet,
        trigger_a11y_id: Option<&str>,
        now_ms: f64,
    ) {
        self.active_sheet = sheet;
        self.closing_sheet = None;
        self.sheet_trigger_a11y_id = trigger_a11y_id.map(str::to_string);
        self.focused_a11y_id = Some("app.sheet.dialog".to_string());
        self.sheet_motion.open(now_ms);
    }

    pub fn close_sheet(&mut self, now_ms: f64) {
        if self.active_sheet != MobileSheet::None {
            self.closing_sheet = Some(self.active_sheet);
            self.active_sheet = MobileSheet::None;
            self.focused_a11y_id = self.sheet_trigger_a11y_id.take();
            self.sheet_motion.close(now_ms);
        }
    }

    pub fn settle_animations(&mut self, now_ms: f64) {
        self.sheet_motion.settle(now_ms);
        if !self.sheet_motion.snapshot_at(now_ms).is_open {
            self.closing_sheet = None;
        }
    }

    pub fn pick_location(&mut self, seq: u64, choice: Option<LocationChoice>, now_ms: f64) {
        self.history.pick_location(seq, choice);
        self.close_sheet(now_ms);
    }

    pub fn click_breadcrumb(&mut self, action: &BreadcrumbAction, now_ms: f64) {
        self.click_breadcrumb_from(action, None, now_ms);
    }

    pub fn click_breadcrumb_from(
        &mut self,
        action: &BreadcrumbAction,
        trigger_a11y_id: Option<&str>,
        now_ms: f64,
    ) {
        match action {
            BreadcrumbAction::OpenLocationSheet { owner_seq } => {
                let fallback = format!("breadcrumb.slot.switcher:{owner_seq}");
                let trigger = trigger_a11y_id.unwrap_or(&fallback);
                self.open_sheet_from(MobileSheet::LocationAndTrail, Some(trigger), now_ms);
            }
            _ => {
                if self
                    .history
                    .click_breadcrumb_ancestor(action, self.scope.clone())
                    .is_some()
                {
                    self.sync_route_from_history();
                }
            }
        }
    }

    pub fn sync_route_from_history(&mut self) {
        let Some(entry) = self.history.current() else {
            return;
        };
        match &entry.target {
            NavTarget::Home => {
                self.active_tab = MobileTab::Home;
                self.route = MobileRoute::Home;
            }
            NavTarget::AllDocs
            | NavTarget::Folder(_)
            | NavTarget::Collection(_)
            | NavTarget::Tag(_)
            | NavTarget::Trash => {
                self.active_tab = MobileTab::Explorer;
                self.route = MobileRoute::Explorer;
            }
            NavTarget::Journals => {
                self.active_tab = MobileTab::Journals;
                self.route = MobileRoute::Journals;
            }
            NavTarget::Search => {
                self.active_tab = MobileTab::Search;
                self.route = MobileRoute::Search;
            }
            NavTarget::Doc(id) => {
                self.route = MobileRoute::Page(id.clone());
            }
            NavTarget::Settings => {
                self.route = MobileRoute::Settings;
            }
        }
    }

    pub fn breadcrumb_snapshot(&mut self) -> WorkspaceBreadcrumbSnapshot {
        let forest = self.folder_cache.resolve(
            self.folders_resolved,
            self.folder_revision,
            &self.folder_rows,
        );
        let docs = self
            .docs
            .iter()
            .map(|d| {
                (
                    d.id.clone(),
                    DocMetaSnapshot {
                        title: d.title.clone(),
                        trashed: d.trashed,
                        journal_date: d.journal_date.clone(),
                        revoked_or_deleted: false,
                    },
                )
            })
            .collect();
        WorkspaceBreadcrumbSnapshot {
            folders_resolved: self.folders_resolved,
            forest,
            docs,
            collections: self
                .collections
                .iter()
                .map(|c| (c.id.clone(), c.name.clone()))
                .collect(),
            tags: self.tags.iter().cloned().collect(),
        }
    }

    pub fn derive_breadcrumb(&mut self) -> BreadcrumbDerivation {
        let snapshot = self.breadcrumb_snapshot();
        breadcrumb::derive(&self.history, &snapshot)
    }

    pub fn backlinks_for(&self, doc_id: &str) -> BacklinksResult {
        let live_clocks: BTreeMap<String, u64> = self
            .docs
            .iter()
            .filter(|d| !d.trashed)
            .map(|d| (d.id.clone(), d.clock))
            .collect();
        self.link_graph
            .backlinks(doc_id, &live_clocks, self.workspace_index_seeded, None)
    }

    pub fn search_hits(&self) -> Vec<SearchHit> {
        let docs: Vec<SearchDocument> = self
            .docs
            .iter()
            .filter(|d| !d.trashed)
            .map(|d| SearchDocument {
                id: d.id.clone(),
                title: d.title.clone(),
                tags: d.tags.clone(),
                body_preview: d.body_preview.clone(),
                updated_at_ms: d.updated_at_ms,
            })
            .collect();
        self.search_engine.search(&docs, &self.search_query, 20)
    }

    pub fn doc_by_id(&self, id: &str) -> Option<&MobileDocRecord> {
        self.docs.iter().find(|d| d.id == id)
    }

    pub fn forest_state(&mut self) -> FolderForestState {
        self.folder_cache.resolve(
            self.folders_resolved,
            self.folder_revision,
            &self.folder_rows,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::showcase::seed_showcase_state;

    #[test]
    fn back_coordinator_follows_strict_consumption_priority() {
        let mut state = seed_showcase_state(MobileLocale::En, ThemeMode::Light, "2026-11-25");
        state.open_doc("doc-arch", Origin::Direct(DirectKind::Home));
        state.page_overlay_active = true;
        state.open_sheet(MobileSheet::LocationAndTrail, 100.0);

        assert_eq!(
            MobileBackCoordinator::handle_back(&mut state, 120.0),
            BackOutcome::ClosedSheet(MobileSheet::LocationAndTrail)
        );
        assert_eq!(
            MobileBackCoordinator::handle_back(&mut state, 140.0),
            BackOutcome::ClearedPageOverlay
        );
        assert_eq!(
            MobileBackCoordinator::handle_back(&mut state, 160.0),
            BackOutcome::NavigatedBack
        );
        assert_eq!(state.route, MobileRoute::Home);
        assert_eq!(
            MobileBackCoordinator::handle_back(&mut state, 180.0),
            BackOutcome::YieldToHostExit
        );
    }

    #[test]
    fn settings_has_10_groups_clean_defaults_and_never_exposes_enable_editor_rtl() {
        let settings = SettingsState::default();
        assert_eq!(SettingsGroupId::ALL.len(), 10);
        assert_eq!(settings.app_version, "0.27.5");
        assert!(settings.account_email.is_empty());
        assert_eq!(settings.account_plan, "Free");
        assert!(
            !settings
                .experimental_flags
                .iter()
                .any(|(k, _)| *k == "enable_editor_rtl")
        );
    }

    #[test]
    fn switching_workspaces_isolates_docs_backlinks_and_history() {
        let mut state = seed_showcase_state(MobileLocale::En, ThemeMode::Light, "2026-11-25");
        state.open_doc("doc-arch", Origin::Direct(DirectKind::Home));
        assert_eq!(state.scope.workspace_id, "ws-mobile-rust");
        assert_eq!(state.backlinks_for("doc-arch").items.len(), 2);

        state.select_workspace(1, 50.0);
        assert_eq!(state.scope.workspace_id, "ws-personal");
        assert!(state.doc_by_id("doc-arch").is_none());
        assert!(state.doc_by_id("doc-personal-1").is_some());
        assert_eq!(state.backlinks_for("doc-personal-1").items.len(), 1);
        assert_eq!(state.route, MobileRoute::Home);
        assert_eq!(
            MobileBackCoordinator::handle_back(&mut state, 60.0),
            BackOutcome::YieldToHostExit
        );
    }
}
