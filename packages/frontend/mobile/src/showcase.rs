//! Deterministic showcase state factory with two fully isolated workspaces for offline
//! verification, interactive integration tests, and offscreen gallery rendering.

use affine_client::{
    DirectKind, FolderForestCache, LinkGraph, NavHistory, NavTarget, Origin, Scope,
    WeightedSearchEngine,
};
use affine_store::workspace_db::FolderRow;
use blocksuite_playground_doc::refs::{DocRefEdge, OutboundRefKind};
use ui_kit::Sheet;
use ui_tokens::ThemeMode;

use crate::{
    state::{
        MobileAppState, MobileCollection, MobileDocRecord, MobileRoute, MobileSheet, MobileTab,
        SettingsState, ThemePreference, WorkspaceData, WorkspaceSummary,
    },
    strings::MobileLocale,
};

fn build_primary_workspace(locale: MobileLocale, today_date: &str) -> WorkspaceData {
    let scope = Scope::new("u-darksky", "https://app.affine.pro", "ws-mobile-rust");
    let folder_rows = vec![
        FolderRow {
            id: "f-eng".into(),
            parent_id: None,
            data: match locale {
                MobileLocale::En => "Engineering".into(),
                MobileLocale::ZhHans => "工程研发".into(),
                MobileLocale::Ar => "الهندسة".into(),
            },
            folder_type: "folder".into(),
            index: "a0".into(),
        },
        FolderRow {
            id: "f-mobile".into(),
            parent_id: Some("f-eng".into()),
            data: match locale {
                MobileLocale::En => "Mobile Rust".into(),
                MobileLocale::ZhHans => "移动端架构".into(),
                MobileLocale::Ar => "تطبيق الجوال".into(),
            },
            folder_type: "folder".into(),
            index: "a0".into(),
        },
        FolderRow {
            id: "f-product".into(),
            parent_id: None,
            data: match locale {
                MobileLocale::En => "Product Specs".into(),
                MobileLocale::ZhHans => "产品规范".into(),
                MobileLocale::Ar => "مواصفات المنتج".into(),
            },
            folder_type: "folder".into(),
            index: "a1".into(),
        },
        FolderRow {
            id: "l-arch-eng".into(),
            parent_id: Some("f-mobile".into()),
            data: "doc-arch".into(),
            folder_type: "doc".into(),
            index: "a0".into(),
        },
        FolderRow {
            id: "l-arch-prod".into(),
            parent_id: Some("f-product".into()),
            data: "doc-arch".into(),
            folder_type: "doc".into(),
            index: "a0".into(),
        },
        FolderRow {
            id: "l-sync-eng".into(),
            parent_id: Some("f-mobile".into()),
            data: "doc-sync".into(),
            folder_type: "doc".into(),
            index: "a1".into(),
        },
    ];

    let docs = vec![
        MobileDocRecord {
            id: "doc-arch".into(),
            title: match locale {
                MobileLocale::En => "Mobile Shell & Breadcrumb Spec".into(),
                MobileLocale::ZhHans => "移动外壳与面包屑规范".into(),
                MobileLocale::Ar => "مواصفات واجهة الجوال ومسار التنقل".into(),
            },
            body_preview: match locale {
                MobileLocale::En => "Pure Rust mobile shell with logical RTL geometry, 4-tier breadcrumb collapse, and deterministic frame replay.".into(),
                MobileLocale::ZhHans => "纯 Rust 移动外壳，采用逻辑 RTL 几何、四级窄屏面包屑折叠与多帧率确定性回放。".into(),
                MobileLocale::Ar => "واجهة جوال بلغة Rust مع هندسة RTL منطقية وطي مسار التنقل وإعادة تشغيل حتمية.".into(),
            },
            tags: vec!["rust".into(), "mobile".into()],
            updated_at_ms: 1_764_000_900,
            is_favorite: true,
            trashed: false,
            journal_date: None,
            clock: 3,
            outgoing_edges: Vec::new(),
        },
        MobileDocRecord {
            id: "doc-sync".into(),
            title: match locale {
                MobileLocale::En => "Offline Sync Protocol v1".into(),
                MobileLocale::ZhHans => "离线同步协议 v1".into(),
                MobileLocale::Ar => "بروتوكول المزامنة دون اتصال v1".into(),
            },
            body_preview: match locale {
                MobileLocale::En => "SQLite 5-step shared storage and sans-I/O SpaceSync engine for zero-loss mobile upgrades.".into(),
                MobileLocale::ZhHans => "SQLite 五步共库存储与无 I/O SpaceSync 引擎，保障零丢数据覆盖升级。".into(),
                MobileLocale::Ar => "تخزين SQLite مشترك ومحرك SpaceSync لترقيات الجوال دون فقدان البيانات.".into(),
            },
            tags: vec!["sync".into(), "rust".into()],
            updated_at_ms: 1_764_000_700,
            is_favorite: true,
            trashed: false,
            journal_date: None,
            clock: 2,
            outgoing_edges: vec![DocRefEdge {
                source_doc_id: "doc-sync".into(),
                target_doc_id: "doc-arch".into(),
                source_block_id: "b-sync-1".into(),
                kind: OutboundRefKind::InlineMention,
            }],
        },
        MobileDocRecord {
            id: "doc-journal".into(),
            title: format!("Journal {today_date}"),
            body_preview: match locale {
                MobileLocale::En => "Completed S3-Shell breadcrumb layout, micro-icons, and accessibility landmarks.".into(),
                MobileLocale::ZhHans => "完成 S3-Shell 面包屑布局、烘焙微动效图标与生产无障碍地标。".into(),
                MobileLocale::Ar => "اكتمل تخطيط مسار التنقل والأيقونات المتحركة وإمكانية الوصول.".into(),
            },
            tags: vec!["daily".into()],
            updated_at_ms: 1_764_000_800,
            is_favorite: false,
            trashed: false,
            journal_date: Some(today_date.to_string()),
            clock: 1,
            outgoing_edges: vec![DocRefEdge {
                source_doc_id: "doc-journal".into(),
                target_doc_id: "doc-arch".into(),
                source_block_id: "b-j-1".into(),
                kind: OutboundRefKind::EmbedLinkedDoc,
            }],
        },
        MobileDocRecord {
            id: "doc-trash".into(),
            title: match locale {
                MobileLocale::En => "Legacy Capacitor Notes".into(),
                MobileLocale::ZhHans => "旧版 Capacitor 备忘".into(),
                MobileLocale::Ar => "ملاحظات Capacitor القديمة".into(),
            },
            body_preview: "Retired legacy wrapper notes.".into(),
            tags: vec![],
            updated_at_ms: 1_763_900_000,
            is_favorite: false,
            trashed: true,
            journal_date: None,
            clock: 1,
            outgoing_edges: Vec::new(),
        },
    ];

    let mut link_graph = LinkGraph::new();
    for doc in &docs {
        link_graph.replace_edges(&doc.id, doc.outgoing_edges.clone(), doc.clock);
    }

    let mut history = NavHistory::new();
    history.push(
        scope.clone(),
        NavTarget::Home,
        Origin::Direct(DirectKind::Home),
        None,
    );

    WorkspaceData {
        summary: WorkspaceSummary {
            id: "ws-mobile-rust".into(),
            name: match locale {
                MobileLocale::En => "AFFiNE Core".into(),
                MobileLocale::ZhHans => "AFFiNE 核心研发".into(),
                MobileLocale::Ar => "نواة AFFiNE".into(),
            },
            doc_count: 3,
            is_cloud: true,
        },
        scope,
        folders_resolved: true,
        folder_rows,
        folder_revision: 1,
        folder_cache: FolderForestCache::new(),
        docs,
        collections: vec![
            MobileCollection {
                id: "col-core".into(),
                name: match locale {
                    MobileLocale::En => "Core Architecture".into(),
                    MobileLocale::ZhHans => "核心架构".into(),
                    MobileLocale::Ar => "البنية الأساسية".into(),
                },
                doc_ids: vec!["doc-arch".into()],
            },
            MobileCollection {
                id: "col-sync".into(),
                name: match locale {
                    MobileLocale::En => "Offline & Sync".into(),
                    MobileLocale::ZhHans => "离线与同步".into(),
                    MobileLocale::Ar => "المزامنة دون اتصال".into(),
                },
                doc_ids: vec!["doc-sync".into(), "doc-journal".into()],
            },
        ],
        tags: vec![
            ("rust".into(), "Rust".into()),
            ("sync".into(), "Sync".into()),
        ],
        link_graph,
        workspace_index_seeded: true,
        history,
        next_doc_seq: 1,
    }
}

