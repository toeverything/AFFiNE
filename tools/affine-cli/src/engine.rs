//! Pure-Rust doc-engine wrappers around `crate::doc_parser` (vendored) plus the few y-octo
//! primitives the CLI must drive directly (root-doc construction + root-doc merge).
//!
//! These functions never touch the store; they are pure binary -> binary transforms, which
//! makes them trivially unit-testable.

use crate::doc_parser;
use y_octo::{AHashMap, Any, Array, Doc, DocOptions, HashMapExt, Map, Value};

use crate::error::CliError;
use crate::fractional_index::generate_key_between;

/// Build a fresh page-doc binary (guid == doc_id) from markdown.
/// Wraps `doc_parser::build_full_doc` (create.rs:29).
pub fn build_full_doc(title: &str, markdown: &str, doc_id: &str) -> Result<Vec<u8>, CliError> {
    Ok(doc_parser::build_full_doc(title, markdown, doc_id)?)
}

/// Build the INITIAL root-workspace doc binary by hand.
///
/// There is no ready-made `doc_parser` helper for an empty root, so we mirror the meta
/// shape the app + `add_doc_to_root_doc` expect: a `meta` Y.Map with a `name` string and an
/// empty `pages` Y.Array. The doc's guid is set to the workspace id (== root doc guid).
pub fn build_root_doc(workspace_id: &str, name: &str) -> Result<Vec<u8>, CliError> {
    let doc = DocOptions::new().with_guid(workspace_id.to_string()).build();

    let mut meta: Map = doc.get_or_create_map("meta")?;
    meta.insert("name".to_string(), Any::String(name.to_string()))?;

    // Ensure meta.pages exists as an empty Y.Array.
    let pages: Array = doc.create_array()?;
    meta.insert("pages".to_string(), Value::Array(pages))?;

    Ok(doc.encode_update_v1()?)
}

/// Merge a snapshot binary (optional) and a series of update binaries into one full-state
/// binary, the canonical y-octo load-and-replay pattern (root_doc.rs:273-277).
///
/// Returns an empty Vec when there is nothing to merge — `add_doc_to_root_doc` accepts an
/// empty Vec and bootstraps a fresh root.
pub fn merge_doc(snapshot: Option<&[u8]>, updates: &[Vec<u8>]) -> Result<Vec<u8>, CliError> {
    if snapshot.is_none() && updates.is_empty() {
        return Ok(Vec::new());
    }
    let mut doc: Doc = DocOptions::new().build();
    if let Some(snap) = snapshot
        && !is_empty_doc_bin(snap)
    {
        doc.apply_update_from_binary_v1(snap)?;
    }
    for u in updates {
        if !is_empty_doc_bin(u) {
            doc.apply_update_from_binary_v1(u)?;
        }
    }
    Ok(doc.encode_update_v1()?)
}

/// Append a page entry to the root doc's `meta.pages` and return the DELTA update.
/// Wraps `doc_parser::add_doc_to_root_doc` (root_doc.rs:71) — takes root bin
/// BY VALUE, returns `encode_state_as_update_v1`.
pub fn add_doc_to_root(root_bin: Vec<u8>, doc_id: &str, title: Option<&str>) -> Result<Vec<u8>, CliError> {
    Ok(doc_parser::add_doc_to_root_doc(root_bin, doc_id, title)?)
}

/// Render a page doc to markdown. Wraps `parse_doc_to_markdown` (read/mod.rs:262) with
/// `ai_editable = false`, `doc_url_prefix = None`. Used by `doc read --format md` for the
/// Phase 0 round-trip proof.
pub fn parse_doc_to_markdown(doc_bin: Vec<u8>, doc_id: &str) -> Result<doc_parser::MarkdownResult, CliError> {
    Ok(doc_parser::parse_doc_to_markdown(
        doc_bin,
        doc_id.to_string(),
        false,
        None,
    )?)
}

/// An empty / sentinel y-octo binary ([], [0,0]) that should not be applied.
fn is_empty_doc_bin(bin: &[u8]) -> bool {
    bin.is_empty() || bin == [0, 0]
}

/// Run a mutation against a doc loaded from a (possibly empty) full-state binary and return the
/// DELTA update plus the closure's own return value.
///
/// Centralises the load → capture-state-vector → mutate → `encode_state_as_update_v1` dance that
/// every direct y-octo transform repeats. Capturing `state_before` BEFORE the mutation is what
/// makes the result a delta rather than a full-state update; folding it in here means a caller
/// can't forget the snapshot. The empty-bin guard matches `is_empty_doc_bin` so a brand-new root
/// / properties doc (passed as `[]` or `[0,0]`) bootstraps instead of erroring on apply.
///
/// All y-octo `Doc` mutators (`get_or_create_map`, `create_*`, `get_map`, …) take `&self`, so the
/// closure receives a shared `&Doc` and mutates through the handles it pulls off it.
fn with_delta<T>(
    bin: &[u8],
    guid: Option<&str>,
    mutate: impl FnOnce(&Doc) -> Result<T, CliError>,
) -> Result<(Vec<u8>, T), CliError> {
    let mut doc: Doc = match guid {
        Some(g) => DocOptions::new().with_guid(g.to_string()).build(),
        None => DocOptions::new().build(),
    };
    if !is_empty_doc_bin(bin) {
        doc.apply_update_from_binary_v1(bin)?;
    }
    let state_before = doc.get_state_vector();
    let out = mutate(&doc)?;
    Ok((doc.encode_state_as_update_v1(&state_before)?, out))
}

// ----------------------------------------------------------------------------
// Phase 1 — doc_parser thin wrappers
// ----------------------------------------------------------------------------

/// Replace a page doc's body from markdown. Wraps `doc_parser::update_doc` (update.rs:61).
/// Takes the existing FULL-state binary BY REFERENCE, returns a DELTA. Does NOT touch the
/// title or root meta.pages by design.
pub fn update_doc(existing_binary: &[u8], new_markdown: &str, doc_id: &str) -> Result<Vec<u8>, CliError> {
    Ok(doc_parser::update_doc(existing_binary, new_markdown, doc_id)?)
}

/// Update a page doc's title. Wraps `doc_parser::update_doc_title` (doc_meta.rs:7).
/// ARG ORDER: doc_id BEFORE title. Takes the existing bin BY REFERENCE, returns a DELTA.
pub fn update_doc_title(existing_binary: &[u8], doc_id: &str, title: &str) -> Result<Vec<u8>, CliError> {
    Ok(doc_parser::update_doc_title(existing_binary, doc_id, title)?)
}

/// Update the title stored in the root doc's `meta.pages` entry for `doc_id`. Wraps
/// `doc_parser::update_root_doc_meta_title` (doc_meta.rs:25). Root bin BY REFERENCE; returns
/// a DELTA. Tolerates an empty root and creates the page entry if it is missing.
pub fn update_root_doc_meta_title(root_bin: &[u8], doc_id: &str, title: &str) -> Result<Vec<u8>, CliError> {
    Ok(doc_parser::update_root_doc_meta_title(root_bin, doc_id, title)?)
}

/// Crawl a full-state page doc binary into a structured `CrawlResult` (blocks + title +
/// summary). Wraps `doc_parser::parse_doc_from_binary` (read/mod.rs:390). Bin BY VALUE.
/// ERRORS when the blocks map is empty (no doc / empty doc).
pub fn parse_doc_from_binary(doc_bin: Vec<u8>, doc_id: &str) -> Result<doc_parser::CrawlResult, CliError> {
    Ok(doc_parser::parse_doc_from_binary(doc_bin, doc_id.to_string())?)
}

/// Read the workspace name from a full-state root doc binary. Wraps `parse_workspace_doc`.
pub fn parse_workspace_name(root_bin: Vec<u8>) -> Result<Option<String>, CliError> {
    Ok(doc_parser::parse_workspace_doc(root_bin)?.map(|w| w.name))
}

