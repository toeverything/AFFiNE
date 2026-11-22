//! Integration tests against real services: `AFFINE_TEST_PG_URL` /
//! `AFFINE_TEST_REDIS_URL` when set, otherwise this machine's shared
//! PostgreSQL container and private Redis containers. Tests run in parallel
//! on one cluster, so each asserts on its own databases only.

use std::{
  collections::BTreeMap,
  path::{Path, PathBuf},
  process::Command,
  sync::{Arc, Barrier},
  time::Duration,
};

use postgres::{Client, NoTls};
use test_db_harness::{
  Container,
  migrations::{MigrationSet, migration},
  pg::{PgCluster, TEST_CLUSTER_MARKER},
  redis::{Reply, TestRedis},
  report::{RunReport, RunStatus},
};

const WORKERS: usize = 8;

fn container_cli() -> Command {
  Command::new(std::env::var("AFFINE_TEST_CONTAINER_CLI").unwrap_or_else(|_| "docker".to_owned()))
}

fn fixture_migrations(tag: &str) -> MigrationSet {
  MigrationSet::from_migrations(vec![
    migration(
      "0001_notes",
      "CREATE TABLE notes (id serial PRIMARY KEY, owner text NOT NULL, body text NOT NULL);",
    ),
    // `tag` keeps one test's template apart from another's.
    migration(
      "0002_seed",
      &format!("INSERT INTO notes (owner, body) VALUES ('seed', '{tag}');"),
    ),
  ])
}

fn connect(url: &str) -> Client {
  Client::connect(url, NoTls).unwrap_or_else(|e| panic!("connect {url}: {e}"))
}

fn database_exists(admin: &mut Client, name: &str) -> bool {
  admin
    .query_opt("SELECT 1 FROM pg_database WHERE datname = $1", &[&name])
    .unwrap()
    .is_some()
}

