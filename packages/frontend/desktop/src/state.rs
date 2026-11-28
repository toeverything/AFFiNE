//! Complete deterministic state for the AFFiNE Desktop shell (`DesktopAppState`).

use affine_client::Scope;
use affine_store::directory::DocMode;
use ui_tokens::ThemeMode;

use crate::{
    doc_store::DesktopDocStore,
    draft_store::{ComposerDraftStore, DesktopDraftBackend, MemoryDraftBackend},
    peek_view::{PeekAction, PeekViewState},
    quick_search::{QuickCommandId, QuickSearchItem, QuickSearchState},
    sidebar::SidebarState,
    split_view::{DesktopRoute, DocViewMode, SplitLayout},
};

/// Active tab of the right docked Document Info / Outline inspector.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DocInspectorTab {
    Outline,
    Info,
}

/// Active top-level modal overlay.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DesktopModal {
    Settings,
}

/// Three-state desktop appearance preference (`System` / `Light` / `Dark`).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum ThemePreference {
    #[default]
    System,
    Light,
    Dark,
}

impl ThemePreference {
    pub const fn resolve(self, system_dark: bool) -> ThemeMode {
        match self {
            Self::System => {
                if system_dark {
                    ThemeMode::Dark
                } else {
                    ThemeMode::Light
                }
            }
            Self::Light => ThemeMode::Light,
            Self::Dark => ThemeMode::Dark,
        }
    }
}

/// Complete deterministic state of the AFFiNE Desktop shell.
pub struct DesktopAppState {
    pub theme: ThemeMode,
    pub theme_preference: ThemePreference,
    pub system_dark: bool,
    pub today_date: String,
    pub logical_clock_ms: i64,
    pub store: DesktopDocStore,
    pub draft_store: ComposerDraftStore<DesktopDraftBackend>,
    /// Populated when an on-disk workspace's isolated draft directory failed to initialize.
    pub draft_store_error: Option<String>,
    pub sidebar: SidebarState,
    pub split: SplitLayout,
    pub quick_search: QuickSearchState,
    pub peek_view: PeekViewState,
    pub inspector_tab: Option<DocInspectorTab>,
    pub modal: Option<DesktopModal>,
    pub settings_scroll_y: f32,
}

impl DesktopAppState {
    /// Seed a deterministic showcase desktop workspace ready for interactive use or offscreen rendering.
    pub fn seed_showcase(theme: ThemeMode, today_date: &str) -> Self {
        let store = DesktopDocStore::seed_showcase(today_date);
        let mut state = Self::from_doc_store_in_memory(store, theme, today_date);
        let ws_id = state.store.active_workspace().id.clone();
        let target_doc = state.store.visible_docs().first().map(|d| d.id.clone());
        let _ = state.draft_store.upsert_draft(
            "draft-welcome",
            ws_id,
            target_doc,
            "Local scratchpad draft",
            "Physically isolated from <spaceId>.db until explicitly published.",
            1_764_300_950,
        );
        let _ = state.draft_store.attach_bytes(
            "draft-welcome",
            "diagram.png",
            "image/png",
            b"affine-desktop-draft-blob-v1",
            1_764_300_951,
        );
        state
    }

    /// Construct a desktop shell state from any [`DesktopDocStore`].
    ///
    /// For on-disk SQLite workspaces (native targets), unpublished drafts are persisted via
    /// [`crate::draft_store::DiskDraftBackend`] in a physically isolated sibling directory
    /// outside `<spaceId>.db` / `.affine`. If disk draft directory validation or initialization
    /// fails, mounts [`DesktopDraftBackend::Unavailable`] and records [`Self::draft_store_error`]
    /// so subsequent draft saves truthfully return `Err` instead of silently falling back to RAM.
    /// Pure in-memory stores use `MemoryDraftBackend`.
    pub fn from_doc_store(store: DesktopDocStore, theme: ThemeMode, today_date: &str) -> Self {
        #[cfg(not(target_family = "wasm"))]
        if let Some(b) = store.sqlite_backing.as_ref() {
            let open_res: crate::draft_store::DraftStoreResult<
                ComposerDraftStore<DesktopDraftBackend>,
            > = crate::draft_store::validate_workspace_segment(&b.space_id).and_then(|()| {
                let draft_dir = b
                    .path
                    .parent()
                    .unwrap_or_else(|| std::path::Path::new("."))
                    .join(".affine-desktop-drafts")
                    .join(&b.space_id);
                let backend = crate::draft_store::DiskDraftBackend::open(&draft_dir)?;
                ComposerDraftStore::open(DesktopDraftBackend::Disk(backend))
            });
            return match open_res {
                Ok(draft_store) => {
                    Self::from_doc_store_and_drafts(store, draft_store, None, theme, today_date)
                }
                Err(err) => {
                    let reason = err.to_string();
                    let unavailable = DesktopDraftBackend::Unavailable {
                        namespace: "unavailable://affine-desktop-composer-drafts".to_string(),
                        reason: reason.clone(),
                    };
                    let draft_store = ComposerDraftStore::open(unavailable)
                        .expect("Unavailable backend load_snapshot is infallible");
                    Self::from_doc_store_and_drafts(
                        store,
                        draft_store,
                        Some(reason),
                        theme,
                        today_date,
                    )
                }
            };
        }
        Self::from_doc_store_in_memory(store, theme, today_date)
    }

