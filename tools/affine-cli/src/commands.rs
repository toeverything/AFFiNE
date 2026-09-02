//! Command handlers. Each returns a `serde_json::Value` on success or a `CliError`.

use std::collections::HashSet;
use std::io::Write;

use serde_json::Value;
use serde_json::json;

use crate::cli::*;
use crate::engine;
use crate::error::CliError;
use crate::layout;
use crate::paths;
use crate::store::{DOC_SEARCH_INDEX, DocBackend, LocalBackend};

/// Resolve the effective base dir from globals.
fn base(global: &GlobalArgs) -> Result<std::path::PathBuf, CliError> {
    paths::base_dir(global.affine_dir.as_deref(), &global.product)
}

/// Resolve the effective workspace id (per-command override beats global).
fn resolve_workspace(per_cmd: Option<&str>, global: &GlobalArgs) -> Result<String, CliError> {
    per_cmd
        .map(str::to_string)
        .or_else(|| global.workspace.clone())
        .ok_or_else(|| CliError::config("a workspace id is required (--workspace)"))
}

fn read_markdown(content: Option<&str>, md_file: Option<&str>) -> Result<String, CliError> {
    match (content, md_file) {
        (Some(c), _) => Ok(c.to_string()),
        (None, Some(path)) => Ok(std::fs::read_to_string(path)?),
        (None, None) => Ok(String::new()),
    }
}

/// Refuse to write into a workspace whose database another process (typically the running
/// AFFiNE app) has open right now: the app does not watch for external writes and may clobber
/// them when it saves. `--force` overrides. Best-effort — see `store::db_in_use_elsewhere`.
/// Read-only commands skip this guard on purpose.
fn guard_workspace_writable(global: &GlobalArgs, base: &std::path::Path, workspace_id: &str) -> Result<(), CliError> {
    if global.force {
        return Ok(());
    }
    let db = paths::workspace_db_path(base, &global.peer, workspace_id);
    if crate::store::db_in_use_elsewhere(&db) {
        return Err(CliError::Locked(format!(
            "workspace {workspace_id} is open in another process (probably the AFFiNE app); \
             writing now risks the app overwriting the change when it saves. Close the \
             workspace in the app first, or pass --force to write anyway"
        )));
    }
    Ok(())
}

/// Reject doc ids that mutating doc/diagram commands must never target: the workspace's own
/// root doc (doc_id == workspace_id — deleting it would destroy the page registry) and the
/// internal database docs (`db$docProperties`, `db$folders`, `userdata$…` — writing markdown
/// blocks into them garbles app state). Agents pass ids programmatically; one swapped variable
/// must fail loudly, not corrupt the store.
fn validate_doc_target(doc_id: &str, workspace_id: &str) -> Result<(), CliError> {
    if doc_id == workspace_id {
        return Err(CliError::config(format!(
            "doc id equals the workspace id ({workspace_id}) — that is the workspace's root \
             doc, which doc/diagram commands must not modify"
        )));
    }
    if doc_id.starts_with("db$") || doc_id.starts_with("userdata$") {
        return Err(CliError::config(format!(
            "doc id '{doc_id}' is an internal database doc, not a page; refusing to modify it"
        )));
    }
    Ok(())
}

/// Parse and canonicalize an `"[x,y,w,h]"` box. Malformed geometry must be rejected HERE: the
/// app `JSON.parse`s this string inside the renderer, and one throwing element poisons the
/// whole edgeless surface (no selection, ghost-trails on pan — see
/// docs/affine-cli-edgeless-render-postmortem.md for the labelXYWH instance of this class).
fn parse_xywh(s: &str) -> Result<String, CliError> {
    let bad = || {
        CliError::config(format!(
            "invalid xywh '{s}' (expected \"[x,y,w,h]\" with finite numbers and positive w/h)"
        ))
    };
    let inner = s
        .trim()
        .strip_prefix('[')
        .and_then(|t| t.strip_suffix(']'))
        .ok_or_else(bad)?;
    let nums = inner
        .split(',')
        .map(|p| p.trim().parse::<f64>().ok())
        .collect::<Option<Vec<f64>>>()
        .ok_or_else(bad)?;
    if nums.len() != 4 || nums.iter().any(|n| !n.is_finite()) || nums[2] <= 0.0 || nums[3] <= 0.0 {
        return Err(bad());
    }
    Ok(format!("[{},{},{},{}]", nums[0], nums[1], nums[2], nums[3]))
}

/// Load a doc's snapshot + updates from `backend` and merge them into one full-state binary.
/// Returns an empty Vec when the doc has neither a snapshot nor any updates (== not found).
async fn merge_target(backend: &LocalBackend, doc_id: &str) -> Result<Vec<u8>, CliError> {
    let snapshot = backend.get_doc_snapshot(doc_id).await?;
    let updates = backend.get_doc_updates(doc_id).await?;
    let update_bins: Vec<Vec<u8>> = updates.into_iter().map(|u| u.bin).collect();
    engine::merge_doc(snapshot.as_ref().map(|s| s.bin.as_slice()), &update_bins)
}

// ----------------------------------------------------------------------------
// Phase 0 — fully implemented
// ----------------------------------------------------------------------------

