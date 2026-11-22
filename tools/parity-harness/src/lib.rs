#![forbid(unsafe_code)]
pub mod model;
pub mod normalize;
pub mod protocol;
pub mod sinks;

use anyhow::{Context, Result, bail, ensure};
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
    let (ldb, rdb) = source
        .snapshots(
            &scenario.left_target,
            &scenario.right_target,
            &scenario.ignore_tables,
        )
        .await?;
    compare_with(
        normalizer,
        scenario,
        json!({"protocol":lsteps,"database":ldb,"effects":{"smtp":lm,"redis":le}}),
        json!({"protocol":rsteps,"database":rdb,"effects":{"smtp":rm,"redis":re}}),
    )
}

/// Compare two recorded sides (`Report::left` / `Report::right` shape) offline,
/// in the same order and with the same rules as a live run. Recorded real runs
/// can be replayed, and faults injected into them, without any service.
pub fn compare(scenario: &Scenario, left: Value, right: Value) -> Result<Report> {
    ensure!(
        !scenario.steps.is_empty(),
        "scenario must contain at least one step"
    );
    let mut normalizer = Normalizer::new(&scenario.dynamic)?;
    let (Some(lp), Some(rp)) = (
        left.pointer("/protocol").and_then(Value::as_array),
        right.pointer("/protocol").and_then(Value::as_array),
    ) else {
        bail!("recorded sides must contain a protocol array");
    };
    ensure!(
        lp.len() == scenario.steps.len() && rp.len() == scenario.steps.len(),
        "recorded protocol has {}/{} observations for {} scenario steps",
        lp.len(),
        rp.len(),
        scenario.steps.len()
    );
    for (i, step) in scenario.steps.iter().enumerate() {
        normalizer.compare(&format!("/protocol/{i}/{}", step.name), &lp[i], &rp[i]);
    }
    compare_with(normalizer, scenario, left, right)
}

/// Database and side-effect comparison after the protocol steps have bound
/// their dynamic values.
fn compare_with(
    mut normalizer: Normalizer,
    scenario: &Scenario,
    mut left: Value,
    mut right: Value,
) -> Result<Report> {
    for side in [&left, &right] {
        ensure!(
            side.pointer("/database").is_some_and(Value::is_object)
                && side.pointer("/effects/smtp").is_some_and(Value::is_array)
                && side.pointer("/effects/redis").is_some_and(Value::is_array),
            "recorded sides need database, effects.smtp and effects.redis"
        );
    }
    sort_tables(
        &mut left["database"],
        &scenario.table_keys,
        &normalizer,
        true,
    )?;
    sort_tables(
        &mut right["database"],
        &scenario.table_keys,
        &normalizer,
        false,
    )?;
    normalizer.compare("/database", &left["database"], &right["database"]);
    normalizer.compare(
        "/effects/smtp",
        &left["effects"]["smtp"],
        &right["effects"]["smtp"],
    );
    if let Some(expected) = scenario.expected_smtp_count {
        for (side, mails) in [("left", &left), ("right", &right)] {
            let actual = mails["effects"]["smtp"]
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
    normalizer.compare(
        "/effects/redis",
        &left["effects"]["redis"],
        &right["effects"]["redis"],
    );
    for (side, observed) in [("left", &left), ("right", &right)] {
        for requirement in &scenario.require {
            if let Some(reason) = unmet(requirement, observed) {
                normalizer.differences.push(model::Difference {
                    path: format!("/require/{side}{}", requirement.path),
                    reason,
                    left: serde_json::to_value(&requirement.check)?,
                    right: observed
                        .pointer(&requirement.path)
                        .cloned()
                        .unwrap_or(Value::Null),
                });
            }
        }
    }
    Ok(Report {
        symbols: normalizer.symbols(),
        differences: normalizer.differences,
        left,
        right,
    })
}
/// Why `requirement` does not hold on one side, if it does not.
fn unmet(requirement: &model::Requirement, side: &Value) -> Option<String> {
    fn contains(value: &Value, pattern: &Value) -> bool {
        match (value, pattern) {
            (Value::Object(v), Value::Object(p)) => p
                .iter()
                .all(|(k, p)| v.get(k).is_some_and(|v| contains(v, p))),
            _ => value == pattern,
        }
    }
    let Some(value) = side.pointer(&requirement.path) else {
        return Some("required path missing".into());
    };
    let held = match &requirement.check {
        model::Check::Equals(expected) => value == expected,
        model::Check::Length(n) => value.as_array().is_some_and(|a| a.len() == *n),
        model::Check::Contains(pattern) => value
            .as_array()
            .is_some_and(|a| a.iter().any(|v| contains(v, pattern))),
    };
    (!held).then(|| "requirement not met".into())
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
    #[test]
    fn offline_compare_rejects_empty_scenarios() {
        let scenario:Scenario=serde_json::from_value(json!({"left_target":{"base_url":"http://127.0.0.1:1"},"right_target":{"base_url":"http://127.0.0.1:2"},"steps":[]})).unwrap();
        let side = json!({"protocol":[],"database":{},"effects":{"smtp":[],"redis":[]}});
        assert!(
            compare(&scenario, side.clone(), side)
                .unwrap_err()
                .to_string()
                .contains("at least one step")
        );
    }
    #[test]
    fn requirements_fail_each_side_that_misses_them_even_when_both_sides_are_equal() {
        let scenario: Scenario = serde_json::from_value(json!({
            "left_target":{"base_url":"http://127.0.0.1:1"},"right_target":{"base_url":"http://127.0.0.1:2"},
            "steps":[{"name":"info","kind":"http","method":"GET","path":"/info"}],
            "require":[
                {"path":"/protocol/0/status","equals":200},
                {"path":"/effects/smtp","length":1},
                {"path":"/effects/redis","contains":{"channel":"affine:eventbus:v1","payload":{"encoding":"json"}}},
                {"path":"/database/public.updates","contains":{}}
            ]
        }))
        .unwrap();
        let healthy = json!({"protocol":[{"status":200}],"database":{"public.updates":[{"guid":"doc"}]},
            "effects":{"smtp":[{"subject":"Mail"}],"redis":[{"channel":"affine:eventbus:v1","payload":{"encoding":"json","value":{}}}]}});
        assert!(
            compare(&scenario, healthy.clone(), healthy.clone())
                .unwrap()
                .is_equal()
        );
        let broken = json!({"protocol":[{"status":503}],"database":{"public.updates":[]},
            "effects":{"smtp":[],"redis":[{"channel":"affine:eventbus:v1","payload":{"encoding":"invalid_json","raw":"x"}}]}});
        let report = compare(&scenario, broken.clone(), broken).unwrap();
        let mut paths: Vec<_> = report.differences.iter().map(|d| d.path.as_str()).collect();
        paths.sort_unstable();
        assert_eq!(
            paths,
            [
                "/require/left/database/public.updates",
                "/require/left/effects/redis",
                "/require/left/effects/smtp",
                "/require/left/protocol/0/status",
                "/require/right/database/public.updates",
                "/require/right/effects/redis",
                "/require/right/effects/smtp",
                "/require/right/protocol/0/status",
            ]
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