    /// Construct a desktop shell state backed by a persistent [`crate::draft_store::DiskDraftBackend`].
    #[cfg(not(target_family = "wasm"))]
    pub fn from_doc_store_with_draft_dir(
        store: DesktopDocStore,
        draft_dir: impl Into<std::path::PathBuf>,
        theme: ThemeMode,
        today_date: &str,
    ) -> crate::draft_store::DraftStoreResult<Self> {
        let backend = crate::draft_store::DiskDraftBackend::open(draft_dir)?;
        let draft_store = ComposerDraftStore::open(DesktopDraftBackend::Disk(backend))?;
        Ok(Self::from_doc_store_and_drafts(
            store,
            draft_store,
            None,
            theme,
            today_date,
        ))
    }

    /// Construct a desktop shell state with a pure in-memory draft store (tests / read-only inspection / wasm32).
    pub fn from_doc_store_in_memory(
        store: DesktopDocStore,
        theme: ThemeMode,
        today_date: &str,
    ) -> Self {
        let backend = MemoryDraftBackend::new("local://affine-desktop-composer-drafts")
            .expect("isolated local draft store");
        let draft_store = ComposerDraftStore::open(DesktopDraftBackend::Memory(backend))
            .expect("open in-memory draft store");
        Self::from_doc_store_and_drafts(store, draft_store, None, theme, today_date)
    }

    fn from_doc_store_and_drafts(
        store: DesktopDocStore,
        draft_store: ComposerDraftStore<DesktopDraftBackend>,
        draft_store_error: Option<String>,
        theme: ThemeMode,
        today_date: &str,
    ) -> Self {
        let scope = Scope::new(
            "local-user",
            "https://app.affine.pro",
            &store.active_workspace().id,
        );
        let initial_route = if store.get_doc("doc-arch").is_some() {
            DesktopRoute::Doc("doc-arch".into())
        } else if let Some(first) = store.visible_docs().first() {
            DesktopRoute::Doc(first.id.clone())
        } else {
            DesktopRoute::AllDocs
        };
        let split = SplitLayout::single(scope, initial_route, DocViewMode::Page);
        let theme_preference = match theme {
            ThemeMode::Light => ThemePreference::Light,
            ThemeMode::Dark => ThemePreference::Dark,
        };

        Self {
            theme,
            theme_preference,
            system_dark: theme == ThemeMode::Dark,
            today_date: today_date.to_string(),
            logical_clock_ms: 1_764_301_000,
            store,
            draft_store,
            draft_store_error,
            sidebar: SidebarState::default(),
            split,
            quick_search: QuickSearchState::default(),
            peek_view: PeekViewState::default(),
            inspector_tab: None,
            modal: None,
            settings_scroll_y: 0.0,
        }
    }

    pub fn set_theme_preference(&mut self, pref: ThemePreference) {
        self.theme_preference = pref;
        self.theme = pref.resolve(self.system_dark);
    }

    fn current_scope(&self) -> Scope {
        Scope::new(
            "local-user",
            "https://app.affine.pro",
            &self.store.active_workspace().id,
        )
    }

    fn tick_ms(&mut self) -> i64 {
        self.logical_clock_ms += 10;
        self.logical_clock_ms
    }