/// `workspace create --name` (R7 §d).
pub async fn workspace_create(global: &GlobalArgs, args: &WorkspaceCreateArgs) -> Result<Value, CliError> {
    let base = base(global)?;
    let id = nanoid::nanoid!();

    let backend = LocalBackend::open(&base, &global.peer, &id).await?;
    // connect() leaves meta.space_id empty; set it (electron does this after connect).
    backend.set_space_id(&id).await?;

    // Build the root doc (meta.name + empty meta.pages) and persist it under doc_id == id.
    let root_bin = engine::build_root_doc(&id, &args.name)?;
    backend.push_update(&id, &root_bin).await?;

    let db_path = LocalBackend::db_path(&base, &global.peer, &id);
    Ok(json!({
        "ok": true,
        "id": id,
        "name": args.name,
        "peer": global.peer,
        "path": db_path.to_string_lossy(),
    }))
}

/// `doc create --workspace --title (--content | --md-file)` (R2 + R7 §e).
pub async fn doc_create(global: &GlobalArgs, args: &DocCreateArgs) -> Result<Value, CliError> {
    let base = base(global)?;
    let workspace_id = resolve_workspace(args.workspace.as_deref(), global)?;
    guard_workspace_writable(global, &base, &workspace_id)?;
    let markdown = read_markdown(args.content.as_deref(), args.md_file.as_deref())?;

    let doc_id = nanoid::nanoid!();

    // Step A: build the page doc binary (guid == doc_id).
    let bin = engine::build_full_doc(&args.title, &markdown, &doc_id)?;

    // Step B: open the (existing) workspace store and persist the doc.
    let backend = LocalBackend::open_existing(&base, &global.peer, &workspace_id).await?;
    backend.push_update(&doc_id, &bin).await?;

    // Step C: load + merge the existing root doc (snapshot + updates).
    let snapshot = backend.get_doc_snapshot(&workspace_id).await?;
    let updates = backend.get_doc_updates(&workspace_id).await?;
    let update_bins: Vec<Vec<u8>> = updates.into_iter().map(|u| u.bin).collect();
    let root_bin = engine::merge_doc(snapshot.as_ref().map(|s| s.bin.as_slice()), &update_bins)?;

    // Step D: append to meta.pages -> DELTA.
    let delta = engine::add_doc_to_root(root_bin, &doc_id, Some(&args.title))?;

    // Step E: persist the root delta under doc_id == workspace id.
    backend.push_update(&workspace_id, &delta).await?;

    Ok(json!({
        "ok": true,
        "docId": doc_id,
        "workspaceId": workspace_id,
        "title": args.title,
    }))
}

/// `doc read --format md | json`. Merges the page doc back from the store, then either renders
/// markdown (`md`) or returns the structured block crawl (`json`).
pub async fn doc_read(global: &GlobalArgs, args: &DocReadArgs) -> Result<Value, CliError> {
    let base = base(global)?;
    let workspace_id = resolve_workspace(args.workspace.as_deref(), global)?;

    let backend = LocalBackend::open_existing(&base, &global.peer, &workspace_id).await?;
    let merged = merge_target(&backend, &args.doc).await?;
    if merged.is_empty() {
        return Err(CliError::other(format!("doc not found: {}", args.doc)));
    }

    match args.format.as_str() {
        "md" => {
            let result = engine::parse_doc_to_markdown(merged, &args.doc)?;
            Ok(json!({
                "ok": true,
                "docId": args.doc,
                "title": result.title,
                "markdown": result.markdown,
            }))
        }
        "json" => {
            let result = engine::parse_doc_from_binary(merged, &args.doc)?;
            Ok(json!({
                "ok": true,
                "docId": args.doc,
                "title": result.title,
                "summary": result.summary,
                "blocks": result.blocks,
            }))
        }
        _ => Err(CliError::config("--format must be md or json")),
    }
}

// ----------------------------------------------------------------------------
// Phase 1 — workspace + doc management
// ----------------------------------------------------------------------------

/// `workspace list` — scan `<base>/workspaces/<peer>/*/storage.db`, skipping deleted-workspace
/// ids, then read each root doc's name + (non-trashed) page count. Mirrors electron's
/// `listLocalWorkspaceIds`.
pub async fn workspace_list(global: &GlobalArgs) -> Result<Value, CliError> {
    let base = base(global)?;
    let dir = paths::workspaces_dir(&base, &global.peer);

    // `<base>/deleted-workspaces` is a SIBLING of `workspaces` (not under <peer>).
    let deleted: HashSet<String> = match std::fs::read_dir(base.join("deleted-workspaces")) {
        Ok(entries) => entries
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .collect(),
        Err(_) => HashSet::new(),
    };

    let read_dir = match std::fs::read_dir(&dir) {
        Ok(rd) => rd,
        // No workspaces dir yet -> empty list (not an error).
        Err(_) => return Ok(json!([])),
    };

    let mut out = Vec::new();
    for entry in read_dir.filter_map(|e| e.ok()) {
        let id = entry.file_name().to_string_lossy().into_owned();
        if deleted.contains(&id) {
            continue;
        }
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        if !path.join("storage.db").exists() {
            continue;
        }

        let db_path = LocalBackend::db_path(&base, &global.peer, &id);
        // One unreadable workspace (corrupt DB, schema from a newer app, …) must not brick the
        // whole listing — report it as an entry with an `error` field and keep going.
        match read_workspace_entry(&base, global, &id).await {
            Ok((name, doc_count)) => out.push(json!({
                "id": id,
                "name": name,
                "docCount": doc_count,
                "peer": global.peer,
                "path": db_path.to_string_lossy(),
            })),
            Err(e) => out.push(json!({
                "id": id,
                "peer": global.peer,
                "path": db_path.to_string_lossy(),
                "error": e.to_string(),
            })),
        }
    }

    Ok(json!(out))
}