/// List the (non-trashed) page ids registered in a root doc's `meta.pages`. Wraps
/// `get_doc_ids_from_binary(.., include_trash = false)` — matches the app's docCount semantics.
pub fn list_root_doc_ids(root_bin: Vec<u8>) -> Result<Vec<String>, CliError> {
    Ok(doc_parser::get_doc_ids_from_binary(root_bin, false)?)
}

// ----------------------------------------------------------------------------
// Phase 1 — net-new direct y-octo transforms
// ----------------------------------------------------------------------------

/// One page entry as read from the root doc's `meta.pages` (for `doc list`).
#[derive(Debug, Clone, serde::Serialize)]
pub struct RootPage {
    pub id: String,
    pub title: Option<String>,
    #[serde(rename = "createDate", skip_serializing_if = "Option::is_none")]
    pub create_date: Option<f64>,
}

/// Extract `Any::String` out of an optional map value.
fn any_string(v: Option<Value>) -> Option<String> {
    v.and_then(|v| v.to_any()).and_then(|a| match a {
        Any::String(s) => Some(s),
        _ => None,
    })
}

/// Read `meta.name` + the `meta.pages` array (id/title/createDate, trash skipped) directly
/// from a merged full-state root binary. There is no `doc_parser` helper that returns
/// pages WITH title/createDate (the `get_string` helper is `pub(super)`), so we do the
/// y-octo reads here. Mirrors read/mod.rs:560-587 + root_doc.rs:84-90.
pub fn read_root_meta(root_bin: Vec<u8>) -> Result<(Option<String>, Vec<RootPage>), CliError> {
    if is_empty_doc_bin(&root_bin) {
        return Ok((None, Vec::new()));
    }
    let mut doc: Doc = DocOptions::new().build();
    doc.apply_update_from_binary_v1(&root_bin)?;

    // A brand-new root may have no `meta` map yet — treat that as an empty list, not an error.
    let meta: Map = match doc.get_map("meta") {
        Ok(m) => m,
        Err(_) => return Ok((None, Vec::new())),
    };

    let name = any_string(meta.get("name"));

    let mut out = Vec::new();
    if let Some(pages) = meta.get("pages").as_ref().and_then(|v| v.to_array()) {
        for pv in pages.iter() {
            if let Some(page) = pv.to_map() {
                let id = match any_string(page.get("id")) {
                    Some(id) => id,
                    None => continue,
                };
                // Skip trashed pages (read/mod.rs:571-580).
                let trashed = matches!(page.get("trash").and_then(|v| v.to_any()), Some(Any::True));
                if trashed {
                    continue;
                }
                let title = any_string(page.get("title"));
                let create_date = page.get("createDate").and_then(|v| v.to_any()).and_then(|a| match a {
                    Any::Float64(f) => Some(f.into_inner()),
                    Any::Float32(f) => Some(f.into_inner() as f64),
                    Any::Integer(i) => Some(i as f64),
                    Any::BigInt64(i) => Some(i as f64),
                    _ => None,
                });
                out.push(RootPage { id, title, create_date });
            }
        }
    }
    Ok((name, out))
}

/// Remove the `meta.pages` entry whose `id == doc_id` and return the DELTA update.
/// No `doc_parser` helper exists (there is no `remove_doc_from_root_doc`), so we search
/// the Y.Array and remove the matching element. Returns a (possibly no-op) delta either way.
pub fn remove_doc_from_root(root_bin: Vec<u8>, doc_id: &str) -> Result<Vec<u8>, CliError> {
    Ok(with_delta(&root_bin, None, |doc| {
        let meta: Map = doc.get_or_create_map("meta")?;
        if let Some(mut pages) = meta.get("pages").as_ref().and_then(|v| v.to_array()) {
            let mut target = None;
            for idx in 0..pages.len() {
                if let Some(page) = pages.get(idx).and_then(|v| v.to_map())
                    && any_string(page.get("id")).as_deref() == Some(doc_id)
                {
                    target = Some(idx);
                    break;
                }
            }
            if let Some(idx) = target {
                pages.remove(idx, 1)?;
            }
        }
        Ok(())
    })?
    .0)
}

/// Set a doc's `primaryMode` ("page" | "edgeless") in the local `db$docProperties` Y.Doc and
/// return the DELTA update. The ORM stores each row as a TOP-LEVEL Y.Map named by the docId,
/// so the row is reached with `get_or_create_map(doc_id)` — NOT nested under a container.
/// We also stamp `id` to mirror exactly what the ORM's `create()` writes. The passed-in bin
/// must be a merged full-state binary (or empty for a brand-new properties doc).
pub fn set_doc_primary_mode(props_doc_bin: Vec<u8>, doc_id: &str, mode: &str) -> Result<Vec<u8>, CliError> {
    Ok(with_delta(&props_doc_bin, Some("db$docProperties"), |doc| {
        let mut row: Map = doc.get_or_create_map(doc_id)?;
        row.insert("id".to_string(), Any::String(doc_id.to_string()))?;
        row.insert("primaryMode".to_string(), Any::String(mode.to_string()))?;
        Ok(())
    })?
    .0)
}

// ----------------------------------------------------------------------------
// Phase 2 — edgeless surface element writers
// ----------------------------------------------------------------------------
//
// Each writer loads the page doc's FULL-state binary into a fresh Doc, captures the state
// vector BEFORE mutation, navigates `blocks` -> the `affine:surface` block -> its Boxed
// `prop:elements` -> the inner `value` Y.Map, inserts one new element Y.Map (keyed by a fresh
// nanoid == its own `id` field) with all required fields, and returns the DELTA update
// (`encode_state_as_update_v1(&state_before)`). The caller pushes the delta via
// `backend.push_update(doc_id, delta)`.
//
// Field schemas mirror blocksuite/affine/model element models exactly (V2 spec):
//   shape:     type, id, index, seed, xywh, shapeType, [text], [fillColor+filled], [strokeColor]
//   text:      type, id, index, seed, xywh, text(Y.Text), [color]
//   connector: type, id, index, seed, xywh("[0,0,0,0]"), source{}, target{}, mode, [text]
// source/target are PLAIN Any::Object{ id?, position? } — NOT nested Y.Map.

/// The Boxed native-type marker stored on `prop:elements.type` (BlockSuite `BOXED_NATIVE_TYPE`).
const BOXED_NATIVE_TYPE: &str = "$blocksuite:internal:native$";

// ----------------------------------------------------------------------------
// Colors — theme-aware visibility
// ----------------------------------------------------------------------------
//
// BlockSuite's `Color` is `string | { normal } | { dark, light }` (themes/color.ts), and
// `resolveColor(color, scheme)` reads `.light` on the light theme and `.dark` on the dark
// theme. The old CLI left text/stroke colors unset, so they fell back to the schema default
// (`pureBlack` for shape text) — invisible on AFFiNE's dark canvas. We now always set readable
// colors: shapes get a solid fill (the shape paints its own background) with a luminance-picked
// black/white label, and label-only elements (text elements, connector labels) get a
// theme-adaptive `{light,dark}` color so they read on both themes.

/// Default soft fill for shapes when none is given — a light tint that reads on any canvas.
const DEFAULT_SHAPE_FILL: &str = "#E8F0FE";
/// Default shape stroke — a mid grey that contrasts with both light fills and dark canvases.
const DEFAULT_SHAPE_STROKE: &str = "#5F6368";
/// Near-black / near-white label pair for theme-adaptive text.
const LABEL_LIGHT: &str = "#1E1E1E";
const LABEL_DARK: &str = "#EAEAEA";

/// A theme-adaptive `Color` object `{ light, dark }` (read by BlockSuite's `resolveColor`).
fn adaptive_color(light: &str, dark: &str) -> Any {
    let mut m = AHashMap::<String, Any>::new();
    m.insert("light".to_string(), Any::String(light.to_string()));
    m.insert("dark".to_string(), Any::String(dark.to_string()));
    Any::Object(m)
}

