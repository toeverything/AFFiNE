//! Deterministic desktop showcase seeding for `DesktopDocStore`.

use affine_store::directory::DocMode;
use blocksuite_playground_doc::{
    client_id_from_seed,
    schema::{BlockSpec, ConnectorEndpointSpec, ListType, ParagraphType, SurfaceElementSpec},
    session::PageDocSession,
};
use y_octo::Any;

use crate::doc_store::{
    DesktopCollection, DesktopDocMeta, DesktopDocStore, DesktopWorkspace, LiveDocEntry,
    WorkspaceKind,
};
use affine_client::{FolderForestCache, LinkGraph, WeightedSearchEngine, domain::CollectionRule};
use affine_store::{
    directory::WorkspaceDirectory,
    workspace_db::{FolderRow, WorkspaceDb},
};
use std::collections::BTreeMap;

impl DesktopDocStore {
    /// Seed a realistic multi-document AFFiNE desktop workspace with rich Page + Edgeless content.
    pub fn seed_showcase(today_date: &str) -> Self {
        let client_id = client_id_from_seed(0x4146_4649_4E45);
        let db = WorkspaceDb::new("ws-affine-desktop", "u-darksky", client_id);
        let directory = WorkspaceDirectory::new(db);

        let workspaces = vec![
            DesktopWorkspace {
                id: "ws-affine-desktop".into(),
                name: "AFFiNE Engineering".into(),
                kind: WorkspaceKind::Cloud,
                synced: true,
            },
            DesktopWorkspace {
                id: "ws-local-scratch".into(),
                name: "Local Research Vault".into(),
                kind: WorkspaceKind::Local,
                synced: true,
            },
        ];

        let mut store = Self {
            workspaces,
            active_workspace_idx: 0,
            directory,
            docs: BTreeMap::new(),
            folder_rows: Vec::new(),
            folder_cache: FolderForestCache::default(),
            collections: vec![
                DesktopCollection {
                    id: "col-rust-core".into(),
                    name: "Rust Native Core".into(),
                    rules: vec![CollectionRule::HasTag("rust".into())],
                },
                DesktopCollection {
                    id: "col-whiteboards".into(),
                    name: "Design Whiteboards".into(),
                    rules: vec![CollectionRule::ModeIs("edgeless".into())],
                },
            ],
            tag_colors: BTreeMap::from([
                ("rust".into(), 0x1E96EB),
                ("architecture".into(), 0x7C5CFA),
                ("release".into(), 0x16A34A),
                ("design".into(), 0xE11D48),
                ("journal".into(), 0xD97706),
            ]),
            link_graph: LinkGraph::default(),
            search_engine: WeightedSearchEngine::default(),
            next_seq: 100,
            env_rev: 1,
            workspace_buckets: BTreeMap::new(),
            #[cfg(not(target_family = "wasm"))]
            sqlite_backing: None,
        };

        store.seed_doc_architecture();
        store.seed_doc_sync_protocol();
        store.seed_doc_whiteboard_map();
        store.seed_doc_journal(today_date);
        store.seed_doc_trashed();

        store.folder_rows = vec![
            FolderRow {
                id: "f-eng".into(),
                parent_id: None,
                data: "Engineering".into(),
                folder_type: "folder".into(),
                index: "a0".into(),
            },
            FolderRow {
                id: "f-desktop".into(),
                parent_id: Some("f-eng".into()),
                data: "Desktop Shell".into(),
                folder_type: "folder".into(),
                index: "a0".into(),
            },
            FolderRow {
                id: "f-specs".into(),
                parent_id: None,
                data: "Architecture Specs".into(),
                folder_type: "folder".into(),
                index: "a1".into(),
            },
            FolderRow {
                id: "link-arch-1".into(),
                parent_id: Some("f-desktop".into()),
                data: "doc-arch".into(),
                folder_type: "doc".into(),
                index: "a0".into(),
            },
            FolderRow {
                id: "link-sync-1".into(),
                parent_id: Some("f-desktop".into()),
                data: "doc-sync".into(),
                folder_type: "doc".into(),
                index: "a1".into(),
            },
            FolderRow {
                id: "link-board-1".into(),
                parent_id: Some("f-specs".into()),
                data: "doc-board".into(),
                folder_type: "doc".into(),
                index: "a0".into(),
            },
        ];
        store.rebuild_derived();
        store
    }

