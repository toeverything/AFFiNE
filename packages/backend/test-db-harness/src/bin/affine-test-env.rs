//! `affine-test-env`: start, share and clean up the PostgreSQL/Redis test
//! services, lease template clones, and write `run.json` reports.

use std::{collections::BTreeMap, path::PathBuf, process::ExitCode, time::Duration};

use test_db_harness::{
  Container, Error, Result,
  migrations::MigrationSet,
  pg::{DEFAULT_LEASE_TTL, PG_URL_ENV, PgCluster},
  process_run_id,
  redis::{REDIS_URL_ENV, TestRedis},
  report::{RunReport, RunStatus, SkippedTarget},
};

const USAGE: &str = "\
usage: affine-test-env <command> [options]

  up --migrations <dir> [--env-file <path>]
      Attach to AFFINE_TEST_PG_URL / AFFINE_TEST_REDIS_URL, or use this
      machine's shared PostgreSQL container and start a Redis container; build
      the template for <dir>; print KEY=VALUE lines (also appended to
      --env-file, e.g. $GITHUB_ENV). The Redis container keeps running until
      `down`; the shared PostgreSQL container stays for later runs.
  down --env-file <path>
      Remove the containers recorded by `up` (only harness-labeled ones).
  lease --template <name> [--ttl-secs <n>]
      Clone the template into a private database; print its name, URL and
      owner token.
  heartbeat --db <name> --token <token> [--ttl-secs <n>]
      Extend a lease.
  release --db <name> --token <token>
      Drop a leased database and its lease.
  reap
      Drop test databases whose lease expired and that have no sessions.
  run-json --out <path> --lane <lane> --status passed|failed|skipped
           [--run-id <id>] [--sha <sha>] [--select <target>]...
           [--skip <target>=<reason>]... [--timing <name>=<ms>]...
      Write a run.json report.
";

const PG_TEMPLATE_ENV: &str = "AFFINE_TEST_PG_TEMPLATE";
const PG_CONTAINER_ENV: &str = "AFFINE_TEST_PG_CONTAINER";
const REDIS_CONTAINER_ENV: &str = "AFFINE_TEST_REDIS_CONTAINER";
/// Run id that started the recorded containers; `down` removes only those.
const OWNER_ENV: &str = "AFFINE_TEST_OWNER";

fn main() -> ExitCode {
  let args: Vec<String> = std::env::args().skip(1).collect();
  match run(&args) {
    Ok(()) => ExitCode::SUCCESS,
    Err(e) => {
      eprintln!("affine-test-env: {e}");
      ExitCode::FAILURE
    }
  }
}

fn run(args: &[String]) -> Result<()> {
  let Some((command, rest)) = args.split_first() else {
    print!("{USAGE}");
    return Err(Error::new("missing command"));
  };
  let opts = Opts::parse(rest)?;
  match command.as_str() {
    "up" => up(&opts),
    "down" => down(&opts),
    "lease" => {
      let cluster = attached_cluster()?;
      let lease = cluster.lease(opts.required("template")?, opts.ttl()?)?;
      println!("AFFINE_TEST_DB_NAME={}", lease.db_name());
      println!("AFFINE_TEST_DB_URL={}", lease.url());
      println!("AFFINE_TEST_DB_TOKEN={}", lease.token());
      lease.keep();
      Ok(())
    }
    "heartbeat" => attached_cluster()?.heartbeat(opts.required("db")?, opts.required("token")?, opts.ttl()?),
    "release" => attached_cluster()?.release(opts.required("db")?, opts.required("token")?),
    "reap" => {
      for name in attached_cluster()?.reap_orphans()? {
        println!("reaped {name}");
      }
      Ok(())
    }
    "run-json" => run_json(&opts),
    "-h" | "--help" | "help" => {
      print!("{USAGE}");
      Ok(())
    }
    other => Err(Error::new(format!("unknown command {other:?}\n{USAGE}"))),
  }
}

fn attached_cluster() -> Result<PgCluster> {
  let url = std::env::var(PG_URL_ENV).map_err(|_| Error::new(format!("{PG_URL_ENV} is not set; run `up` first")))?;
  PgCluster::attach(&url)
}