/// Theme-adaptive label color: near-black on light theme, near-white on dark theme.
fn adaptive_label_color() -> Any {
    adaptive_color(LABEL_LIGHT, LABEL_DARK)
}

/// Encode a number array as a SINGLE Y.Map value that survives the round-trip through the real
/// browser yjs library.
///
/// y-octo maps a bare top-level `Any::Array([a,b,c])` (stored directly as a Y.Map value) onto a
/// yjs `ContentAny` whose internal `values` list is `[a,b,c]` — i.e. THREE separate values. The
/// real yjs then returns only the LAST element from `Y.Map.get`, so `labelXYWH=[x,y,w,h]` was
/// read back in-app as the scalar `h`. BlockSuite's `serializeXYWH(...labelXYWH)` (connector view)
/// and the connector renderer then spread/iterate a number → `TypeError: Spread syntax requires
/// ...iterable[Symbol.iterator]`, which is thrown every frame in `CanvasRenderer._renderByBound`
/// and in `ConnectorElementView.onCreated`. That single throw poisons the whole edgeless surface:
/// stale pixels on pan (ghost-trails), no shape selection, no connector tool.
///
/// Wrapping once (`Any::Array([Any::Array([..])])`) makes `values` a single element that IS the
/// array, so yjs returns a plain JS array — byte-identical to what the app itself writes via
/// `yMap.set(key, [x,y,w,h])`. Verified against yjs 13.6.31 (examples/probe_array_encoding.rs).
///
/// NOTE: only arrays stored DIRECTLY as a Y.Map value need this. Arrays nested inside an
/// `Any::Object` value (e.g. connector source/target `position`) already round-trip correctly —
/// wrapping those would double-nest them. So this helper is for top-level element fields only.
fn yjs_number_array(nums: &[f64]) -> Any {
    Any::Array(vec![Any::Array(
        nums.iter().map(|n| Any::Float64((*n).into())).collect(),
    )])
}

/// Parse a `#rgb` / `#rrggbb` hex string into 0-255 components.
fn parse_hex(hex: &str) -> Option<(u8, u8, u8)> {
    let h = hex.trim().strip_prefix('#')?;
    // The slicing below is byte-indexed; a multibyte char (e.g. `#1é`) would panic mid-char.
    if !h.is_ascii() {
        return None;
    }
    match h.len() {
        3 => {
            let r = u8::from_str_radix(&h[0..1].repeat(2), 16).ok()?;
            let g = u8::from_str_radix(&h[1..2].repeat(2), 16).ok()?;
            let b = u8::from_str_radix(&h[2..3].repeat(2), 16).ok()?;
            Some((r, g, b))
        }
        6 => {
            let r = u8::from_str_radix(&h[0..2], 16).ok()?;
            let g = u8::from_str_radix(&h[2..4], 16).ok()?;
            let b = u8::from_str_radix(&h[4..6], 16).ok()?;
            Some((r, g, b))
        }
        _ => None,
    }
}

/// Pick a readable text color (`#1E1E1E` / `#FFFFFF`) for a solid fill via sRGB luminance.
fn text_color_for_fill(fill: &str) -> &'static str {
    match parse_hex(fill) {
        Some((r, g, b)) => {
            let lum = 0.2126 * (r as f64 / 255.0) + 0.7152 * (g as f64 / 255.0) + 0.0722 * (b as f64 / 255.0);
            if lum > 0.55 { "#1E1E1E" } else { "#FFFFFF" }
        }
        None => "#1E1E1E",
    }
}

/// A connector endpoint (BlockSuite `Connection`): at least one of `id` / `position`.
/// `id` anchors to another element; `position` is a free-floating `[x, y]` point.
#[derive(Debug, Clone, Default)]
pub struct Endpoint {
    pub id: Option<String>,
    pub position: Option<(f64, f64)>,
}

impl Endpoint {
    pub fn to_any(&self) -> Any {
        let mut m = AHashMap::<String, Any>::new();
        if let Some(id) = &self.id {
            m.insert("id".to_string(), Any::String(id.clone()));
        }
        if let Some((x, y)) = self.position {
            m.insert(
                "position".to_string(),
                Any::Array(vec![Any::Float64(x.into()), Any::Float64(y.into())]),
            );
        }
        Any::Object(m)
    }
}

/// Parameters for a shape element.
#[derive(Debug, Clone)]
pub struct ShapeParams {
    pub xywh: String,
    pub shape_type: String,
    pub fill: Option<String>,
    pub stroke: Option<String>,
    pub text: Option<String>,
    /// Deterministic seed override for tests; `None` => random uint32.
    pub seed: Option<i32>,
}

/// Parameters for a standalone text element.
#[derive(Debug, Clone)]
pub struct TextParams {
    pub xywh: String,
    pub text: String,
    pub color: Option<String>,
    pub seed: Option<i32>,
}

/// Parameters for a connector element.
#[derive(Debug, Clone)]
pub struct ConnectorParams {
    pub source: Endpoint,
    pub target: Endpoint,
    /// ConnectorMode int: 0 straight, 1 orthogonal/elbow, 2 curve.
    pub mode: i32,
    pub label: Option<String>,
    /// Absolute `[x, y, w, h]` box for the label. REQUIRED for the label to render: BlockSuite's
    /// `hasLabel()` returns false unless `labelXYWH` is set, so without it the label is silently
    /// dropped. `None` => the connector has no rendered label.
    pub label_xywh: Option<[f64; 4]>,
    pub seed: Option<i32>,
}

/// Locate the live `affine:surface` block map inside a loaded page doc.
fn find_surface_block(doc: &Doc) -> Result<Map, CliError> {
    let blocks: Map = doc.get_map("blocks")?;
    blocks
        .iter()
        .find_map(|(_, v)| {
            let m = v.to_map()?;
            match m.get("sys:flavour").and_then(|f| f.to_any()) {
                Some(Any::String(s)) if s == "affine:surface" => Some(m),
                _ => None,
            }
        })
        .ok_or_else(|| CliError::other("doc has no affine:surface block"))
}

/// Reach the inner `value` Y.Map of the surface block's Boxed `prop:elements` wrapper.
fn surface_value_map(surface: &Map) -> Result<Map, CliError> {
    let boxed: Map = surface
        .get("prop:elements")
        .and_then(|v| v.to_map())
        .ok_or_else(|| CliError::other("surface has no prop:elements"))?;
    // Sanity-check the Boxed native-type marker so we never write into a mis-shaped wrapper.
    if !matches!(
        boxed.get("type").and_then(|v| v.to_any()),
        Some(Any::String(ref s)) if s == BOXED_NATIVE_TYPE
    ) {
        return Err(CliError::other("prop:elements is not a Boxed native wrapper"));
    }
    boxed
        .get("value")
        .and_then(|v| v.to_map())
        .ok_or_else(|| CliError::other("boxed prop:elements has no value map"))
}

/// Compute the next fractional `index` by appending after the current max element index.
/// Empty surface => "a0"; otherwise generate_key_between(Some(max), None).
fn next_index(value_map: &Map) -> Result<String, CliError> {
    let mut max: Option<String> = None;
    for v in value_map.values() {
        if let Some(el) = v.to_map()
            && let Some(Any::String(idx)) = el.get("index").and_then(|x| x.to_any())
            && max.as_deref().map(|m| idx.as_str() > m).unwrap_or(true)
        {
            max = Some(idx);
        }
    }
    generate_key_between(max.as_deref(), None).map_err(|e| CliError::other(format!("index generation failed: {e}")))
}

/// Resolve a seed: explicit override (tests) or a random uint32 truncated to i32 bit-pattern.
fn resolve_seed(seed: Option<i32>) -> i32 {
    seed.unwrap_or_else(|| rand::random::<u32>() as i32)
}

