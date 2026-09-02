//! clap derive definitions for the full affine-cli surface.
//!
//! Every subcommand declared here is dispatched from `main.rs` to its handler in `commands.rs`;
//! `skills/affine/REFERENCE.md` is the user-facing description of the same tree.

use clap::{Args, Parser, Subcommand};

#[derive(Parser, Debug)]
#[command(
    name = "affine-cli",
    version,
    about = "Headless CLI over the AFFiNE local-first store"
)]
pub struct Cli {
    #[command(flatten)]
    pub global: GlobalArgs,

    #[command(subcommand)]
    pub command: Commands,
}

#[derive(Args, Debug, Clone)]
pub struct GlobalArgs {
    /// Override the AFFiNE data base dir (default: ~/Library/Application Support/AFFiNE on macOS).
    #[arg(long, global = true)]
    pub affine_dir: Option<String>,

    /// Default workspace id for commands that need one (overridable per-command).
    #[arg(long, global = true)]
    pub workspace: Option<String>,

    /// Storage peer / flavour. Local-first uses "local".
    #[arg(long, global = true, default_value = "local")]
    pub peer: String,

    /// Product directory name under the data dir (stable build == "AFFiNE").
    #[arg(long, global = true, default_value = "AFFiNE")]
    pub product: String,

    /// Pretty-print JSON output (default: compact single-line JSON).
    #[arg(long, global = true)]
    pub pretty: bool,

    /// Write even when the workspace database is open in another process (normally the CLI
    /// refuses: the AFFiNE app does not see external writes while running and may overwrite
    /// them when it saves).
    #[arg(long, global = true)]
    pub force: bool,
}

#[derive(Subcommand, Debug)]
pub enum Commands {
    /// Workspace operations.
    #[command(subcommand)]
    Workspace(WorkspaceCmd),
    /// Document operations.
    #[command(subcommand)]
    Doc(DocCmd),
    /// Edgeless diagram operations (Phase 2).
    #[command(subcommand)]
    Diagram(DiagramCmd),
    /// Full-text search across a workspace.
    Search(SearchArgs),
    /// Blob operations.
    #[command(subcommand)]
    Blob(BlobCmd),
}

#[derive(Subcommand, Debug)]
pub enum WorkspaceCmd {
    /// List local workspaces.
    List,
    /// Create a new local workspace.
    Create(WorkspaceCreateArgs),
}

#[derive(Args, Debug)]
pub struct WorkspaceCreateArgs {
    /// Display name for the workspace (written to root meta.name).
    #[arg(long)]
    pub name: String,
}

#[derive(Subcommand, Debug)]
pub enum DocCmd {
    /// List the docs (pages) registered in a workspace's root meta.
    List(DocListArgs),
    /// Create a doc in a workspace from markdown.
    Create(DocCreateArgs),
    /// Read a doc back (--format md | json).
    Read(DocReadArgs),
    /// Replace a doc's body from markdown.
    Update(DocUpdateArgs),
    /// Set a doc's title.
    SetTitle(DocSetTitleArgs),
    /// Set a doc's primary mode (page | edgeless).
    SetMode(DocSetModeArgs),
    /// Append a math equation (LaTeX) block to a doc.
    AddLatex(DocAddLatexArgs),
    /// Delete a doc.
    Delete(DocDeleteArgs),
}

#[derive(Args, Debug)]
pub struct DocAddLatexArgs {
    #[arg(long)]
    pub workspace: Option<String>,
    #[arg(long)]
    pub doc: String,
    /// LaTeX/TeX source for the equation, e.g. "E = mc^2" or a full `\begin{aligned}...` block.
    /// This is AFFiNE's native math syntax (an `affine:latex` block) — NOT Obsidian `$$` markup.
    #[arg(long)]
    pub latex: String,
}

#[derive(Args, Debug)]
pub struct DocListArgs {
    /// Target workspace id (falls back to the global --workspace).
    #[arg(long)]
    pub workspace: Option<String>,
}

#[derive(Args, Debug)]
pub struct DocCreateArgs {
    /// Target workspace id (falls back to the global --workspace).
    #[arg(long)]
    pub workspace: Option<String>,
    /// Doc title.
    #[arg(long)]
    pub title: String,
    /// Inline markdown content.
    #[arg(long, conflicts_with = "md_file")]
    pub content: Option<String>,
    /// Path to a markdown file (alternative to --content).
    #[arg(long, conflicts_with = "content")]
    pub md_file: Option<String>,
}

#[derive(Args, Debug)]
pub struct DocReadArgs {
    #[arg(long)]
    pub workspace: Option<String>,
    #[arg(long)]
    pub doc: String,
    /// Output format: "md" (rendered markdown) or "json" (structured blocks).
    #[arg(long, default_value = "md")]
    pub format: String,
}

#[derive(Args, Debug)]
pub struct DocUpdateArgs {
    #[arg(long)]
    pub workspace: Option<String>,
    #[arg(long)]
    pub doc: String,
    #[arg(long, conflicts_with = "md_file")]
    pub content: Option<String>,
    #[arg(long, conflicts_with = "content")]
    pub md_file: Option<String>,
}

#[derive(Args, Debug)]
pub struct DocSetTitleArgs {
    #[arg(long)]
    pub workspace: Option<String>,
    #[arg(long)]
    pub doc: String,
    #[arg(long)]
    pub title: String,
}

#[derive(Args, Debug)]
pub struct DocSetModeArgs {
    #[arg(long)]
    pub workspace: Option<String>,
    #[arg(long)]
    pub doc: String,
    /// "page" or "edgeless".
    #[arg(long)]
    pub mode: String,
}

