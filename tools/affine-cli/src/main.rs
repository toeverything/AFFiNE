//! affine-cli — a headless CLI over the AFFiNE local-first store.
//!
//! Thin clap dispatcher over the `affine_cli` library (see `src/lib.rs`); every command prints
//! one JSON value on success or a stable error envelope on failure — never a panic.

use clap::Parser;

use affine_cli::cli::{BlobCmd, Cli, Commands, DiagramCmd, DocCmd, WorkspaceCmd};
use affine_cli::error::CliError;
use affine_cli::{commands, output};

#[tokio::main(flavor = "multi_thread")]
async fn main() {
    let cli = Cli::parse();
    let global = cli.global.clone();
    let pretty = global.pretty;

    let result = dispatch(&cli).await;

    match result {
        Ok(value) => {
            output::print_value(&value, pretty);
        }
        Err(err) => {
            let envelope = err.to_envelope();
            let value = serde_json::to_value(&envelope)
                .unwrap_or_else(|_| serde_json::json!({ "ok": false, "error": "error", "message": err.to_string() }));
            output::print_value(&value, pretty);
            std::process::exit(1);
        }
    }
}

async fn dispatch(cli: &Cli) -> Result<serde_json::Value, CliError> {
    let g = &cli.global;
    match &cli.command {
        Commands::Workspace(WorkspaceCmd::Create(args)) => commands::workspace_create(g, args).await,
        Commands::Workspace(WorkspaceCmd::List) => commands::workspace_list(g).await,

        Commands::Doc(DocCmd::List(args)) => commands::doc_list(g, args).await,
        Commands::Doc(DocCmd::Create(args)) => commands::doc_create(g, args).await,
        Commands::Doc(DocCmd::Read(args)) => commands::doc_read(g, args).await,
        Commands::Doc(DocCmd::Update(args)) => commands::doc_update(g, args).await,
        Commands::Doc(DocCmd::SetTitle(args)) => commands::doc_set_title(g, args).await,
        Commands::Doc(DocCmd::SetMode(args)) => commands::doc_set_mode(g, args).await,
        Commands::Doc(DocCmd::AddLatex(args)) => commands::doc_add_latex(g, args).await,
        Commands::Doc(DocCmd::Delete(args)) => commands::doc_delete(g, args).await,

        Commands::Diagram(DiagramCmd::AddShape(args)) => commands::diagram_add_shape(g, args).await,
        Commands::Diagram(DiagramCmd::AddText(args)) => commands::diagram_add_text(g, args).await,
        Commands::Diagram(DiagramCmd::AddConnector(args)) => commands::diagram_add_connector(g, args).await,
        Commands::Diagram(DiagramCmd::Create(args)) => commands::diagram_create(g, args).await,
        Commands::Diagram(DiagramCmd::RepairLabels(args)) => commands::diagram_repair_labels(g, args).await,
        Commands::Search(args) => commands::search(g, args).await,
        Commands::Blob(BlobCmd::Put(args)) => commands::blob_put(g, args).await,
        Commands::Blob(BlobCmd::Get(args)) => commands::blob_get(g, args).await,
        Commands::Blob(BlobCmd::List(args)) => commands::blob_list(g, args).await,
    }
}
