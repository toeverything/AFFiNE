use anyhow::{Context, Result, bail};
use parity_harness::model::{Report, Scenario};
use serde_json::Value;

const USAGE: &str = "Usage:
  parity-harness SCENARIO.json [REPORT.json]
      Replay SCENARIO against both targets. Targets must be disposable,
      independent test instances.
  parity-harness compare SCENARIO.json RECORDED.json [REPORT.json]
      Compare the left/right sides of a previously written report again,
      offline, with SCENARIO's rules.
Exit 0: equal; 1: difference; 2: infrastructure/configuration failure.";

#[tokio::main]
async fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.is_empty() || args.iter().any(|a| a == "--help") {
        println!("{USAGE}");
        return Ok(());
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
async fn read_json<T: serde::de::DeserializeOwned>(path: &str) -> Result<T> {
    serde_json::from_slice(
        &tokio::fs::read(path)
            .await
            .with_context(|| format!("read {path}"))?,
    )
    .with_context(|| format!("parse {path}"))
}
async fn execute(args: &[String]) -> Result<bool> {
    let (report, output) = match args {
        [command, scenario, recorded, rest @ ..] if command == "compare" && rest.len() <= 1 => {
            let scenario: Scenario = read_json(scenario).await?;
            let mut recorded: Value = read_json(recorded).await?;
            let report = parity_harness::compare(
                &scenario,
                recorded["left"].take(),
                recorded["right"].take(),
            )?;
            (report, rest.first())
        }
        [scenario, rest @ ..] if scenario != "compare" && rest.len() <= 1 => {
            let scenario: Scenario = read_json(scenario).await?;
            (parity_harness::run(&scenario).await?, rest.first())
        }
        _ => bail!("unexpected arguments\n{USAGE}"),
    };
    write(&report, output).await
}
async fn write(report: &Report, path: Option<&String>) -> Result<bool> {
    let text = serde_json::to_string_pretty(report)?;
    if let Some(path) = path {
        tokio::fs::write(path, text).await?;
    } else {
        println!("{text}");
    }
    eprintln!("{} differences", report.differences.len());
    Ok(report.is_equal())
}
