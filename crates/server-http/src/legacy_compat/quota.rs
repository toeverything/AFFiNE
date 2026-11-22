//! `v0.27.5` GraphQL `WorkspaceQuotaType` and `WorkspaceQuotaHumanReadableType`
//! compatibility projection from canonical [`server_types::AccessGrant`].

use async_graphql::{InputValueError, InputValueResult, Scalar, ScalarType, SimpleObject, Value};
use serde::{Deserialize, Serialize};
use server_types::{AccessGrant, LicenseTier};

const ONE_KB: f64 = 1024.0;
const BYTE_UNITS: [&str; 9] = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

/// `v0.27.5` `SafeInt` GraphQL scalar (transparent `i64` JSON integer).
#[derive(Clone, Copy, Debug, Eq, PartialEq, Ord, PartialOrd, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct SafeInt(pub i64);

#[Scalar(name = "SafeInt")]
impl ScalarType for SafeInt {
  fn parse(value: Value) -> InputValueResult<Self> {
    match value {
      Value::Number(n) => n
        .as_i64()
        .map(SafeInt)
        .ok_or_else(|| InputValueError::custom("SafeInt must be a 64-bit integer")),
      other => Err(InputValueError::expected_type(other)),
    }
  }

  fn to_value(&self) -> Value {
    Value::Number(self.0.into())
  }
}

/// Exact parity port of `packages/backend/server/src/core/quota/utils.ts:formatSize`.
pub fn format_size(bytes: i64, decimals: usize) -> String {
  if bytes <= 0 {
    return "0 B".to_owned();
  }
  let bytes_f = bytes as f64;
  let idx = ((bytes_f.ln() / ONE_KB.ln()).floor() as usize).min(BYTE_UNITS.len() - 1);
  let scaled = bytes_f / ONE_KB.powi(idx as i32);
  let fixed = format!("{scaled:.decimals$}");
  let parsed: f64 = fixed.parse().unwrap_or(scaled);
  // Format like JS `parseFloat(scaled.toFixed(dm))`: drop trailing `.0` / zeros.
  let num_str = if parsed.fract() == 0.0 {
    format!("{:.0}", parsed)
  } else {
    format!("{parsed}")
  };
  format!("{num_str} {}", BYTE_UNITS[idx])
}

/// Exact parity port of `packages/backend/server/src/core/quota/utils.ts:formatDate`.
pub fn format_date(seconds: i64) -> String {
  let days = (seconds as f64) / (24.0 * 60.0 * 60.0);
  format!("{days:.0} days")
}