#[test]
fn pg_concurrent_template_build_isolated_clones_and_expired_orphan_reaping() {
  let cluster = Arc::new(PgCluster::from_env_or_docker().unwrap());
  let migrations = Arc::new(fixture_migrations("clone-isolation"));

  // Eight sessions race to build (or, on a reused cluster, find) the same
  // template and all agree on it.
  let barrier = Arc::new(Barrier::new(WORKERS));
  let names: Vec<String> = (0..WORKERS)
    .map(|_| {
      let (cluster, migrations, barrier) = (cluster.clone(), migrations.clone(), barrier.clone());
      std::thread::spawn(move || {
        barrier.wait();
        cluster.ensure_template(&migrations).unwrap()
      })
    })
    .collect::<Vec<_>>()
    .into_iter()
    .map(|h| h.join().unwrap())
    .collect();
  let template = migrations.template_name();
  assert!(names.iter().all(|n| *n == template), "{names:?}");

  let mut admin = connect(cluster.admin_url());
  let row = admin
    .query_one(
      "SELECT datistemplate, datallowconn FROM pg_database WHERE datname = $1",
      &[&template],
    )
    .unwrap();
  assert_eq!(
    (row.get::<_, bool>(0), row.get::<_, bool>(1)),
    (true, false),
    "read-only template"
  );
  assert!(
    Client::connect(&cluster.url_for(&template), NoTls).is_err(),
    "template refuses connections"
  );
  assert_eq!(
    cluster.ensure_template(&migrations).unwrap(),
    template,
    "rebuild is a no-op"
  );

  // Single clone: seeded and writable.
  {
    let lease = cluster.lease(&template, Duration::from_secs(60)).unwrap();
    let mut db = connect(lease.url());
    db.execute("INSERT INTO notes (owner, body) VALUES ('solo', 'x')", &[])
      .unwrap();
    let count: i64 = db.query_one("SELECT count(*) FROM notes", &[]).unwrap().get(0);
    assert_eq!(count, 2);
    drop(db);
    let name = lease.db_name().to_owned();
    lease.release().unwrap();
    assert!(!database_exists(&mut admin, &name), "release drops the clone");
  }

  // Eight concurrent clones write and read without seeing each other.
  let barrier = Arc::new(Barrier::new(WORKERS));
  let results: Vec<(String, i64, Vec<String>)> = (0..WORKERS)
    .map(|worker| {
      let (cluster, template, barrier) = (cluster.clone(), template.clone(), barrier.clone());
      std::thread::spawn(move || {
        barrier.wait();
        let lease = cluster.lease(&template, Duration::from_secs(60)).unwrap();
        let mut db = connect(lease.url());
        let owner = format!("w{worker}");
        for i in 0..100 {
          db.execute(
            "INSERT INTO notes (owner, body) VALUES ($1, $2)",
            &[&owner, &i.to_string()],
          )
          .unwrap();
        }
        let count: i64 = db.query_one("SELECT count(*) FROM notes", &[]).unwrap().get(0);
        let owners = db
          .query("SELECT DISTINCT owner FROM notes ORDER BY owner", &[])
          .unwrap()
          .iter()
          .map(|r| r.get(0))
          .collect();
        drop(db);
        let name = lease.db_name().to_owned();
        lease.release().unwrap();
        (name, count, owners)
      })
    })
    .collect::<Vec<_>>()
    .into_iter()
    .map(|h| h.join().unwrap())
    .collect();
  for (worker, (name, count, owners)) in results.iter().enumerate() {
    assert_eq!(*count, 101, "{name}");
    assert_eq!(owners, &vec!["seed".to_owned(), format!("w{worker}")], "{name}");
  }
  let unique: std::collections::BTreeSet<_> = results.iter().map(|r| &r.0).collect();
  assert_eq!(unique.len(), WORKERS, "every worker got its own database");

  // Reaper: only expired leases without sessions are dropped.
  let active_expired = cluster.lease(&template, Duration::from_secs(1)).unwrap();
  let idle_expired = cluster.lease(&template, Duration::from_secs(1)).unwrap();
  let idle_live = cluster.lease(&template, Duration::from_secs(600)).unwrap();
  let mut session = connect(active_expired.url());
  std::thread::sleep(Duration::from_millis(1500));

  // Another test's reaper may get there first; either way only the idle
  // expired database goes.
  cluster.reap_orphans().unwrap();
  for kept in [&active_expired, &idle_live] {
    assert!(
      database_exists(&mut admin, kept.db_name()),
      "{} must survive",
      kept.db_name()
    );
  }
  assert!(!database_exists(&mut admin, idle_expired.db_name()));
  let count: i64 = session.query_one("SELECT count(*) FROM notes", &[]).unwrap().get(0);
  assert_eq!(count, 1, "active database untouched");

  // Once its last session ends, the expired database is reaped too.
  drop(session);
  let deadline = std::time::Instant::now() + Duration::from_secs(5);
  while database_exists(&mut admin, active_expired.db_name()) && std::time::Instant::now() < deadline {
    cluster.reap_orphans().unwrap();
    std::thread::sleep(Duration::from_millis(50));
  }
  assert!(!database_exists(&mut admin, active_expired.db_name()));

  // A heartbeat keeps an otherwise expiring lease alive.
  let renewed = cluster.lease(&template, Duration::from_secs(1)).unwrap();
  std::thread::sleep(Duration::from_millis(600));
  renewed.heartbeat().unwrap();
  std::thread::sleep(Duration::from_millis(600));
  cluster.reap_orphans().unwrap();
  assert!(database_exists(&mut admin, renewed.db_name()));
  for lease in [idle_live, renewed] {
    lease.release().unwrap();
  }
  drop((active_expired, idle_expired));
}

#[test]
fn pg_heartbeat_racing_the_reaper_never_drops_a_renewed_lease() {
  let cluster = Arc::new(PgCluster::from_env_or_docker().unwrap());
  let template = cluster.ensure_template(&fixture_migrations("race")).unwrap();
  let mut admin = connect(cluster.admin_url());
  let (mut renewed, mut reaped) = (0, 0);
  for _ in 0..24 {
    // Already expired: the reaper may take it unless the heartbeat wins.
    let lease = cluster.lease(&template, Duration::ZERO).unwrap();
    let (db, token) = (lease.db_name().to_owned(), lease.token().to_owned());
    let barrier = Arc::new(Barrier::new(2));
    let heartbeat = {
      let (cluster, barrier, db, token) = (cluster.clone(), barrier.clone(), db.clone(), token.clone());
      std::thread::spawn(move || {
        barrier.wait();
        cluster.heartbeat(&db, &token, Duration::from_secs(60)).is_ok()
      })
    };
    let reaper = {
      let (cluster, barrier) = (cluster.clone(), barrier.clone());
      std::thread::spawn(move || {
        barrier.wait();
        cluster.reap_orphans().unwrap()
      })
    };
    let heartbeat_ok = heartbeat.join().unwrap();
    reaper.join().unwrap();
    assert_eq!(
      database_exists(&mut admin, &db),
      heartbeat_ok,
      "{db}: a successful heartbeat keeps the database, a failed one means it was reaped"
    );
    if heartbeat_ok {
      renewed += 1;
      lease.release().unwrap();
    } else {
      reaped += 1;
      drop(lease);
    }
  }
  eprintln!("heartbeat won {renewed}, reaper won {reaped}");
}

