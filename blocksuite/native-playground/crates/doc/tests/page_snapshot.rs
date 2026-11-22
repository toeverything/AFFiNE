#![forbid(unsafe_code)]

use blocksuite_playground_doc::{
    client_id_from_seed,
    read::{BlockContent, BlockNode, NoteDisplayMode, PageSnapshot, TextAlign},
    schema::{BlockSpec, ListType, ParagraphType},
    session::PageDocSession,
};
use y_octo::{Any, SessionValue, TextAttributes, TextDeltaOp, TextInsert};

fn paragraph(kind: ParagraphType, text: &str) -> BlockSpec {
    BlockSpec::Paragraph {
        paragraph_type: kind,
        text: text.to_string(),
    }
}

fn list(kind: ListType, text: &str, checked: bool, order: Option<i32>) -> BlockSpec {
    BlockSpec::List {
        list_type: kind,
        text: text.to_string(),
        checked,
        order,
    }
}

fn seeded_page() -> PageDocSession {
    let mut page = PageDocSession::new("doc:snapshot", client_id_from_seed(7)).unwrap();
    let mut now = 1_000_u64;
    let mut add = |page: &mut PageDocSession, id: &str, spec: BlockSpec, parent: Option<&str>| {
        now += 10;
        page.add_block(id, spec, parent, None, now).unwrap();
    };

    add(
        &mut page,
        "page",
        BlockSpec::Page {
            title: "Snapshot Title".to_string(),
        },
        None,
    );
    add(&mut page, "surface", BlockSpec::Surface, Some("page"));
    add(
        &mut page,
        "note",
        BlockSpec::Note { xywh: None },
        Some("page"),
    );
    add(
        &mut page,
        "h1",
        paragraph(ParagraphType::H1, "Heading"),
        Some("note"),
    );
    add(
        &mut page,
        "rich",
        paragraph(ParagraphType::Text, "plain bold code"),
        Some("note"),
    );
    add(
        &mut page,
        "quote",
        paragraph(ParagraphType::Quote, "Quoted"),
        Some("note"),
    );
    add(
        &mut page,
        "n1",
        list(ListType::Numbered, "one", false, None),
        Some("note"),
    );
    add(
        &mut page,
        "n2",
        list(ListType::Numbered, "two", false, None),
        Some("note"),
    );
    add(
        &mut page,
        "n2-a",
        list(ListType::Numbered, "nested one", false, None),
        Some("n2"),
    );
    add(
        &mut page,
        "n2-b",
        list(ListType::Numbered, "nested two", false, None),
        Some("n2"),
    );
    add(
        &mut page,
        "bullet",
        list(ListType::Bulleted, "break", false, None),
        Some("note"),
    );
    add(
        &mut page,
        "n3",
        list(ListType::Numbered, "restarted", false, None),
        Some("note"),
    );
    add(
        &mut page,
        "n4",
        list(ListType::Numbered, "explicit", false, Some(7)),
        Some("note"),
    );
    add(
        &mut page,
        "n5",
        list(ListType::Numbered, "after explicit", false, None),
        Some("note"),
    );
    add(
        &mut page,
        "todo",
        list(ListType::Todo, "done", true, None),
        Some("note"),
    );
    add(
        &mut page,
        "toggle",
        list(ListType::Toggle, "folded", false, None),
        Some("note"),
    );
    add(
        &mut page,
        "toggle-child",
        paragraph(ParagraphType::Text, "hidden child"),
        Some("toggle"),
    );
    add(&mut page, "divider", BlockSpec::Divider, Some("note"));
    add(
        &mut page,
        "code",
        BlockSpec::Code {
            text: "fn main() {}\n".to_string(),
            language: Some("rust".to_string()),
            caption: "Listing".to_string(),
        },
        Some("note"),
    );
    add(
        &mut page,
        "image",
        BlockSpec::Image {
            source_id: "blob-1".to_string(),
            caption: "Figure".to_string(),
            width: 320.0,
            height: 200.0,
            xywh: None,
        },
        Some("note"),
    );
    add(
        &mut page,
        "bookmark",
        BlockSpec::Bookmark {
            url: "https://affine.pro".to_string(),
            title: Some("AFFiNE".to_string()),
            description: None,
        },
        Some("note"),
    );
    add(
        &mut page,
        "edgeless-note",
        BlockSpec::Note {
            xywh: Some("[900,0,400,200]".to_string()),
        },
        Some("page"),
    );
    add(
        &mut page,
        "frame",
        BlockSpec::Frame {
            title: "Frame".to_string(),
            xywh: None,
            presentation_index: None,
        },
        Some("page"),
    );
    add(
        &mut page,
        "edgeless-text",
        BlockSpec::EdgelessText { xywh: None },
        Some("page"),
    );

    page.set_block_prop(
        "edgeless-note",
        "prop:displayMode",
        SessionValue::Any(Any::String("edgeless".to_string())),
        2_000,
    )
    .unwrap();
    page.set_block_prop(
        "toggle",
        "prop:collapsed",
        SessionValue::Any(Any::True),
        2_010,
    )
    .unwrap();

    let mut bold = TextAttributes::new();
    bold.insert("bold".to_string(), Any::True);
    page.format_text("rich", "prop:text", 6, 4, bold, 2_020)
        .unwrap();
    let mut code = TextAttributes::new();
    code.insert("code".to_string(), Any::True);
    page.format_text("rich", "prop:text", 11, 4, code, 2_030)
        .unwrap();

    page.add_raw_block(
        "database",
        "affine:database",
        3,
        vec![
            (
                "prop:title".to_string(),
                SessionValue::Text(vec![TextDeltaOp::Insert {
                    insert: TextInsert::Text("Tasks".to_string()),
                    format: None,
                }]),
            ),
            ("prop:views".to_string(), SessionValue::Array(Vec::new())),
        ],
        Some("note"),
        None,
        2_040,
    )
    .unwrap();
    page.add_raw_block(
        "orphan",
        "affine:paragraph",
        1,
        vec![(
            "prop:type".to_string(),
            SessionValue::Any(Any::String("text".to_string())),
        )],
        None,
        None,
        2_050,
    )
    .unwrap();
    page
}

