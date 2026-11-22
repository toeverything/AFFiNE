//! PostgreSQL test cluster: marked cluster guard, migration-digest template
//! databases, template clones under heartbeat leases, and the orphan reaper.

use std::{
  hash::{BuildHasher, Hasher},
  sync::atomic::{AtomicU32, Ordering},
  time::{Duration, Instant},
};

use postgres::{Client, NoTls};

use crate::{Container, Error, Result, host_id, migrations::MigrationSet, process_run_id};

/// Pinned by digest (multi-arch index) so every machine runs the same image.
pub const PG_IMAGE: &str =
  "docker.io/pgvector/pgvector:pg16@sha256:484e838076e04939d27d3e176e91c86eea96236126023be8d3059761122e579f";
pub const PG_URL_ENV: &str = "AFFINE_TEST_PG_URL";
/// Comment on database `postgres` that marks a cluster as disposable test
/// infrastructure. Only marked clusters are ever written to.
pub const TEST_CLUSTER_MARKER: &str = "affine-test-cluster";
/// Default lifetime of a lease without a heartbeat.
pub const DEFAULT_LEASE_TTL: Duration = Duration::from_secs(600);

const MAINTENANCE_DB: &str = "postgres";
const DOCKER_USER: &str = "affine";
const DOCKER_PASSWORD: &str = "affine";
const READY_TIMEOUT: Duration = Duration::from_secs(60);
/// First key of the two-key advisory locks that serialize work on one
/// leased database (heartbeat, release, reap).
const LEASE_LOCK_NAMESPACE: i32 = 0x4146_5445;

/// A PostgreSQL cluster that is known to be dedicated to tests.
#[derive(Debug)]
pub struct PgCluster {
  /// URL of the maintenance database `postgres`.
  admin_url: String,
  container: Option<Container>,
}

impl PgCluster {
  /// Attaches to `AFFINE_TEST_PG_URL` when set, otherwise uses this machine's
  /// shared test container ([`PgCluster::ensure_docker`]).
  pub fn from_env_or_docker() -> Result<Self> {
    match std::env::var(PG_URL_ENV) {
      Ok(url) if !url.trim().is_empty() => Self::attach(&url),
      _ => Self::ensure_docker(),
    }
  }

  /// Attaches to an existing cluster, refusing any cluster whose `postgres`
  /// database does not carry the test marker comment.
  pub fn attach(url: &str) -> Result<Self> {
    let cluster = Self {
      admin_url: with_database(url, MAINTENANCE_DB)?,
      container: None,
    };
    cluster.admin()?;
    Ok(cluster)
  }

  /// Reuses the running machine-wide test container, starting it when there
  /// is none. It outlives this process so later runs skip the start-up.
  pub fn ensure_docker() -> Result<Self> {
    let digest = PG_IMAGE.rsplit_once("@sha256:").map_or("latest", |(_, d)| &d[..12]);
    let name = format!("affine-test-env-postgres-{digest}");
    Self::with_container(|args, command| Container::ensure_shared(&name, PG_IMAGE, 5432, args, command))
  }

  /// Starts a private container removed when this cluster is dropped.
  pub fn start_docker() -> Result<Self> {
    Self::with_container(|args, command| Container::run(PG_IMAGE, 5432, args, command))
  }

  /// Runs `pgvector/pgvector:pg16` on a random loopback port with its data
  /// directory on tmpfs and durability turned off, then marks it.
  fn with_container(start: impl FnOnce(&[&str], &[&str]) -> Result<Container>) -> Result<Self> {
    let env_user = format!("POSTGRES_USER={DOCKER_USER}");
    let env_password = format!("POSTGRES_PASSWORD={DOCKER_PASSWORD}");
    let container = start(
      &[
        "--tmpfs",
        "/var/lib/postgresql/data:rw",
        "--shm-size",
        "256m",
        "-e",
        &env_user,
        "-e",
        &env_password,
        "-e",
        "POSTGRES_DB=postgres",
      ],
      &[
        "postgres",
        "-c",
        "fsync=off",
        "-c",
        "synchronous_commit=off",
        "-c",
        "full_page_writes=off",
        "-c",
        "max_connections=300",
      ],
    )?;
    let admin_url = format!(
      "postgres://{DOCKER_USER}:{DOCKER_PASSWORD}@{}/{MAINTENANCE_DB}",
      container.addr()
    );
    // The container carries the harness label, so it is ours to mark.
    let mut client = connect_with_retry(&admin_url, READY_TIMEOUT)?;
    client.batch_execute(&format!("COMMENT ON DATABASE postgres IS '{TEST_CLUSTER_MARKER}'"))?;
    Ok(Self {
      admin_url,
      container: Some(container),
    })
  }