fn build_personal_workspace(locale: MobileLocale) -> WorkspaceData {
    let scope = Scope::new("u-darksky", "https://app.affine.pro", "ws-personal");
    let folder_rows = vec![
        FolderRow {
            id: "f-reading".into(),
            parent_id: None,
            data: match locale {
                MobileLocale::En => "Reading List".into(),
                MobileLocale::ZhHans => "阅读清单".into(),
                MobileLocale::Ar => "قائمة القراءة".into(),
            },
            folder_type: "folder".into(),
            index: "a0".into(),
        },
        FolderRow {
            id: "l-personal-book".into(),
            parent_id: Some("f-reading".into()),
            data: "doc-personal-1".into(),
            folder_type: "doc".into(),
            index: "a0".into(),
        },
    ];
    let docs = vec![
        MobileDocRecord {
            id: "doc-personal-1".into(),
            title: match locale {
                MobileLocale::En => "Weekend Field Notes".into(),
                MobileLocale::ZhHans => "周末随笔记录".into(),
                MobileLocale::Ar => "ملاحظات نهاية الأسبوع".into(),
            },
            body_preview: "Isolated personal workspace document with zero cross-workspace leakage."
                .into(),
            tags: vec!["personal".into()],
            updated_at_ms: 1_764_001_000,
            is_favorite: true,
            trashed: false,
            journal_date: None,
            clock: 1,
            outgoing_edges: Vec::new(),
        },
        MobileDocRecord {
            id: "doc-personal-2".into(),
            title: match locale {
                MobileLocale::En => "Travel Checklist".into(),
                MobileLocale::ZhHans => "出行清单".into(),
                MobileLocale::Ar => "قائمة السفر".into(),
            },
            body_preview: "Passport, charger, and offline maps.".into(),
            tags: vec!["personal".into()],
            updated_at_ms: 1_764_000_500,
            is_favorite: false,
            trashed: false,
            journal_date: None,
            clock: 1,
            outgoing_edges: vec![DocRefEdge {
                source_doc_id: "doc-personal-2".into(),
                target_doc_id: "doc-personal-1".into(),
                source_block_id: "b-p-1".into(),
                kind: OutboundRefKind::InlineMention,
            }],
        },
    ];
    let mut link_graph = LinkGraph::new();
    for doc in &docs {
        link_graph.replace_edges(&doc.id, doc.outgoing_edges.clone(), doc.clock);
    }

    let mut history = NavHistory::new();
    history.push(
        scope.clone(),
        NavTarget::Home,
        Origin::Direct(DirectKind::Home),
        None,
    );

    WorkspaceData {
        summary: WorkspaceSummary {
            id: "ws-personal".into(),
            name: match locale {
                MobileLocale::En => "Personal Notes".into(),
                MobileLocale::ZhHans => "个人笔记".into(),
                MobileLocale::Ar => "ملاحظات شخصية".into(),
            },
            doc_count: 2,
            is_cloud: false,
        },
        scope,
        folders_resolved: true,
        folder_rows,
        folder_revision: 1,
        folder_cache: FolderForestCache::new(),
        docs,
        collections: vec![MobileCollection {
            id: "col-personal".into(),
            name: "Personal".into(),
            doc_ids: vec!["doc-personal-1".into(), "doc-personal-2".into()],
        }],
        tags: vec![("personal".into(), "Personal".into())],
        link_graph,
        workspace_index_seeded: true,
        history,
        next_doc_seq: 1,
    }
}

