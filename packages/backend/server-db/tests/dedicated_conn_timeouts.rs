use postgres::{Client, NoTls};
use server_db::{DbConfig, SchemaReadiness, ServerDb};
use test_db_harness::pg::PgCluster;

struct EmptyDbGuard {
  admin_url: String,
  db_name: String,
  url: String,
}

impl EmptyDbGuard {
  fn create(cluster: &PgCluster, prefix: &str) -> Self {
    let suffix = uuid::Uuid::new_v4().simple().to_string();
    let db_name = format!("test_{prefix}_{}", &suffix[..12]);
    let mut admin = Client::connect(cluster.admin_url(), NoTls).expect("connect test admin");
    admin
      .batch_execute(&format!("CREATE DATABASE \"{db_name}\""))
      .expect("create empty test database");
    let url = cluster.url_for(&db_name);
    Self {
      admin_url: cluster.admin_url().to_owned(),
      db_name,
      url,
    }
  }
}

impl Drop for EmptyDbGuard {
  fn drop(&mut self) {
    if let Ok(mut admin) = Client::connect(&self.admin_url, NoTls) {
      let _ = admin.batch_execute(&format!("DROP DATABASE IF EXISTS \"{}\" WITH (FORCE)", self.db_name));
    }
  }
}

#[test]
fn dedicated_session_conn_sets_default_timeouts_and_allows_schema_init() {
  let cluster = PgCluster::from_env_or_docker().expect("test PG16 cluster");
  let empty = EmptyDbGuard::create(&cluster, "dedtimeout");

  let rt = tokio::runtime::Builder::new_current_thread()
    .enable_all()
    .build()
    .expect("build tokio runtime");

  rt.block_on(async {
    let mut cfg = DbConfig::new(&empty.url);
    cfg.statement_timeout_ms = 7_500;
    let db = ServerDb::connect(cfg).await.expect("connect ServerDb");

    let mut conn = db.dedicated_session_conn().await.expect("open dedicated session conn");
    let stmt_timeout: String = sqlx::query_scalar("SHOW statement_timeout")
      .fetch_one(&mut conn)
      .await
      .expect("show statement_timeout");
    let idle_timeout: String = sqlx::query_scalar("SHOW idle_in_transaction_session_timeout")
      .fetch_one(&mut conn)
      .await
      .expect("show idle_in_transaction_session_timeout");
    assert_eq!(stmt_timeout, "7500ms");
    assert_eq!(idle_timeout, "10s");
    drop(conn);

    // Schema initialization overrides statement_timeout to 120s on its dedicated connection.
    let readiness = db.ensure_schema_ready().await.expect("ensure schema ready");
    assert!(matches!(readiness, SchemaReadiness::InitializedFresh0275 { .. }));
  });
}