    pub fn toggle_theme(&mut self) {
        self.theme = match self.theme {
            ThemeMode::Light => ThemeMode::Dark,
            ThemeMode::Dark => ThemeMode::Light,
        };
        self.theme_preference = match self.theme {
            ThemeMode::Light => ThemePreference::Light,
            ThemeMode::Dark => ThemePreference::Dark,
        };
    }

    /// Resolve the best target document for the topbar `Peek` action without hardcoding IDs.
    pub fn resolve_peek_target(&self) -> Option<String> {
        self.split
            .active()
            .active_route()
            .doc_id()
            .and_then(|id| self.store.get_doc(id))
            .and_then(|entry| {
                entry
                    .meta
                    .outgoing_refs
                    .first()
                    .cloned()
                    .or_else(|| Some(entry.meta.id.clone()))
            })
            .or_else(|| self.store.visible_docs().first().map(|d| d.id.clone()))
    }

    pub fn navigate_active_pane(&mut self, route: DesktopRoute) {
        let scope = self.current_scope();
        let mode = match &route {
            DesktopRoute::Doc(id) => self.store.get_doc(id).map(|e| match e.meta.default_mode {
                DocMode::Page => DocViewMode::Page,
                DocMode::Edgeless => DocViewMode::Edgeless,
            }),
            _ => None,
        };
        self.split.active_mut().navigate(scope, route, mode);
    }

    pub fn open_doc_in_active_pane(&mut self, doc_id: &str) {
        let scope = self.current_scope();
        let mode =
            self.store
                .get_doc(doc_id)
                .map_or(DocViewMode::Page, |e| match e.meta.default_mode {
                    DocMode::Page => DocViewMode::Page,
                    DocMode::Edgeless => DocViewMode::Edgeless,
                });
        self.split
            .active_mut()
            .open_tab(scope, DesktopRoute::Doc(doc_id.to_string()), mode);
    }

    pub fn open_doc_in_split(&mut self, doc_id: &str) {
        let scope = self.current_scope();
        let mode =
            self.store
                .get_doc(doc_id)
                .map_or(DocViewMode::Page, |e| match e.meta.default_mode {
                    DocMode::Page => DocViewMode::Page,
                    DocMode::Edgeless => DocViewMode::Edgeless,
                });
        self.split
            .open_in_split(scope, DesktopRoute::Doc(doc_id.to_string()), mode);
    }

    pub fn open_split_edgeless_for_active_doc(&mut self) {
        let scope = self.current_scope();
        self.split.split_active_doc_opposite_mode(scope);
    }

    pub fn create_new_doc(&mut self, mode: DocMode) -> String {
        let now = self.tick_ms();
        let title = match mode {
            DocMode::Page => format!("Untitled Page {}", self.store.docs.len() + 1),
            DocMode::Edgeless => format!("Untitled Board {}", self.store.docs.len() + 1),
        };
        let id = self.store.create_doc(title, mode, None, now);
        self.open_doc_in_active_pane(&id);
        id
    }

    pub fn open_today_journal(&mut self) -> String {
        let now = self.tick_ms();
        let date = self.today_date.clone();
        let id = self.store.open_or_create_journal(&date, now);
        self.open_doc_in_active_pane(&id);
        id
    }

    pub fn create_folder(&mut self, name: &str, parent_id: Option<String>) -> String {
        let id = self.store.create_folder(name, parent_id);
        self.sidebar.expanded_folders.insert(id.clone());
        id
    }

    pub fn trash_doc(&mut self, doc_id: &str) -> bool {
        let now = self.tick_ms();
        self.store.trash_doc(doc_id, now)
    }

    pub fn restore_doc(&mut self, doc_id: &str) -> bool {
        let now = self.tick_ms();
        self.store.restore_doc(doc_id, now)
    }

    pub fn permanently_delete_doc(&mut self, doc_id: &str) -> bool {
        self.store.permanently_delete_doc(doc_id)
    }

    pub fn open_quick_search(&mut self) {
        self.modal = None;
        self.peek_view.close();
        self.quick_search.open();
    }

    pub fn open_peek_view(&mut self, target_doc_id: &str) {
        self.modal = None;
        self.quick_search.close();
        let source = self
            .split
            .active()
            .active_route()
            .doc_id()
            .map(ToOwned::to_owned);
        self.peek_view.open(target_doc_id, source);
    }