  pub fn admin_url(&self) -> &str {
    &self.admin_url
  }

  pub fn url_for(&self, database: &str) -> String {
    with_database(&self.admin_url, database).expect("admin url was validated on construction")
  }

  /// Id of the container behind this cluster, shared or private.
  pub fn container_id(&self) -> Option<&str> {
    self.container.as_ref().map(Container::id)
  }

  /// Id of a private container started for this cluster, kept running after
  /// drop. A shared container is never handed out: it is already kept.
  pub fn detach_container(&mut self) -> Option<String> {
    match self.container.take() {
      Some(c) if c.is_private() => Some(c.detach()),
      other => {
        self.container = other;
        None
      }
    }
  }

  fn admin(&self) -> Result<Client> {
    connect_marked_admin(&self.admin_url)
  }

  /// Builds `affine_tpl_<digest>` from `migrations` once per cluster and
  /// returns its name. Concurrent callers serialize on an advisory lock; a
  /// half-built template left by a crashed builder is rebuilt.
  pub fn ensure_template(&self, migrations: &MigrationSet) -> Result<String> {
    let name = migrations.template_name();
    // The lock lives as long as this session; dropping the client on any
    // early return releases it.
    let mut admin = self.admin()?;
    admin.execute("SELECT pg_advisory_lock(hashtext($1))", &[&name])?;
    let state: Option<bool> = admin
      .query_opt("SELECT datistemplate FROM pg_database WHERE datname = $1", &[&name])?
      .map(|row| row.get(0));
    match state {
      Some(true) => return Ok(name),
      Some(false) => admin.batch_execute(&format!("DROP DATABASE {} WITH (FORCE)", ident(&name)?))?,
      None => {}
    }
    admin.batch_execute(&format!("CREATE DATABASE {}", ident(&name)?))?;
    {
      let mut tpl = Client::connect(&self.url_for(&name), NoTls)?;
      for m in &migrations.migrations {
        tpl
          .batch_execute(&m.sql)
          .map_err(|e| Error::new(format!("migration {} failed: {}", m.name, Error::from(e))))?;
      }
      record_prisma_migrations(&mut tpl, migrations)?;
    }
    let quoted = ident(&name)?;
    admin.batch_execute(&format!(
      "REVOKE ALL ON DATABASE {quoted} FROM PUBLIC;
       ALTER DATABASE {quoted} SET default_transaction_read_only = on;
       ALTER DATABASE {quoted} WITH ALLOW_CONNECTIONS false;
       ALTER DATABASE {quoted} IS_TEMPLATE true;"
    ))?;
    Ok(name)
  }

  /// Clones `template` into a private `test_<run>_<seq>` database leased to
  /// this process for `ttl` without heartbeat.
  pub fn lease(&self, template: &str, ttl: Duration) -> Result<DbLease> {
    static SEQ: AtomicU32 = AtomicU32::new(0);
    let db_name = format!("test_{}_{}", process_run_id(), SEQ.fetch_add(1, Ordering::Relaxed));
    let token = new_token();
    let mut admin = self.admin()?;
    ensure_lease_table(&mut admin)?;
    let strategy = if server_version(&mut admin)? >= 150_000 {
      " STRATEGY = FILE_COPY"
    } else {
      ""
    };
    let create = format!(
      "CREATE DATABASE {} TEMPLATE {}{strategy}",
      ident(&db_name)?,
      ident(template)?
    );
    // The whole clone runs under the lease lock, so the reaper can neither
    // drop the row nor the half-made database however long cloning takes.
    with_lease_lock(&mut admin, &db_name, |admin| {
      admin.execute(
        "INSERT INTO test_db_leases (db_name, owner_pid, host_id, heartbeat_at, expires_at, owner_token)
         VALUES ($1, $2, $3, clock_timestamp(), clock_timestamp() + make_interval(secs => $4), $5)",
        &[
          &db_name,
          &(std::process::id() as i32),
          &host_id(),
          &ttl.as_secs_f64(),
          &token,
        ],
      )?;
      if let Err(e) = admin.batch_execute(&create) {
        admin.execute("DELETE FROM test_db_leases WHERE db_name = $1", &[&db_name])?;
        return Err(e.into());
      }
      // The TTL counts from the moment the clone is ready.
      admin.execute(
        "UPDATE test_db_leases
         SET heartbeat_at = clock_timestamp(), expires_at = clock_timestamp() + make_interval(secs => $2)
         WHERE db_name = $1",
        &[&db_name, &ttl.as_secs_f64()],
      )?;
      Ok(())
    })?;
    Ok(DbLease {
      url: self.url_for(&db_name),
      admin_url: self.admin_url.clone(),
      db_name,
      token,
      ttl,
      released: false,
    })
  }