/// Open one workspace and read its display name + non-trashed doc count from the root doc.
async fn read_workspace_entry(
    base: &std::path::Path,
    global: &GlobalArgs,
    id: &str,
) -> Result<(String, usize), CliError> {
    let backend = LocalBackend::open_existing(base, &global.peer, id).await?;
    let root_bin = merge_target(&backend, id).await?;
    if root_bin.is_empty() {
        return Ok((String::new(), 0));
    }
    let name = engine::parse_workspace_name(root_bin.clone())?.unwrap_or_default();
    let ids = engine::list_root_doc_ids(root_bin)?;
    Ok((name, ids.len()))
}

/// `doc list --workspace` — enumerate the (non-trashed) pages from the workspace root meta.
pub async fn doc_list(global: &GlobalArgs, args: &DocListArgs) -> Result<Value, CliError> {
    let base = base(global)?;
    let workspace_id = resolve_workspace(args.workspace.as_deref(), global)?;

    let backend = LocalBackend::open_existing(&base, &global.peer, &workspace_id).await?;
    let root_bin = merge_target(&backend, &workspace_id).await?;
    if root_bin.is_empty() {
        return Err(CliError::other(format!("workspace not found: {workspace_id}")));
    }

    let (_name, pages) = engine::read_root_meta(root_bin)?;
    Ok(json!(pages))
}

/// `doc update --workspace --doc (--content | --md-file)` — replace the page body from markdown.
/// Does NOT touch the title or root meta.pages (by design of `update_doc`).
pub async fn doc_update(global: &GlobalArgs, args: &DocUpdateArgs) -> Result<Value, CliError> {
    let base = base(global)?;
    let workspace_id = resolve_workspace(args.workspace.as_deref(), global)?;
    validate_doc_target(&args.doc, &workspace_id)?;
    guard_workspace_writable(global, &base, &workspace_id)?;
    let markdown = read_markdown(args.content.as_deref(), args.md_file.as_deref())?;

    let backend = LocalBackend::open_existing(&base, &global.peer, &workspace_id).await?;
    let existing = merge_target(&backend, &args.doc).await?;
    if existing.is_empty() {
        return Err(CliError::other(format!("doc not found: {}", args.doc)));
    }

    let delta = engine::update_doc(&existing, &markdown, &args.doc)?;
    backend.push_update(&args.doc, &delta).await?;

    // Re-index the updated body so `search` reflects the change.
    if let Err(e) = reindex_doc(&backend, &args.doc).await {
        eprintln!("warning: failed to re-index {}: {e}", args.doc);
    }

    Ok(json!({
        "ok": true,
        "docId": args.doc,
        "workspaceId": workspace_id,
    }))
}

/// `doc set-title --workspace --doc --title` — push BOTH the page-doc title delta AND the
/// root meta.pages title delta, so `doc list` / `workspace list` reflect the new title.
pub async fn doc_set_title(global: &GlobalArgs, args: &DocSetTitleArgs) -> Result<Value, CliError> {
    let base = base(global)?;
    let workspace_id = resolve_workspace(args.workspace.as_deref(), global)?;
    validate_doc_target(&args.doc, &workspace_id)?;
    guard_workspace_writable(global, &base, &workspace_id)?;

    let backend = LocalBackend::open_existing(&base, &global.peer, &workspace_id).await?;

    // (a) Page doc title.
    let existing = merge_target(&backend, &args.doc).await?;
    if existing.is_empty() {
        return Err(CliError::other(format!("doc not found: {}", args.doc)));
    }
    let delta_doc = engine::update_doc_title(&existing, &args.doc, &args.title)?;
    backend.push_update(&args.doc, &delta_doc).await?;

    // (b) Root meta.pages title.
    let root_bin = merge_target(&backend, &workspace_id).await?;
    let delta_root = engine::update_root_doc_meta_title(&root_bin, &args.doc, &args.title)?;
    backend.push_update(&workspace_id, &delta_root).await?;

    // Keep the search index title in sync.
    if let Err(e) = reindex_doc(&backend, &args.doc).await {
        eprintln!("warning: failed to re-index {}: {e}", args.doc);
    }

    Ok(json!({
        "ok": true,
        "docId": args.doc,
        "workspaceId": workspace_id,
        "title": args.title,
    }))
}

/// `doc set-mode --workspace --doc --mode page|edgeless` — write `primaryMode` into the local
/// `db$docProperties` Y.Doc row (top-level map named by docId).
pub async fn doc_set_mode(global: &GlobalArgs, args: &DocSetModeArgs) -> Result<Value, CliError> {
    if args.mode != "page" && args.mode != "edgeless" {
        return Err(CliError::config("--mode must be page or edgeless"));
    }
    let base = base(global)?;
    let workspace_id = resolve_workspace(args.workspace.as_deref(), global)?;
    validate_doc_target(&args.doc, &workspace_id)?;
    guard_workspace_writable(global, &base, &workspace_id)?;

    let backend = LocalBackend::open_existing(&base, &global.peer, &workspace_id).await?;

    // Load the existing properties doc (preserving other docs' rows + other fields on this row).
    let props_bin = merge_target(&backend, "db$docProperties").await?;
    let delta = engine::set_doc_primary_mode(props_bin, &args.doc, &args.mode)?;
    backend.push_update("db$docProperties", &delta).await?;

    Ok(json!({
        "ok": true,
        "docId": args.doc,
        "workspaceId": workspace_id,
        "mode": args.mode,
    }))
}