fn child<'a>(node: &'a BlockNode, id: &str) -> &'a BlockNode {
    node.children
        .iter()
        .find(|child| child.id == id)
        .unwrap_or_else(|| panic!("missing child {id} under {}", node.id))
}

fn numbered_index(snapshot: &PageSnapshot, id: &str) -> Option<u32> {
    match &snapshot.block(id).expect("block").content {
        BlockContent::List { numbered_index, .. } => *numbered_index,
        other => panic!("{id} is not a list: {other:?}"),
    }
}

#[test]
fn page_snapshot_reads_ordered_typed_tree_without_losing_properties() {
    let page = seeded_page();
    let snapshot = page.read_page_snapshot().unwrap();

    assert_eq!(snapshot.doc_id, "doc:snapshot");
    assert_eq!(snapshot.title(), "Snapshot Title");
    let root = snapshot.root.as_ref().expect("affine:page root");
    assert_eq!(root.flavour, "affine:page");
    assert_eq!(root.version, Some(2));
    assert_eq!(
        root.children
            .iter()
            .map(|c| c.id.as_str())
            .collect::<Vec<_>>(),
        ["surface", "note", "edgeless-note", "frame", "edgeless-text"]
    );

    // Edgeless-only blocks stay in the tree but are flagged for Page mode to skip.
    assert!(child(root, "surface").is_edgeless_only());
    assert!(child(root, "frame").is_edgeless_only());
    assert!(child(root, "edgeless-text").is_edgeless_only());
    assert!(child(root, "edgeless-note").is_edgeless_only());
    let note = child(root, "note");
    assert!(!note.is_edgeless_only());
    match &note.content {
        BlockContent::Note {
            display_mode,
            xywh,
            hidden,
            background,
        } => {
            assert_eq!(*display_mode, NoteDisplayMode::Both);
            assert_eq!(xywh, "[0,0,498,92]");
            assert!(!hidden);
            assert_eq!(background["light"], "#ffffff");
            assert_eq!(background["dark"], "#252525");
        }
        other => panic!("unexpected note content: {other:?}"),
    }

    assert_eq!(
        note.children
            .iter()
            .map(|c| c.id.as_str())
            .collect::<Vec<_>>(),
        [
            "h1", "rich", "quote", "n1", "n2", "bullet", "n3", "n4", "n5", "todo", "toggle",
            "divider", "code", "image", "bookmark", "database",
        ]
    );

    assert!(matches!(
        &child(note, "h1").content,
        BlockContent::Paragraph { kind: ParagraphType::H1, text, collapsed: false, text_align: None }
            if text.plain == "Heading"
    ));
    assert!(matches!(
        &child(note, "quote").content,
        BlockContent::Paragraph {
            kind: ParagraphType::Quote,
            ..
        }
    ));

    // Inline marks arrive as a coalesced insert-only delta next to the plain string.
    let BlockContent::Paragraph { text, .. } = &child(note, "rich").content else {
        panic!("rich paragraph expected");
    };
    assert_eq!(text.plain, "plain bold code");
    let spans: Vec<(String, Vec<String>)> = text
        .delta
        .iter()
        .map(|op| match op {
            TextDeltaOp::Insert {
                insert: TextInsert::Text(s),
                format,
            } => (
                s.clone(),
                format
                    .as_ref()
                    .map(|attrs| attrs.keys().cloned().collect())
                    .unwrap_or_default(),
            ),
            other => panic!("unexpected delta op: {other:?}"),
        })
        .collect();
    assert_eq!(
        spans,
        [
            ("plain ".to_string(), vec![]),
            ("bold".to_string(), vec!["bold".to_string()]),
            (" ".to_string(), vec![]),
            ("code".to_string(), vec!["code".to_string()]),
        ]
    );

    // Numbered runs: consecutive siblings count up, another block breaks the run,
    // an explicit `prop:order` restarts it, and nested lists number independently.
    assert_eq!(numbered_index(&snapshot, "n1"), Some(1));
    assert_eq!(numbered_index(&snapshot, "n2"), Some(2));
    assert_eq!(numbered_index(&snapshot, "n2-a"), Some(1));
    assert_eq!(numbered_index(&snapshot, "n2-b"), Some(2));
    assert_eq!(numbered_index(&snapshot, "bullet"), None);
    assert_eq!(numbered_index(&snapshot, "n3"), Some(1));
    assert_eq!(numbered_index(&snapshot, "n4"), Some(7));
    assert_eq!(numbered_index(&snapshot, "n5"), Some(8));

    assert!(matches!(
        &child(note, "todo").content,
        BlockContent::List {
            kind: ListType::Todo,
            checked: true,
            ..
        }
    ));
    let toggle = child(note, "toggle");
    assert!(matches!(
        &toggle.content,
        BlockContent::List {
            kind: ListType::Toggle,
            collapsed: true,
            ..
        }
    ));
    assert_eq!(toggle.children.len(), 1, "collapsed children stay readable");

    assert_eq!(child(note, "divider").content, BlockContent::Divider);
    assert_eq!(
        child(note, "code").content,
        BlockContent::Code {
            language: "rust".to_string(),
            wrap: false,
            text: "fn main() {}\n".to_string(),
            caption: "Listing".to_string(),
        }
    );
    assert_eq!(
        child(note, "image").content,
        BlockContent::Image {
            source_id: "blob-1".to_string(),
            width: Some(320.0),
            height: Some(200.0),
            caption: "Figure".to_string(),
        }
    );
    assert_eq!(
        child(note, "bookmark").content,
        BlockContent::Bookmark {
            url: "https://affine.pro".to_string(),
            title: Some("AFFiNE".to_string()),
            description: None,
            caption: String::new(),
        }
    );

    // Unknown flavours keep identity, version, children and property keys.
    let database = child(note, "database");
    let BlockContent::Unknown(unknown) = &database.content else {
        panic!("affine:database must read as Unknown");
    };
    assert_eq!(unknown.id, "database");
    assert_eq!(unknown.flavour, "affine:database");
    assert_eq!(unknown.version, Some(3));
    assert_eq!(unknown.prop_keys, ["prop:title", "prop:views"]);
    assert_eq!(database.props["prop:title"][0]["insert"], "Tasks");

    // Every `prop:*` of every block survives, identical to the normalized doc export.
    let exported = page.export_doc_json().unwrap();
    let exported_blocks = exported["blocks"].as_object().unwrap();
    assert_eq!(snapshot.block_count(), exported_blocks.len());
    for (id, exported_block) in exported_blocks {
        let node = snapshot
            .block(id)
            .unwrap_or_else(|| panic!("block {id} missing"));
        let exported_props: Vec<(&String, &serde_json::Value)> = exported_block
            .as_object()
            .unwrap()
            .iter()
            .filter(|(key, _)| key.starts_with("prop:"))
            .collect();
        assert_eq!(node.props.len(), exported_props.len(), "props of {id}");
        for (key, value) in exported_props {
            assert_eq!(&node.props[key], value, "{id}.{key}");
        }
    }

    // Blocks outside the root tree are reported instead of being dropped.
    assert_eq!(
        snapshot
            .detached
            .iter()
            .map(|n| n.id.as_str())
            .collect::<Vec<_>>(),
        ["orphan"]
    );
}