/// Set a nested Y.Text field on an element from a plain string (attach-first, then fill).
fn set_text_field(doc: &Doc, el: &mut Map, key: &str, content: &str) -> Result<(), CliError> {
    let mut text = doc.create_text()?;
    el.insert(key.to_string(), Value::Text(text.clone()))?;
    if !content.is_empty() {
        text.insert(0, content)?;
    }
    Ok(())
}

/// Shared preamble for one element inside an already-loaded doc: find the surface value map,
/// mint an id + index + seed, and attach a fresh element Y.Map carrying the common base fields
/// (type/id/index/seed). Returns the new element id and the live element handle to fill in
/// type-specific fields. Operating on `&Doc` (not a binary) is what lets `create_diagram` put a
/// whole node/edge graph into ONE delta.
fn attach_element(doc: &Doc, element_type: &str, seed: Option<i32>) -> Result<(String, Map), CliError> {
    let surface = find_surface_block(doc)?;
    let mut value_map = surface_value_map(&surface)?;

    let element_id = nanoid::nanoid!();
    let index = next_index(&value_map)?;

    // Attach the element FIRST so child ops encode after their parent type.
    let element: Map = doc.create_map()?;
    value_map.insert(element_id.clone(), Value::Map(element))?;
    let mut el: Map = value_map
        .get(&element_id)
        .and_then(|v| v.to_map())
        .ok_or_else(|| CliError::other("element vanished after insert"))?;

    el.insert("type".to_string(), Any::String(element_type.to_string()))?;
    el.insert("id".to_string(), Any::String(element_id.clone()))?;
    el.insert("index".to_string(), Any::String(index))?;
    el.insert("seed".to_string(), Any::Integer(resolve_seed(seed)))?;

    Ok((element_id, el))
}

/// Insert a shape element into an already-loaded doc. Returns the element id.
fn insert_shape(doc: &Doc, params: &ShapeParams) -> Result<String, CliError> {
    let (element_id, mut el) = attach_element(doc, "shape", params.seed)?;

    el.insert("xywh".to_string(), Any::String(params.xywh.clone()))?;
    el.insert("shapeType".to_string(), Any::String(params.shape_type.clone()))?;
    el.insert("strokeWidth".to_string(), Any::Float64(2.0_f64.into()))?;
    el.insert("strokeStyle".to_string(), Any::String("solid".to_string()))?;
    // CRITICAL for visibility: `shapeStyle` is a no-fallback `@field()`, so when we write the
    // element map directly (bypassing the model's init that would seed it), the renderer reads
    // it as `undefined` and falls into the rough.js HACHURE path — light fills then render as
    // faint scratchy lines (near-invisible on the dark canvas), and rects break outright on the
    // `undefined` `radius`. Pinning "General" routes every shape to the clean solid renderer.
    el.insert("shapeStyle".to_string(), Any::String("General".to_string()))?;
    el.insert("radius".to_string(), Any::Float64(0.0_f64.into()))?;

    // Fill + label color. A shape paints its own background, so a solid fill keeps the label
    // readable on any canvas; the label color is luminance-picked for the fill behind it.
    // `transparent`/`none` keeps the shape unfilled and falls back to a theme-adaptive label.
    let label_color: Any = match params.fill.as_deref() {
        Some("transparent") | Some("none") => {
            el.insert("fillColor".to_string(), Any::String("transparent".to_string()))?;
            el.insert("filled".to_string(), Any::False)?;
            adaptive_label_color()
        }
        Some(fill) => {
            el.insert("fillColor".to_string(), Any::String(fill.to_string()))?;
            el.insert("filled".to_string(), Any::True)?;
            Any::String(text_color_for_fill(fill).to_string())
        }
        None => {
            el.insert("fillColor".to_string(), Any::String(DEFAULT_SHAPE_FILL.to_string()))?;
            el.insert("filled".to_string(), Any::True)?;
            Any::String(text_color_for_fill(DEFAULT_SHAPE_FILL).to_string())
        }
    };
    el.insert("color".to_string(), label_color)?;

    let stroke = params
        .stroke
        .clone()
        .unwrap_or_else(|| DEFAULT_SHAPE_STROKE.to_string());
    el.insert("strokeColor".to_string(), Any::String(stroke))?;

    if let Some(text) = &params.text {
        set_text_field(doc, &mut el, "text", text)?;
    }

    Ok(element_id)
}

/// Insert a shape element. Returns `(delta, element_id)`.
pub fn add_shape(doc_bin: &[u8], params: &ShapeParams) -> Result<(Vec<u8>, String), CliError> {
    with_delta(doc_bin, None, |doc| insert_shape(doc, params))
}

/// Insert a standalone text element into an already-loaded doc. Returns the element id.
fn insert_text(doc: &Doc, params: &TextParams) -> Result<String, CliError> {
    let (element_id, mut el) = attach_element(doc, "text", params.seed)?;

    el.insert("xywh".to_string(), Any::String(params.xywh.clone()))?;
    set_text_field(doc, &mut el, "text", &params.text)?;
    // No fill sits behind a text element, so default to a theme-adaptive color (readable on
    // both light and dark canvases) when the caller didn't pin a specific one.
    let color = match &params.color {
        Some(c) => Any::String(c.clone()),
        None => adaptive_label_color(),
    };
    el.insert("color".to_string(), color)?;

    Ok(element_id)
}

/// Insert a standalone text element. Returns `(delta, element_id)`.
pub fn add_text(doc_bin: &[u8], params: &TextParams) -> Result<(Vec<u8>, String), CliError> {
    with_delta(doc_bin, None, |doc| insert_text(doc, params))
}

/// Build the connector `labelStyle` object, mirroring BlockSuite's default (connector.ts:455)
/// but with a theme-adaptive color so the label is readable on the dark canvas.
fn connector_label_style() -> Any {
    let mut m = AHashMap::<String, Any>::new();
    m.insert("color".to_string(), adaptive_label_color());
    m.insert(
        "fontFamily".to_string(),
        Any::String("blocksuite:surface:Inter".to_string()),
    );
    m.insert("fontSize".to_string(), Any::Integer(16));
    m.insert("fontStyle".to_string(), Any::String("normal".to_string()));
    m.insert("fontWeight".to_string(), Any::String("400".to_string()));
    m.insert("textAlign".to_string(), Any::String("center".to_string()));
    Any::Object(m)
}

/// Insert a connector element into an already-loaded doc. Returns the element id.
/// `source`/`target` are written as PLAIN `Any::Object` (read back via `value.to_any()`), NOT
/// nested Y.Map. No xywh/rotate are persisted for connectors in-app, but we stamp the canonical
/// "[0,0,0,0]" placeholder.
fn insert_connector(doc: &Doc, params: &ConnectorParams) -> Result<String, CliError> {
    let (element_id, mut el) = attach_element(doc, "connector", params.seed)?;

    el.insert("xywh".to_string(), Any::String("[0,0,0,0]".to_string()))?;
    el.insert("source".to_string(), params.source.to_any())?;
    el.insert("target".to_string(), params.target.to_any())?;
    el.insert("mode".to_string(), Any::Integer(params.mode))?;
    el.insert("strokeWidth".to_string(), Any::Float64(2.0_f64.into()))?;
    el.insert("strokeStyle".to_string(), Any::String("solid".to_string()))?;
    // Theme-adaptive connector line color (default `connectorColor` is mid-grey but stored
    // unset it would render as the schema default; pin it so it reads on the dark canvas).
    el.insert("stroke".to_string(), adaptive_color("#5F6368", "#BDC1C6"))?;
    el.insert("frontEndpointStyle".to_string(), Any::String("None".to_string()))?;
    el.insert("rearEndpointStyle".to_string(), Any::String("Arrow".to_string()))?;

    if let Some(label) = &params.label {
        set_text_field(doc, &mut el, "text", label)?;
        el.insert("labelStyle".to_string(), connector_label_style())?;
        el.insert("labelDisplay".to_string(), Any::True)?;
        // `hasLabel()` (and thus label rendering) requires a truthy `labelXYWH`. Provide one when
        // the caller knows the connector's geometry; otherwise the label simply doesn't render
        // (no throw). Stored as a number array `[x,y,w,h]` (XYWH), not the serialized string form.
        // MUST go through `yjs_number_array` — a bare top-level `Any::Array` decodes to its last
        // element in the real yjs lib, which crashes the connector view + renderer (see helper).
        if let Some([x, y, w, h]) = params.label_xywh {
            el.insert("labelXYWH".to_string(), yjs_number_array(&[x, y, w, h]))?;
        }
    }

    Ok(element_id)
}

