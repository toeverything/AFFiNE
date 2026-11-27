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

#[test]
fn commit_connector_label_encodes_single_array_item_and_plain_object_offset() -> DocResult {
    use blocksuite_playground_doc::schema::{ConnectorEndpointSpec, SurfaceElementSpec};
    use y_octo::{SessionReadValue, StateVector, TypePath, TypeTarget};

    let mut p = PageDocSession::new("doc", 42)?;
    p.add_block("root", BlockSpec::Page { title: "T".into() }, None, None, 0)?;
    p.add_block("surf", BlockSpec::Surface, Some("root"), None, 1)?;
    p.add_surface_element(
        "surf",
        "c1",
        "a0",
        SurfaceElementSpec::Connector {
            mode: 1,
            seed: 7,
            source: ConnectorEndpointSpec::point(0.0, 0.0),
            target: ConnectorEndpointSpec::point(200.0, 100.0),
            text: None,
            label_xywh: None,
        },
        2,
    )?;
    // Clear any default labelOffset first so commit_connector_label exercises both labelXYWH and labelOffset writes.
    p.commit_connector_label("surf", "c1", "", [0.0; 4], 3)?;
    let sv_before = StateVector::decode_v1(&p.encode_state_vector_v1()?)?;
    let clock_before = sv_before.get(&42);
    let commit = p
        .commit_connector_label("surf", "c1", "Edge", [120.0, 140.0, 64.0, 24.0], 4)?
        .expect("commit");
    let sv_after = StateVector::decode_v1(&p.encode_state_vector_v1()?)?;
    let clock_after = sv_after.get(&42);
    // Exactly 3 single-element map items: labelDisplay (1) + labelXYWH (1, NOT 4!) + labelOffset (1).
    assert_eq!(
        clock_after - clock_before,
        3,
        "labelXYWH must consume 1 CRDT clock (single Content::Any wrapping Any::Array), not 4"
    );

    let mut peer = PageDocSession::new("doc", 99)?;
    peer.apply_remote_update_v1(&p.encode_update_v1()?)?;
    let _ = commit;
    let elem_target = TypeTarget::Path(
        TypePath::root("blocks")
            .key("surf")
            .key("prop:elements")
            .key("value")
            .key("c1"),
    );
    match peer.inner().get_map_value(&elem_target, "labelXYWH")? {
        Some(SessionReadValue::Any(Any::Array(vals))) => {
            assert_eq!(vals.len(), 4);
            assert_eq!(vals[0], Any::Float64(120.0.into()));
            assert_eq!(vals[3], Any::Float64(24.0.into()));
        }
        other => panic!("expected Any::Array(4) for labelXYWH, got {other:?}"),
    }
    match peer.inner().get_map_value(&elem_target, "labelOffset")? {
        Some(SessionReadValue::Any(Any::Object(obj))) => {
            assert_eq!(obj.get("distance"), Some(&Any::Float64(0.5.into())));
            assert_eq!(obj.get("anchor"), Some(&Any::String("center".to_string())));
        }
        other => panic!("expected plain Any::Object for labelOffset, got {other:?}"),
    }
    Ok(())
}

#[test]
fn fresh_page_frame_creation_is_atomic_across_peer_sync_and_undo() -> DocResult {
    let mut a = PageDocSession::new("doc", 43)?;
    a.add_block("root", BlockSpec::Page { title: "T".into() }, None, None, 0)?;
    let mut peer = PageDocSession::new("doc", 44)?;
    peer.apply_remote_update_v1(&a.encode_update_v1()?)?;
    let initial_json = a.export_doc_json()?;

    let commit = a
        .add_frame_with_children(
            None,
            "frame-1",
            "Frame",
            "a0",
            [10.0, 20.0, 300.0, 200.0],
            &[],
            10,
        )?
        .expect("single atomic commit");
    peer.apply_remote_update_v1(&commit.update)?;
    assert_eq!(peer.export_doc_json()?, a.export_doc_json()?);
    let snap = peer.read_page_snapshot()?;
    assert!(snap.block("frame-1").is_some());

    a.undo()?;
    assert_eq!(a.export_doc_json()?, initial_json);
    Ok(())
}