    pub fn apply_peek_action(&mut self, action: PeekAction) {
        let target = self.peek_view.doc_id.clone();
        self.peek_view.close();
        if let Some(doc_id) = target {
            match action {
                PeekAction::OpenInCurrentPane => self.open_doc_in_active_pane(&doc_id),
                PeekAction::OpenInSplitView => self.open_doc_in_split(&doc_id),
                PeekAction::Close => {}
            }
        }
    }

    pub fn open_settings(&mut self) {
        self.quick_search.close();
        self.peek_view.close();
        self.modal = Some(DesktopModal::Settings);
    }

    pub fn close_modal(&mut self) {
        self.modal = None;
    }

    pub fn toggle_inspector(&mut self) {
        self.inspector_tab = match self.inspector_tab {
            Some(_) => None,
            None => Some(DocInspectorTab::Outline),
        };
    }

    pub fn execute_quick_command(&mut self, cmd: QuickCommandId) {
        match cmd {
            QuickCommandId::NewPage => {
                self.create_new_doc(DocMode::Page);
            }
            QuickCommandId::NewEdgeless => {
                self.create_new_doc(DocMode::Edgeless);
            }
            QuickCommandId::ToggleTheme => self.toggle_theme(),
            QuickCommandId::OpenTodayJournal => {
                self.open_today_journal();
            }
            QuickCommandId::ToggleSidebar => self.sidebar.toggle_open(),
            QuickCommandId::SplitView => self.open_split_edgeless_for_active_doc(),
        }
    }

    /// Execute the currently selected `QuickSearch` item (`open_in_split` corresponds to `Cmd+Enter`).
    pub fn confirm_quick_search(&mut self, open_in_split: bool) -> bool {
        if !self.quick_search.open {
            return false;
        }
        let items = self.quick_search.items(&self.store);
        let Some(item) = items.get(self.quick_search.selected_index).cloned() else {
            return false;
        };
        self.quick_search.close();
        match item {
            QuickSearchItem::Doc { doc_id, .. } => {
                if open_in_split {
                    self.open_doc_in_split(&doc_id);
                } else {
                    self.open_doc_in_active_pane(&doc_id);
                }
            }
            QuickSearchItem::Command(cmd) => self.execute_quick_command(cmd),
        }
        true
    }