/// Insert a connector element. Returns `(delta, element_id)`.
pub fn add_connector(doc_bin: &[u8], params: &ConnectorParams) -> Result<(Vec<u8>, String), CliError> {
    with_delta(doc_bin, None, |doc| insert_connector(doc, params))
}

/// One edge of a `create_diagram` graph. `from`/`to` index into the `shapes` slice passed
/// alongside it — the connector anchors to the element ids minted for those shapes within the
/// same delta.
#[derive(Debug, Clone)]
pub struct DiagramEdgeParams {
    pub from: usize,
    pub to: usize,
    /// ConnectorMode int: 0 straight, 1 orthogonal/elbow, 2 curve.
    pub mode: i32,
    pub label: Option<String>,
    pub label_xywh: Option<[f64; 4]>,
}

/// Output of `create_diagram`: the single delta plus the minted element ids, parallel to the
/// `shapes` / `edges` inputs.
pub struct DiagramDelta {
    pub delta: Vec<u8>,
    pub shape_ids: Vec<String>,
    pub connector_ids: Vec<String>,
}

/// Build a whole diagram in ONE delta: optionally clear the surface, insert every shape, then
/// every connector.
///
/// Single-delta construction is what makes `diagram create` atomic at the store level: the
/// caller pushes exactly one update, so a crash mid-command can never leave a half-written
/// graph behind — and `replace` clears and rebuilds in the same update, closing the window
/// where the old per-push flow had already wiped the surface but not yet written the new
/// elements. It also avoids the old O(n²) re-merge of the full doc after every element.
pub fn create_diagram(
    doc_bin: &[u8],
    replace: bool,
    shapes: &[ShapeParams],
    edges: &[DiagramEdgeParams],
) -> Result<DiagramDelta, CliError> {
    for (i, e) in edges.iter().enumerate() {
        if e.from >= shapes.len() || e.to >= shapes.len() {
            return Err(CliError::other(format!(
                "edge {i} references shape index out of range ({}/{} of {})",
                e.from,
                e.to,
                shapes.len()
            )));
        }
    }
    let (delta, (shape_ids, connector_ids)) = with_delta(doc_bin, None, |doc| {
        if replace {
            let surface = find_surface_block(doc)?;
            let mut value_map = surface_value_map(&surface)?;
            let keys: Vec<String> = value_map.keys().map(|k| k.to_string()).collect();
            for k in keys {
                value_map.remove(&k);
            }
        }

        let mut shape_ids = Vec::with_capacity(shapes.len());
        for params in shapes {
            shape_ids.push(insert_shape(doc, params)?);
        }

        let mut connector_ids = Vec::with_capacity(edges.len());
        for e in edges {
            let params = ConnectorParams {
                source: Endpoint {
                    id: Some(shape_ids[e.from].clone()),
                    position: None,
                },
                target: Endpoint {
                    id: Some(shape_ids[e.to].clone()),
                    position: None,
                },
                mode: e.mode,
                label: e.label.clone(),
                label_xywh: e.label_xywh,
                seed: None,
            };
            connector_ids.push(insert_connector(doc, &params)?);
        }
        Ok((shape_ids, connector_ids))
    })?;
    Ok(DiagramDelta {
        delta,
        shape_ids,
        connector_ids,
    })
}

/// Remove every element from the surface's `prop:elements.value` map and return the DELTA.
/// Makes `diagram create --replace` idempotent: a re-run starts from a clean surface instead
/// of stacking a second copy of every shape/connector on top of the first.
pub fn clear_surface_elements(doc_bin: &[u8]) -> Result<Vec<u8>, CliError> {
    Ok(with_delta(doc_bin, None, |doc| {
        let surface = find_surface_block(doc)?;
        let mut value_map = surface_value_map(&surface)?;
        let keys: Vec<String> = value_map.keys().map(|k| k.to_string()).collect();
        for k in keys {
            value_map.remove(&k);
        }
        Ok(())
    })?
    .0)
}

/// Coerce a numeric `Any` (any int/float variant) into f64.
fn any_to_f64(a: &Any) -> Option<f64> {
    match a {
        Any::Float64(f) => Some(f.into_inner()),
        Any::Float32(f) => Some(f.into_inner() as f64),
        Any::Integer(i) => Some(*i as f64),
        Any::BigInt64(i) => Some(*i as f64),
        _ => None,
    }
}

/// Repair connector `labelXYWH` values written before the `yjs_number_array` fix.
///
/// A bare top-level `Any::Array` decoded to its LAST element in the real yjs lib, crashing the
/// whole edgeless surface (see `yjs_number_array`). y-octo's own reader, however, still returns
/// the full `[x,y,w,h]` for the bare form — so we can read the original coordinates back, then
/// re-write them in the wrapped form that real yjs reads correctly. Idempotent: re-running on an
/// already-fixed doc reads the same `[x,y,w,h]` and re-wraps to the identical value.
///
/// Returns `Ok(None)` when the doc has no edgeless surface (a plain note — nothing to repair),
/// `Ok(Some((delta, repaired_count)))` otherwise. A connector with no `labelXYWH` (unlabeled)
/// is left alone. Distinguishing no-surface from a real decode/store error matters for the bulk
/// repair path: a plain note is silently skipped, but corruption must surface to the caller.
pub fn rewrap_connector_labels(doc_bin: &[u8]) -> Result<Option<(Vec<u8>, usize)>, CliError> {
    // Pre-flight on a throwaway load: a missing surface block is a skip, not an error. Any
    // failure to APPLY the binary, however, propagates — that is real corruption.
    {
        let mut doc: Doc = DocOptions::new().build();
        doc.apply_update_from_binary_v1(doc_bin)?;
        if find_surface_block(&doc).is_err() {
            return Ok(None);
        }
    }
    with_delta(doc_bin, None, |doc| {
        let surface = find_surface_block(doc)?;
        let value_map = surface_value_map(&surface)?;

        let mut count = 0usize;
        for v in value_map.values() {
            let mut el = match v.to_map() {
                Some(m) => m,
                None => continue,
            };
            let is_connector = matches!(
                el.get("type").and_then(|x| x.to_any()),
                Some(Any::String(ref s)) if s == "connector"
            );
            if !is_connector {
                continue;
            }
            let nums: Option<Vec<f64>> = el.get("labelXYWH").and_then(|x| x.to_any()).and_then(|a| match a {
                Any::Array(items) => items.iter().map(any_to_f64).collect(),
                _ => None,
            });
            if let Some(nums) = nums
                && nums.len() == 4
            {
                // insert overwrites the existing key with the correctly-wrapped value.
                el.insert("labelXYWH".to_string(), yjs_number_array(&nums))?;
                count += 1;
            }
        }
        Ok(count)
    })
    .map(Some)
}

// ----------------------------------------------------------------------------
// Phase 3 — math equations (affine:latex block)
// ----------------------------------------------------------------------------

