use std::collections::BTreeMap;

use blocksuite_playground_doc::{
    read::{BlockContent, BlockNode, PageSnapshot, RichText},
    refs::{DocRefEdge, OutboundRefKind, extract_outbound_doc_refs},
    schema::{BlockSpec, ParagraphType, UnknownBlock},
    session::PageDocSession,
};
use serde_json::{Value as JsonValue, json};
use y_octo::{AHashMap, Any, HashMapExt, TextAttributes, TextDeltaOp, TextInsert};

fn linked_page_op(page_id: &str, ref_type: &str) -> TextDeltaOp {
    let mut reference = AHashMap::new();
    reference.insert("type".to_string(), Any::String(ref_type.to_string()));
    reference.insert("pageId".to_string(), Any::String(page_id.to_string()));
    let mut attrs = BTreeMap::new();
    attrs.insert("reference".to_string(), Any::Object(Box::new(reference)));
    TextDeltaOp::Insert {
        insert: TextInsert::Text(" ".to_string()),
        format: Some(attrs),
    }
}

fn unknown_block(id: &str, flavour: &str, props: BTreeMap<String, JsonValue>) -> BlockNode {
    BlockNode {
        id: id.to_string(),
        flavour: flavour.to_string(),
        version: Some(1),
        content: BlockContent::Unknown(UnknownBlock {
            id: id.to_string(),
            flavour: flavour.to_string(),
            version: Some(1),
            children: Vec::new(),
            prop_keys: props.keys().cloned().collect(),
        }),
        props,
        children: Vec::new(),
    }
}

