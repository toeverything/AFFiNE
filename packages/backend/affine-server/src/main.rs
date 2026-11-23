use std::sync::Arc;

use affine_server::{ServerCli, build_app_and_serve};
use clap::Parser;
use server_spi::CommunityExtension;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() {
  let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
  tracing_subscriber::fmt().with_env_filter(filter).init();

  let cli = ServerCli::parse();
  if let Err(err) = build_app_and_serve(cli, Arc::new(CommunityExtension::new())).await {
    tracing::error!(error = %err, "affine-server exited with error");
    std::process::exit(1);
  }
}