#[test]
fn multi_author_merged_v1_surface_tiebreak_matches_yjs_client_desc_clock_asc() -> DocResult {
    use blocksuite_playground_doc::{read::BlockContent, schema::SurfaceElementSpec};

    let mut base = PageDocSession::new("doc", 5)?;
    base.add_block("root", BlockSpec::Page { title: "T".into() }, None, None, 0)?;
    base.add_block("surf", BlockSpec::Surface, Some("root"), None, 1)?;
    let seed = base.encode_update_v1()?;

    let mut c10 = PageDocSession::new("doc", 10)?;
    c10.apply_remote_update_v1(&seed)?;
    let mut c20 = PageDocSession::new("doc", 20)?;
    c20.apply_remote_update_v1(&seed)?;

    let shape = |xywh: &str| SurfaceElementSpec::Shape {
        shape_type: "rect".into(),
        xywh: xywh.into(),
        seed: 1,
        filled: true,
        text: None,
    };
    let u20 = c20
        .add_surface_element("surf", "z", "a0", shape("[0,0,40,40]"), 10)?
        .unwrap()
        .update;
    let u10_a = c10
        .add_surface_element("surf", "a", "a0", shape("[10,0,40,40]"), 10)?
        .unwrap()
        .update;
    c20.apply_remote_update_v1(&u10_a)?;
    let merged = c20.encode_update_v1()?;

    let mut observer = PageDocSession::new("doc", 99)?;
    observer.apply_remote_update_v1(&merged)?;
    let snap = observer.read_page_snapshot()?;
    let BlockContent::Surface { elements, .. } = &snap.block("surf").unwrap().content else {
        panic!("expected surface");
    };
    let ids: Vec<&str> = elements.iter().map(|e| e.id.as_str()).collect();
    assert_eq!(ids, vec!["z", "a"]);

    // Same-client sequential inserts with equal index preserve clock ascending order.
    let mut seq = PageDocSession::new("doc", 30)?;
    seq.apply_remote_update_v1(&seed)?;
    seq.add_surface_element("surf", "first", "a0", shape("[0,0,20,20]"), 10)?;
    seq.add_surface_element("surf", "second", "a0", shape("[30,0,20,20]"), 11)?;
    let mut seq_obs = PageDocSession::new("doc", 31)?;
    seq_obs.apply_remote_update_v1(&seq.encode_update_v1()?)?;
    let seq_snap = seq_obs.read_page_snapshot()?;
    let BlockContent::Surface { elements, .. } = &seq_snap.block("surf").unwrap().content else {
        panic!("expected surface");
    };
    let seq_ids: Vec<&str> = elements.iter().map(|e| e.id.as_str()).collect();
    assert_eq!(seq_ids, vec!["first", "second"]);
    let _ = u20;
    Ok(())
}

#[test]
fn cascade_delete_after_property_mutations_undoes_and_redoes_all_elements() -> DocResult {
    use blocksuite_playground_doc::{
        read::BlockContent,
        schema::{ConnectorEndpointSpec, SurfaceElementSpec},
    };
    use y_octo::SessionValue;

    let mut page = PageDocSession::new("doc", 77)?;
    page.add_block("root", BlockSpec::Page { title: "T".into() }, None, None, 0)?;
    page.add_block("surf", BlockSpec::Surface, Some("root"), None, 1)?;
    page.add_surface_element(
        "surf",
        "sh-1",
        "a0",
        SurfaceElementSpec::Shape {
            shape_type: "rect".into(),
            xywh: "[100,100,120,80]".into(),
            seed: 11,
            filled: true,
            text: Some("Box".into()),
        },
        2,
    )?;
    page.add_surface_element(
        "surf",
        "conn-att",
        "a1",
        SurfaceElementSpec::Connector {
            mode: 0,
            seed: 12,
            source: ConnectorEndpointSpec::element("sh-1", Some([1.0, 0.5])),
            target: ConnectorEndpointSpec::point(340.0, 140.0),
            text: None,
            label_xywh: None,
        },
        3,
    )?;
    // Mutate sh-1 fields after conn-att so sh-1 holds clocks both below and above conn-att.
    page.set_surface_element_field(
        "surf",
        "sh-1",
        "xywh",
        SessionValue::Any(Any::String("[140,125,120,80]".into())),
        4,
    )?;
    page.set_surface_element_field(
        "surf",
        "sh-1",
        "rotate",
        SessionValue::Any(Any::Float64(45.0.into())),
        5,
    )?;
    page.set_surface_element_field(
        "surf",
        "sh-1",
        "index",
        SessionValue::Any(Any::String("a2".into())),
        6,
    )?;
    page.stop_capturing()?;

    let before_delete = page.export_doc_json()?;
    page.delete_blocks_and_elements_with_connectors(&[], &[("surf", "sh-1")], 10)?;
    let after_delete = page.export_doc_json()?;
    let snap_del = page.read_page_snapshot()?;
    let BlockContent::Surface { elements, .. } = &snap_del.block("surf").unwrap().content else {
        panic!("expected surface");
    };
    assert!(
        elements.is_empty(),
        "both sh-1 and conn-att must be deleted"
    );

    page.undo()?;
    assert_eq!(page.export_doc_json()?, before_delete);
    let snap_undo = page.read_page_snapshot()?;
    let BlockContent::Surface { elements, .. } = &snap_undo.block("surf").unwrap().content else {
        panic!("expected surface");
    };
    let ids: Vec<&str> = elements.iter().map(|e| e.id.as_str()).collect();
    assert!(
        ids.contains(&"sh-1") && ids.contains(&"conn-att"),
        "undo must restore both sh-1 and conn-att: {ids:?}"
    );

    page.redo()?;
    assert_eq!(page.export_doc_json()?, after_delete);
    Ok(())
}