#[test]
fn note_display_mode_and_text_align_use_blocksuite_wire_values() {
    fn set(page: &mut PageDocSession, id: &str, key: &str, value: &str, now: u64) {
        page.set_block_prop(
            id,
            key,
            SessionValue::Any(Any::String(value.to_string())),
            now,
        )
        .unwrap();
    }
    let mut page = seeded_page();
    set(&mut page, "h1", "prop:textAlign", "right", 3_000);
    set(&mut page, "n1", "prop:textAlign", "center", 3_010);
    set(&mut page, "quote", "prop:textAlign", "justify", 3_020);

    // BlockSuite writes `"doc"` for a note shown only in Page mode; `"page"` reads the same.
    for (step, wire) in ["doc", "page"].into_iter().enumerate() {
        set(
            &mut page,
            "note",
            "prop:displayMode",
            wire,
            3_100 + step as u64,
        );
        let snapshot = page.read_page_snapshot().unwrap();
        let note = snapshot.block("note").unwrap();
        let BlockContent::Note { display_mode, .. } = &note.content else {
            panic!("unexpected note content: {:?}", note.content);
        };
        assert_eq!(*display_mode, NoteDisplayMode::DocOnly, "{wire}");
        assert_eq!(display_mode.as_str(), "doc");
        assert!(!note.is_edgeless_only(), "{wire}");
    }

    let snapshot = page.read_page_snapshot().unwrap();
    let align = |id: &str| match &snapshot.block(id).unwrap().content {
        BlockContent::Paragraph { text_align, .. } | BlockContent::List { text_align, .. } => {
            *text_align
        }
        other => panic!("unexpected content of {id}: {other:?}"),
    };
    assert_eq!(align("h1"), Some(TextAlign::Right));
    assert_eq!(align("n1"), Some(TextAlign::Center));
    assert_eq!(align("n2"), None);
    // Only `left`, `center` and `right` are alignments.
    assert_eq!(align("quote"), None);
    assert_eq!(
        snapshot.block("h1").unwrap().props["prop:textAlign"],
        "right"
    );
    for value in [TextAlign::Left, TextAlign::Center, TextAlign::Right] {
        assert_eq!(TextAlign::parse(value.as_str()), Some(value));
    }
}