/// `doc delete --workspace --doc` — delete the page-doc rows AND remove its meta.pages entry.
pub async fn doc_delete(global: &GlobalArgs, args: &DocDeleteArgs) -> Result<Value, CliError> {
    let base = base(global)?;
    let workspace_id = resolve_workspace(args.workspace.as_deref(), global)?;
    validate_doc_target(&args.doc, &workspace_id)?;
    guard_workspace_writable(global, &base, &workspace_id)?;

    let backend = LocalBackend::open_existing(&base, &global.peer, &workspace_id).await?;

    // (a) Remove the entry from root meta.pages (compute from the merged root, push a delta).
    let root_bin = merge_target(&backend, &workspace_id).await?;
    let delta = engine::remove_doc_from_root(root_bin, &args.doc)?;
    backend.push_update(&workspace_id, &delta).await?;

    // (b) Delete the page-doc's own rows (updates/snapshots/clocks/indexer_sync).
    backend.delete_doc(&args.doc).await?;

    // Drop the doc from the search index too.
    if let Err(e) = backend.index_doc(DOC_SEARCH_INDEX, &args.doc, "").await {
        eprintln!("warning: failed to clear index for {}: {e}", args.doc);
    } else {
        let _ = backend.flush_index().await;
    }

    Ok(json!({
        "ok": true,
        "docId": args.doc,
        "workspaceId": workspace_id,
        "deleted": true,
    }))
}

// ----------------------------------------------------------------------------
// Phase 1 — full-text search
// ----------------------------------------------------------------------------

/// Crawl one doc and (re-)index its title + body plaintext under `DOC_SEARCH_INDEX`.
/// A missing/empty doc is indexed as empty text (which removes it from results).
async fn reindex_doc(backend: &LocalBackend, doc_id: &str) -> Result<(), CliError> {
    let text = match backend.crawl_doc_data(doc_id).await {
        Ok(cr) => doc_plaintext(&cr),
        // Stale or empty doc — index empty text rather than failing the whole op.
        Err(_) => String::new(),
    };
    backend.index_doc(DOC_SEARCH_INDEX, doc_id, &text).await?;
    backend.flush_index().await?;
    Ok(())
}

/// Build the searchable plaintext for a doc: title + every block's content joined by spaces.
fn doc_plaintext(cr: &affine_nbstore::indexer::NativeCrawlResult) -> String {
    let mut parts: Vec<String> = Vec::new();
    if !cr.title.is_empty() {
        parts.push(cr.title.clone());
    }
    for block in &cr.blocks {
        if let Some(content) = &block.content {
            for chunk in content {
                if !chunk.is_empty() {
                    parts.push(chunk.clone());
                }
            }
        }
    }
    parts.join(" ")
}

/// `search --workspace --query` — index every doc in the workspace on-demand, persist the
/// snapshots, then run a ranked search over the `doc:title` in-memory index.
pub async fn search(global: &GlobalArgs, args: &SearchArgs) -> Result<Value, CliError> {
    let base = base(global)?;
    let workspace_id = resolve_workspace(args.workspace.as_deref(), global)?;
    // Not actually read-only: the index refresh below persists idx_snapshots rows into the
    // workspace DB, so it takes the same open-workspace guard as every mutating command.
    guard_workspace_writable(global, &base, &workspace_id)?;

    let backend = LocalBackend::open_existing(&base, &global.peer, &workspace_id).await?;
    // connect() (inside open) already ran init_index, loading any desktop-app snapshots.

    let root_bin = merge_target(&backend, &workspace_id).await?;
    if root_bin.is_empty() {
        return Err(CliError::other(format!("workspace not found: {workspace_id}")));
    }
    let (_name, pages) = engine::read_root_meta(root_bin)?;

    // Index (or refresh) every doc's title+body.
    let mut titles = std::collections::HashMap::new();
    for page in &pages {
        titles.insert(page.id.clone(), page.title.clone().unwrap_or_default());
        match backend.crawl_doc_data(&page.id).await {
            Ok(cr) => {
                let text = doc_plaintext(&cr);
                backend.index_doc(DOC_SEARCH_INDEX, &page.id, &text).await?;
            }
            // A stale meta.pages entry with no doc rows — skip rather than fail the search.
            Err(_) => continue,
        }
    }
    backend.flush_index().await?;

    let hits = backend.search(DOC_SEARCH_INDEX, &args.query).await?;
    let results: Vec<Value> = hits
        .into_iter()
        .map(|h| {
            let title = titles.get(&h.doc_id).cloned().unwrap_or_default();
            json!({
                "docId": h.doc_id,
                "title": title,
                "score": h.score,
                "terms": h.terms,
            })
        })
        .collect();

    Ok(json!(results))
}

// ----------------------------------------------------------------------------
// Phase 1 — blobs
// ----------------------------------------------------------------------------