/// Locate the live `affine:note` block map inside a loaded page doc (the content container).
fn find_note_block(doc: &Doc) -> Result<Map, CliError> {
    let blocks: Map = doc.get_map("blocks")?;
    blocks
        .iter()
        .find_map(|(_, v)| {
            let m = v.to_map()?;
            match m.get("sys:flavour").and_then(|f| f.to_any()) {
                Some(Any::String(s)) if s == "affine:note" => Some(m),
                _ => None,
            }
        })
        .ok_or_else(|| CliError::other("doc has no affine:note block"))
}

/// Append an `affine:latex` equation block to the doc's note and return the DELTA update.
///
/// Mirrors `blocksuite/affine/model` `LatexBlockSchema` (flavour `affine:latex`, version 1):
/// `prop:latex` holds the TeX source as a plain string; the GFX props (`xywh`/`index`/`scale`/
/// `rotate`/`lockedBySelf`) match the model defaults so the block also behaves if dragged onto
/// the edgeless surface. The block is registered in the `blocks` map and its id is pushed onto
/// the note's `sys:children`, so it renders inline in page mode.
pub fn add_latex_block(doc_bin: &[u8], latex: &str) -> Result<(Vec<u8>, String), CliError> {
    with_delta(doc_bin, None, |doc| {
        let block_id = nanoid::nanoid!();

        // 1) Register the block in the top-level `blocks` map.
        let mut blocks: Map = doc.get_map("blocks")?;
        let empty: Map = doc.create_map()?;
        blocks.insert(block_id.clone(), Value::Map(empty))?;
        let mut block: Map = blocks
            .get(&block_id)
            .and_then(|v| v.to_map())
            .ok_or_else(|| CliError::other("latex block vanished after insert"))?;

        // 2) sys fields.
        block.insert("sys:id".to_string(), Any::String(block_id.clone()))?;
        block.insert("sys:flavour".to_string(), Any::String("affine:latex".to_string()))?;
        block.insert("sys:version".to_string(), Any::Integer(1))?;
        let children: Array = doc.create_array()?;
        block.insert("sys:children".to_string(), Value::Array(children))?;

        // 3) props.
        block.insert("prop:latex".to_string(), Any::String(latex.to_string()))?;
        block.insert("prop:xywh".to_string(), Any::String("[0,0,16,16]".to_string()))?;
        block.insert("prop:index".to_string(), Any::String("a0".to_string()))?;
        block.insert("prop:scale".to_string(), Any::Float64(1.0_f64.into()))?;
        block.insert("prop:rotate".to_string(), Any::Integer(0))?;
        block.insert("prop:lockedBySelf".to_string(), Any::False)?;

        // 4) Attach to the note's children so it renders in the page flow.
        let note = find_note_block(doc)?;
        let mut note_children: Array = note
            .get("sys:children")
            .and_then(|v| v.to_array())
            .ok_or_else(|| CliError::other("note has no sys:children array"))?;
        note_children.push(block_id.clone())?;

        Ok(block_id)
    })
}

#[cfg(test)]
mod surface_tests {
    use super::*;

    /// Build a fresh edgeless page doc (already carries an `affine:surface` block).
    fn fresh_doc() -> Vec<u8> {
        build_full_doc("Diagram", "# Diagram\n\nbody", "diagram-doc").expect("build")
    }

    /// Apply a delta onto the original full-state bin and return the merged full-state bin.
    fn apply_delta(base: &[u8], delta: &[u8]) -> Vec<u8> {
        let mut doc: Doc = DocOptions::new().build();
        doc.apply_update_from_binary_v1(base).expect("apply base");
        doc.apply_update_from_binary_v1(delta).expect("apply delta");
        doc.encode_update_v1().expect("re-encode")
    }

    /// Decode the surface `prop:elements.value` map from a full-state bin.
    fn decode_value_map(full: &[u8]) -> (Doc, Map) {
        let mut doc: Doc = DocOptions::new().build();
        doc.apply_update_from_binary_v1(full).expect("apply full");
        let surface = find_surface_block(&doc).expect("surface");
        let boxed = surface.get("prop:elements").and_then(|v| v.to_map()).unwrap();
        assert_eq!(
            boxed.get("type").and_then(|v| v.to_any()),
            Some(Any::String(BOXED_NATIVE_TYPE.to_string())),
            "Boxed native type marker preserved"
        );
        let value = boxed.get("value").and_then(|v| v.to_map()).unwrap();
        (doc, value)
    }

    fn any_str(el: &Map, key: &str) -> Option<String> {
        match el.get(key).and_then(|v| v.to_any()) {
            Some(Any::String(s)) => Some(s),
            _ => None,
        }
    }

    #[test]
    fn parse_hex_rejects_multibyte_instead_of_panicking() {
        // `#1é` is 3 bytes after `#` but slicing it byte-wise lands mid-char — must be None.
        assert_eq!(parse_hex("#1é"), None);
        assert_eq!(parse_hex("#12é4"), None);
        assert_eq!(parse_hex("#ééé"), None);
        assert_eq!(text_color_for_fill("#1é"), "#1E1E1E");
        // Sanity: valid forms still parse.
        assert_eq!(parse_hex("#fff"), Some((255, 255, 255)));
        assert_eq!(parse_hex("#1E1E1E"), Some((30, 30, 30)));
    }

    #[test]
    fn add_shape_persists_required_fields() {
        let base = fresh_doc();
        let params = ShapeParams {
            xywh: "[100,100,200,100]".to_string(),
            shape_type: "rect".to_string(),
            fill: Some("#ffe838".to_string()),
            stroke: None,
            text: Some("Hello".to_string()),
            seed: Some(123_456),
        };
        let (delta, id) = add_shape(&base, &params).expect("add_shape");
        assert!(!delta.is_empty(), "delta should be non-empty");

        let full = apply_delta(&base, &delta);
        let (_doc, value) = decode_value_map(&full);
        assert_eq!(value.len(), 1, "exactly one element");

        let el = value.get(&id).and_then(|v| v.to_map()).expect("element");
        // key == own id field.
        assert_eq!(any_str(&el, "id").as_deref(), Some(id.as_str()));
        assert_eq!(any_str(&el, "type").as_deref(), Some("shape"));
        assert_eq!(any_str(&el, "shapeType").as_deref(), Some("rect"));
        assert_eq!(any_str(&el, "xywh").as_deref(), Some("[100,100,200,100]"));
        assert_eq!(any_str(&el, "index").as_deref(), Some("a0"));
        assert_eq!(el.get("seed").and_then(|v| v.to_any()), Some(Any::Integer(123_456)));
        // fill -> fillColor + filled:true.
        assert_eq!(any_str(&el, "fillColor").as_deref(), Some("#ffe838"));
        assert_eq!(el.get("filled").and_then(|v| v.to_any()), Some(Any::True));
        // text round-trips as a nested Y.Text.
        let text = el.get("text").and_then(|v| v.to_text()).expect("Y.Text");
        assert_eq!(text.to_string(), "Hello");
    }

    #[test]
    fn shape_stroke_width_is_float_not_collapsed() {
        let base = fresh_doc();
        let params = ShapeParams {
            xywh: "[0,0,100,100]".to_string(),
            shape_type: "ellipse".to_string(),
            fill: None,
            stroke: None,
            text: None,
            seed: Some(0),
        };
        let (delta, id) = add_shape(&base, &params).unwrap();
        let full = apply_delta(&base, &delta);
        let (_d, value) = decode_value_map(&full);
        let el = value.get(&id).and_then(|v| v.to_map()).unwrap();
        match el.get("strokeWidth").and_then(|v| v.to_any()) {
            Some(Any::Float64(_)) => {}
            other => panic!("strokeWidth should be Float64, got {other:?}"),
        }
    }

