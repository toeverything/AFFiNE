use blocksuite_playground_doc::{
    DocResult,
    schema::{BlockSpec, ParagraphType},
    session::PageDocSession,
};
use y_octo::{Any, TextAttributes};

fn paragraph(text: &str) -> BlockSpec {
    BlockSpec::Paragraph {
        paragraph_type: ParagraphType::Text,
        text: text.into(),
    }
}

#[test]
fn title_and_backward_range_resolve_after_atomic_join_undo() -> DocResult {
    let mut page = PageDocSession::new("doc", 12)?;
    page.add_block(
        "root",
        BlockSpec::Page {
            title: "Title".into(),
        },
        None,
        None,
        0,
    )?;
    for (id, text) in [("a", "ab"), ("b", "cd"), ("c", "ef")] {
        page.add_block(id, paragraph(text), Some("root"), None, 1)?;
    }
    let title = page.capture_selection_snapshot("root", 2, "a", 0)?;
    let before = page.capture_selection_snapshot("c", 1, "a", 1)?;
    let original = page.export_doc_json()?;
    page.delete_cross_block_range(("a", 1), ("c", 1), &["b".into()], &[], 10)?;
    page.set_undo_selection_snapshot(before)?;
    let joined = page.export_doc_json()?;
    assert_eq!(joined["blocks"]["a"]["prop:text"][0]["insert"], "af");
    assert!(joined["blocks"].get("b").is_none());
    let restored = page.undo()?.unwrap().selection_meta.unwrap();
    assert_eq!(page.export_doc_json()?, original);
    let resolved = page.resolve_selection_snapshot(&restored)?.unwrap();
    assert_eq!(resolved.anchor, ("c".into(), 1));
    assert_eq!(resolved.focus, ("a".into(), 1));
    assert_eq!(
        page.resolve_selection_snapshot(&title)?.unwrap().anchor,
        ("root".into(), 2)
    );
    page.redo()?;
    assert_eq!(page.export_doc_json()?, joined);
    Ok(())
}

#[test]
fn split_and_merge_preserve_surrogate_pairs_marks_and_undo_boundaries() -> DocResult {
    let mut page = PageDocSession::new("doc", 13)?;
    page.add_block(
        "root",
        BlockSpec::Page {
            title: String::new(),
        },
        None,
        None,
        0,
    )?;
    page.add_block("a", paragraph("A🪶B"), Some("root"), None, 1)?;
    page.format_text(
        "a",
        "prop:text",
        1,
        2,
        TextAttributes::from([("bold".into(), Any::True)]),
        2,
    )?;
    let original = page.export_doc_json()?;
    assert!(
        page.split_text_block("a", "b", 2, paragraph(""), 3)
            .is_err()
    );
    assert_eq!(page.export_doc_json()?, original);
    page.split_text_block("a", "b", 1, paragraph(""), 4)?;
    let split = page.export_doc_json()?;
    assert_eq!(
        split["blocks"]["b"]["prop:text"][0]["attributes"]["bold"],
        true
    );
    let (offset, commit) = page.merge_with_previous_text_block("a", "b", "root", 5)?;
    assert_eq!(offset, 1);
    assert!(commit.is_some());
    assert_eq!(page.export_doc_json()?, original);
    page.undo()?;
    assert_eq!(page.export_doc_json()?, split);
    page.undo()?;
    assert_eq!(page.export_doc_json()?, original);
    Ok(())
}