/// `blob put --workspace --file [--key] [--mime]` — upload a file. Key defaults to the
/// lowercase hex SHA-256 of the contents (app convention); mime defaults to octet-stream.
pub async fn blob_put(global: &GlobalArgs, args: &BlobPutArgs) -> Result<Value, CliError> {
    use sha2::{Digest, Sha256};

    let base = base(global)?;
    let workspace_id = resolve_workspace(args.workspace.as_deref(), global)?;
    guard_workspace_writable(global, &base, &workspace_id)?;

    let data = std::fs::read(&args.file)?;
    let key = match &args.key {
        Some(k) => k.clone(),
        None => {
            let digest = Sha256::digest(&data);
            hex_lower(&digest)
        }
    };
    let mime = args
        .mime
        .clone()
        .unwrap_or_else(|| "application/octet-stream".to_string());

    let backend = LocalBackend::open_existing(&base, &global.peer, &workspace_id).await?;
    backend.set_blob(&key, &data, &mime).await?;

    Ok(json!({
        "ok": true,
        "key": key,
        "size": data.len(),
        "mime": mime,
        "workspaceId": workspace_id,
    }))
}

/// `blob get --workspace --key [--out]` — fetch a blob. With `--out`, raw bytes are written to
/// that path; otherwise the bytes are base64-encoded in the JSON result.
pub async fn blob_get(global: &GlobalArgs, args: &BlobGetArgs) -> Result<Value, CliError> {
    let base = base(global)?;
    let workspace_id = resolve_workspace(args.workspace.as_deref(), global)?;

    let backend = LocalBackend::open_existing(&base, &global.peer, &workspace_id).await?;
    let blob = backend
        .get_blob(&args.key)
        .await?
        .ok_or_else(|| CliError::other(format!("blob not found: {}", args.key)))?;

    match &args.out {
        Some(path) => {
            let mut f = std::fs::File::create(path)?;
            f.write_all(&blob.data)?;
            Ok(json!({
                "ok": true,
                "key": blob.key,
                "size": blob.size,
                "mime": blob.mime,
                "path": path,
            }))
        }
        None => {
            let data_base64 = base64_simd::STANDARD.encode_to_string(&blob.data);
            Ok(json!({
                "ok": true,
                "key": blob.key,
                "size": blob.size,
                "mime": blob.mime,
                "dataBase64": data_base64,
            }))
        }
    }
}

/// `blob list --workspace` — list blobs (most-recent first).
pub async fn blob_list(global: &GlobalArgs, args: &BlobListArgs) -> Result<Value, CliError> {
    let base = base(global)?;
    let workspace_id = resolve_workspace(args.workspace.as_deref(), global)?;

    let backend = LocalBackend::open_existing(&base, &global.peer, &workspace_id).await?;
    let blobs = backend.list_blobs().await?;

    let out: Vec<Value> = blobs
        .into_iter()
        .map(|b| {
            json!({
                "key": b.key,
                "mime": b.mime,
                "size": b.size,
                "createdAt": b.created_at.to_string(),
            })
        })
        .collect();
    Ok(json!(out))
}

/// Lowercase hex encoding of a byte slice (for SHA-256 blob keys).
fn hex_lower(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push_str(&format!("{b:02x}"));
    }
    s
}

// ----------------------------------------------------------------------------
// Phase 2 — edgeless diagram surface elements
// ----------------------------------------------------------------------------

use crate::engine::{ConnectorParams, Endpoint, ShapeParams, TextParams};

/// Normalize a user shape string to a valid `ShapeType` value; error on unknown input
/// rather than silently coercing (agents should learn about a typo, not get a stray rect).
fn shape_type(s: &str) -> Result<String, CliError> {
    match s {
        "ellipse" | "diamond" | "triangle" | "rect" => Ok(s.to_string()),
        other => Err(CliError::config(format!(
            "invalid --shape-type '{other}' (expected one of: rect, ellipse, diamond, triangle)"
        ))),
    }
}

/// Map an edge `mode` string to a `ConnectorMode` int (0 straight, 1 elbow, 2 curve); error on unknown.
/// `orthogonal` is accepted as an alias of `elbow` (BlockSuite's own name for mode 1).
fn conn_mode(s: &str) -> Result<i32, CliError> {
    match s {
        "straight" => Ok(0),
        "elbow" | "orthogonal" => Ok(1),
        "curve" => Ok(2),
        other => Err(CliError::config(format!(
            "invalid connector mode '{other}' (expected one of: straight, elbow, orthogonal, curve)"
        ))),
    }
}

/// Mark a diagram doc as edgeless so it opens in edgeless mode (Phase 1 set-mode path).
async fn ensure_edgeless(backend: &LocalBackend, doc_id: &str) -> Result<(), CliError> {
    let props_bin = merge_target(backend, "db$docProperties").await?;
    let delta = engine::set_doc_primary_mode(props_bin, doc_id, "edgeless")?;
    backend.push_update("db$docProperties", &delta).await?;
    Ok(())
}