    #[test]
    fn add_connector_source_target_are_objects() {
        let base = fresh_doc();
        // First add two shapes to anchor the connector.
        let (d1, a_id) = add_shape(
            &base,
            &ShapeParams {
                xywh: "[0,0,100,100]".to_string(),
                shape_type: "rect".to_string(),
                fill: None,
                stroke: None,
                text: None,
                seed: Some(1),
            },
        )
        .unwrap();
        let full1 = apply_delta(&base, &d1);

        let params = ConnectorParams {
            source: Endpoint {
                id: Some(a_id.clone()),
                position: None,
            },
            target: Endpoint {
                id: None,
                position: Some((300.0, 200.0)),
            },
            mode: 1,
            label: None,
            label_xywh: None,
            seed: Some(7),
        };
        let (d2, c_id) = add_connector(&full1, &params).expect("add_connector");
        let full2 = apply_delta(&full1, &d2);

        let (_d, value) = decode_value_map(&full2);
        let el = value.get(&c_id).and_then(|v| v.to_map()).expect("connector");
        assert_eq!(any_str(&el, "type").as_deref(), Some("connector"));
        assert_eq!(any_str(&el, "xywh").as_deref(), Some("[0,0,0,0]"));
        assert_eq!(el.get("mode").and_then(|v| v.to_any()), Some(Any::Integer(1)));

        // source is an Any::Object with id.
        match el.get("source").and_then(|v| v.to_any()) {
            Some(Any::Object(m)) => {
                assert_eq!(m.get("id"), Some(&Any::String(a_id.clone())));
            }
            other => panic!("source should be Any::Object, got {other:?}"),
        }
        // target is an Any::Object with position [300,200].
        match el.get("target").and_then(|v| v.to_any()) {
            Some(Any::Object(m)) => {
                assert_eq!(
                    m.get("position"),
                    Some(&Any::Array(vec![
                        Any::Float64(300.0.into()),
                        Any::Float64(200.0.into())
                    ]))
                );
            }
            other => panic!("target should be Any::Object, got {other:?}"),
        }
        // surface should now hold 2 elements.
        assert_eq!(value.len(), 2);
    }

    #[test]
    fn two_shapes_get_ordered_fractional_indices() {
        let base = fresh_doc();
        let (d1, _id1) = add_shape(
            &base,
            &ShapeParams {
                xywh: "[0,0,100,100]".to_string(),
                shape_type: "rect".to_string(),
                fill: None,
                stroke: None,
                text: None,
                seed: Some(0),
            },
        )
        .unwrap();
        let full1 = apply_delta(&base, &d1);

        let (d2, id2) = add_shape(
            &full1,
            &ShapeParams {
                xywh: "[200,0,100,100]".to_string(),
                shape_type: "rect".to_string(),
                fill: None,
                stroke: None,
                text: None,
                seed: Some(0),
            },
        )
        .unwrap();
        let full2 = apply_delta(&full1, &d2);

        let (_d, value) = decode_value_map(&full2);
        // gather all indices, assert two distinct strictly-ascending values, first == "a0".
        let mut indices: Vec<String> = value
            .values()
            .filter_map(|v| v.to_map())
            .filter_map(|el| any_str(&el, "index"))
            .collect();
        indices.sort();
        assert_eq!(indices.len(), 2);
        assert_eq!(indices[0], "a0");
        assert!(indices[0] < indices[1], "indices must be ascending");
        // The second-added shape has the larger index.
        let el2 = value.get(&id2).and_then(|v| v.to_map()).unwrap();
        assert_eq!(any_str(&el2, "index").as_deref(), Some(indices[1].as_str()));
    }

    #[test]
    fn add_text_element_round_trips() {
        let base = fresh_doc();
        let (delta, id) = add_text(
            &base,
            &TextParams {
                xywh: "[10,10,120,30]".to_string(),
                text: "Note".to_string(),
                color: Some("#000000".to_string()),
                seed: Some(5),
            },
        )
        .unwrap();
        let full = apply_delta(&base, &delta);
        let (_d, value) = decode_value_map(&full);
        let el = value.get(&id).and_then(|v| v.to_map()).unwrap();
        assert_eq!(any_str(&el, "type").as_deref(), Some("text"));
        let text = el.get("text").and_then(|v| v.to_text()).unwrap();
        assert_eq!(text.to_string(), "Note");
        assert_eq!(any_str(&el, "color").as_deref(), Some("#000000"));
    }

    #[test]
    fn latex_block_round_trips_through_reader() {
        // add_latex_block injects an affine:latex block; the production reader (read/mod.rs:527)
        // surfaces prop:latex as block content.
        let base = fresh_doc();
        let tex = "E = mc^2";
        let (delta, block_id) = add_latex_block(&base, tex).expect("add_latex_block");
        assert!(!delta.is_empty());
        let full = apply_delta(&base, &delta);

        // Structural: the block exists with the right flavour/version/prop and is a note child.
        let mut doc: Doc = DocOptions::new().build();
        doc.apply_update_from_binary_v1(&full).unwrap();
        let blocks: Map = doc.get_map("blocks").unwrap();
        let block = blocks.get(&block_id).and_then(|v| v.to_map()).expect("latex block");
        assert_eq!(any_str(&block, "sys:flavour").as_deref(), Some("affine:latex"));
        assert_eq!(any_str(&block, "prop:latex").as_deref(), Some(tex));
        assert_eq!(block.get("sys:version").and_then(|v| v.to_any()), Some(Any::Integer(1)));

        let note = find_note_block(&doc).unwrap();
        let children: Vec<String> = note
            .get("sys:children")
            .and_then(|v| v.to_array())
            .unwrap()
            .iter()
            .filter_map(|v| v.to_any())
            .filter_map(|a| match a {
                Any::String(s) => Some(s),
                _ => None,
            })
            .collect();
        assert!(
            children.contains(&block_id),
            "note children should include the latex block"
        );

        // Production reader surfaces the TeX as content.
        let result = parse_doc_from_binary(full, "diagram-doc").expect("parse");
        let found = result
            .blocks
            .iter()
            .any(|b| b.content.as_ref().is_some_and(|c| c.contains(&tex.to_string())));
        assert!(found, "production reader should surface the latex source");
    }

    #[test]
    fn clear_surface_elements_empties_the_value_map() {
        let base = fresh_doc();
        let (d1, _) = add_shape(
            &base,
            &ShapeParams {
                xywh: "[0,0,100,100]".to_string(),
                shape_type: "rect".to_string(),
                fill: None,
                stroke: None,
                text: None,
                seed: Some(0),
            },
        )
        .unwrap();
        let full1 = apply_delta(&base, &d1);
        let (_d, value) = decode_value_map(&full1);
        assert_eq!(value.len(), 1);

        let clear = clear_surface_elements(&full1).expect("clear");
        let full2 = apply_delta(&full1, &clear);
        let (_d2, value2) = decode_value_map(&full2);
        assert_eq!(value2.len(), 0, "surface should be empty after clear");
    }

    #[test]
    fn unfilled_shape_gets_adaptive_label_color() {
        // A shape with no fill should still be filled (default tint) with a readable label
        // color so it's visible on the dark canvas.
        let base = fresh_doc();
        let (delta, id) = add_shape(
            &base,
            &ShapeParams {
                xywh: "[0,0,120,60]".to_string(),
                shape_type: "rect".to_string(),
                fill: None,
                stroke: None,
                text: Some("Visible".to_string()),
                seed: Some(0),
            },
        )
        .unwrap();
        let full = apply_delta(&base, &delta);
        let (_d, value) = decode_value_map(&full);
        let el = value.get(&id).and_then(|v| v.to_map()).unwrap();
        // Default fill applied + filled true => label is a concrete black/white string.
        assert_eq!(el.get("filled").and_then(|v| v.to_any()), Some(Any::True));
        assert!(any_str(&el, "fillColor").is_some(), "default fill applied");
        assert!(any_str(&el, "color").is_some(), "a concrete label color is set");
        // strokeColor is always set now (was conditional before).
        assert!(any_str(&el, "strokeColor").is_some(), "stroke color is set");
        // shapeStyle must be the literal "General" or the renderer falls into the rough/hachure
        // path and light fills become invisible on the dark canvas.
        assert_eq!(any_str(&el, "shapeStyle").as_deref(), Some("General"));
    }