/// Exact parity mapping of canonical [`LicenseTier`] to `v0.27.5` `QuotaService.planName`.
///
/// `v0.27.5` only emits `"Pro" | "Lifetime Pro" | "AI" | "Team" | "Free"`;
/// enterprise self-hosted licenses project to `"Team"` at the legacy GraphQL edge.
pub fn legacy_plan_name(tier: LicenseTier) -> &'static str {
  match tier {
    LicenseTier::SelfhostDefault | LicenseTier::CloudPro => "Pro",
    LicenseTier::SelfhostTeam | LicenseTier::SelfhostEnterprise | LicenseTier::CloudTeam => "Team",
    LicenseTier::CloudAi => "AI",
    LicenseTier::CloudFree => "Free",
  }
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[graphql(name = "WorkspaceQuotaHumanReadableType")]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceQuotaHumanReadableType {
  pub name: String,
  pub blob_limit: String,
  pub storage_quota: String,
  pub storage_quota_used: String,
  pub history_period: String,
  pub member_limit: String,
  pub member_count: String,
  pub overcapacity_member_count: String,
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[graphql(name = "WorkspaceQuotaType")]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceQuotaType {
  pub name: String,
  pub blob_limit: SafeInt,
  pub storage_quota: SafeInt,
  pub used_storage_quota: SafeInt,
  pub history_period: SafeInt,
  pub member_limit: i32,
  pub member_count: i32,
  pub overcapacity_member_count: i32,
  pub human_readable: WorkspaceQuotaHumanReadableType,
}

/// Projects a canonical [`AccessGrant`] plus current usage counters into the
/// exact `v0.27.5` GraphQL [`WorkspaceQuotaType`].
pub fn workspace_quota_from_grant(
  grant: &AccessGrant,
  used_storage_quota: i64,
  member_count: i32,
) -> WorkspaceQuotaType {
  let name = legacy_plan_name(grant.tier).to_owned();
  let blob_limit = grant.limits.blob_limit_bytes;
  let storage_quota = grant.limits.storage_quota_bytes;
  let history_period = grant.limits.history_period_seconds;
  let member_limit = grant.limits.seat_limit;
  let overcapacity_member_count = (member_count - member_limit).max(0);

  let human_readable = WorkspaceQuotaHumanReadableType {
    name: name.clone(),
    blob_limit: format_size(blob_limit, 2),
    storage_quota: format_size(storage_quota, 2),
    storage_quota_used: format_size(used_storage_quota, 2),
    history_period: format_date(history_period),
    member_limit: member_limit.to_string(),
    member_count: member_count.to_string(),
    overcapacity_member_count: overcapacity_member_count.to_string(),
  };

  WorkspaceQuotaType {
    name,
    blob_limit: SafeInt(blob_limit),
    storage_quota: SafeInt(storage_quota),
    used_storage_quota: SafeInt(used_storage_quota),
    history_period: SafeInt(history_period),
    member_limit,
    member_count,
    overcapacity_member_count,
    human_readable,
  }
}

#[cfg(test)]
mod tests {
  use std::collections::BTreeMap;
  use std::path::Path;

  use async_graphql::{EmptyMutation, EmptySubscription, Schema};
  use server_types::{Limits, Rights};

  use super::*;
  use crate::graphql::QueryRoot;

  fn extract_gql_type_signatures(sdl: &str, type_name: &str) -> BTreeMap<String, String> {
    let header = format!("type {type_name} {{");
    let start = sdl.find(&header).unwrap_or_else(|| panic!("missing `{header}` in SDL"));
    let body = &sdl[start + header.len()..];
    let end = body.find('}').expect("closing brace for GraphQL type");
    let mut in_block_comment = false;
    let mut map = BTreeMap::new();
    for raw in body[..end].lines() {
      let line = raw.trim();
      if let Some(rest) = line.strip_prefix("\"\"\"") {
        if rest.is_empty() || !rest.ends_with("\"\"\"") {
          in_block_comment = !in_block_comment;
        }
        continue;
      }
      if in_block_comment || line.is_empty() || line.starts_with('#') || line.starts_with('"') {
        continue;
      }
      if let Some((sig, ty)) = line.rsplit_once(':') {
        map.insert(sig.trim().to_owned(), ty.trim().to_owned());
      }
    }
    map
  }

  #[test]
  fn format_size_and_date_match_v0275_quota_utils() {
    let cases = [
      (0, "0 B"),
      (512, "512 B"),
      (1024, "1 KB"),
      (1536, "1.5 KB"),
      (104_857_600, "100 MB"),
      (107_374_182_400, "100 GB"),
      (1_099_511_627_776, "1 TB"),
    ];
    for (bytes, expected) in cases {
      assert_eq!(format_size(bytes, 2), expected, "bytes={bytes}");
    }
    assert_eq!(format_date(2_592_000), "30 days");
    assert_eq!(format_date(604_800), "7 days");
  }

  #[test]
  fn selfhost_tiers_match_v0275_quota_service_golden_output() {
    // 1. Default 10-seat / 100 GiB bundled self-host license -> legacy name "Pro"
    let default_grant = server_types::license::default_selfhost_access_grant();
    let default_quota = workspace_quota_from_grant(&default_grant, 104_857_600, 3);
    assert_eq!(default_quota.name, "Pro");
    assert_eq!(default_quota.blob_limit, SafeInt(104_857_600));
    assert_eq!(default_quota.storage_quota, SafeInt(107_374_182_400));
    assert_eq!(default_quota.used_storage_quota, SafeInt(104_857_600));
    assert_eq!(default_quota.history_period, SafeInt(2_592_000));
    assert_eq!(default_quota.member_limit, 10);
    assert_eq!(default_quota.member_count, 3);
    assert_eq!(default_quota.overcapacity_member_count, 0);
    assert_eq!(
      default_quota.human_readable,
      WorkspaceQuotaHumanReadableType {
        name: "Pro".into(),
        blob_limit: "100 MB".into(),
        storage_quota: "100 GB".into(),
        storage_quota_used: "100 MB".into(),
        history_period: "30 days".into(),
        member_limit: "10".into(),
        member_count: "3".into(),
        overcapacity_member_count: "0".into(),
      }
    );

    // 2. SelfhostTeam with overcapacity members -> legacy name "Team"
    let team_grant = AccessGrant {
      tier: LicenseTier::SelfhostTeam,
      seat_quantity: Some(25),
      expires_at: None,
      limits: Limits {
        blob_limit_bytes: 524_288_000,
        storage_quota_bytes: 1_099_511_627_776,
        seat_limit: 25,
        seat_quota_bytes: Some(21_474_836_480),
        history_period_seconds: 2_592_000,
        copilot_action_limit: None,
      },
      rights: Rights {
        commercial: true,
        copilot_byok: true,
        unlimited_copilot: true,
      },
      diagnostics: vec![],
    };
    let team_quota = workspace_quota_from_grant(&team_grant, 0, 28);
    assert_eq!(team_quota.name, "Team");
    assert_eq!(team_quota.overcapacity_member_count, 3);
    assert_eq!(team_quota.human_readable.storage_quota, "1 TB");
    assert_eq!(team_quota.human_readable.blob_limit, "500 MB");
    assert_eq!(team_quota.human_readable.overcapacity_member_count, "3");

    // 3. SelfhostEnterprise -> legacy name "Team" (v0.27.5 QuotaService.planName never emits "Enterprise")
    let ent_grant = AccessGrant {
      tier: LicenseTier::SelfhostEnterprise,
      ..team_grant
    };
    let ent_quota = workspace_quota_from_grant(&ent_grant, 0, 10);
    assert_eq!(ent_quota.name, "Team");
    assert_eq!(ent_quota.overcapacity_member_count, 0);
  }

  #[test]
  fn graphql_sdl_fields_and_types_match_v0275_oracle_schema() {
    let oracle_path = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/oracle-contracts/v0.27.5/schema.gql");
    let oracle_sdl =
      std::fs::read_to_string(&oracle_path).unwrap_or_else(|e| panic!("failed to read {}: {e}", oracle_path.display()));

    let generated_sdl = Schema::new(QueryRoot, EmptyMutation, EmptySubscription).sdl();

    // Exact field name + GraphQL type (including SafeInt!, Int!, String! non-nullability)
    for type_name in ["WorkspaceQuotaType", "WorkspaceQuotaHumanReadableType"] {
      let oracle_sigs = extract_gql_type_signatures(&oracle_sdl, type_name);
      let generated_sigs = extract_gql_type_signatures(&generated_sdl, type_name);
      assert_eq!(
        generated_sigs, oracle_sigs,
        "GraphQL field signatures for {type_name} drifted from v0.27.5 oracle schema"
      );
    }

    // Every QueryRoot field we expose must match its exact signature in oracle Query
    let oracle_query = extract_gql_type_signatures(&oracle_sdl, "Query");
    let generated_query = extract_gql_type_signatures(&generated_sdl, "Query");
    assert!(!generated_query.is_empty());
    for (field_sig, field_ty) in &generated_query {
      assert_eq!(
        oracle_query.get(field_sig),
        Some(field_ty),
        "QueryRoot field `{field_sig}: {field_ty}` does not match v0.27.5 oracle schema"
      );
    }
  }
}