#[test]
fn outbound_refs_table_driven_golden_fixtures() {
    struct Case {
        name: &'static str,
        snapshot: PageSnapshot,
        expected: Vec<(&'static str, &'static str, OutboundRefKind)>,
    }

    let para_with_mixed_mentions = BlockNode {
        id: "b-para".into(),
        flavour: "affine:paragraph".into(),
        version: Some(1),
        content: BlockContent::Paragraph {
            kind: ParagraphType::Text,
            text: RichText {
                plain: "See   and  ".into(),
                delta: vec![
                    TextDeltaOp::Insert {
                        insert: TextInsert::Text("See ".into()),
                        format: None,
                    },
                    linked_page_op("doc-target-a", "LinkedPage"),
                    // Duplicate in same block -> deduplicated.
                    linked_page_op("doc-target-a", "LinkedPage"),
                    // Self-reference -> stripped.
                    linked_page_op("doc-src", "LinkedPage"),
                    // Empty pageId -> stripped.
                    linked_page_op("   ", "LinkedPage"),
                    // Subpage reference (same parity as Web reader.ts) -> extracted.
                    linked_page_op("doc-subpage", "Subpage"),
                    linked_page_op("doc-target-b", "LinkedPage"),
                ],
            },
            collapsed: false,
            text_align: None,
        },
        props: BTreeMap::new(),
        children: Vec::new(),
    };

    let embed_linked = unknown_block(
        "b-embed-linked",
        "affine:embed-linked-doc",
        BTreeMap::from([("prop:pageId".into(), json!("doc-linked"))]),
    );
    let embed_linked_self = unknown_block(
        "b-embed-linked-self",
        "affine:embed-linked-doc",
        BTreeMap::from([("prop:pageId".into(), json!("doc-src"))]),
    );
    let embed_synced = unknown_block(
        "b-embed-synced",
        "affine:embed-synced-doc",
        BTreeMap::from([("prop:pageId".into(), json!("doc-synced"))]),
    );
    let embed_synced_empty = unknown_block(
        "b-embed-synced-empty",
        "affine:embed-synced-doc",
        BTreeMap::from([("prop:pageId".into(), json!(""))]),
    );
    let surface_ref = unknown_block(
        "b-surface-ref",
        "affine:surface-ref",
        BTreeMap::from([
            ("prop:reference".into(), json!("frame-1")),
            ("prop:pageId".into(), json!("doc-must-not-emit")),
            (
                "prop:caption".into(),
                json!([{
                    "insert": " ",
                    "attributes": { "reference": { "type": "LinkedPage", "pageId": "doc-must-not-emit-2" } }
                }]),
            ),
        ]),
    );
    let database_block = unknown_block(
        "b-db",
        "affine:database",
        BTreeMap::from([
            (
                "prop:title".into(),
                json!([
                    { "insert": "Roadmap " },
                    { "insert": " ", "attributes": { "reference": { "type": "LinkedPage", "pageId": "doc-db-title" } } }
                ]),
            ),
            (
                "prop:cells".into(),
                json!({
                    "row-1": {
                        "col-a": {
                            "columnId": "col-a",
                            "value": {
                                "$blocksuite:internal:text$": true,
                                "delta": [
                                    { "insert": "Owner " },
                                    { "insert": " ", "attributes": { "reference": { "type": "LinkedPage", "pageId": "doc-db-cell-1" } } },
                                    { "insert": " ", "attributes": { "reference": { "type": "LinkedPage", "pageId": "doc-src" } } }
                                ]
                            }
                        },
                        "col-b": {
                            "columnId": "col-b",
                            "value": [
                                { "insert": " ", "attributes": { "reference": { "type": "LinkedPage", "pageId": "doc-db-cell-2" } } },
                                { "insert": " ", "attributes": { "reference": { "type": "LinkedPage", "pageId": "doc-db-cell-1" } } }
                            ]
                        }
                    }
                }),
            ),
        ]),
    );

    let cases = vec![
        Case {
            name: "mixed inline mentions, embeds, database, and exclusions",
            snapshot: PageSnapshot {
                doc_id: "doc-src".into(),
                root: Some(BlockNode {
                    id: "b-page".into(),
                    flavour: "affine:page".into(),
                    version: Some(2),
                    content: BlockContent::Page {
                        title: RichText {
                            plain: "Source".into(),
                            delta: Vec::new(),
                        },
                    },
                    props: BTreeMap::new(),
                    children: vec![
                        para_with_mixed_mentions,
                        embed_linked,
                        embed_linked_self,
                        embed_synced,
                        embed_synced_empty,
                        surface_ref,
                        database_block,
                    ],
                }),
                detached: Vec::new(),
            },
            expected: vec![
                ("b-para", "doc-target-a", OutboundRefKind::InlineMention),
                ("b-para", "doc-subpage", OutboundRefKind::InlineMention),
                ("b-para", "doc-target-b", OutboundRefKind::InlineMention),
                (
                    "b-embed-linked",
                    "doc-linked",
                    OutboundRefKind::EmbedLinkedDoc,
                ),
                (
                    "b-embed-synced",
                    "doc-synced",
                    OutboundRefKind::EmbedSyncedDoc,
                ),
                ("b-db", "doc-db-title", OutboundRefKind::InlineMention),
                ("b-db", "doc-db-cell-1", OutboundRefKind::DatabaseCell),
                ("b-db", "doc-db-cell-2", OutboundRefKind::DatabaseCell),
            ],
        },
        Case {
            name: "same target via different kinds stays distinct",
            snapshot: PageSnapshot {
                doc_id: "doc-src".into(),
                root: Some(BlockNode {
                    id: "b-page".into(),
                    flavour: "affine:page".into(),
                    version: Some(2),
                    content: BlockContent::Page {
                        title: RichText::default(),
                    },
                    props: BTreeMap::new(),
                    children: vec![
                        unknown_block(
                            "b-callout",
                            "affine:callout",
                            BTreeMap::from([(
                                "prop:text".into(),
                                json!([{
                                    "insert": " ",
                                    "attributes": { "reference": { "type": "LinkedPage", "pageId": "doc-x" } }
                                }]),
                            )]),
                        ),
                        unknown_block(
                            "b-embed",
                            "affine:embed-linked-doc",
                            BTreeMap::from([("prop:pageId".into(), json!("doc-x"))]),
                        ),
                    ],
                }),
                detached: Vec::new(),
            },
            expected: vec![
                ("b-callout", "doc-x", OutboundRefKind::InlineMention),
                ("b-embed", "doc-x", OutboundRefKind::EmbedLinkedDoc),
            ],
        },
    ];

    for case in cases {
        let actual = extract_outbound_doc_refs(&case.snapshot);
        let expected: Vec<DocRefEdge> = case
            .expected
            .into_iter()
            .map(|(block_id, target, kind)| DocRefEdge {
                source_doc_id: case.snapshot.doc_id.clone(),
                target_doc_id: target.to_string(),
                source_block_id: block_id.to_string(),
                kind,
            })
            .collect();
        assert_eq!(actual, expected, "case failed: {}", case.name);
    }
}