/// Create a deterministic showcase state populated with two fully isolated workspaces, folders,
/// multi-location documents, trails, journals, backlinks, and searchable content.
pub fn seed_showcase_state(
    locale: MobileLocale,
    theme: ThemeMode,
    today_date: &str,
) -> MobileAppState {
    let primary = build_primary_workspace(locale, today_date);
    let personal = build_personal_workspace(locale);

    let workspaces = vec![primary.summary.clone(), personal.summary.clone()];
    let mut settings = SettingsState::default();
    settings.account_email = "darksky@affine.pro".to_string();
    settings.account_plan = "Pro Cloud".to_string();
    settings.cache_size_mb = 42;
    settings.locale = locale;
    settings.theme_preference = match theme {
        ThemeMode::Light => ThemePreference::Light,
        ThemeMode::Dark => ThemePreference::Dark,
    };

    MobileAppState {
        scope: primary.scope.clone(),
        workspaces,
        workspace_store: vec![primary.clone(), personal],
        active_workspace_idx: 0,
        active_tab: MobileTab::Home,
        route: MobileRoute::Home,
        active_sheet: MobileSheet::None,
        closing_sheet: None,
        pending_delete_target: None,
        sheet_trigger_a11y_id: None,
        focused_a11y_id: None,
        sheet_motion: Sheet::new(),
        tab_anim_start_ms: 0.0,
        page_overlay_active: false,
        explorer_scroll_y: 0.0,
        explorer_scroll_by_seq: std::collections::HashMap::new(),
        today_date: today_date.to_string(),
        selected_journal_date: today_date.to_string(),
        next_doc_seq: primary.next_doc_seq,
        search_query: match locale {
            MobileLocale::En => "Sync".into(),
            MobileLocale::ZhHans => "同步".into(),
            MobileLocale::Ar => "المزامنة".into(),
        },
        search_selection: 0..0,
        search_preedit: None,
        search_engine: WeightedSearchEngine::default(),
        settings,
        history: primary.history,
        folders_resolved: primary.folders_resolved,
        folder_rows: primary.folder_rows,
        folder_revision: primary.folder_revision,
        folder_cache: FolderForestCache::new(),
        docs: primary.docs,
        collections: primary.collections,
        tags: primary.tags,
        link_graph: primary.link_graph,
        workspace_index_seeded: primary.workspace_index_seeded,
        system_dark: matches!(theme, ThemeMode::Dark),
        font_scale: 1.0,
    }
}