/// `diagram add-shape` — insert a shape element into the doc's edgeless surface.
pub async fn diagram_add_shape(global: &GlobalArgs, args: &DiagramAddShapeArgs) -> Result<Value, CliError> {
    let base = base(global)?;
    let workspace_id = resolve_workspace(args.workspace.as_deref(), global)?;
    validate_doc_target(&args.doc, &workspace_id)?;
    guard_workspace_writable(global, &base, &workspace_id)?;

    let backend = LocalBackend::open_existing(&base, &global.peer, &workspace_id).await?;
    let existing = merge_target(&backend, &args.doc).await?;
    if existing.is_empty() {
        return Err(CliError::other(format!("doc not found: {}", args.doc)));
    }

    let params = ShapeParams {
        xywh: parse_xywh(&args.xywh)?,
        shape_type: shape_type(&args.shape_type)?,
        fill: args.fill.clone(),
        stroke: args.stroke.clone(),
        text: args.text.clone(),
        seed: None,
    };
    let (delta, element_id) = engine::add_shape(&existing, &params)?;
    backend.push_update(&args.doc, &delta).await?;
    ensure_edgeless(&backend, &args.doc).await?;

    Ok(json!({
        "ok": true,
        "docId": args.doc,
        "workspaceId": workspace_id,
        "elementId": element_id,
        "type": "shape",
    }))
}

/// `diagram add-text` — insert a standalone text element into the doc's edgeless surface.
pub async fn diagram_add_text(global: &GlobalArgs, args: &DiagramAddTextArgs) -> Result<Value, CliError> {
    let base = base(global)?;
    let workspace_id = resolve_workspace(args.workspace.as_deref(), global)?;
    validate_doc_target(&args.doc, &workspace_id)?;
    guard_workspace_writable(global, &base, &workspace_id)?;

    let backend = LocalBackend::open_existing(&base, &global.peer, &workspace_id).await?;
    let existing = merge_target(&backend, &args.doc).await?;
    if existing.is_empty() {
        return Err(CliError::other(format!("doc not found: {}", args.doc)));
    }

    let params = TextParams {
        xywh: parse_xywh(&args.xywh)?,
        text: args.text.clone(),
        color: args.color.clone(),
        seed: None,
    };
    let (delta, element_id) = engine::add_text(&existing, &params)?;
    backend.push_update(&args.doc, &delta).await?;
    ensure_edgeless(&backend, &args.doc).await?;

    Ok(json!({
        "ok": true,
        "docId": args.doc,
        "workspaceId": workspace_id,
        "elementId": element_id,
        "type": "text",
    }))
}

/// `diagram add-connector` — connect two existing surface elements by element id.
pub async fn diagram_add_connector(global: &GlobalArgs, args: &DiagramAddConnectorArgs) -> Result<Value, CliError> {
    let base = base(global)?;
    let workspace_id = resolve_workspace(args.workspace.as_deref(), global)?;
    validate_doc_target(&args.doc, &workspace_id)?;
    guard_workspace_writable(global, &base, &workspace_id)?;

    let backend = LocalBackend::open_existing(&base, &global.peer, &workspace_id).await?;
    let existing = merge_target(&backend, &args.doc).await?;
    if existing.is_empty() {
        return Err(CliError::other(format!("doc not found: {}", args.doc)));
    }

    let params = ConnectorParams {
        source: Endpoint {
            id: Some(args.from.clone()),
            position: None,
        },
        target: Endpoint {
            id: Some(args.to.clone()),
            position: None,
        },
        mode: conn_mode(&args.mode)?,
        label: args.label.clone(),
        // Low-level add-connector doesn't know element geometry, so no label box is computed;
        // the connector still draws, the label just won't render (see ConnectorParams::label_xywh).
        label_xywh: None,
        seed: None,
    };
    let (delta, element_id) = engine::add_connector(&existing, &params)?;
    backend.push_update(&args.doc, &delta).await?;
    ensure_edgeless(&backend, &args.doc).await?;

    Ok(json!({
        "ok": true,
        "docId": args.doc,
        "workspaceId": workspace_id,
        "elementId": element_id,
        "type": "connector",
        "from": args.from,
        "to": args.to,
    }))
}

/// `diagram repair-labels` — rewrite connector `labelXYWH` values written by an older CLI so they
/// survive the round-trip through the real yjs lib (see engine::rewrap_connector_labels). Repairs
/// one `--doc`, or every doc in the workspace when `--doc` is omitted. Docs without an edgeless
/// surface (plain notes) are skipped.
pub async fn diagram_repair_labels(
    global: &GlobalArgs,
    args: &crate::cli::DiagramRepairLabelsArgs,
) -> Result<Value, CliError> {
    let base = base(global)?;
    let workspace_id = resolve_workspace(args.workspace.as_deref(), global)?;
    if let Some(doc) = &args.doc {
        validate_doc_target(doc, &workspace_id)?;
    }
    guard_workspace_writable(global, &base, &workspace_id)?;
    let backend = LocalBackend::open_existing(&base, &global.peer, &workspace_id).await?;

    // Resolve the target doc list.
    let doc_ids: Vec<String> = match &args.doc {
        Some(d) => vec![d.clone()],
        None => {
            let root_bin = merge_target(&backend, &workspace_id).await?;
            if root_bin.is_empty() {
                return Err(CliError::other(format!("workspace not found: {workspace_id}")));
            }
            engine::list_root_doc_ids(root_bin)?
        }
    };

    let mut repaired = Vec::new();
    let mut errors = Vec::new();
    let mut total_fixed = 0usize;
    for doc_id in &doc_ids {
        let current = match merge_target(&backend, doc_id).await {
            Ok(c) => c,
            Err(e) => {
                errors.push(json!({ "docId": doc_id, "error": e.to_string() }));
                continue;
            }
        };
        if current.is_empty() {
            continue;
        }
        match engine::rewrap_connector_labels(&current) {
            // A doc with no affine:surface block (a plain note) isn't an error — just skip it.
            Ok(None) => continue,
            Ok(Some((delta, count))) => {
                if count > 0 {
                    backend.push_update(doc_id, &delta).await?;
                    repaired.push(json!({ "docId": doc_id, "connectorsFixed": count }));
                    total_fixed += count;
                }
            }
            // A doc that fails to DECODE is corruption the caller must hear about — keep
            // scanning the rest, but report it instead of pretending the doc was fine.
            Err(e) => errors.push(json!({ "docId": doc_id, "error": e.to_string() })),
        }
    }

    Ok(json!({
        "ok": errors.is_empty(),
        "workspaceId": workspace_id,
        "docsScanned": doc_ids.len(),
        "docsRepaired": repaired.len(),
        "connectorsFixed": total_fixed,
        "repaired": repaired,
        "errors": errors,
    }))
}

