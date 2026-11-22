use parity_harness::sinks::postgres_snapshot;
use serde_json::json;

/// Run explicitly against a disposable database:
/// PARITY_TEST_POSTGRES='host=127.0.0.1 port=... user=... dbname=...' cargo test --test postgres -- --ignored
/// This test creates/drops only its own schema; it does not touch business tables.
#[tokio::test]
#[ignore = "requires an explicitly supplied disposable PostgreSQL database"]
async fn postgres_snapshot_preserves_empty_tables_rows_nulls_binary_and_ignore_rules() {
    let url = std::env::var("PARITY_TEST_POSTGRES").expect("supply disposable PG URL");
    let (client, connection) = tokio_postgres::connect(&url, tokio_postgres::NoTls)
        .await
        .unwrap();
    let task = tokio::spawn(connection);
    client.batch_execute("CREATE SCHEMA parity_snapshot_test; CREATE TABLE parity_snapshot_test.docs (id text primary key, workspace_id text, body bytea, optional text); CREATE TABLE parity_snapshot_test.empty (id int); CREATE TABLE parity_snapshot_test.native_schema_migrations (id int); CREATE TABLE parity_snapshot_test._prisma_migrations (id int); INSERT INTO parity_snapshot_test.docs VALUES ('doc-1','workspace-1',decode('000102ff','hex'),NULL),('doc-2','workspace-1',decode('03','hex'),'kept');").await.unwrap();
    let result = postgres_snapshot(&url, &[]).await;
    let defaults = postgres_snapshot(&url, &parity_harness::model::default_ignore_tables()).await;
    let explicit = postgres_snapshot(&url, &["parity_snapshot_test.docs".into()]).await;
    client
        .batch_execute("DROP SCHEMA parity_snapshot_test CASCADE")
        .await
        .unwrap();
    task.abort();
    let value = result.unwrap();
    assert_eq!(
        value["parity_snapshot_test.native_schema_migrations"],
        json!([])
    );
    assert_eq!(value["parity_snapshot_test._prisma_migrations"], json!([]));
    let defaults = defaults.unwrap();
    assert!(
        defaults
            .get("parity_snapshot_test.native_schema_migrations")
            .is_none()
    );
    assert!(
        defaults
            .get("parity_snapshot_test._prisma_migrations")
            .is_none()
    );
    assert!(explicit.unwrap().get("parity_snapshot_test.docs").is_none());
    assert_eq!(value["parity_snapshot_test.empty"], json!([]));
    let mut rows = value["parity_snapshot_test.docs"]
        .as_array()
        .unwrap()
        .clone();
    rows.sort_by_key(|r| r["id"].to_string());
    assert_eq!(
        rows,
        json!([
            {"id":"doc-1","workspace_id":"workspace-1","body":"\\x000102ff","optional":null},
            {"id":"doc-2","workspace_id":"workspace-1","body":"\\x03","optional":"kept"}
        ])
        .as_array()
        .unwrap()
        .clone()
    );
}