    #[test]
    fn labeled_shape_visible_through_production_reader() {
        // Proof B: gather_surface_texts via parse_doc_from_binary picks up the label.
        let base = fresh_doc();
        let (delta, _id) = add_shape(
            &base,
            &ShapeParams {
                xywh: "[0,0,100,100]".to_string(),
                shape_type: "rect".to_string(),
                fill: None,
                stroke: None,
                text: Some("Surface Label".to_string()),
                seed: Some(0),
            },
        )
        .unwrap();
        let full = apply_delta(&base, &delta);
        let result = parse_doc_from_binary(full, "diagram-doc").expect("parse");
        let surface = result
            .blocks
            .iter()
            .find(|b| b.flavour == "affine:surface")
            .expect("surface block");
        let content = surface.content.clone().unwrap_or_default();
        assert!(
            content.contains(&"Surface Label".to_string()),
            "production reader should surface the element text; got {content:?}"
        );
    }

    #[test]
    fn yjs_number_array_is_wrapped_for_real_yjs_compat() {
        // A bare top-level `Any::Array` decodes to its LAST element in the real browser yjs lib
        // (proven in examples/probe_array_encoding.rs against yjs 13.6.31 — it crashed every
        // connector-label render). CAVEAT / seam gap: y-octo's OWN reader collapses BOTH the bare
        // and the wrapped form back to `Array([..])`, so no round-trip test through y-octo can tell
        // the fix from the bug. This structural assertion on the helper's output is therefore the
        // only Rust seam that locks the fix; the authoritative check is the real-yjs probe.
        let v = yjs_number_array(&[1.0, 2.0, 3.0, 4.0]);
        match v {
            Any::Array(outer) => {
                assert_eq!(
                    outer.len(),
                    1,
                    "must encode as ONE outer value that IS the array, not N separate values"
                );
                match &outer[0] {
                    Any::Array(inner) => assert_eq!(inner.len(), 4, "inner holds the 4 numbers"),
                    other => panic!("inner value must be the number array, got {other:?}"),
                }
            }
            other => panic!("expected a wrapped Any::Array, got {other:?}"),
        }
    }

    #[test]
    fn rewrap_connector_labels_repairs_and_is_idempotent() {
        let base = fresh_doc();
        let (d1, a_id) = add_shape(
            &base,
            &ShapeParams {
                xywh: "[0,0,100,100]".to_string(),
                shape_type: "rect".to_string(),
                fill: None,
                stroke: None,
                text: None,
                seed: Some(1),
            },
        )
        .unwrap();
        let full1 = apply_delta(&base, &d1);

        let (d2, c_id) = add_connector(
            &full1,
            &ConnectorParams {
                source: Endpoint {
                    id: Some(a_id),
                    position: None,
                },
                target: Endpoint {
                    id: None,
                    position: Some((300.0, 200.0)),
                },
                mode: 1,
                label: Some("hi".to_string()),
                label_xywh: Some([10.0, 20.0, 30.0, 40.0]),
                seed: Some(7),
            },
        )
        .unwrap();
        let full2 = apply_delta(&full1, &d2);

        let (rd, count) = rewrap_connector_labels(&full2).unwrap().expect("doc has a surface");
        assert_eq!(count, 1, "the one labeled connector is repaired");
        let full3 = apply_delta(&full2, &rd);

        let (_d, value) = decode_value_map(&full3);
        let el = value.get(&c_id).and_then(|v| v.to_map()).unwrap();
        // y-octo reads the wrapped form back as the flat 4-array — coordinates preserved exactly.
        match el.get("labelXYWH").and_then(|v| v.to_any()) {
            Some(Any::Array(items)) => {
                let nums: Vec<f64> = items.iter().filter_map(any_to_f64).collect();
                assert_eq!(nums, vec![10.0, 20.0, 30.0, 40.0]);
            }
            other => panic!("labelXYWH should read back as a 4-array, got {other:?}"),
        }

        // Idempotent: a second pass still finds & re-wraps the same value.
        let (_rd2, count2) = rewrap_connector_labels(&full3).unwrap().expect("doc has a surface");
        assert_eq!(count2, 1, "re-running is a no-op in effect");
    }

    #[test]
    fn rewrap_connector_labels_skips_docs_without_surface() {
        // A root/workspace doc has no `blocks` map at all — that's a skip (None), not an error.
        let root = build_root_doc("w", "name").unwrap();
        assert!(rewrap_connector_labels(&root).unwrap().is_none());
    }

    #[test]
    fn create_diagram_is_one_delta_and_replace_clears() {
        let base = fresh_doc();
        // Pre-existing element that `replace` must remove — in the SAME delta as the new graph.
        let (d0, old_id) = add_shape(
            &base,
            &ShapeParams {
                xywh: "[500,500,50,50]".to_string(),
                shape_type: "rect".to_string(),
                fill: None,
                stroke: None,
                text: None,
                seed: Some(1),
            },
        )
        .unwrap();
        let full0 = apply_delta(&base, &d0);

        let shapes = vec![
            ShapeParams {
                xywh: "[0,0,100,60]".to_string(),
                shape_type: "rect".to_string(),
                fill: None,
                stroke: None,
                text: Some("A".to_string()),
                seed: Some(2),
            },
            ShapeParams {
                xywh: "[200,0,100,60]".to_string(),
                shape_type: "ellipse".to_string(),
                fill: None,
                stroke: None,
                text: Some("B".to_string()),
                seed: Some(3),
            },
        ];
        let edges = vec![DiagramEdgeParams {
            from: 0,
            to: 1,
            mode: 1,
            label: Some("e".to_string()),
            label_xywh: Some([10.0, 20.0, 30.0, 40.0]),
        }];
        let DiagramDelta {
            delta,
            shape_ids,
            connector_ids: conn_ids,
        } = create_diagram(&full0, true, &shapes, &edges).unwrap();
        assert_eq!(shape_ids.len(), 2);
        assert_eq!(conn_ids.len(), 1);

        let full = apply_delta(&full0, &delta);
        let (_doc, value) = decode_value_map(&full);
        assert_eq!(value.len(), 3, "old element cleared; 2 shapes + 1 connector remain");
        assert!(value.get(&old_id).is_none(), "replace removed the pre-existing element");

        // The connector's endpoints reference the shape ids minted in the same delta.
        let conn = value.get(&conn_ids[0]).and_then(|v| v.to_map()).expect("connector");
        match conn.get("source").and_then(|v| v.to_any()) {
            Some(Any::Object(m)) => assert_eq!(m.get("id"), Some(&Any::String(shape_ids[0].clone()))),
            other => panic!("source should be Any::Object, got {other:?}"),
        }
        match conn.get("target").and_then(|v| v.to_any()) {
            Some(Any::Object(m)) => assert_eq!(m.get("id"), Some(&Any::String(shape_ids[1].clone()))),
            other => panic!("target should be Any::Object, got {other:?}"),
        }
    }

    #[test]
    fn create_diagram_rejects_out_of_range_edge_index() {
        let base = fresh_doc();
        let shapes = vec![ShapeParams {
            xywh: "[0,0,100,60]".to_string(),
            shape_type: "rect".to_string(),
            fill: None,
            stroke: None,
            text: None,
            seed: Some(1),
        }];
        let edges = vec![DiagramEdgeParams {
            from: 0,
            to: 5,
            mode: 0,
            label: None,
            label_xywh: None,
        }];
        assert!(create_diagram(&base, false, &shapes, &edges).is_err());
    }
}