// --- diagram create --spec ---

/// Size limits for a `--spec` graph. The layout pass is O(n²) per relaxation iteration
/// (layout.rs `separate`), every node and edge becomes a surface element in one delta, and the
/// app renders the whole surface at once; a spec past these bounds is almost certainly an
/// agent bug rather than a diagram anyone will read. Rejected up front with `"error":"config"`.
pub const MAX_SPEC_NODES: usize = 500;
pub const MAX_SPEC_EDGES: usize = 2000;

#[derive(serde::Deserialize)]
struct DiagramSpec {
    nodes: Vec<SpecNode>,
    #[serde(default)]
    edges: Vec<SpecEdge>,
}

#[derive(serde::Deserialize)]
struct SpecNode {
    id: String,
    #[serde(default)]
    label: Option<String>,
    #[serde(default)]
    shape: Option<String>,
    #[serde(default)]
    x: Option<f64>,
    #[serde(default)]
    y: Option<f64>,
    #[serde(default)]
    w: Option<f64>,
    #[serde(default)]
    h: Option<f64>,
    #[serde(default)]
    fill: Option<String>,
}

#[derive(serde::Deserialize)]
struct SpecEdge {
    from: String,
    to: String,
    #[serde(default)]
    label: Option<String>,
    #[serde(default)]
    mode: Option<String>,
}