    pub(crate) fn seed_doc_architecture(&mut self) {
        let mut s = PageDocSession::new("doc-arch", client_id_from_seed(11)).unwrap();
        s.add_block(
            "root",
            BlockSpec::Page {
                title: "AFFiNE Desktop Shell Architecture".into(),
            },
            None,
            None,
            10,
        )
        .unwrap();
        s.add_block("surface-arch", BlockSpec::Surface, Some("root"), None, 11)
            .unwrap();
        s.add_block(
            "note-arch",
            BlockSpec::Note {
                xywh: Some("[40,60,520,420]".into()),
            },
            Some("root"),
            None,
            12,
        )
        .unwrap();
        s.add_block(
            "h1-1",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::H1,
                text: "Multi-Pane Workbench".into(),
            },
            Some("note-arch"),
            None,
            13,
        )
        .unwrap();
        s.add_block("p-1", BlockSpec::Paragraph { paragraph_type: ParagraphType::Text, text: "Side-by-side Page and Edgeless panes share the same live CRDT PageDocSession and WorkspaceDirectory without duplicating state.".into() }, Some("note-arch"), None, 14).unwrap();
        s.add_block(
            "h2-1",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::H2,
                text: "Core Milestones".into(),
            },
            Some("note-arch"),
            None,
            15,
        )
        .unwrap();
        s.add_block(
            "l-1",
            BlockSpec::List {
                list_type: ListType::Todo,
                text: "Collapsible and resizable AppSidebar with Folders, Collections, and Tags"
                    .into(),
                checked: true,
                order: None,
            },
            Some("note-arch"),
            None,
            16,
        )
        .unwrap();
        s.add_block(
            "l-2",
            BlockSpec::List {
                list_type: ListType::Todo,
                text: "Split View with independent per-pane Back/Forward NavHistory".into(),
                checked: true,
                order: None,
            },
            Some("note-arch"),
            None,
            17,
        )
        .unwrap();
        s.add_block(
            "l-3",
            BlockSpec::List {
                list_type: ListType::Todo,
                text: "Physically isolated ComposerDraftStore with SHA-256 attachment dedup".into(),
                checked: true,
                order: None,
            },
            Some("note-arch"),
            None,
            18,
        )
        .unwrap();
        s.add_block(
            "q-1",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Quote,
                text: "Reference: @Offline Sync Protocol v1 and @Release Spatial Board".into(),
            },
            Some("note-arch"),
            None,
            19,
        )
        .unwrap();

        seed_surface_diagram(&mut s, "surface-arch", 20);

        self.register_seeded(
            DesktopDocMeta {
                id: "doc-arch".into(),
                title: "AFFiNE Desktop Shell Architecture".into(),
                summary:
                    "Side-by-side Page and Edgeless panes share the same live CRDT PageDocSession."
                        .into(),
                default_mode: DocMode::Page,
                tags: vec!["rust".into(), "architecture".into()],
                is_favorite: true,
                trashed: false,
                journal_date: None,
                updated_at_ms: 1_764_300_900,
                outgoing_refs: vec!["doc-sync".into(), "doc-board".into()],
            },
            s,
            "note-arch".into(),
            "surface-arch".into(),
        );
    }

    pub(crate) fn seed_doc_sync_protocol(&mut self) {
        let mut s = PageDocSession::new("doc-sync", client_id_from_seed(22)).unwrap();
        s.add_block(
            "root",
            BlockSpec::Page {
                title: "Offline Sync Protocol v1".into(),
            },
            None,
            None,
            10,
        )
        .unwrap();
        s.add_block("surface-sync", BlockSpec::Surface, Some("root"), None, 11)
            .unwrap();
        s.add_block(
            "note-sync",
            BlockSpec::Note {
                xywh: Some("[40,60,500,320]".into()),
            },
            Some("root"),
            None,
            12,
        )
        .unwrap();
        s.add_block(
            "h1-sync",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::H1,
                text: "SQLite Storage Contract".into(),
            },
            Some("note-sync"),
            None,
            13,
        )
        .unwrap();
        s.add_block("p-sync", BlockSpec::Paragraph { paragraph_type: ParagraphType::Text, text: "Collaborative workspace docs remain strictly inside <spaceId>.db while unpublished composer drafts live in an isolated local store.".into() }, Some("note-sync"), None, 14).unwrap();
        s.add_block(
            "code-sync",
            BlockSpec::Code {
                language: Some("rust".into()),
                text: "let store = ComposerDraftStore::in_memory(\"local://composer-drafts\")?;"
                    .into(),
                caption: String::new(),
            },
            Some("note-sync"),
            None,
            15,
        )
        .unwrap();

        self.register_seeded(
            DesktopDocMeta {
                id: "doc-sync".into(),
                title: "Offline Sync Protocol v1".into(),
                summary: "SQLite storage contract and physical isolation between <spaceId>.db and local drafts.".into(),
                default_mode: DocMode::Page,
                tags: vec!["rust".into(), "release".into()],
                is_favorite: true,
                trashed: false,
                journal_date: None,
                updated_at_ms: 1_764_300_700,
                outgoing_refs: vec!["doc-arch".into()],
            },
            s,
            "note-sync".into(),
            "surface-sync".into(),
        );
    }

    pub(crate) fn seed_doc_whiteboard_map(&mut self) {
        let mut s = PageDocSession::new("doc-board", client_id_from_seed(33)).unwrap();
        s.add_block(
            "root",
            BlockSpec::Page {
                title: "Release Spatial Board".into(),
            },
            None,
            None,
            10,
        )
        .unwrap();
        s.add_block("surface-board", BlockSpec::Surface, Some("root"), None, 11)
            .unwrap();
        s.add_block(
            "note-board",
            BlockSpec::Note {
                xywh: Some("[40,80,440,260]".into()),
            },
            Some("root"),
            None,
            12,
        )
        .unwrap();
        s.add_block(
            "h2-board",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::H2,
                text: "Spatial Architecture Notes".into(),
            },
            Some("note-board"),
            None,
            13,
        )
        .unwrap();
        s.add_block("p-board", BlockSpec::Paragraph { paragraph_type: ParagraphType::Text, text: "Edgeless whiteboard elements render alongside live Page notes on a shared GPU canvas.".into() }, Some("note-board"), None, 14).unwrap();
        seed_surface_diagram(&mut s, "surface-board", 20);

        self.register_seeded(
            DesktopDocMeta {
                id: "doc-board".into(),
                title: "Release Spatial Board".into(),
                summary: "Edgeless whiteboard diagram of desktop shell modules and CRDT pipelines."
                    .into(),
                default_mode: DocMode::Edgeless,
                tags: vec!["design".into(), "architecture".into()],
                is_favorite: false,
                trashed: false,
                journal_date: None,
                updated_at_ms: 1_764_300_500,
                outgoing_refs: Vec::new(),
            },
            s,
            "note-board".into(),
            "surface-board".into(),
        );
    }

    pub(crate) fn seed_doc_journal(&mut self, today_date: &str) {
        let mut s = PageDocSession::new("doc-journal-today", client_id_from_seed(44)).unwrap();
        let title = format!("Journal {today_date}");
        s.add_block(
            "root",
            BlockSpec::Page {
                title: title.clone(),
            },
            None,
            None,
            10,
        )
        .unwrap();
        s.add_block("surface-j", BlockSpec::Surface, Some("root"), None, 11)
            .unwrap();
        s.add_block(
            "note-j",
            BlockSpec::Note {
                xywh: Some("[40,60,480,240]".into()),
            },
            Some("root"),
            None,
            12,
        )
        .unwrap();
        s.add_block(
            "h2-j",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::H2,
                text: "Daily Focus".into(),
            },
            Some("note-j"),
            None,
            13,
        )
        .unwrap();
        s.add_block(
            "l-j1",
            BlockSpec::List {
                list_type: ListType::Todo,
                text: "Verify Split View live Page + Edgeless sync".into(),
                checked: true,
                order: None,
            },
            Some("note-j"),
            None,
            14,
        )
        .unwrap();
        s.add_block(
            "l-j2",
            BlockSpec::List {
                list_type: ListType::Todo,
                text: "Audit Light and Dark 1440x900 desktop gallery renders".into(),
                checked: false,
                order: None,
            },
            Some("note-j"),
            None,
            15,
        )
        .unwrap();

        self.register_seeded(
            DesktopDocMeta {
                id: "doc-journal-today".into(),
                title,
                summary:
                    "Daily journal tracking Split View verification and desktop gallery audit."
                        .into(),
                default_mode: DocMode::Page,
                tags: vec!["journal".into()],
                is_favorite: false,
                trashed: false,
                journal_date: Some(today_date.to_string()),
                updated_at_ms: 1_764_300_800,
                outgoing_refs: vec!["doc-arch".into()],
            },
            s,
            "note-j".into(),
            "surface-j".into(),
        );
    }

    pub(crate) fn seed_doc_trashed(&mut self) {
        let (session, note_id, surface_id) =
            build_basic_doc_session("doc-legacy-draft", "Deprecated WebView Notes", 50);
        self.register_seeded(
            DesktopDocMeta {
                id: "doc-legacy-draft".into(),
                title: "Deprecated WebView Notes".into(),
                summary:
                    "Archived migration notes queued in Trash for restore or permanent deletion."
                        .into(),
                default_mode: DocMode::Page,
                tags: vec!["release".into()],
                is_favorite: false,
                trashed: true,
                journal_date: None,
                updated_at_ms: 1_764_200_100,
                outgoing_refs: Vec::new(),
            },
            session,
            note_id,
            surface_id,
        );
    }
}

