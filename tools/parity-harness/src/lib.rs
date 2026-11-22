#![forbid(unsafe_code)]
pub mod model;
pub mod normalize;
pub mod protocol;
pub mod sinks;

use anyhow::{Context, Result, ensure};
use model::{Report, Scenario};
use normalize::Normalizer;
use protocol::Session;
use serde_json::{Value, json};
use sinks::{RedisSink, SmtpSink, postgres_snapshot};
use std::time::Duration;

pub trait SnapshotSource: Sync {
    fn snapshots(
        &self,
        left: &model::Target,
        right: &model::Target,
        ignore_tables: &[String],
    ) -> impl std::future::Future<Output = Result<(Value, Value)>> + Send;
}
pub struct PostgresSnapshots;
impl SnapshotSource for PostgresSnapshots {
    async fn snapshots(
        &self,
        left: &model::Target,
        right: &model::Target,
        ignore_tables: &[String],
    ) -> Result<(Value, Value)> {
        async fn side(target: &model::Target, ignore: &[String]) -> Result<Value> {
            match &target.postgres {
                Some(url) => postgres_snapshot(url, ignore).await,
                None => Ok(json!({})),
            }
        }
        tokio::try_join!(side(left, ignore_tables), side(right, ignore_tables))
    }
}
pub async fn run(scenario: &Scenario) -> Result<Report> {
    run_with_snapshots(scenario, &PostgresSnapshots).await
}
pub async fn run_with_snapshots<S: SnapshotSource>(
    scenario: &Scenario,
    source: &S,
) -> Result<Report> {
    // Bound setup, streams, snapshot queries and final collection as well as each
    // step. A dead database or SMTP peer must not leave an unattended run hung.
    let phases = u64::try_from(scenario.steps.len())?.saturating_add(3);
    let budget = scenario.timeout_ms.saturating_mul(phases);
    tokio::time::timeout(Duration::from_millis(budget), run_inner(scenario, source))
        .await
        .context("scenario deadline exceeded")?
}
async fn run_inner<S: SnapshotSource>(scenario: &Scenario, source: &S) -> Result<Report> {
    ensure!(
        !scenario.steps.is_empty(),
        "scenario must contain at least one step"
    );
    ensure!(scenario.timeout_ms > 0, "timeout_ms must be positive");
    ensure!(
        scenario.left_target.postgres.is_some() == scenario.right_target.postgres.is_some(),
        "configure PostgreSQL for both targets"
    );
    ensure!(
        scenario.left_target.redis.is_some() == scenario.right_target.redis.is_some(),
        "configure Redis for both targets"
    );
    ensure!(
        scenario.left_target.smtp_bind.is_some() == scenario.right_target.smtp_bind.is_some(),
        "configure SMTP sinks for both targets"
    );
    if let (Some(l), Some(r)) = (&scenario.left_target.redis, &scenario.right_target.redis) {
        // Redis DB numbers do not isolate Pub/Sub. Require distinct server endpoints.
        let l = reqwest::Url::parse(l)?;
        let r = reqwest::Url::parse(r)?;
        let endpoint = |url: &reqwest::Url| {
            (
                url.host_str().unwrap_or("").to_owned(),
                url.port().unwrap_or(6379),
            )
        };
        ensure!(
            endpoint(&l) != endpoint(&r),
            "Redis Pub/Sub requires separate server endpoints, not logical DBs or credentials"
        );
    }
    if let (Some(l), Some(r)) = (
        &scenario.left_target.postgres,
        &scenario.right_target.postgres,
    ) {
        let l = l.parse::<tokio_postgres::Config>()?;
        let r = r.parse::<tokio_postgres::Config>()?;
        ensure!(
            l.get_hosts() != r.get_hosts()
                || l.get_ports() != r.get_ports()
                || l.get_dbname() != r.get_dbname(),
            "PostgreSQL snapshots require independent test databases"
        );
    }
    let mut normalizer = Normalizer::new(&scenario.dynamic)?;
    let (ls, rs) = tokio::try_join!(
        start_smtp(&scenario.left_target.smtp_bind),
        start_smtp(&scenario.right_target.smtp_bind)
    )?;
    let (lr, rr) = tokio::try_join!(
        start_redis(&scenario.left_target.redis),
        start_redis(&scenario.right_target.redis)
    )?;
    let mut left = Session::new(&scenario.left_target, scenario)?;
    let mut right = Session::new(&scenario.right_target, scenario)?;
    let mut lsteps = Vec::new();
    let mut rsteps = Vec::new();
    for (i, step) in scenario.steps.iter().enumerate() {
        let responses = tokio::time::timeout(Duration::from_millis(scenario.timeout_ms), async {
            tokio::try_join!(left.run(step), right.run(step))
        })
        .await
        .with_context(|| format!("step {} timed out", step.name))??;
        normalizer.compare(
            &format!("/protocol/{i}/{}", step.name),
            &responses.0,
            &responses.1,
        );
        lsteps.push(responses.0);
        rsteps.push(responses.1);
    }
    let lm = match &ls {
        Some(s) => {
            s.snapshot(
                scenario.expected_smtp_count,
                Duration::from_millis(scenario.timeout_ms),
            )
            .await?
        }
        None => json!([]),
    };
    let rm = match &rs {
        Some(s) => {
            s.snapshot(
                scenario.expected_smtp_count,
                Duration::from_millis(scenario.timeout_ms),
            )
            .await?
        }
        None => json!([]),
    };
    let le = match &lr {
        Some(s) => s.snapshot().await?,
        None => json!([]),
    };
    let re = match &rr {
        Some(s) => s.snapshot().await?,
        None => json!([]),
    };
    let (mut ldb, mut rdb) = source
        .snapshots(
            &scenario.left_target,
            &scenario.right_target,
            &scenario.ignore_tables,
        )
        .await?;
    sort_tables(&mut ldb, &scenario.table_keys, &normalizer, true)?;
    sort_tables(&mut rdb, &scenario.table_keys, &normalizer, false)?;
    normalizer.compare("/database", &ldb, &rdb);
    normalizer.compare("/effects/smtp", &lm, &rm);
    if let Some(expected) = scenario.expected_smtp_count {
        for (side, mails) in [("left", &lm), ("right", &rm)] {
            let actual = mails
                .as_array()
                .context("SMTP snapshot must be array")?
                .len();
            if actual != expected {
                normalizer.differences.push(model::Difference {
                    path: format!("/effects/smtp/{side}/expected_count"),
                    reason: "expected SMTP message count".into(),
                    left: json!(expected),
                    right: json!(actual),
                });
            }
        }
    }
    normalizer.compare("/effects/redis", &le, &re);
    let symbols = normalizer.symbols();
    Ok(Report {
        symbols,
        differences: normalizer.differences,
        left: json!({"protocol":lsteps,"database":ldb,"effects":{"smtp":lm,"redis":le}}),
        right: json!({"protocol":rsteps,"database":rdb,"effects":{"smtp":rm,"redis":re}}),
    })
}
async fn start_smtp(bind: &Option<String>) -> Result<Option<SmtpSink>> {
    match bind {
        Some(b) => Ok(Some(SmtpSink::bind(b).await?)),
        None => Ok(None),
    }
}
async fn start_redis(url: &Option<String>) -> Result<Option<RedisSink>> {
    match url {
        Some(u) => Ok(Some(RedisSink::subscribe(u).await?)),
        None => Ok(None),
    }
}