#[test]
fn frame_child_ids_crdt_convergence_and_deletion_edge_cases() -> DocResult {
    use blocksuite_playground_doc::read::BlockContent;
    use blocksuite_playground_doc::schema::SurfaceElementSpec;
    use y_octo::SessionValue;

    let mut peer_a = PageDocSession::new("doc", 101)?;
    peer_a.add_block(
        "root",
        BlockSpec::Page {
            title: "Frame CRDT".into(),
        },
        None,
        None,
        1,
    )?;
    peer_a.add_frame_with_children(None, "f1", "a0", "F1", [0.0, 0.0, 400.0, 400.0], &[], 2)?;
    let snap0 = peer_a.read_page_snapshot()?;
    let surf_id = snap0
        .root
        .as_ref()
        .unwrap()
        .walk()
        .find(|n| matches!(n.content, BlockContent::Surface { .. }))
        .unwrap()
        .id
        .clone();
    for (sid, xy) in [("s1", [20.0, 20.0]), ("s2", [80.0, 80.0])] {
        peer_a.add_surface_element(
            &surf_id,
            sid,
            "a1",
            SurfaceElementSpec::Shape {
                shape_type: "rect".into(),
                xywh: format!("[{},{},40,40]", xy[0], xy[1]),
                seed: 1,
                filled: false,
                text: None,
            },
            3,
        )?;
    }

    // Clone initial state into peer_b so both share the exact same prop:childElementIds Y.Map.
    let mut peer_b = PageDocSession::new("doc", 202)?;
    let init_update = peer_a.encode_update_v1()?;
    peer_b.apply_remote_update_v1(&init_update)?;

    // Concurrent drag-in on peer_a (adds s1) and peer_b (adds s2) must keep BOTH keys after sync.
    let commit_a = peer_a
        .update_frame_child_element_ids("f1", &["s1".into()], &[], 10)?
        .unwrap();
    let commit_b = peer_b
        .update_frame_child_element_ids("f1", &["s2".into()], &[], 11)?
        .unwrap();
    peer_a.apply_remote_update_v1(&commit_b.update)?;
    peer_b.apply_remote_update_v1(&commit_a.update)?;
    for peer in [&peer_a, &peer_b] {
        let snap = peer.read_page_snapshot()?;
        let children = snap
            .block("f1")
            .unwrap()
            .props
            .get("prop:childElementIds")
            .unwrap()
            .as_object()
            .unwrap();
        assert_eq!(children.get("s1").and_then(|v| v.as_bool()), Some(true));
        assert_eq!(children.get("s2").and_then(|v| v.as_bool()), Some(true));
    }

    // Deleting s1 while f1 survives must prune "s1" from f1.prop:childElementIds and restore both in 1 Undo.
    peer_a.stop_capturing()?;
    peer_a.delete_blocks_and_elements_with_connectors(&[], &[(&surf_id, "s1")], 20)?;
    let snap_after_s1 = peer_a.read_page_snapshot()?;
    let children_after_s1 = snap_after_s1
        .block("f1")
        .unwrap()
        .props
        .get("prop:childElementIds")
        .unwrap()
        .as_object()
        .unwrap();
    assert!(children_after_s1.get("s1").is_none());
    assert_eq!(
        children_after_s1.get("s2").and_then(|v| v.as_bool()),
        Some(true)
    );
    peer_a.undo()?;
    let snap_undo_s1 = peer_a.read_page_snapshot()?;
    let children_undo_s1 = snap_undo_s1
        .block("f1")
        .unwrap()
        .props
        .get("prop:childElementIds")
        .unwrap()
        .as_object()
        .unwrap();
    assert_eq!(
        children_undo_s1.get("s1").and_then(|v| v.as_bool()),
        Some(true)
    );

    // Deleting only n1 while f1 survives must prune BOTH n1 and its descendant p_child from f1.
    peer_a.add_block(
        "n1",
        BlockSpec::Note {
            xywh: Some("[10,10,200,100]".into()),
        },
        Some("root"),
        None,
        30,
    )?;
    peer_a.add_block("p_child", paragraph("inside note"), Some("n1"), None, 31)?;
    peer_a.update_frame_child_element_ids("f1", &["n1".into(), "p_child".into()], &[], 32)?;
    peer_a.stop_capturing()?;
    peer_a.delete_blocks_and_elements_with_connectors(&["n1"], &[], 33)?;
    let snap_after_n1 = peer_a.read_page_snapshot()?;
    let children_after_n1 = snap_after_n1
        .block("f1")
        .unwrap()
        .props
        .get("prop:childElementIds")
        .unwrap()
        .as_object()
        .unwrap();
    assert!(children_after_n1.get("n1").is_none());
    assert!(
        children_after_n1.get("p_child").is_none(),
        "descendant p_child must also be pruned from surviving frame"
    );
    peer_a.undo()?;

    // Frame containing a Group (with child shape g_sh): deleting Frame recursively deletes Group + g_sh
    // and ignores `false` entries, while single-step Undo restores all.
    peer_a.add_surface_element(
        &surf_id,
        "g_sh",
        "a2",
        SurfaceElementSpec::Shape {
            shape_type: "rect".into(),
            xywh: "[120,120,40,40]".into(),
            seed: 2,
            filled: false,
            text: None,
        },
        34,
    )?;
    peer_a.add_surface_element(
        &surf_id,
        "g1",
        "a3",
        SurfaceElementSpec::Group {
            title: "G1".into(),
            seed: 3,
            children: vec!["g_sh".into()],
        },
        35,
    )?;
    // Explicitly mark s2 as `false` in prop:childElementIds.
    peer_a.set_block_prop(
        "f1",
        "prop:childElementIds",
        SessionValue::Map(vec![
            ("s1".into(), SessionValue::Any(Any::True)),
            ("s2".into(), SessionValue::Any(Any::False)),
            ("n1".into(), SessionValue::Any(Any::True)),
            ("p_child".into(), SessionValue::Any(Any::True)),
            ("g1".into(), SessionValue::Any(Any::True)),
        ]),
        36,
    )?;
    peer_a.stop_capturing()?;
    peer_a.delete_blocks_and_elements_with_connectors(&["f1"], &[], 40)?;
    let snap_del_f1 = peer_a.read_page_snapshot()?;
    assert!(snap_del_f1.block("f1").is_none());
    assert!(snap_del_f1.block("n1").is_none());
    assert!(snap_del_f1.block("p_child").is_none());
    let BlockContent::Surface { elements, .. } = &snap_del_f1.block(&surf_id).unwrap().content
    else {
        panic!("expected surface");
    };
    assert!(
        elements.iter().all(|e| e.id != "s1"),
        "s1 (true) must be deleted"
    );
    assert!(
        elements.iter().all(|e| e.id != "g1" && e.id != "g_sh"),
        "group g1 and its child g_sh must be deleted with frame"
    );
    assert!(
        elements.iter().any(|e| e.id == "s2"),
        "s2 (false) must be preserved"
    );
    peer_a.undo()?;
    let snap_undo_f1 = peer_a.read_page_snapshot()?;
    let BlockContent::Surface { elements, .. } = &snap_undo_f1.block(&surf_id).unwrap().content
    else {
        panic!("expected surface");
    };
    assert!(
        elements.iter().any(|e| e.id == "g1") && elements.iter().any(|e| e.id == "g_sh"),
        "single-step undo must restore frame, group, and group child"
    );

    // Multi-parent shared descendant: two Notes (note_a, note_b) both reference `shared_p`,
    // and Frame `f1` contains both `note_a` and `shared_p`. Deleting only `note_a` must keep
    // `shared_p` alive AND keep `shared_p: true` in `f1`'s `prop:childElementIds` on both peers.
    peer_a.add_block(
        "note_a",
        BlockSpec::Note {
            xywh: Some("[20,20,160,80]".into()),
        },
        Some("root"),
        None,
        50,
    )?;
    peer_a.add_block(
        "note_b",
        BlockSpec::Note {
            xywh: Some("[220,20,160,80]".into()),
        },
        Some("root"),
        None,
        51,
    )?;
    peer_a.add_block(
        "shared_p",
        paragraph("shared child"),
        Some("note_a"),
        None,
        52,
    )?;
    peer_a.structural_edit(53, |p| {
        let edges = y_octo::TypeTarget::Path(
            y_octo::TypePath::root("blocks")
                .key("note_b")
                .key("sys:children"),
        );
        p.inner_mut().array_push(
            &edges,
            vec![SessionValue::Any(Any::String("shared_p".into()))],
        )?;
        Ok(())
    })?;
    peer_a.update_frame_child_element_ids("f1", &["note_a".into(), "shared_p".into()], &[], 54)?;
    let mut peer_c = PageDocSession::new("doc", 203)?;
    peer_c.apply_remote_update_v1(&peer_a.encode_update_v1()?)?;
    peer_a.stop_capturing()?;
    let del_commit = peer_a.delete_blocks_and_elements_with_connectors(&["note_a"], &[], 55)?;
    peer_c.apply_remote_update_v1(&del_commit.unwrap().update)?;
    for peer in [&peer_a, &peer_c] {
        let snap = peer.read_page_snapshot()?;
        assert!(snap.block("note_a").is_none());
        assert!(snap.block("note_b").is_some());
        assert!(snap.block("shared_p").is_some());
        let children = snap
            .block("f1")
            .unwrap()
            .props
            .get("prop:childElementIds")
            .unwrap()
            .as_object()
            .unwrap();
        assert!(children.get("note_a").is_none());
        assert_eq!(
            children.get("shared_p").and_then(|v| v.as_bool()),
            Some(true),
            "surviving shared descendant must retain Frame membership on both peers"
        );
    }

    // Order-independence: deleting Frame `f1` (containing `note_a` and `shared_p`, but not
    // `note_b`) must keep both `note_b` and `shared_p` alive regardless of whether `root`'s
    // `sys:children` lists `[note_a, note_b]` or `[note_b, note_a]`.
    for note_a_first in [true, false] {
        let mut p = PageDocSession::new("doc-order", if note_a_first { 301 } else { 302 })?;
        p.add_block(
            "root",
            BlockSpec::Page {
                title: "Order".into(),
            },
            None,
            None,
            1,
        )?;
        let (first_note, second_note) = if note_a_first {
            ("note_a", "note_b")
        } else {
            ("note_b", "note_a")
        };
        p.add_block(
            first_note,
            BlockSpec::Note {
                xywh: Some("[20,20,160,80]".into()),
            },
            Some("root"),
            None,
            2,
        )?;
        p.add_block(
            second_note,
            BlockSpec::Note {
                xywh: Some("[220,20,160,80]".into()),
            },
            Some("root"),
            None,
            3,
        )?;
        p.add_block("shared_p", paragraph("shared"), Some("note_a"), None, 4)?;
        p.structural_edit(5, |page| {
            let edges = y_octo::TypeTarget::Path(
                y_octo::TypePath::root("blocks")
                    .key("note_b")
                    .key("sys:children"),
            );
            page.inner_mut().array_push(
                &edges,
                vec![SessionValue::Any(Any::String("shared_p".into()))],
            )?;
            Ok(())
        })?;
        p.add_block(
            "f1",
            BlockSpec::Frame {
                title: "F1".into(),
                xywh: Some("[0,0,400,200]".into()),
                presentation_index: Some("a0".into()),
            },
            Some("root"),
            None,
            6,
        )?;
        p.update_frame_child_element_ids("f1", &["note_a".into(), "shared_p".into()], &[], 7)?;
        p.stop_capturing()?;
        p.delete_blocks_and_elements_with_connectors(&["f1"], &[], 8)?;
        let snap = p.read_page_snapshot()?;
        assert!(snap.block("f1").is_none());
        assert!(snap.block("note_a").is_none());
        assert!(
            snap.block("note_b").is_some(),
            "note_a_first={note_a_first}"
        );
        assert!(
            snap.block("shared_p").is_some(),
            "shared_p must survive Frame deletion regardless of parent order (note_a_first={note_a_first})"
        );
    }
    Ok(())
}