/// `diagram create --spec <file>` — size nodes to their labels, arrange them with the chosen
/// layout (grid | tree | radial) so boxes never overlap, write one shape per node + one
/// connector per edge, mark the doc edgeless, and return the node-id -> elementId mapping.
///
/// The whole graph (including the `--replace` clear) is computed as ONE delta and pushed with
/// ONE store write, so a crash mid-command can never leave a half-written diagram or a wiped
/// surface behind.
pub async fn diagram_create(global: &GlobalArgs, args: &DiagramCreateArgs) -> Result<Value, CliError> {
    let base = base(global)?;
    let workspace_id = resolve_workspace(args.workspace.as_deref(), global)?;
    validate_doc_target(&args.doc, &workspace_id)?;
    guard_workspace_writable(global, &base, &workspace_id)?;

    let raw = std::fs::read_to_string(&args.spec)?;
    let spec: DiagramSpec =
        serde_json::from_str(&raw).map_err(|e| CliError::config(format!("invalid --spec JSON: {e}")))?;

    let mode = layout::LayoutMode::parse(&args.layout).ok_or_else(|| {
        CliError::config(format!(
            "invalid --layout '{}' (expected one of: grid, tree, radial)",
            args.layout
        ))
    })?;
    let dir = layout::Direction::parse(&args.direction)
        .ok_or_else(|| CliError::config(format!("invalid --direction '{}' (expected lr | tb)", args.direction)))?;

    if spec.nodes.len() > MAX_SPEC_NODES {
        return Err(CliError::config(format!(
            "spec has {} nodes; the limit is {MAX_SPEC_NODES}",
            spec.nodes.len()
        )));
    }
    if spec.edges.len() > MAX_SPEC_EDGES {
        return Err(CliError::config(format!(
            "spec has {} edges; the limit is {MAX_SPEC_EDGES}",
            spec.edges.len()
        )));
    }

    // Validate the WHOLE spec before touching the store: shape types, edge modes, duplicate
    // node ids (silently last-wins otherwise — almost certainly an agent bug), edge node refs,
    // and explicit node geometry (a non-finite or non-positive size would poison the rendered
    // surface the same way a malformed xywh string does).
    let mut node_index = std::collections::HashMap::<&str, usize>::new();
    for (i, node) in spec.nodes.iter().enumerate() {
        shape_type(node.shape.as_deref().unwrap_or("rect"))?;
        if node_index.insert(node.id.as_str(), i).is_some() {
            return Err(CliError::config(format!("duplicate node id in spec: {}", node.id)));
        }
        for (name, v) in [("x", node.x), ("y", node.y), ("w", node.w), ("h", node.h)] {
            if let Some(v) = v {
                let positive_size = name == "x" || name == "y" || v > 0.0;
                if !v.is_finite() || !positive_size {
                    return Err(CliError::config(format!(
                        "node '{}': invalid {name} ({v}) — must be finite{}",
                        node.id,
                        if name == "w" || name == "h" { " and > 0" } else { "" }
                    )));
                }
            }
        }
    }
    for edge in &spec.edges {
        conn_mode(edge.mode.as_deref().unwrap_or("elbow"))?;
        for (side, id) in [("from", &edge.from), ("to", &edge.to)] {
            if !node_index.contains_key(id.as_str()) {
                return Err(CliError::config(format!("edge.{side} references unknown node: {id}")));
            }
        }
    }

    // Compute non-overlapping positions for every node up front.
    let lnodes: Vec<layout::Node> = spec
        .nodes
        .iter()
        .map(|n| layout::Node {
            id: n.id.clone(),
            label: n.label.clone().unwrap_or_default(),
            shape: n.shape.clone().unwrap_or_else(|| "rect".to_string()),
            x: n.x,
            y: n.y,
            w: n.w,
            h: n.h,
        })
        .collect();
    let ledges: Vec<layout::Edge> = spec
        .edges
        .iter()
        .map(|e| layout::Edge {
            from: e.from.clone(),
            to: e.to.clone(),
        })
        .collect();
    let rects = layout::layout(&lnodes, &ledges, mode, dir);

    // Assemble the engine inputs: one ShapeParams per node, one edge per spec edge (endpoints
    // by node index; the engine resolves them to the element ids it mints in the same delta).
    let shapes: Vec<ShapeParams> = spec
        .nodes
        .iter()
        .enumerate()
        .map(|(i, node)| {
            Ok(ShapeParams {
                xywh: rects[i].to_xywh(),
                shape_type: shape_type(node.shape.as_deref().unwrap_or("rect"))?,
                fill: node.fill.clone(),
                stroke: None,
                text: node.label.clone().filter(|s| !s.is_empty()),
                seed: None,
            })
        })
        .collect::<Result<_, CliError>>()?;
    let edges: Vec<engine::DiagramEdgeParams> = spec
        .edges
        .iter()
        .map(|edge| {
            let from = node_index[edge.from.as_str()];
            let to = node_index[edge.to.as_str()];
            let label = edge.label.clone().filter(|s| !s.is_empty());
            // Place the label box at the midpoint between the two node centers so it renders on
            // the edge (BlockSuite needs a labelXYWH for the label to show at all).
            let label_xywh = label.as_deref().map(|lbl| {
                let (sx, sy) = rects[from].center();
                let (tx, ty) = rects[to].center();
                let (mx, my) = ((sx + tx) / 2.0, (sy + ty) / 2.0);
                let lw = (lbl.chars().count() as f64 * 8.0 + 16.0).max(24.0);
                let lh = 24.0;
                [mx - lw / 2.0, my - lh / 2.0, lw, lh]
            });
            Ok(engine::DiagramEdgeParams {
                from,
                to,
                mode: conn_mode(edge.mode.as_deref().unwrap_or("elbow"))?,
                label,
                label_xywh,
            })
        })
        .collect::<Result<_, CliError>>()?;

    let backend = LocalBackend::open_existing(&base, &global.peer, &workspace_id).await?;
    let current = merge_target(&backend, &args.doc).await?;
    if current.is_empty() {
        return Err(CliError::other(format!("doc not found: {}", args.doc)));
    }

    // One delta, one push: clear (when --replace) + every node + every edge, atomically.
    let diagram = engine::create_diagram(&current, args.replace, &shapes, &edges)?;
    backend.push_update(&args.doc, &diagram.delta).await?;

    let node_results: Vec<Value> = spec
        .nodes
        .iter()
        .enumerate()
        .map(|(i, node)| json!({ "id": node.id, "elementId": diagram.shape_ids[i], "xywh": rects[i].to_xywh() }))
        .collect();
    let edge_results: Vec<Value> = spec
        .edges
        .iter()
        .enumerate()
        .map(|(i, edge)| json!({ "from": edge.from, "to": edge.to, "elementId": diagram.connector_ids[i] }))
        .collect();

    ensure_edgeless(&backend, &args.doc).await?;

    Ok(json!({
        "ok": true,
        "docId": args.doc,
        "workspaceId": workspace_id,
        "layout": args.layout,
        "direction": args.direction,
        "replaced": args.replace,
        "nodes": node_results,
        "edges": edge_results,
        "nodeCount": node_results.len(),
        "edgeCount": edge_results.len(),
    }))
}

/// `doc add-latex` — append an `affine:latex` equation block to a doc's note.
pub async fn doc_add_latex(global: &GlobalArgs, args: &DocAddLatexArgs) -> Result<Value, CliError> {
    let base = base(global)?;
    let workspace_id = resolve_workspace(args.workspace.as_deref(), global)?;
    validate_doc_target(&args.doc, &workspace_id)?;
    guard_workspace_writable(global, &base, &workspace_id)?;

    let backend = LocalBackend::open_existing(&base, &global.peer, &workspace_id).await?;
    let existing = merge_target(&backend, &args.doc).await?;
    if existing.is_empty() {
        return Err(CliError::other(format!("doc not found: {}", args.doc)));
    }

    let (delta, block_id) = engine::add_latex_block(&existing, &args.latex)?;
    backend.push_update(&args.doc, &delta).await?;

    Ok(json!({
        "ok": true,
        "docId": args.doc,
        "workspaceId": workspace_id,
        "blockId": block_id,
        "flavour": "affine:latex",
        "latex": args.latex,
    }))
}