fn sort_tables(
    value: &mut Value,
    keys: &std::collections::BTreeMap<String, Vec<String>>,
    normalizer: &Normalizer,
    left: bool,
) -> Result<()> {
    if let Some(tables) = value.as_object_mut() {
        for (table, rows) in tables {
            let rows = rows.as_array_mut().context("table must be row array")?;
            let key = |index: usize, row: &Value| -> Result<String> {
                let path = format!(
                    "/database/{}/{index}",
                    table.replace('~', "~0").replace('/', "~1")
                );
                let mut primary = Vec::new();
                if let Some(columns) = keys.get(table) {
                    for c in columns {
                        let value = row
                            .get(c)
                            .with_context(|| format!("missing sort key {table}.{c}"))?;
                        primary.push(normalizer.sort_key(
                            &format!("{path}/{}", c.replace('~', "~0").replace('/', "~1")),
                            value,
                            left,
                        ));
                    }
                }
                Ok(serde_json::to_string(&(
                    primary,
                    normalizer.sort_key(&path, row, left),
                ))?)
            };
            let mut sorted = rows
                .drain(..)
                .enumerate()
                .map(|(i, r)| Ok((key(i, &r)?, r)))
                .collect::<Result<Vec<_>>>()?;
            sorted.sort_by(|a, b| a.0.cmp(&b.0));
            rows.extend(sorted.into_iter().map(|(_, r)| r));
        }
    }
    Ok(())
}

pub(crate) fn tagged_json_payload(text: &str, non_json_encoding: &str) -> Value {
    match serde_json::from_str::<Value>(text) {
        Ok(value) => json!({"encoding":"json","value":value}),
        Err(_) => json!({"encoding":non_json_encoding,"raw":text}),
    }
}

#[cfg(test)]
mod snapshot_tests {
    use super::*;
    #[test]
    fn unpaired_random_primary_keys_use_business_fields_and_preserve_bijections() {
        let rules = [model::DynamicRule {
            path: "/id$".into(),
            kind: "id".into(),
        }];
        let mut normalizer = Normalizer::new(&rules).unwrap();
        let mut left = json!({"public.rows":[{"id":"a-random-left","name":"Z"},{"id":"z-random-left","name":"A"}]});
        let mut right = json!({"public.rows":[{"id":"a-random-right","name":"A"},{"id":"z-random-right","name":"Z"}]});
        let keys = [("public.rows".into(), vec!["id".into()])].into();
        sort_tables(&mut left, &keys, &normalizer, true).unwrap();
        sort_tables(&mut right, &keys, &normalizer, false).unwrap();
        normalizer.compare("/database", &left, &right);
        assert!(normalizer.differences.is_empty());
        normalizer.compare(
            "/later/id",
            &json!("z-random-left"),
            &json!("z-random-right"),
        );
        assert!(!normalizer.differences.is_empty());
        normalizer.compare("/database", &json!({"public.empty":[]}), &json!({}));
        assert!(
            normalizer
                .differences
                .iter()
                .any(|d| d.path == "/database/public.empty")
        );
    }
    #[tokio::test]
    async fn empty_scenarios_are_rejected() {
        let scenario:Scenario=serde_json::from_value(json!({"left_target":{"base_url":"http://127.0.0.1:1"},"right_target":{"base_url":"http://127.0.0.1:2"},"steps":[]})).unwrap();
        assert!(
            run(&scenario)
                .await
                .unwrap_err()
                .to_string()
                .contains("at least one step")
        );
    }
}