#[test]
fn shared_descendants_survive_deletion_and_cycles_are_rejected_before_mutation() -> DocResult {
    use y_octo::{SessionValue, TypePath, TypeTarget};
    let mut page = PageDocSession::new("doc", 17)?;
    page.add_block(
        "root",
        BlockSpec::Page {
            title: String::new(),
        },
        None,
        None,
        0,
    )?;
    page.add_block(
        "note",
        BlockSpec::Note { xywh: None },
        Some("root"),
        None,
        1,
    )?;
    for (id, parent) in [
        ("a", "note"),
        ("b", "note"),
        ("shared", "a"),
        ("leaf", "shared"),
        ("unique", "a"),
    ] {
        page.add_block(id, paragraph(id), Some(parent), None, 1)?;
    }
    let edges = TypeTarget::Path(TypePath::root("blocks").key("b").key("sys:children"));
    page.inner_mut().array_push(
        &edges,
        vec![SessionValue::Any(Any::String("shared".into()))],
    )?;
    let original = page.export_doc_json()?;
    assert!(page.reparent_block("a", "note", "leaf", 0, 5).is_err());
    assert_eq!(page.export_doc_json()?, original);
    page.delete_block_subtree("note", "a", 6)?;
    let blocks = page.export_doc_json()?["blocks"].clone();
    assert!(blocks.get("a").is_none() && blocks.get("unique").is_none());
    assert!(blocks.get("shared").is_some() && blocks.get("leaf").is_some());
    page.undo()?;
    assert_eq!(page.export_doc_json()?, original);
    page.reparent_block("b", "note", "a", 0, 8)?;
    page.undo()?;
    assert_eq!(page.export_doc_json()?, original);
    Ok(())
}

#[test]
fn split_at_start_moves_children_and_merge_lifts_them_into_the_old_slot() -> DocResult {
    let mut page = PageDocSession::new("doc", 21)?;
    page.add_block("root", BlockSpec::Page { title: "T".into() }, None, None, 0)?;
    page.add_block(
        "note",
        BlockSpec::Note { xywh: None },
        Some("root"),
        None,
        0,
    )?;
    for (id, parent) in [("a", "note"), ("b", "a"), ("c", "a"), ("d", "note")] {
        page.add_block(id, paragraph(id), Some(parent), None, 0)?;
    }
    let initial = page.export_doc_json()?;
    page.split_text_block("a", "second", 0, paragraph(""), 5)?;
    assert!(page.read_unknown_block("a")?.children.is_empty());
    assert_eq!(page.read_unknown_block("second")?.children, ["b", "c"]);
    assert_eq!(
        page.read_unknown_block("note")?.children,
        ["a", "second", "d"]
    );
    page.merge_with_previous_text_block("a", "second", "note", 10)?;
    assert_eq!(
        page.read_unknown_block("note")?.children,
        ["a", "b", "c", "d"]
    );
    assert!(page.read_unknown_block("a")?.children.is_empty());
    page.undo()?;
    page.undo()?;
    assert_eq!(page.export_doc_json()?, initial);
    Ok(())
}

#[test]
fn title_range_removes_intermediate_subtrees_and_preserves_end_children_in_note() -> DocResult {
    let mut p = PageDocSession::new("doc", 22)?;
    p.add_block(
        "root",
        BlockSpec::Page {
            title: "Title".into(),
        },
        None,
        None,
        0,
    )?;
    p.add_block(
        "note",
        BlockSpec::Note { xywh: None },
        Some("root"),
        None,
        0,
    )?;
    for (id, parent) in [
        ("fold", "note"),
        ("hidden", "fold"),
        ("end", "note"),
        ("child", "end"),
        ("next", "note"),
    ] {
        p.add_block(id, paragraph(id), Some(parent), None, 0)?;
    }
    let original = p.export_doc_json()?;
    p.delete_cross_block_range(
        ("root", 2),
        ("end", 1),
        &["fold".into()],
        &["child".into()],
        2,
    )?;
    assert_eq!(p.read_unknown_block("root")?.children, ["note"]);
    assert_eq!(p.read_unknown_block("note")?.children, ["child", "next"]);
    assert!(p.read_unknown_block("hidden").is_err());
    assert_eq!(p.read_editable_text("root")?.0.plain, "Tind");
    p.undo()?;
    assert_eq!(p.export_doc_json()?, original);
    Ok(())
}