  /// Extends the lease of `db_name` held under `token` to `ttl` from now.
  pub fn heartbeat(&self, db_name: &str, token: &str, ttl: Duration) -> Result<()> {
    heartbeat_lease(&mut self.admin()?, db_name, token, ttl)
  }

  /// Drops `db_name` and its lease, if `token` is the lease's owner token.
  pub fn release(&self, db_name: &str, token: &str) -> Result<()> {
    release_lease(&mut self.admin()?, db_name, token)
  }

  /// Drops every test database whose lease has expired and which has no
  /// session in `pg_stat_activity`; returns the dropped names. Each candidate
  /// is re-checked under its lease lock, which heartbeat and release also
  /// take, so a lease renewed meanwhile is never dropped.
  pub fn reap_orphans(&self) -> Result<Vec<String>> {
    let mut admin = self.admin()?;
    ensure_lease_table(&mut admin)?;
    let candidates: Vec<String> = admin
      .query(
        "SELECT db_name FROM test_db_leases WHERE expires_at < clock_timestamp() ORDER BY db_name",
        &[],
      )?
      .into_iter()
      .map(|row| row.get(0))
      .collect();
    let mut dropped = Vec::new();
    for db_name in candidates {
      let Ok(quoted) = ident(&db_name) else { continue };
      if !db_name.starts_with("test_") {
        continue;
      }
      let locked: bool = admin
        .query_one(
          "SELECT pg_try_advisory_lock($1, hashtext($2))",
          &[&LEASE_LOCK_NAMESPACE, &db_name],
        )?
        .get(0);
      if !locked {
        continue;
      }
      let outcome = (|| -> Result<bool> {
        let still_orphaned: bool = admin
          .query_one(
            "SELECT EXISTS (SELECT 1 FROM test_db_leases WHERE db_name = $1 AND expires_at < clock_timestamp())
               AND NOT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname = $1)",
            &[&db_name],
          )?
          .get(0);
        // No FORCE: a session that connected after the check makes the drop
        // fail, and the database survives to the next pass.
        if !still_orphaned
          || admin
            .batch_execute(&format!("DROP DATABASE IF EXISTS {quoted}"))
            .is_err()
        {
          return Ok(false);
        }
        admin.execute("DELETE FROM test_db_leases WHERE db_name = $1", &[&db_name])?;
        Ok(true)
      })();
      admin.execute(
        "SELECT pg_advisory_unlock($1, hashtext($2))",
        &[&LEASE_LOCK_NAMESPACE, &db_name],
      )?;
      if outcome? {
        dropped.push(db_name);
      }
    }
    Ok(dropped)
  }
}

/// A private database cloned from a template. Dropped with its lease on
/// [`DbLease::release`] or drop.
#[derive(Debug)]
pub struct DbLease {
  db_name: String,
  url: String,
  admin_url: String,
  token: String,
  ttl: Duration,
  released: bool,
}

impl DbLease {
  pub fn db_name(&self) -> &str {
    &self.db_name
  }

  pub fn url(&self) -> &str {
    &self.url
  }

  /// Secret that proves ownership of this lease to [`PgCluster::heartbeat`]
  /// and [`PgCluster::release`].
  pub fn token(&self) -> &str {
    &self.token
  }

  /// Extends the lease by its TTL from now.
  pub fn heartbeat(&self) -> Result<()> {
    heartbeat_lease(
      &mut connect_marked_admin(&self.admin_url)?,
      &self.db_name,
      &self.token,
      self.ttl,
    )
  }

  /// Leaves the database and its lease in place (for a lease handed to
  /// another process) and returns its name and token.
  pub fn keep(mut self) -> (String, String) {
    self.released = true;
    (std::mem::take(&mut self.db_name), std::mem::take(&mut self.token))
  }

  /// Drops the database, terminating this lease's own leftover sessions.
  pub fn release(mut self) -> Result<()> {
    self.released = true;
    release_lease(&mut connect_marked_admin(&self.admin_url)?, &self.db_name, &self.token)
  }
}

impl Drop for DbLease {
  fn drop(&mut self) {
    if !self.released
      && let Ok(mut admin) = connect_marked_admin(&self.admin_url)
    {
      let _ = release_lease(&mut admin, &self.db_name, &self.token);
    }
  }
}