    pub(crate) fn route_title(&self, route: &DesktopRoute) -> String {
        match route {
            DesktopRoute::Doc(id) => self
                .store
                .get_doc(id)
                .map(|e| e.meta.title.clone())
                .unwrap_or_else(|| "Untitled".to_string()),
            DesktopRoute::AllDocs => "All Docs".to_string(),
            DesktopRoute::Favorites => "Favorites".to_string(),
            DesktopRoute::Journals => "Journals".to_string(),
            DesktopRoute::Folder(id) => self
                .store
                .folder_rows
                .iter()
                .find(|r| r.id == *id)
                .map(|r| r.data.clone())
                .unwrap_or_else(|| "Folder".to_string()),
            DesktopRoute::Collection(id) => self
                .store
                .collections
                .iter()
                .find(|c| c.id == *id)
                .map(|c| c.name.clone())
                .unwrap_or_else(|| "Collection".to_string()),
            DesktopRoute::Tag(tag) => format!("#{tag}"),
            DesktopRoute::Trash => "Trash".to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sidebar_folder_crud_and_trash_lifecycle() {
        let mut state = DesktopAppState::seed_showcase(ThemeMode::Light, "2026-11-28");
        let folder_id = state.create_folder("Q4 Release", Some("f-eng".into()));
        assert!(state.store.docs_in_folder(&folder_id).is_empty());

        let doc_id = state.create_new_doc(DocMode::Page);
        state.store.move_doc_to_folder(&doc_id, Some(&folder_id));
        assert_eq!(state.store.docs_in_folder(&folder_id).len(), 1);
        assert!(state.store.remove_doc_from_folder(&doc_id, &folder_id));
        assert!(state.store.docs_in_folder(&folder_id).is_empty());

        // Trash -> Restore -> Trash -> Permanent Delete
        assert!(state.trash_doc(&doc_id));
        assert!(state.store.trashed_docs().iter().any(|d| d.id == doc_id));
        assert!(state.restore_doc(&doc_id));
        assert!(!state.store.trashed_docs().iter().any(|d| d.id == doc_id));
        assert!(state.trash_doc(&doc_id));
        assert!(state.permanently_delete_doc(&doc_id));
        assert!(state.store.get_doc(&doc_id).is_none());
    }

    #[test]
    fn split_view_shares_live_crdt_doc_across_page_and_edgeless_panes() {
        let mut state = DesktopAppState::seed_showcase(ThemeMode::Light, "2026-11-28");
        state.open_split_edgeless_for_active_doc();
        assert_eq!(state.split.panes.len(), 2);
        assert_eq!(state.split.panes[0].active_mode(), DocViewMode::Page);
        assert_eq!(state.split.panes[1].active_mode(), DocViewMode::Edgeless);
        assert_eq!(
            state.split.panes[0].active_route().doc_id(),
            Some("doc-arch")
        );
        assert_eq!(
            state.split.panes[1].active_route().doc_id(),
            Some("doc-arch")
        );

        let rev_before = state.store.get_doc("doc-arch").unwrap().revision;
        let block_id = state
            .store
            .append_paragraph(
                "doc-arch",
                "Live synced paragraph across split panes",
                1_764_302_000,
            )
            .expect("append paragraph");
        let live = state.store.get_doc("doc-arch").unwrap();
        assert!(live.revision > rev_before);
        let root = live.snapshot.root.as_ref().unwrap();
        assert!(root.walk().any(|n| n.id == block_id));
    }

    #[test]
    fn quick_search_and_peek_view_state_machines() {
        let mut state = DesktopAppState::seed_showcase(ThemeMode::Light, "2026-11-28");
        state.open_quick_search();
        assert!(state.quick_search.open);
        state.quick_search.set_query("Offline Sync");
        let items = state.quick_search.items(&state.store);
        assert!(matches!(
            items.first(),
            Some(QuickSearchItem::Doc { doc_id, .. }) if doc_id == "doc-sync"
        ));

        // Cmd+Enter opens matched document in right split pane.
        assert!(state.confirm_quick_search(true));
        assert!(!state.quick_search.open);
        assert_eq!(state.split.panes.len(), 2);
        assert_eq!(
            state.split.panes[1].active_route().doc_id(),
            Some("doc-sync")
        );

        // PeekView opens target doc and promotes to current pane cleanly.
        state.open_peek_view("doc-board");
        assert!(state.peek_view.is_open());
        assert_eq!(state.peek_view.doc_id.as_deref(), Some("doc-board"));
        state.apply_peek_action(PeekAction::OpenInCurrentPane);
        assert!(!state.peek_view.is_open());
        assert_eq!(
            state.split.active().active_route().doc_id(),
            Some("doc-board")
        );
    }

    #[test]
    fn theme_preference_three_states_and_large_workspace_search() {
        let mut state = DesktopAppState::seed_showcase(ThemeMode::Light, "2026-11-28");
        state.system_dark = true;
        state.set_theme_preference(ThemePreference::System);
        assert_eq!(state.theme, ThemeMode::Dark);
        state.set_theme_preference(ThemePreference::Light);
        assert_eq!(state.theme, ThemeMode::Light);
        state.set_theme_preference(ThemePreference::Dark);
        assert_eq!(state.theme, ThemeMode::Dark);

        for i in 0..165 {
            state.store.create_doc(
                format!("Bulk Spec Document {i:03}"),
                DocMode::Page,
                None,
                1_764_310_000 + i,
            );
        }
        assert!(state.store.visible_docs().len() >= 165);
        state.open_quick_search();
        state.quick_search.set_query("Bulk Spec Document 160");
        let items = state.quick_search.items(&state.store);
        assert!(items.iter().any(|item| matches!(
            item,
            QuickSearchItem::Doc { title, .. } if title == "Bulk Spec Document 160"
        )));

        // toggle_theme must stay synchronized with theme_preference.
        state.set_theme_preference(ThemePreference::Light);
        state.toggle_theme();
        assert_eq!(state.theme, ThemeMode::Dark);
        assert_eq!(state.theme_preference, ThemePreference::Dark);
        state.toggle_theme();
        assert_eq!(state.theme, ThemeMode::Light);
        assert_eq!(state.theme_preference, ThemePreference::Light);

        // External DesktopDocStore constructed via from_doc_store starts with zero synthetic drafts.
        let external = DesktopAppState::from_doc_store(
            DesktopDocStore::seed_showcase("2026-11-28"),
            ThemeMode::Light,
            "2026-11-28",
        );
        assert_eq!(external.draft_store.draft_count(), 0);
    }

    #[test]
    fn rename_doc_splices_real_nanoid_root_title_in_place() {
        let mut store = DesktopDocStore::seed_showcase("2026-11-28");
        let doc_id = "doc-nanoid-root";
        let mut session = blocksuite_playground_doc::session::PageDocSession::new(
            doc_id,
            blocksuite_playground_doc::client_id_from_seed(42),
        )
        .unwrap();
        session
            .add_block(
                "xK9mP2qR7v",
                blocksuite_playground_doc::schema::BlockSpec::Page {
                    title: "Initial Title".into(),
                },
                None,
                None,
                100,
            )
            .unwrap();
        let snap = session.read_page_snapshot().unwrap();
        let rev = session.revision();
        store.docs.insert(
            doc_id.into(),
            crate::doc_store::LiveDocEntry {
                meta: crate::doc_store::DesktopDocMeta {
                    id: doc_id.into(),
                    title: "Initial Title".into(),
                    summary: String::new(),
                    default_mode: DocMode::Page,
                    tags: Vec::new(),
                    is_favorite: false,
                    trashed: false,
                    journal_date: None,
                    updated_at_ms: 100,
                    outgoing_refs: Vec::new(),
                },
                session,
                note_id: String::new(),
                surface_id: String::new(),
                snapshot: snap,
                revision: rev,
                hydrated: true,
            },
        );

        assert!(store.rename_doc(doc_id, "Updated NanoID Title", 200));
        let updated = store.get_doc(doc_id).unwrap();
        assert_eq!(updated.meta.title, "Updated NanoID Title");
        let root = updated.snapshot.root.as_ref().unwrap();
        assert_eq!(root.id, "xK9mP2qR7v");
        match &root.content {
            blocksuite_playground_doc::read::BlockContent::Page { title } => {
                assert_eq!(title.plain, "Updated NanoID Title");
            }
            other => panic!("expected Page root block, got {other:?}"),
        }
    }

    #[test]
    fn switching_workspaces_isolates_docs_and_mutations() {
        let mut store = DesktopDocStore::seed_showcase("2026-11-28");
        assert_eq!(store.active_workspace_idx, 0);
        let original_title = store.get_doc("doc-arch").unwrap().meta.title.clone();

        // Switch to workspace 1 (Personal Notes) — must have its own isolated doc map.
        store.switch_workspace(1);
        assert_eq!(store.active_workspace_idx, 1);
        assert!(
            store.get_doc("doc-arch").is_none(),
            "workspace 1 must not share workspace 0's docs"
        );
        let b_id = store.create_doc("Workspace B Only", DocMode::Page, None, 1_764_330_000);
        assert!(store.rename_doc(&b_id, "Workspace B Renamed", 1_764_330_010));

        // Switch back to workspace 0 — completely unaffected.
        store.switch_workspace(0);
        assert_eq!(
            store.get_doc("doc-arch").unwrap().meta.title,
            original_title
        );
        assert!(store.get_doc(&b_id).is_none());

        // Switch back to workspace 1 — retains its own doc.
        store.switch_workspace(1);
        assert_eq!(
            store.get_doc(&b_id).unwrap().meta.title,
            "Workspace B Renamed"
        );
    }

    #[cfg(not(target_family = "wasm"))]
    #[test]
    fn disk_draft_backend_persists_draft_and_attachment_across_reopen() {
        let temp_root = std::env::temp_dir().join("affine-desktop-draft-persist-test");
        let _ = std::fs::remove_dir_all(&temp_root);
        let payload = b"persisted-desktop-attachment-bytes-v1";

        let hash = {
            let store = DesktopDocStore::seed_showcase("2026-11-28");
            let mut state = DesktopAppState::from_doc_store_with_draft_dir(
                store,
                &temp_root,
                ThemeMode::Light,
                "2026-11-28",
            )
            .unwrap();
            assert_eq!(state.draft_store.draft_count(), 0);
            state
                .draft_store
                .upsert_draft(
                    "draft-persisted",
                    "ws-1",
                    Some("doc-arch".into()),
                    "Persisted Draft Title",
                    "Body survives restart",
                    1_764_340_000,
                )
                .unwrap();
            let (hash, _) = state
                .draft_store
                .attach_bytes(
                    "draft-persisted",
                    "spec.png",
                    "image/png",
                    payload,
                    1_764_340_010,
                )
                .unwrap();
            hash
        };

        // Reopen a brand new DesktopAppState pointing at the same isolated draft directory.
        let store2 = DesktopDocStore::seed_showcase("2026-11-28");
        let reopened = DesktopAppState::from_doc_store_with_draft_dir(
            store2,
            &temp_root,
            ThemeMode::Light,
            "2026-11-28",
        )
        .unwrap();
        let draft = reopened.draft_store.get_draft("draft-persisted").unwrap();
        assert_eq!(draft.title, "Persisted Draft Title");
        assert_eq!(draft.body_markdown, "Body survives restart");
        assert_eq!(
            reopened
                .draft_store
                .read_attachment(&hash)
                .unwrap()
                .as_slice(),
            payload
        );
        let _ = std::fs::remove_dir_all(&temp_root);
    }

    #[cfg(not(target_family = "wasm"))]
    #[test]
    fn unwritable_disk_draft_dir_fails_closed_instead_of_falling_back_to_ram() {
        let temp_root = std::env::temp_dir().join("affine-desktop-unwritable-draft-test");
        let _ = std::fs::remove_dir_all(&temp_root);
        std::fs::create_dir_all(&temp_root).unwrap();
        // Create a regular file at `.affine-desktop-drafts` so `create_dir_all` fails reliably
        // regardless of OS permissions or root UID.
        std::fs::write(temp_root.join(".affine-desktop-drafts"), b"blocker").unwrap();

        let mut store = DesktopDocStore::seed_showcase("2026-11-28");
        store.sqlite_backing = Some(crate::sqlite_loader::SqliteLazyBacking {
            path: temp_root.join("sample.affine"),
            space_id: "ws-blocked".to_string(),
            blob_count: 0,
        });
        let mut state = DesktopAppState::from_doc_store(store, ThemeMode::Light, "2026-11-28");
        assert!(
            state.draft_store_error.is_some(),
            "failed disk draft dir init must expose draft_store_error"
        );
        let save_err = state.draft_store.upsert_draft(
            "d-1",
            "ws-blocked",
            None,
            "Must Fail",
            "Should not pretend to persist in RAM",
            1_764_350_000,
        );
        assert!(
            matches!(
                save_err,
                Err(crate::draft_store::DraftStoreError::Backend(_))
            ),
            "saving draft when disk draft dir failed to open must return Err, got {save_err:?}"
        );

        // Path-traversal and forbidden-DB-suffix space_ids must fail closed without panicking.
        for bad_space_id in ["../escape", "evil.db", "ws.affine"] {
            let mut store_bad = DesktopDocStore::seed_showcase("2026-11-28");
            store_bad.sqlite_backing = Some(crate::sqlite_loader::SqliteLazyBacking {
                path: temp_root.join("sample.affine"),
                space_id: bad_space_id.to_string(),
                blob_count: 0,
            });
            let mut state_bad =
                DesktopAppState::from_doc_store(store_bad, ThemeMode::Light, "2026-11-28");
            assert!(
                state_bad.draft_store_error.is_some(),
                "invalid space_id `{bad_space_id}` must expose draft_store_error"
            );
            assert!(
                state_bad
                    .draft_store
                    .upsert_draft("d-2", bad_space_id, None, "Bad", "Body", 1_764_350_001)
                    .is_err(),
                "saving draft for invalid space_id `{bad_space_id}` must return Err"
            );
        }
        let _ = std::fs::remove_dir_all(&temp_root);
    }

    #[cfg(not(target_family = "wasm"))]
    #[test]
    fn readonly_sqlite_reads_uncompacted_updates_and_never_swallows_hydration_errors() {
        let db_path = std::env::temp_dir().join("affine-desktop-uncompacted-ro-test.affine");
        let _ = std::fs::remove_file(&db_path);
        let _ = std::fs::remove_file(format!("{}-wal", db_path.display()));
        let _ = std::fs::remove_file(format!("{}-shm", db_path.display()));

        // Seed a SQLite workspace with a root doc + a page doc having BOTH snapshots AND uncompacted updates.
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let doc_id = "doc-uncompacted";
        rt.block_on(async {
            let storage =
                affine_store::sqlite::SqliteDocStorage::new(db_path.to_string_lossy().into_owned());
            storage.connect().await.unwrap();
            let mut dir = affine_store::directory::WorkspaceDirectory::new(
                affine_store::workspace_db::WorkspaceDb::new(
                    "ws-ro-test",
                    "local-user",
                    blocksuite_playground_doc::client_id_from_seed(11),
                ),
            );
            let _ = dir.create_doc(affine_store::directory::CreateDocRequest {
                id: affine_store::directory::CreateDocId::explicit(
                    affine_store::directory::DocId::new(doc_id).unwrap(),
                ),
                title: "Uncompacted Doc".into(),
                mode: DocMode::Page,
                now_ms: 1_764_350_000,
            });
            let root_bin = dir.db().root().encode_update_v1().unwrap();
            storage
                .push_update("ws-ro-test", &root_bin, 1_764_350_000)
                .await
                .unwrap();
            let _ = storage.get_doc("ws-ro-test").await.unwrap();

            let mut page = blocksuite_playground_doc::session::PageDocSession::new(
                doc_id,
                blocksuite_playground_doc::client_id_from_seed(12),
            )
            .unwrap();
            page.add_block(
                "root-nano",
                blocksuite_playground_doc::schema::BlockSpec::Page {
                    title: "Uncompacted Doc".into(),
                },
                None,
                None,
                100,
            )
            .unwrap();
            page.add_block(
                "surf-nano",
                blocksuite_playground_doc::schema::BlockSpec::Surface,
                Some("root-nano"),
                None,
                101,
            )
            .unwrap();
            page.add_block(
                "note-nano",
                blocksuite_playground_doc::schema::BlockSpec::Note { xywh: None },
                Some("root-nano"),
                None,
                102,
            )
            .unwrap();
            let snap_bin = page.encode_update_v1().unwrap();
            storage
                .push_update(doc_id, &snap_bin, 1_764_350_001)
                .await
                .unwrap();
            // Compact initial state into `snapshots` table.
            let _ = storage.get_doc(doc_id).await.unwrap();

            let sv = page.encode_state_vector_v1().unwrap();
            page.add_block(
                "p-tail",
                blocksuite_playground_doc::schema::BlockSpec::Paragraph {
                    paragraph_type: blocksuite_playground_doc::schema::ParagraphType::Text,
                    text: "Uncompacted update row payload".into(),
                },
                Some("note-nano"),
                None,
                103,
            )
            .unwrap();
            let delta = page.encode_diff_v1(&sv).unwrap();
            // Push into `updates` table without compacting!
            storage
                .push_update(doc_id, &delta, 1_764_350_002)
                .await
                .unwrap();
            storage.checkpoint().await.unwrap();
            storage.close().await;
        });
        let _ = std::fs::remove_file(format!("{}-wal", db_path.display()));
        let _ = std::fs::remove_file(format!("{}-shm", db_path.display()));

        let hash_before = crate::ContentHash::of_bytes(&std::fs::read(&db_path).unwrap());
        let (mut store, stats) = DesktopDocStore::open_sqlite_file(&db_path).unwrap();
        assert!(stats.total_docs >= 1);
        assert!(store.get_doc(doc_id).is_some());

        // Must hydrate BOTH snapshot + uncompacted update row without SQLITE_READONLY,
        // and backfill real `note_id` & `surface_id`.
        assert_eq!(store.ensure_doc_hydrated(doc_id), Ok(true));
        let entry = store.get_doc(doc_id).unwrap();
        assert_eq!(entry.note_id, "note-nano");
        assert_eq!(entry.surface_id, "surf-nano");
        assert!(entry.snapshot.block("p-tail").is_some());

        // Zero writeback on disk!
        let hash_after = crate::ContentHash::of_bytes(&std::fs::read(&db_path).unwrap());
        assert_eq!(hash_before, hash_after);

        // Now verify hydration error is propagated and NEVER falsely marks `hydrated = true`.
        let _ = std::fs::remove_file(&db_path);
        if let Some(backing) = store.sqlite_backing.as_mut() {
            backing.path = std::env::temp_dir().join("nonexistent-missing-workspace.affine");
        }
        store.docs.get_mut(doc_id).unwrap().hydrated = false;
        assert!(store.ensure_doc_hydrated(doc_id).is_err());
        assert!(
            !store.get_doc(doc_id).unwrap().hydrated,
            "failed hydration must NOT mark entry as hydrated"
        );
    }
}