#[test]
fn pg_lease_tokens_and_cluster_marker_guard_destructive_calls() {
  let cluster = PgCluster::from_env_or_docker().unwrap();
  let template = cluster.ensure_template(&fixture_migrations("tokens")).unwrap();
  let lease = cluster.lease(&template, Duration::from_secs(60)).unwrap();
  let mut admin = connect(cluster.admin_url());
  for wrong in ["", "not-the-token"] {
    assert!(
      cluster
        .heartbeat(lease.db_name(), wrong, Duration::from_secs(60))
        .is_err()
    );
    let refused = cluster.release(lease.db_name(), wrong).unwrap_err().to_string();
    assert!(refused.contains("another owner"), "{refused}");
    assert!(
      database_exists(&mut admin, lease.db_name()),
      "wrong token drops nothing"
    );
  }
  cluster
    .heartbeat(lease.db_name(), lease.token(), Duration::from_secs(60))
    .unwrap();
  let (db, token) = lease.keep();
  cluster.release(&db, &token).unwrap();
  assert!(!database_exists(&mut admin, &db));

  if std::env::var("AFFINE_TEST_PG_URL").is_ok() {
    // Never strip the marker of a cluster this test did not start.
    return;
  }
  // A private cluster: unmarking it must not disturb the shared one.
  let private = PgCluster::start_docker().unwrap();
  let template = private.ensure_template(&fixture_migrations("tokens")).unwrap();
  let (db, token) = private.lease(&template, Duration::from_secs(60)).unwrap().keep();
  let held = private.lease(&template, Duration::from_secs(60)).unwrap();
  let held_db = held.db_name().to_owned();
  let mut private_admin = connect(private.admin_url());
  private_admin
    .batch_execute("COMMENT ON DATABASE postgres IS NULL")
    .unwrap();
  for refused in [
    PgCluster::attach(private.admin_url()).unwrap_err(),
    private.release(&db, &token).unwrap_err(),
    private.heartbeat(&db, &token, Duration::from_secs(60)).unwrap_err(),
    private.reap_orphans().unwrap_err(),
    held.heartbeat().unwrap_err(),
    held.release().unwrap_err(),
  ] {
    assert!(
      refused.to_string().contains("not marked as a test cluster"),
      "{refused}"
    );
  }
  for kept in [&db, &held_db] {
    assert!(database_exists(&mut private_admin, kept), "unmarked cluster untouched");
  }
  private_admin
    .batch_execute(&format!("COMMENT ON DATABASE postgres IS '{TEST_CLUSTER_MARKER}'"))
    .unwrap();
  assert!(PgCluster::attach(private.admin_url()).is_ok());
}

#[test]
fn affine_server_migrations_build_prisma_compatible_template() {
  let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../packages/backend/server/migrations");
  let migrations = MigrationSet::load(&dir).unwrap();
  let cluster = PgCluster::from_env_or_docker().unwrap();
  let template = cluster.ensure_template(&migrations).unwrap();
  let lease = cluster.lease(&template, Duration::from_secs(60)).unwrap();
  let mut db = connect(lease.url());

  let recorded: Vec<(String, String)> = db
    .query(
      r#"SELECT migration_name, checksum FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name"#,
      &[],
    )
    .unwrap()
    .iter()
    .map(|r| (r.get(0), r.get(1)))
    .collect();
  let expected: Vec<(String, String)> = migrations
    .migrations
    .iter()
    .map(|m| (m.name.clone(), m.checksum.clone()))
    .collect();
  assert_eq!(recorded, expected);

  for table in ["users", "workspaces", "snapshots"] {
    let exists: bool = db
      .query_one("SELECT to_regclass($1) IS NOT NULL", &[&format!("public.{table}")])
      .unwrap()
      .get(0);
    assert!(exists, "table {table}");
  }
  let read_only: String = db.query_one("SHOW default_transaction_read_only", &[]).unwrap().get(0);
  assert_eq!(read_only, "off", "clones are writable");
  drop(db);
  lease.release().unwrap();
}