fn seed_surface_diagram(session: &mut PageDocSession, surface_id: &str, base_ms: u64) {
    let elements = [
        (
            "shape-sidebar",
            SurfaceElementSpec::Shape {
                shape_type: "rect".into(),
                xywh: "[640,100,180,84]".into(),
                filled: true,
                seed: 101,
                text: Some("AppSidebar".into()),
            },
        ),
        (
            "shape-workbench",
            SurfaceElementSpec::Shape {
                shape_type: "rect".into(),
                xywh: "[640,260,180,84]".into(),
                filled: true,
                seed: 102,
                text: Some("Workbench".into()),
            },
        ),
        (
            "conn-flow",
            SurfaceElementSpec::Connector {
                mode: 1,
                seed: 103,
                source: ConnectorEndpointSpec::element("shape-sidebar", Some([0.5, 1.0])),
                target: ConnectorEndpointSpec::element("shape-workbench", Some([0.5, 0.0])),
                text: Some("Route".into()),
                label_xywh: None,
            },
        ),
    ];
    for (idx, (id, spec)) in elements.into_iter().enumerate() {
        let _ = session.add_surface_element(
            surface_id,
            id,
            &format!("a{}", idx + 1),
            spec,
            base_ms + idx as u64,
        );
    }
    let color = |light: &str, dark: &str| {
        Any::Object(Box::new(
            [
                ("light".into(), Any::String(light.into())),
                ("dark".into(), Any::String(dark.into())),
            ]
            .into_iter()
            .collect(),
        ))
    };
    let _ = session.set_surface_element_field(
        surface_id,
        "shape-sidebar",
        "fillColor",
        y_octo::SessionValue::Any(color("#e0f2fe", "#1e3a5f")),
        base_ms + 10,
    );
    let _ = session.set_surface_element_field(
        surface_id,
        "shape-sidebar",
        "strokeColor",
        y_octo::SessionValue::Any(color("#0284c7", "#38bdf8")),
        base_ms + 11,
    );
    let _ = session.set_surface_element_field(
        surface_id,
        "shape-workbench",
        "fillColor",
        y_octo::SessionValue::Any(color("#ede9fe", "#3b2c68")),
        base_ms + 12,
    );
    let _ = session.set_surface_element_field(
        surface_id,
        "shape-workbench",
        "strokeColor",
        y_octo::SessionValue::Any(color("#7c3aed", "#a78bfa")),
        base_ms + 13,
    );
}

