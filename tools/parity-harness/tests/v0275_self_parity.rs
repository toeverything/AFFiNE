//! Offline replay of a recorded real run of two `@affine/server` instances of
//! the frozen v0.27.5 baseline (`scripts/run-v0275-self-parity.mjs
//! --server-root <checkout> --record`). The recording must stay equal and
//! healthy under the committed scenario rules, one injected change in any
//! dimension must be reported at exactly its own paths, and both sides losing
//! the same business result must still fail the scenario's requirements.

use parity_harness::model::Scenario;
use serde_json::{Value, json};

const SCENARIO: &str = include_str!("../scenarios/v0275-self-parity.json");
const RECORDED: &str = include_str!("fixtures/v0275-self-parity.recorded.json");
/// The frozen v0.27.5 server the recording was made against.
const SERVER_SHA: &str = "c2929acf2d24456c40c2df164e068d1d3d59d7fd";

fn recorded() -> (Scenario, Value, Value) {
    let scenario: Scenario = serde_json::from_str(SCENARIO).unwrap();
    let mut recorded: Value = serde_json::from_str(RECORDED).unwrap();
    assert_eq!(recorded["server_sha"], json!(SERVER_SHA));
    let left = recorded["left"].take();
    let right = recorded["right"].take();
    (scenario, left, right)
}

/// Recorded data lives at `/protocol/<index>`; reported paths add the step name.
fn step(scenario: &Scenario, name: &str) -> (String, String) {
    let index = scenario
        .steps
        .iter()
        .position(|s| s.name == name)
        .unwrap_or_else(|| panic!("scenario step {name}"));
    (
        format!("/protocol/{index}"),
        format!("/protocol/{index}/{name}"),
    )
}

#[test]
fn recorded_frozen_v0275_run_is_equal_and_covers_protocol_database_mail_and_redis() {
    let (scenario, left, right) = recorded();
    let report = parity_harness::compare(&scenario, left, right).unwrap();
    assert!(
        report.is_equal(),
        "{}",
        serde_json::to_string_pretty(&report.differences).unwrap()
    );
    let side = &report.left;
    let at = |step_name: &str, pointer: &str| {
        side.pointer(&format!("{}{pointer}", step(&scenario, step_name).0))
            .cloned()
            .unwrap_or_else(|| panic!("{step_name}{pointer} in recording"))
    };
    assert_eq!(at("info", "/status"), json!(200));
    assert_eq!(
        at(
            "server_config_before_setup",
            "/body/value/data/serverConfig/initialized"
        ),
        json!(false)
    );
    assert_eq!(
        at("current_user", "/body/value/data/currentUser/email"),
        json!("parity-admin@affine.test")
    );
    assert_eq!(
        at("doc_sync", "/body/value/acks/1/value/data/accepted"),
        json!(true)
    );
    assert!(
        at("doc_sync", "/body/value/acks/3/value/data/missing")
            .as_str()
            .is_some_and(|s| !s.is_empty())
    );
    assert_eq!(
        at("send_test_email", "/body/value/data/sendTestEmail"),
        json!(true)
    );
    assert_eq!(
        side["database"]["public.users"].as_array().unwrap().len(),
        1
    );
    assert_eq!(
        side["database"]["public.updates"][0]["guid"],
        json!("parity-self-doc")
    );
    assert_eq!(
        side["effects"]["smtp"][0]["recipients"],
        json!(["parity-admin@affine.test"])
    );
    assert!(
        side["database"]["public.storage_reconciliation_checkpoints"]
            .as_array()
            .unwrap()
            .iter()
            .any(|row| row["kind"] == "schema_baseline_0275")
    );
    let channels: Vec<_> = side["effects"]["redis"]
        .as_array()
        .unwrap()
        .iter()
        .map(|e| e["channel"].as_str().unwrap())
        .collect();
    for channel in [
        "affine:backend-runtime:invalidation:v1",
        "affine:eventbus:v1",
    ] {
        assert!(channels.contains(&channel), "{channel} in {channels:?}");
    }
}

