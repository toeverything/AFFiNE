use anyhow::{Context, Result, bail};
use parity_harness::model::Scenario;

#[tokio::main]
async fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.is_empty() || args.iter().any(|a| a == "--help") {
        println!(
            "Usage: parity-harness SCENARIO.json [REPORT.json]\nTargets must be disposable, independent test instances. Exit 0: equal; 1: difference; 2: infrastructure/configuration failure."
        );
        return Ok(());
    }
    if args.len() > 2 {
        bail!("expected scenario and optional report path");
    }
    match execute(&args).await {
        Ok(equal) => {
            if !equal {
                std::process::exit(1)
            }
        }
        Err(error) => {
            eprintln!("{error:#}");
            std::process::exit(2);
        }
    }
    Ok(())
}
async fn execute(args: &[String]) -> Result<bool> {
    let scenario: Scenario =
        serde_json::from_slice(&tokio::fs::read(&args[0]).await?).context("parse scenario")?;
    let report = parity_harness::run(&scenario).await?;
    let text = serde_json::to_string_pretty(&report)?;
    if let Some(path) = args.get(1) {
        tokio::fs::write(path, text).await?;
    } else {
        println!("{text}");
    }
    eprintln!("{} differences", report.differences.len());
    Ok(report.is_equal())
}
