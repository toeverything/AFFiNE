//! affine-cli — a headless CLI over the AFFiNE local-first store.
//!
//! Thin clap dispatcher over the `affine_cli` library (see `src/lib.rs`); every command prints
//! one JSON value on success or a stable error envelope on failure - never a panic. Command-line
//! usage errors (unknown subcommand, missing/conflicting flags) go through the same envelope with
//! `"error":"usage"` and exit code 2; `--help` / `--version` keep clap's plain text and exit 0.

use clap::Parser;
use clap::error::ErrorKind;

use affine_cli::cli::{BlobCmd, Cli, Commands, DiagramCmd, DocCmd, WorkspaceCmd};
use affine_cli::error::CliError;
use affine_cli::{commands, output};

#[tokio::main(flavor = "multi_thread")]
async fn main() {
    let cli = match Cli::try_parse() {
        Ok(cli) => cli,
        Err(e) if matches!(e.kind(), ErrorKind::DisplayHelp | ErrorKind::DisplayVersion) => e.exit(),
        Err(e) => {
            // `--pretty` is a global flag, but parsing failed, so honor it by inspecting argv.
            let pretty = std::env::args().skip(1).any(|a| a == "--pretty");
            let message = e.render().to_string().trim_end().to_string();
            fail(&CliError::Usage(message), pretty);
        }
    };
    let pretty = cli.global.pretty;

    match dispatch(&cli).await {
        Ok(mut value) => {
            output::attach_warnings(&mut value);
            output::print_value(&value, pretty);
        }
        Err(err) => fail(&err, pretty),
    }
}

/// Print the JSON error envelope for `err` to stdout and exit with its code.
fn fail(err: &CliError, pretty: bool) -> ! {
    let envelope = err.to_envelope();
    let mut value = serde_json::to_value(&envelope)
        .unwrap_or_else(|_| serde_json::json!({ "ok": false, "error": "error", "message": err.to_string() }));
    output::attach_warnings(&mut value);
    output::print_value(&value, pretty);
    std::process::exit(err.exit_code());
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