#[test]
fn redis_service_answers_and_scopes_keys_by_run_prefix() {
  let redis = TestRedis::from_env_or_docker().unwrap();
  assert!(redis.key_prefix().starts_with("test:") && redis.key_prefix().ends_with(':'));
  let key = format!("{}k", redis.key_prefix());
  let mut conn = redis.connect().unwrap();
  conn.ping().unwrap();
  assert_eq!(conn.cmd(&["SET", &key, "v"]).unwrap(), Reply::Status("OK".into()));
  assert_eq!(conn.cmd(&["GET", &key]).unwrap(), Reply::Bulk(Some(b"v".to_vec())));
  assert_eq!(conn.cmd(&["DEL", &key]).unwrap(), Reply::Int(1));
  assert!(conn.cmd(&["NOSUCHCOMMAND"]).is_err());
}

#[test]
fn container_remove_refuses_names_prefixes_foreign_unlabeled_unmarked_and_shared_containers() {
  let me = test_db_harness::process_run_id();
  let running = |id: &str| {
    let ps = container_cli()
      .args(["ps", "-q", "--no-trunc", "--filter", &format!("id={id}")])
      .output()
      .unwrap();
    !String::from_utf8_lossy(&ps.stdout).trim().is_empty()
  };
  let refused = |id: &str, owner: &str| Container::remove_owned(id, owner).unwrap_err().to_string();
  let run_raw = |labels: &[&str]| {
    let mut args = vec!["run", "-d", "--rm"];
    for label in labels {
      args.extend(["--label", label]);
    }
    args.push(test_db_harness::redis::REDIS_IMAGE);
    let out = container_cli().args(&args).output().unwrap();
    assert!(out.status.success(), "{}", String::from_utf8_lossy(&out.stderr));
    String::from_utf8_lossy(&out.stdout).trim().to_owned()
  };

  // Containers this harness did not start, or started before the shared
  // label existed: refused even with this run as the expected owner.
  let foreign = run_raw(&[]);
  let unmarked = run_raw(&["affine.test.env=true", &format!("affine.test.owner={me}")]);
  let unlabeled = refused(&foreign, me);
  let short = refused(&foreign[..12], me);
  let no_shared_label = refused(&unmarked, me);
  let no_owner = refused(&unmarked, "");
  for id in [&foreign, &unmarked] {
    let _ = container_cli().args(["rm", "-f", id]).output();
  }
  assert!(
    unlabeled.contains("lacks the affine.test.env=true label"),
    "{unlabeled}"
  );
  assert!(short.contains("full 64-hex container id"), "{short}");
  assert!(
    no_shared_label.contains("not labeled affine.test.shared=false"),
    "{no_shared_label}"
  );
  assert!(no_owner.contains("no expected owner"), "{no_owner}");

  // A private container of this run: another run id is refused, its own
  // handle removes it.
  let private = Container::run(test_db_harness::redis::REDIS_IMAGE, 6379, &[], &[]).unwrap();
  let other_run = refused(private.id(), "another-run");
  assert!(other_run.contains("belongs to run"), "{other_run}");
  assert!(running(private.id()));
  let id = private.id().to_owned();
  drop(private);
  assert!(!running(&id), "its own handle removes it");
  Container::remove_owned(&"0".repeat(64), me).unwrap();

  // The shared PostgreSQL container, by id or by name.
  if std::env::var("AFFINE_TEST_PG_URL").is_err() {
    let cluster = PgCluster::from_env_or_docker().unwrap();
    let shared = cluster.container_id().unwrap().to_owned();
    let by_id = refused(&shared, me);
    assert!(by_id.contains("affine.test.shared=false"), "{by_id}");
    let name = String::from_utf8_lossy(
      &container_cli()
        .args(["inspect", "--format", "{{.Name}}", &shared])
        .output()
        .unwrap()
        .stdout,
    )
    .trim()
    .trim_start_matches('/')
    .to_owned();
    assert!(refused(&name, me).contains("full 64-hex container id"));
    assert!(running(&shared), "shared container survives");
  }
}

