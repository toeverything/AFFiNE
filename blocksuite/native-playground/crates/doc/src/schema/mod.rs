mod blocks;
mod surface;

use std::collections::BTreeMap;

use y_octo::{SessionValue, TextDeltaOp, TextInsert};

pub use blocks::{BlockSpec, ListType, ParagraphType, UnknownBlock, is_leaf_flavour};
pub use surface::{ConnectorEndpointSpec, SurfaceElementSpec, map_array_any};

/// BlockSuite internal marker for `Boxed` values inside a `Y.Map`.
pub const NATIVE_UNIQ_IDENTIFIER: &str = "$blocksuite:internal:native$";

/// Default Note dimensions (`450 + 24 * 2`, `92`).
pub const DEFAULT_NOTE_WIDTH: f64 = 498.0;
pub const DEFAULT_NOTE_HEIGHT: f64 = 92.0;

/// Default roughness for surface shapes and connectors.
pub const DEFAULT_ROUGHNESS: f64 = 1.4;

/// Default highlighter stroke width.
pub const DEFAULT_HIGHLIGHTER_LINE_WIDTH: f64 = 22.0;

/// Default connector label max width.
pub const CONNECTOR_LABEL_MAX_WIDTH: f64 = 280.0;

/// Exact schema versions for all built-in `AffineSchemas` blocks.
pub fn affine_block_versions() -> BTreeMap<&'static str, i32> {
    BTreeMap::from([
        ("affine:attachment", 1),
        ("affine:bookmark", 1),
        ("affine:callout", 1),
        ("affine:code", 1),
        ("affine:data-view", 1),
        ("affine:database", 3),
        ("affine:divider", 1),
        ("affine:edgeless-text", 1),
        ("affine:embed-figma", 1),
        ("affine:embed-github", 1),
        ("affine:embed-html", 1),
        ("affine:embed-linked-doc", 1),
        ("affine:embed-loom", 1),
        ("affine:embed-synced-doc", 1),
        ("affine:embed-youtube", 1),
        ("affine:frame", 1),
        ("affine:image", 1),
        ("affine:latex", 1),
        ("affine:list", 1),
        ("affine:note", 1),
        ("affine:page", 2),
        ("affine:paragraph", 1),
        ("affine:surface", 5),
        ("affine:surface-ref", 1),
        ("affine:table", 1),
    ])
}

fn text_value(s: &str) -> SessionValue {
    if s.is_empty() {
        SessionValue::Text(Vec::new())
    } else {
        SessionValue::Text(vec![TextDeltaOp::Insert {
            insert: TextInsert::Text(s.to_string()),
            format: None,
        }])
    }
}