#[derive(Args, Debug)]
pub struct DocDeleteArgs {
    #[arg(long)]
    pub workspace: Option<String>,
    #[arg(long)]
    pub doc: String,
}

#[derive(Subcommand, Debug)]
pub enum DiagramCmd {
    /// Add a shape element (rect | ellipse | diamond | triangle) to the doc's edgeless surface.
    AddShape(DiagramAddShapeArgs),
    /// Add a standalone text element to the doc's edgeless surface.
    AddText(DiagramAddTextArgs),
    /// Add a connector between two existing surface elements (by element id).
    AddConnector(DiagramAddConnectorArgs),
    /// Build a whole diagram (nodes + edges) from a --spec JSON file.
    Create(DiagramCreateArgs),
    /// Repair connector labels written by an older CLI (re-encode labelXYWH for yjs compat).
    RepairLabels(DiagramRepairLabelsArgs),
}

#[derive(Args, Debug)]
pub struct DiagramAddShapeArgs {
    #[arg(long)]
    pub workspace: Option<String>,
    #[arg(long)]
    pub doc: String,
    /// Bounding box as a JSON-ish "[x,y,w,h]" string (default "[0,0,100,100]").
    #[arg(long, default_value = "[0,0,100,100]")]
    pub xywh: String,
    /// rect | ellipse | diamond | triangle.
    #[arg(long, default_value = "rect")]
    pub shape_type: String,
    /// Fill color hex (e.g. "#ffe838"). Sets filled=true when given.
    #[arg(long)]
    pub fill: Option<String>,
    /// Stroke color hex.
    #[arg(long)]
    pub stroke: Option<String>,
    /// Optional label text inside the shape.
    #[arg(long)]
    pub text: Option<String>,
}

#[derive(Args, Debug)]
pub struct DiagramAddTextArgs {
    #[arg(long)]
    pub workspace: Option<String>,
    #[arg(long)]
    pub doc: String,
    /// Bounding box "[x,y,w,h]" (default "[0,0,120,30]").
    #[arg(long, default_value = "[0,0,120,30]")]
    pub xywh: String,
    /// Text content.
    #[arg(long)]
    pub text: String,
    /// Text color hex.
    #[arg(long)]
    pub color: Option<String>,
}

#[derive(Args, Debug)]
pub struct DiagramAddConnectorArgs {
    #[arg(long)]
    pub workspace: Option<String>,
    #[arg(long)]
    pub doc: String,
    /// Source element id (anchors the connector start).
    #[arg(long)]
    pub from: String,
    /// Target element id (anchors the connector end).
    #[arg(long)]
    pub to: String,
    /// straight | elbow | orthogonal | curve (default elbow; orthogonal is an alias of elbow).
    #[arg(long, default_value = "elbow")]
    pub mode: String,
    /// Optional connector label.
    #[arg(long)]
    pub label: Option<String>,
}

#[derive(Args, Debug)]
pub struct DiagramRepairLabelsArgs {
    #[arg(long)]
    pub workspace: Option<String>,
    /// Doc to repair. Omit to repair every doc in the workspace.
    #[arg(long)]
    pub doc: Option<String>,
}

#[derive(Args, Debug)]
pub struct DiagramCreateArgs {
    #[arg(long)]
    pub workspace: Option<String>,
    #[arg(long)]
    pub doc: String,
    /// Path to a JSON file: { "nodes": [...], "edges": [...] }.
    #[arg(long)]
    pub spec: String,
    /// Arrangement: grid | tree (layered flowchart) | radial (mind map). Default grid.
    /// Nodes are sized to their labels and spaced so boxes never overlap.
    #[arg(long, default_value = "grid")]
    pub layout: String,
    /// Tree/flow direction: lr (left→right) | tb (top→bottom). Default lr.
    #[arg(long, default_value = "lr")]
    pub direction: String,
    /// Clear the surface's existing elements first, so re-running doesn't stack duplicates.
    #[arg(long)]
    pub replace: bool,
}

#[derive(Args, Debug)]
pub struct SearchArgs {
    #[arg(long)]
    pub workspace: Option<String>,
    #[arg(long)]
    pub query: String,
}

#[derive(Subcommand, Debug)]
pub enum BlobCmd {
    /// Upload a file as a blob.
    Put(BlobPutArgs),
    /// Download a blob (to --out, or base64 in the JSON result).
    Get(BlobGetArgs),
    /// List blobs in a workspace.
    List(BlobListArgs),
}

#[derive(Args, Debug)]
pub struct BlobPutArgs {
    #[arg(long)]
    pub workspace: Option<String>,
    /// Blob key. Defaults to the lowercase hex SHA-256 of the file contents.
    #[arg(long)]
    pub key: Option<String>,
    /// Path to the file to upload.
    #[arg(long)]
    pub file: String,
    /// MIME type. Defaults to "application/octet-stream".
    #[arg(long)]
    pub mime: Option<String>,
}

#[derive(Args, Debug)]
pub struct BlobGetArgs {
    #[arg(long)]
    pub workspace: Option<String>,
    /// Blob key to fetch.
    #[arg(long)]
    pub key: String,
    /// Write the raw bytes to this path. If omitted, bytes are base64-encoded in the result.
    #[arg(long)]
    pub out: Option<String>,
}

#[derive(Args, Debug)]
pub struct BlobListArgs {
    #[arg(long)]
    pub workspace: Option<String>,
}