#[test]
fn shared_container_cold_start_converges_for_concurrent_callers() {
  // A fresh name, so all callers race a cold start.
  let name = format!("affine-test-env-race-{}", test_db_harness::process_run_id());
  let barrier = Arc::new(Barrier::new(WORKERS));
  let results: Vec<_> = (0..WORKERS)
    .map(|_| {
      let (barrier, name) = (barrier.clone(), name.clone());
      std::thread::spawn(move || {
        barrier.wait();
        Container::ensure_shared(
          &name,
          test_db_harness::redis::REDIS_IMAGE,
          6379,
          &[],
          &["redis-server", "--save", "", "--appendonly", "no"],
        )
        .map(|c| (c.id().to_owned(), c.addr()))
        .map_err(|e| e.to_string())
      })
    })
    .collect::<Vec<_>>()
    .into_iter()
    .map(|h| h.join().unwrap())
    .collect();
  let ids: std::collections::BTreeSet<_> = results.iter().filter_map(|r| r.as_ref().ok()).collect();
  let _ = container_cli().args(["rm", "-f", &name]).output();
  let errors: Vec<_> = results.iter().filter_map(|r| r.as_ref().err()).collect();
  assert!(errors.is_empty(), "every caller gets the container: {errors:?}");
  assert_eq!(ids.len(), 1, "all callers converge on one container and port: {ids:?}");
}

