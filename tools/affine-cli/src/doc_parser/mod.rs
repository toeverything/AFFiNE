mod block_spec;
mod blocksuite;
mod doc_loader;
mod error;
mod html;
mod markdown;
mod read;
#[cfg(test)]
mod roundtrip_tests;
mod schema;
mod table;
mod value;
mod write;

pub use error::ParseError;
pub use read::{
    BlockInfo, CrawlResult, MarkdownResult, PageDocContent, WorkspaceDocContent, get_doc_ids_from_binary,
    parse_doc_from_binary, parse_doc_to_markdown, parse_page_doc, parse_workspace_doc,
};
pub use write::{
    add_doc_to_root_doc, build_full_doc, build_public_root_doc, update_doc, update_doc_properties, update_doc_title,
    update_root_doc_meta_title,
};

/// Every block flavour this parser writes, paired with the `sys:version` it stamps on new
/// blocks. This is the CLI's hardcoded copy of BlockSuite's schema registry; the schema drift
/// test (`tests/schema_drift.rs`) checks each entry against the flavour and version declared
/// in the BlockSuite sources of this monorepo, so an upstream bump or rename fails the test
/// instead of silently writing stale blocks.
pub fn written_block_schemas() -> Vec<(&'static str, i32)> {
    let mut out: Vec<(&'static str, i32)> = vec![schema::PAGE_FLAVOUR, schema::NOTE_FLAVOUR, schema::SURFACE_FLAVOUR]
        .into_iter()
        .chain(block_spec::BlockFlavour::ALL.iter().map(|f| f.as_str()))
        .map(|flavour| (flavour, write::builder::block_version(flavour)))
        .collect();
    out.sort();
    out
}