#[test]
fn sole_note_paragraph_stays_in_place_and_failed_compound_edit_is_invisible() -> DocResult {
    let mut p = PageDocSession::new("doc", 23)?;
    p.add_block("root", BlockSpec::Page { title: "T".into() }, None, None, 0)?;
    p.add_block(
        "note",
        BlockSpec::Note { xywh: None },
        Some("root"),
        None,
        0,
    )?;
    p.add_block("solo", paragraph("solo"), Some("note"), None, 0)?;
    let before = p.export_doc_json()?;
    assert!(
        p.structural_edit(1, |page| {
            page.insert_text("solo", "prop:text", 0, "bad", 1)?;
            page.reparent_block("solo", "note", "missing", 0, 1)?;
            Ok(())
        })
        .is_err()
    );
    assert_eq!(p.export_doc_json()?, before);
    p.merge_with_previous_text_block("root", "solo", "note", 2)?;
    assert_eq!(p.read_unknown_block("note")?.children, ["solo"]);
    assert_eq!(p.read_editable_text("solo")?.0.plain, "");
    assert_eq!(p.read_editable_text("root")?.0.plain, "Tsolo");
    p.undo()?;
    assert_eq!(p.export_doc_json()?, before);
    Ok(())
}

#[test]
fn flavour_changes_preserve_alignment_and_dedent_adopts_trailing_siblings() -> DocResult {
    use y_octo::SessionValue;
    let mut p = PageDocSession::new("doc", 24)?;
    p.add_block("root", BlockSpec::Page { title: "T".into() }, None, None, 0)?;
    p.add_block(
        "note",
        BlockSpec::Note { xywh: None },
        Some("root"),
        None,
        0,
    )?;
    for (id, parent) in [("a", "note"), ("b", "a"), ("c", "a"), ("d", "b")] {
        p.add_block(id, paragraph(id), Some(parent), None, 0)?;
    }
    p.set_block_prop(
        "a",
        "prop:textAlign",
        SessionValue::Any(Any::String("center".into())),
        1,
    )?;
    let spec = BlockSpec::Paragraph {
        paragraph_type: ParagraphType::H2,
        text: String::new(),
    };
    p.convert_block_flavour("a", "spare", spec, 2)?;
    let json = p.export_doc_json()?;
    assert_eq!(json["blocks"]["a"]["prop:textAlign"], "center");
    assert!(json["blocks"].get("spare").is_none());
    let list = BlockSpec::List {
        list_type: blocksuite_playground_doc::schema::ListType::Numbered,
        text: String::new(),
        checked: false,
        order: Some(1),
    };
    p.convert_block_flavour("a", "list", list, 3)?;
    let json = p.export_doc_json()?;
    assert_eq!(json["blocks"]["list"]["prop:textAlign"], "center");
    assert_eq!(p.read_unknown_block("list")?.children, ["b", "c"]);
    assert_eq!(p.read_editable_text("list")?.0.plain, "a");
    p.dedent_block("b", 4)?;
    assert_eq!(p.read_unknown_block("note")?.children, ["list", "b"]);
    assert_eq!(p.read_unknown_block("b")?.children, ["d", "c"]);
    p.undo()?;
    assert_eq!(p.export_doc_json()?, json);
    Ok(())
}

#[test]
fn converting_to_a_leaf_lifts_children_at_the_replaced_slot() -> DocResult {
    let mut p = PageDocSession::new("doc", 41)?;
    p.add_block("note", BlockSpec::Note { xywh: None }, None, None, 0)?;
    for (id, parent) in [
        ("p", "note"),
        ("child1", "p"),
        ("child2", "p"),
        ("following", "note"),
    ] {
        p.add_block(id, paragraph(id), Some(parent), None, 0)?;
    }
    let original = p.export_doc_json()?;
    p.convert_block_flavour(
        "p",
        "code1",
        BlockSpec::Code {
            text: String::new(),
            language: None,
            caption: String::new(),
        },
        1,
    )?;
    assert_eq!(
        p.read_unknown_block("note")?.children,
        ["code1", "child1", "child2", "following"]
    );
    assert!(p.read_unknown_block("code1")?.children.is_empty());
    assert_eq!(p.read_editable_text("code1")?.0.plain, "p");
    assert!(p.read_unknown_block("p").is_err());
    p.undo()?;
    assert_eq!(p.export_doc_json()?, original);
    Ok(())
}