#[test]
fn page_snapshot_is_deterministic_and_survives_cycles_and_missing_children() {
    let page = seeded_page();
    assert_eq!(
        page.read_page_snapshot().unwrap(),
        page.read_page_snapshot().unwrap()
    );

    // A replica that applied the same update reads the identical snapshot.
    let mut replica = PageDocSession::new("doc:snapshot", client_id_from_seed(8)).unwrap();
    replica
        .apply_remote_update_v1(&page.encode_update_v1().unwrap())
        .unwrap();
    assert_eq!(
        replica.read_page_snapshot().unwrap(),
        page.read_page_snapshot().unwrap()
    );

    let mut empty = PageDocSession::new("doc:empty", client_id_from_seed(9)).unwrap();
    let snapshot = empty.read_page_snapshot().unwrap();
    assert!(snapshot.root.is_none());
    assert!(snapshot.detached.is_empty());
    assert_eq!(snapshot.title(), "");

    // `a` and `b` reference each other and a block that does not exist.
    for (id, other) in [("a", "b"), ("b", "a")] {
        empty
            .add_raw_block(id, "affine:paragraph", 1, Vec::new(), None, None, 10)
            .unwrap();
        let children =
            y_octo::TypeTarget::Path(y_octo::TypePath::root("blocks").key(id).key("sys:children"));
        empty
            .inner_mut()
            .array_push(
                &children,
                vec![
                    SessionValue::Any(Any::String(other.to_string())),
                    SessionValue::Any(Any::String("ghost".to_string())),
                ],
            )
            .unwrap();
    }
    let snapshot = empty.read_page_snapshot().unwrap();
    assert!(snapshot.root.is_none());
    assert_eq!(snapshot.block_count(), 2);
    assert_eq!(snapshot.detached.len(), 1);
    assert_eq!(snapshot.detached[0].id, "a");
    assert_eq!(snapshot.detached[0].children[0].id, "b");
    assert!(snapshot.detached[0].children[0].children.is_empty());
}