/// Resolve and backfill `note_id` (first page-visible note) and `surface_id` from a hydrated snapshot.
pub(crate) fn populate_note_and_surface_ids(
    entry: &mut LiveDocEntry,
    snap: &blocksuite_playground_doc::read::PageSnapshot,
) {
    let Some(root) = &snap.root else {
        return;
    };
    let mut fallback_note: Option<String> = None;
    let mut visible_note: Option<String> = None;
    let mut surface_id: Option<String> = None;
    for child in &root.children {
        match &child.content {
            blocksuite_playground_doc::read::BlockContent::Note { .. } => {
                if child.is_page_visible_note() && visible_note.is_none() {
                    visible_note = Some(child.id.clone());
                } else if fallback_note.is_none() {
                    fallback_note = Some(child.id.clone());
                }
            }
            blocksuite_playground_doc::read::BlockContent::Surface { .. }
                if surface_id.is_none() =>
            {
                surface_id = Some(child.id.clone());
            }
            _ => {}
        }
    }
    if let Some(id) = visible_note.or(fallback_note) {
        entry.note_id = id;
    }
    if let Some(id) = surface_id {
        entry.surface_id = id;
    }
}

pub(crate) fn build_basic_doc_session(
    doc_id: &str,
    title: &str,
    now_ms: u64,
) -> (PageDocSession, String, String) {
    let mut s = PageDocSession::new(doc_id, client_id_from_seed(now_ms.max(1))).unwrap();
    let note_id = format!("note-{doc_id}");
    let surface_id = format!("surface-{doc_id}");
    let _ = s.add_block(
        "root",
        BlockSpec::Page {
            title: title.to_string(),
        },
        None,
        None,
        now_ms,
    );
    let _ = s.add_block(
        &surface_id,
        BlockSpec::Surface,
        Some("root"),
        None,
        now_ms + 1,
    );
    let _ = s.add_block(
        &note_id,
        BlockSpec::Note {
            xywh: Some("[60,80,500,260]".into()),
        },
        Some("root"),
        None,
        now_ms + 2,
    );
    let _ = s.add_block(
        &format!("p-init-{doc_id}"),
        BlockSpec::Paragraph {
            paragraph_type: ParagraphType::Text,
            text: format!("{title} — live collaborative Page & Edgeless document."),
        },
        Some(&note_id),
        None,
        now_ms + 3,
    );
    (s, note_id, surface_id)
}
