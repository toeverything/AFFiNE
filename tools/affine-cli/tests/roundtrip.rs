//! Engine-level round-trip: build a page doc, render it back to markdown, and confirm the
//! root-doc merge + add_doc_to_root pipeline produces a non-empty delta. This exercises the
//! same pure functions the CLI commands call, without touching the filesystem/store.

use affine_cli::doc_parser;

#[test]
fn build_then_parse_roundtrips_title_and_body() {
    let doc_id = "test-doc-id";
    let title = "Hello";
    let markdown = "# Hello\n\nworld";

    let bin = doc_parser::build_full_doc(title, markdown, doc_id).expect("build_full_doc");
    assert!(!bin.is_empty(), "doc binary should be non-empty");

    let parsed = doc_parser::parse_doc_to_markdown(bin, doc_id.to_string(), false, None).expect("parse");

    assert_eq!(parsed.title, title);
    assert!(
        parsed.markdown.contains("world"),
        "rendered markdown should contain the body; got: {:?}",
        parsed.markdown
    );
}

#[test]
fn add_doc_to_empty_root_bootstraps_and_returns_delta() {
    let doc_id = "test-doc-id";
    // Empty root bin bootstraps a fresh root and appends meta.pages entry.
    let delta = doc_parser::add_doc_to_root_doc(Vec::new(), doc_id, Some("Hello")).expect("add_doc_to_root_doc");
    assert!(!delta.is_empty(), "root delta should be non-empty");
}