#[test]
fn both_sides_losing_the_same_business_result_fail_their_requirements() {
    let (scenario, mut left, mut right) = recorded();
    let sync = step(&scenario, "doc_sync").0;
    for side in [&mut left, &mut right] {
        side["effects"]["redis"]
            .as_array_mut()
            .unwrap()
            .retain(|e| e["channel"] != "affine:eventbus:v1");
        side["database"]["public.storage_reconciliation_checkpoints"]
            .as_array_mut()
            .unwrap()
            .retain(|row| row["kind"] != "schema_baseline_0275");
        side["database"]["public.updates"] = json!([]);
        side["effects"]["smtp"] = json!([]);
        *side
            .pointer_mut(&format!("{sync}/body/value/acks/1/value"))
            .unwrap() = json!({"error":{"code":"NOT_IN_SPACE"}});
    }
    let report = parity_harness::compare(&scenario, left, right).unwrap();
    let mut paths: Vec<_> = report.differences.iter().map(|d| d.path.clone()).collect();
    paths.sort_unstable();
    // The scenario's expected mail count also reports the missing mail.
    let mut expected = vec![
        "/effects/smtp/left/expected_count".to_owned(),
        "/effects/smtp/right/expected_count".to_owned(),
    ];
    for side in ["left", "right"] {
        for path in [
            format!("{sync}/body/value/acks/1/value/data/accepted"),
            "/database/public.storage_reconciliation_checkpoints".into(),
            "/database/public.updates".into(),
            "/effects/redis".into(),
            "/effects/smtp".into(),
        ] {
            expected.push(format!("/require/{side}{path}"));
        }
    }
    expected.sort_unstable();
    assert_eq!(paths, expected);
}

#[test]
fn injected_changes_in_each_dimension_are_reported_at_exactly_their_path() {
    let (scenario, left, right) = recorded();
    let in_step = |name: &str, pointer: &str| {
        let (data, reported) = step(&scenario, name);
        (
            format!("{data}{pointer}"),
            vec![format!("{reported}{pointer}")],
        )
    };
    let same = |pointer: &str| (pointer.to_owned(), vec![pointer.to_owned()]);
    let info = step(&scenario, "info");
    let cases = [
        // A failed health check is both a difference and an unmet requirement.
        (
            (
                format!("{}/status", info.0),
                vec![
                    format!("{}/status", info.1),
                    format!("/require/right{}/status", info.0),
                ],
            ),
            json!(500),
        ),
        (
            in_step("current_user", "/body/value/data/currentUser/name"),
            json!("Parity Admin (tampered)"),
        ),
        (
            in_step(
                "current_user",
                "/body/value/data/currentUser/quota/storageQuota",
            ),
            json!(1),
        ),
        (
            in_step("doc_sync", "/body/value/acks/1/value/data/created"),
            json!(false),
        ),
        (
            same("/database/public.users/0/name"),
            json!("Parity Admin (tampered)"),
        ),
        (
            same("/database/public.workspaces/0/id"),
            json!("00000000-0000-4000-8000-000000000000"),
        ),
        (same("/effects/smtp/0/subject"), json!("Tampered")),
        (
            same("/effects/redis/0/payload/value/kind"),
            json!("tampered"),
        ),
        (
            same("/effects/redis/3/payload/value/payload/docId"),
            json!("another-doc"),
        ),
    ];
    for ((pointer, expected), value) in cases {
        let mut changed = right.clone();
        *changed
            .pointer_mut(&pointer)
            .unwrap_or_else(|| panic!("{pointer} in recording")) = value;
        let report = parity_harness::compare(&scenario, left.clone(), changed).unwrap();
        let paths: Vec<_> = report.differences.iter().map(|d| &d.path).collect();
        assert_eq!(paths, expected.iter().collect::<Vec<_>>(), "{pointer}");
    }
}