#[test]
fn affine_test_env_cli_up_lease_release_reap_run_json_down() {
  let work = std::env::temp_dir().join(format!("tdh-cli-{}", test_db_harness::process_run_id()));
  let _ = std::fs::remove_dir_all(&work);
  let migrations_dir = work.join("migrations");
  std::fs::create_dir_all(migrations_dir.join("0001_t")).unwrap();
  std::fs::write(
    migrations_dir.join("0001_t/migration.sql"),
    "CREATE TABLE cli_fixture (id int);",
  )
  .unwrap();
  let env_file = work.join("services.env");

  let run = |args: &[&str], env: &BTreeMap<String, String>| {
    Command::new(env!("CARGO_BIN_EXE_affine-test-env"))
      .args(args)
      .envs(env)
      .output()
      .unwrap()
  };
  let cli = |args: &[&str], env: &BTreeMap<String, String>| -> String {
    let out = run(args, env);
    assert!(
      out.status.success(),
      "{args:?}: {}",
      String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8(out.stdout).unwrap()
  };
  let parse = |text: &str| -> BTreeMap<String, String> {
    text
      .lines()
      .filter_map(|l| l.split_once('='))
      .map(|(k, v)| (k.to_owned(), v.to_owned()))
      .collect()
  };

  let up = parse(&cli(
    &[
      "up",
      "--migrations",
      migrations_dir.to_str().unwrap(),
      "--env-file",
      env_file.to_str().unwrap(),
    ],
    &BTreeMap::new(),
  ));
  assert_eq!(
    parse(&std::fs::read_to_string(&env_file).unwrap()),
    up,
    "env file mirrors stdout"
  );
  let services: BTreeMap<String, String> = up
    .iter()
    .filter(|(k, _)| k.as_str() == "AFFINE_TEST_PG_URL" || k.as_str() == "AFFINE_TEST_REDIS_URL")
    .map(|(k, v)| (k.clone(), v.clone()))
    .collect();
  let template = &up["AFFINE_TEST_PG_TEMPLATE"];

  let leased = parse(&cli(&["lease", "--template", template, "--ttl-secs", "60"], &services));
  let db = &leased["AFFINE_TEST_DB_NAME"];
  connect(&leased["AFFINE_TEST_DB_URL"])
    .batch_execute("SELECT 1")
    .unwrap();
  let token = &leased["AFFINE_TEST_DB_TOKEN"];
  cli(
    &["heartbeat", "--db", db, "--token", token, "--ttl-secs", "60"],
    &services,
  );
  let wrong = run(&["release", "--db", db, "--token", "wrong"], &services);
  assert!(!wrong.status.success(), "release needs the owner token");
  assert!(String::from_utf8_lossy(&wrong.stderr).contains("another owner"));
  cli(&["release", "--db", db, "--token", token], &services);
  let mut admin = connect(&services["AFFINE_TEST_PG_URL"]);
  assert!(!database_exists(&mut admin, db));
  drop(admin);
  cli(&["reap"], &services);

  let report_path = work.join("out/run.json");
  cli(
    &[
      "run-json",
      "--out",
      report_path.to_str().unwrap(),
      "--lane",
      "server-harness",
      "--status",
      "passed",
      "--run-id",
      "r",
      "--sha",
      "s",
      "--select",
      "test-db-harness",
      "--skip",
      "web=no frontend change",
      "--timing",
      "test=5",
    ],
    &BTreeMap::new(),
  );
  let report = RunReport::read(&report_path).unwrap();
  assert_eq!(report.status, RunStatus::Passed);
  assert_eq!(report.skipped_targets_with_reason[0].reason, "no frontend change");
  assert_eq!(report.timings_ms["test"], 5);

  // The shared PostgreSQL container is never handed to `down`, and `down`
  // refuses it when it is written into an env file anyway.
  assert!(!up.contains_key("AFFINE_TEST_PG_CONTAINER"), "{up:?}");
  if std::env::var("AFFINE_TEST_PG_URL").is_err() {
    let shared = PgCluster::from_env_or_docker()
      .unwrap()
      .container_id()
      .unwrap()
      .to_owned();
    let forged = work.join("forged.env");
    std::fs::write(
      &forged,
      format!(
        "AFFINE_TEST_OWNER={}\nAFFINE_TEST_PG_CONTAINER={shared}\n",
        up["AFFINE_TEST_OWNER"]
      ),
    )
    .unwrap();
    let out = run(&["down", "--env-file", forged.to_str().unwrap()], &BTreeMap::new());
    assert!(!out.status.success());
    assert!(String::from_utf8_lossy(&out.stderr).contains("machine-wide shared container"));
    assert!(PgCluster::from_env_or_docker().is_ok(), "shared container survives");
  }
  cli(&["down", "--env-file", env_file.to_str().unwrap()], &BTreeMap::new());
  for key in ["AFFINE_TEST_REDIS_CONTAINER"] {
    if let Some(id) = up.get(key) {
      let ps = container_cli()
        .args(["ps", "-aq", "--no-trunc", "--filter", &format!("id={id}")])
        .output()
        .unwrap();
      assert!(String::from_utf8_lossy(&ps.stdout).trim().is_empty(), "{key} removed");
    }
  }
  let _ = std::fs::remove_dir_all(PathBuf::from(&work));
}

#[test]
fn paused_shared_container_is_reported_and_kept() {
  let name = format!("affine-test-env-paused-{}", test_db_harness::process_run_id());
  let start = || {
    Container::ensure_shared(
      &name,
      test_db_harness::redis::REDIS_IMAGE,
      6379,
      &[],
      &["redis-server", "--save", "", "--appendonly", "no"],
    )
  };
  let id = start().unwrap().id().to_owned();
  let paused = container_cli().args(["pause", &id]).output().unwrap();
  if paused.status.success() {
    let refused = start().unwrap_err().to_string();
    let exists = container_cli()
      .args(["ps", "-aq", "--no-trunc", "--filter", &format!("id={id}")])
      .output()
      .unwrap();
    let _ = container_cli().args(["unpause", &id]).output();
    let _ = container_cli().args(["rm", "-f", &id]).output();
    assert!(refused.contains("unexpected state \"paused\""), "{refused}");
    assert!(
      !String::from_utf8_lossy(&exists.stdout).trim().is_empty(),
      "paused container kept"
    );
  } else {
    // This runtime cannot pause; the state table is covered by the unit test
    // in src/docker.rs.
    let _ = container_cli().args(["rm", "-f", &id]).output();
    eprintln!("pause unsupported: {}", String::from_utf8_lossy(&paused.stderr).trim());
  }
}