/// A maintenance connection, verified to belong to a marked test cluster
/// before anything else runs on it. Every destructive or lease-changing call
/// goes through it.
fn connect_marked_admin(admin_url: &str) -> Result<Client> {
  let mut client = Client::connect(admin_url, NoTls)?;
  let comment: Option<String> = client
    .query_one(
      "SELECT shobj_description(oid, 'pg_database') FROM pg_database WHERE datname = $1",
      &[&MAINTENANCE_DB],
    )?
    .get(0);
  if comment.as_deref() != Some(TEST_CLUSTER_MARKER) {
    return Err(Error::new(format!(
      "refusing to use {}: database `postgres` is not marked as a test cluster; on a disposable cluster run COMMENT ON \
       DATABASE postgres IS '{TEST_CLUSTER_MARKER}'",
      redact(admin_url)
    )));
  }
  Ok(client)
}

fn new_token() -> String {
  let random = || std::collections::hash_map::RandomState::new().build_hasher().finish();
  format!("{:016x}{:016x}", random(), random())
}

/// Runs `f` holding the lease lock of `db_name` on `admin`'s session.
fn with_lease_lock<T>(admin: &mut Client, db_name: &str, f: impl FnOnce(&mut Client) -> Result<T>) -> Result<T> {
  admin.execute(
    "SELECT pg_advisory_lock($1, hashtext($2))",
    &[&LEASE_LOCK_NAMESPACE, &db_name],
  )?;
  let result = f(admin);
  admin.execute(
    "SELECT pg_advisory_unlock($1, hashtext($2))",
    &[&LEASE_LOCK_NAMESPACE, &db_name],
  )?;
  result
}

fn heartbeat_lease(admin: &mut Client, db_name: &str, token: &str, ttl: Duration) -> Result<()> {
  with_lease_lock(admin, db_name, |admin| {
    let updated = admin.execute(
      "UPDATE test_db_leases
       SET heartbeat_at = clock_timestamp(), expires_at = clock_timestamp() + make_interval(secs => $3)
       WHERE db_name = $1 AND owner_token = $2",
      &[&db_name, &token, &ttl.as_secs_f64()],
    )?;
    if updated == 1 {
      Ok(())
    } else {
      Err(Error::new(format!(
        "no lease for {db_name} under this token; it was released, reaped or belongs to another owner"
      )))
    }
  })
}

fn release_lease(admin: &mut Client, db_name: &str, token: &str) -> Result<()> {
  let quoted = ident(db_name)?;
  with_lease_lock(admin, db_name, |admin| {
    let owner: Option<Option<String>> = admin
      .query_opt("SELECT owner_token FROM test_db_leases WHERE db_name = $1", &[&db_name])?
      .map(|row| row.get(0));
    match owner {
      None => return Ok(()),
      Some(Some(t)) if t == token => {}
      Some(_) => {
        return Err(Error::new(format!(
          "refusing to release {db_name}: the lease belongs to another owner"
        )));
      }
    }
    // The lease is ours: end its leftover sessions with the database.
    admin.batch_execute(&format!("DROP DATABASE IF EXISTS {quoted} WITH (FORCE)"))?;
    admin.execute("DELETE FROM test_db_leases WHERE db_name = $1", &[&db_name])?;
    Ok(())
  })
}

fn ensure_lease_table(admin: &mut Client) -> Result<()> {
  let ready: bool = admin
    .query_one(
      "SELECT EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_schema = 'public' AND table_name = 'test_db_leases' AND column_name = 'owner_token')",
      &[],
    )?
    .get(0);
  if ready {
    return Ok(());
  }
  // Concurrent CREATE TABLE IF NOT EXISTS can still collide in pg_type;
  // serialize the first creation (and the upgrade of a table without tokens).
  let mut tx = admin.transaction()?;
  tx.execute(
    "SELECT pg_advisory_xact_lock(hashtext('affine-test-env:lease-table'))",
    &[],
  )?;
  tx.batch_execute(
    "CREATE TABLE IF NOT EXISTS public.test_db_leases (
       db_name      text PRIMARY KEY,
       owner_pid    integer NOT NULL,
       host_id      text NOT NULL,
       heartbeat_at timestamptz NOT NULL,
       expires_at   timestamptz NOT NULL,
       owner_token  text
     );
     ALTER TABLE public.test_db_leases ADD COLUMN IF NOT EXISTS owner_token text;",
  )?;
  tx.commit()?;
  Ok(())
}