#[test]
fn outbound_refs_extraction_causes_zero_writeback_on_source_ydoc() {
    let mut session = PageDocSession::new("doc-zero-wb", 42).unwrap();
    session
        .add_block(
            "b-page",
            BlockSpec::Page {
                title: "Root".into(),
            },
            None,
            None,
            10,
        )
        .unwrap();
    session
        .add_block(
            "b-note",
            BlockSpec::Note { xywh: None },
            Some("b-page"),
            None,
            20,
        )
        .unwrap();
    session
        .add_block(
            "b-para",
            BlockSpec::Paragraph {
                paragraph_type: ParagraphType::Text,
                text: "See  now".into(),
            },
            Some("b-note"),
            None,
            30,
        )
        .unwrap();

    // Format the space at UTF-16 offset 4 as an inline LinkedPage mention.
    let mut ref_map = AHashMap::new();
    ref_map.insert("type".to_string(), Any::String("LinkedPage".into()));
    ref_map.insert("pageId".to_string(), Any::String("doc-remote-1".into()));
    let mut attrs = TextAttributes::new();
    attrs.insert("reference".to_string(), Any::Object(Box::new(ref_map)));
    session
        .format_text("b-para", "prop:text", 4, 1, attrs, 40)
        .unwrap();

    let encoded_update = session.encode_update_v1().unwrap();
    let sv_before = session.encode_state_vector_v1().unwrap();

    let mut reader_session = PageDocSession::new("doc-zero-wb", 99).unwrap();
    let apply_res = reader_session
        .apply_remote_update_v1(&encoded_update)
        .unwrap();
    assert!(
        apply_res.outbound_updates.is_empty(),
        "applying update must not produce writeback commits"
    );
    let reader_sv_before = reader_session.encode_state_vector_v1().unwrap();
    let reader_bytes_before = reader_session.encode_update_v1().unwrap();

    let snapshot = reader_session.read_page_snapshot().unwrap();
    let edges = extract_outbound_doc_refs(&snapshot);

    let reader_sv_after = reader_session.encode_state_vector_v1().unwrap();
    let reader_bytes_after = reader_session.encode_update_v1().unwrap();
    let diff_after = reader_session.encode_diff_v1(&sv_before).unwrap();

    assert_eq!(
        sv_before, reader_sv_before,
        "reader state vector must match source"
    );
    assert_eq!(
        reader_sv_before, reader_sv_after,
        "reading refs must not advance state vector"
    );
    assert_eq!(
        reader_bytes_before, reader_bytes_after,
        "reading refs must not mutate reader YDoc bytes"
    );
    assert_eq!(
        diff_after,
        vec![0, 0],
        "reading refs must cause 0 writeback diff on source YDoc"
    );
    assert_eq!(
        edges,
        vec![DocRefEdge {
            source_doc_id: "doc-zero-wb".into(),
            target_doc_id: "doc-remote-1".into(),
            source_block_id: "b-para".into(),
            kind: OutboundRefKind::InlineMention,
        }]
    );
}