fn up(opts: &Opts) -> Result<()> {
  let migrations = MigrationSet::load(&PathBuf::from(opts.required("migrations")?))?;
  let mut cluster = PgCluster::from_env_or_docker()?;
  let mut redis = TestRedis::from_env_or_docker()?;
  let template = cluster.ensure_template(&migrations)?;

  let mut lines = vec![
    format!("{PG_URL_ENV}={}", cluster.admin_url()),
    format!("{PG_TEMPLATE_ENV}={template}"),
    format!("{REDIS_URL_ENV}={}", redis.url()),
    format!("{OWNER_ENV}={}", process_run_id()),
  ];
  if let Some(id) = cluster.detach_container() {
    lines.push(format!("{PG_CONTAINER_ENV}={id}"));
  }
  if let Some(id) = redis.detach_container() {
    lines.push(format!("{REDIS_CONTAINER_ENV}={id}"));
  }
  let text = lines.join("\n") + "\n";
  print!("{text}");
  if let Some(path) = opts.get("env-file") {
    use std::io::Write;
    std::fs::OpenOptions::new()
      .create(true)
      .append(true)
      .open(path)?
      .write_all(text.as_bytes())?;
  }
  Ok(())
}

fn down(opts: &Opts) -> Result<()> {
  let path = opts.required("env-file")?;
  let text = std::fs::read_to_string(path)?;
  // Each `up` appends its owner line before its container lines.
  let mut owner = None;
  for (key, value) in text.lines().filter_map(|line| line.split_once('=')) {
    let (key, value) = (key.trim(), value.trim());
    if key == OWNER_ENV {
      owner = Some(value);
    } else if key == PG_CONTAINER_ENV || key == REDIS_CONTAINER_ENV {
      let owner = owner.ok_or_else(|| Error::new(format!("{key} in {path} has no preceding {OWNER_ENV}")))?;
      Container::remove_owned(value, owner)?;
      println!("removed {key} {value}");
    }
  }
  Ok(())
}

fn run_json(opts: &Opts) -> Result<()> {
  let status = match opts.required("status")? {
    "passed" => RunStatus::Passed,
    "failed" => RunStatus::Failed,
    "skipped" => RunStatus::Skipped,
    other => {
      return Err(Error::new(format!(
        "--status must be passed|failed|skipped, got {other:?}"
      )));
    }
  };
  let pairs = |key: &str| -> Result<Vec<(String, String)>> {
    opts
      .all(key)
      .into_iter()
      .map(|v| {
        v.split_once('=')
          .map(|(a, b)| (a.to_owned(), b.to_owned()))
          .ok_or_else(|| Error::new(format!("--{key} expects <name>=<value>, got {v:?}")))
      })
      .collect()
  };
  let timings_ms = pairs("timing")?
    .into_iter()
    .map(|(name, ms)| {
      ms.parse::<u64>()
        .map(|ms| (name, ms))
        .map_err(|_| Error::new(format!("--timing value {ms:?} is not milliseconds")))
    })
    .collect::<Result<BTreeMap<_, _>>>()?;
  let report = RunReport {
    run_id: opts
      .get("run-id")
      .map_or_else(|| process_run_id().to_owned(), str::to_owned),
    sha: opts
      .get("sha")
      .map(str::to_owned)
      .or_else(|| std::env::var("GITHUB_SHA").ok())
      .unwrap_or_default(),
    lane: opts.required("lane")?.to_owned(),
    selected_targets: opts.all("select").into_iter().map(str::to_owned).collect(),
    skipped_targets_with_reason: pairs("skip")?
      .into_iter()
      .map(|(target, reason)| SkippedTarget { target, reason })
      .collect(),
    timings_ms,
    status,
  };
  report.write(&PathBuf::from(opts.required("out")?))
}

/// `--key value` options; a key may repeat.
struct Opts(Vec<(String, String)>);

impl Opts {
  fn parse(args: &[String]) -> Result<Self> {
    let mut pairs = Vec::new();
    let mut it = args.iter();
    while let Some(arg) = it.next() {
      let key = arg
        .strip_prefix("--")
        .ok_or_else(|| Error::new(format!("unexpected argument {arg:?}\n{USAGE}")))?;
      let value = it.next().ok_or_else(|| Error::new(format!("--{key} needs a value")))?;
      pairs.push((key.to_owned(), value.clone()));
    }
    Ok(Self(pairs))
  }

  fn all(&self, key: &str) -> Vec<&str> {
    self
      .0
      .iter()
      .filter(|(k, _)| k == key)
      .map(|(_, v)| v.as_str())
      .collect()
  }

  fn get(&self, key: &str) -> Option<&str> {
    self.all(key).last().copied()
  }

  fn required(&self, key: &str) -> Result<&str> {
    self
      .get(key)
      .ok_or_else(|| Error::new(format!("--{key} is required\n{USAGE}")))
  }

  fn ttl(&self) -> Result<Duration> {
    match self.get("ttl-secs") {
      None => Ok(DEFAULT_LEASE_TTL),
      Some(s) => s
        .parse()
        .map(Duration::from_secs)
        .map_err(|_| Error::new(format!("--ttl-secs {s:?} is not a number"))),
    }
  }
}