/// Records the applied set in Prisma's own bookkeeping table so `prisma
/// migrate deploy` against a clone is a no-op.
fn record_prisma_migrations(tpl: &mut Client, migrations: &MigrationSet) -> Result<()> {
  tpl.batch_execute(
    r#"CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
         "id"                  VARCHAR(36) PRIMARY KEY NOT NULL,
         "checksum"            VARCHAR(64) NOT NULL,
         "finished_at"         TIMESTAMPTZ,
         "migration_name"      VARCHAR(255) NOT NULL,
         "logs"                TEXT,
         "rolled_back_at"      TIMESTAMPTZ,
         "started_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
         "applied_steps_count" INTEGER NOT NULL DEFAULT 0
       )"#,
  )?;
  let insert = tpl.prepare(
    r#"INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
       VALUES (gen_random_uuid()::text, $1, now(), $2, now(), 1)"#,
  )?;
  for m in &migrations.migrations {
    tpl.execute(&insert, &[&m.checksum, &m.name])?;
  }
  Ok(())
}

fn server_version(client: &mut Client) -> Result<i32> {
  let text: String = client.query_one("SHOW server_version_num", &[])?.get(0);
  text
    .parse()
    .map_err(|_| Error::new(format!("unexpected server_version_num {text:?}")))
}

fn connect_with_retry(url: &str, timeout: Duration) -> Result<Client> {
  let deadline = Instant::now() + timeout;
  loop {
    match Client::connect(url, NoTls) {
      Ok(client) => return Ok(client),
      Err(e) if Instant::now() >= deadline => {
        return Err(Error::new(format!(
          "postgres at {} not ready after {timeout:?}: {e}",
          redact(url)
        )));
      }
      Err(_) => std::thread::sleep(Duration::from_millis(100)),
    }
  }
}

/// Quotes a harness-generated database name, rejecting anything outside
/// `[a-z0-9_]` so names never need escaping.
fn ident(name: &str) -> Result<String> {
  let valid = !name.is_empty()
    && name.len() <= 63
    && name
      .bytes()
      .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_');
  if valid {
    Ok(format!("\"{name}\""))
  } else {
    Err(Error::new(format!("invalid harness database name {name:?}")))
  }
}

/// Replaces the database path of a `postgres://` / `postgresql://` URL.
pub fn with_database(url: &str, database: &str) -> Result<String> {
  let scheme_end = url
    .find("://")
    .filter(|_| url.starts_with("postgres://") || url.starts_with("postgresql://"))
    .ok_or_else(|| Error::new("expected a postgres:// or postgresql:// URL"))?;
  let authority_start = scheme_end + 3;
  let rest = &url[authority_start..];
  let authority_end = rest.find(['/', '?']).map_or(url.len(), |i| authority_start + i);
  let query = url[authority_end..].find('?').map_or("", |i| &url[authority_end + i..]);
  Ok(format!("{}/{database}{query}", &url[..authority_end]))
}

/// Hides the password of a URL for messages.
fn redact(url: &str) -> String {
  match (url.find("://"), url.rfind('@')) {
    (Some(s), Some(at)) if at > s => match url[s + 3..at].find(':') {
      Some(colon) => format!("{}:***{}", &url[..s + 3 + colon], &url[at..]),
      None => url.to_owned(),
    },
    _ => url.to_owned(),
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn url_database_rewrite_and_redaction() {
    let cases = [
      ("postgres://u:p@h:5432/affine", "postgres://u:p@h:5432/x"),
      (
        "postgresql://u:p@h:5432/affine?sslmode=disable",
        "postgresql://u:p@h:5432/x?sslmode=disable",
      ),
      ("postgres://u@h", "postgres://u@h/x"),
      ("postgres://u@h?a=b", "postgres://u@h/x?a=b"),
    ];
    for (input, expected) in cases {
      assert_eq!(with_database(input, "x").unwrap(), expected, "{input}");
    }
    assert!(with_database("mysql://h/db", "x").is_err());
    assert_eq!(redact("postgres://u:secret@h:1/db"), "postgres://u:***@h:1/db");
    assert_eq!(redact("postgres://u@h:1/db"), "postgres://u@h:1/db");
  }

  #[test]
  fn ident_accepts_only_generated_names() {
    for (name, ok) in [
      ("test_abc_1", true),
      ("affine_tpl_0123456789abcdef", true),
      ("Test", false),
      ("a\"b", false),
      ("a-b", false),
      ("", false),
      (&"x".repeat(64), false),
    ] {
      assert_eq!(ident(name).is_ok(), ok, "{name}");
    }
  }
}
