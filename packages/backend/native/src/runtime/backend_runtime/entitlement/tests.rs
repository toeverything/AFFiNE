use super::{
  license::{RuntimeLicenseInstallInput, RuntimeLicenseRefreshInput},
  *,
};
use crate::runtime::{backend_runtime::tests::runtime_from_database_url, migrations::DATABASE_TEST_LOCK};

pub(super) async fn fixture(runtime: &BackendRuntime) -> (String, String) {
  let owner = uuid::Uuid::new_v4().to_string();
  let workspace = uuid::Uuid::new_v4().to_string();
  let pool = runtime.pool().await.unwrap();
  sqlx::query("INSERT INTO users(id,email,name) VALUES($1,$2,'Entitlement Test')")
    .bind(&owner)
    .bind(format!("{owner}@example.com"))
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query("INSERT INTO workspaces(id) VALUES($1)")
    .bind(&workspace)
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query("INSERT INTO workspace_members(id,workspace_id,user_id,role,state) VALUES($1,$2,$3,'owner','active')")
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(&workspace)
    .bind(&owner)
    .execute(&pool)
    .await
    .unwrap();
  (owner, workspace)
}

#[tokio::test]
async fn license_upgrade_recovers_installed_files_and_online_renewals_before_workers() {
  use chrono::Duration;
  use sqlx::Row;

  use crate::{
    license::tests::LicenseServer,
    license_import::{normalize_license, tests::legacy_license},
    runtime::backend_runtime::ServerRole,
  };

  let _guard = DATABASE_TEST_LOCK.lock().await;
  let Some(mut runtime) = runtime_from_database_url().await.unwrap() else {
    return;
  };
  runtime.role = ServerRole::Api;
  let db = sqlx::postgres::PgPoolOptions::new()
    .max_connections(2)
    .connect(&runtime.config().unwrap().database_url)
    .await
    .unwrap();
  let mut fixtures = Vec::new();
  for mode in [
    "missing",
    "raw",
    "normalized",
    "revoked",
    "invalid",
    "identity",
    "subject",
    "workspace",
  ] {
    let (owner, workspace) = fixture(&runtime).await;
    let expiry = Utc::now() + Duration::days(365);
    let original = if mode == "invalid" {
      b"invalid license".to_vec()
    } else {
      legacy_license(&workspace, expiry)
    };
    sqlx::query(
      "INSERT INTO \
       installed_licenses(key,workspace_id,quantity,recurring,variant,validate_key,validated_at,expired_at,license) \
       VALUES($1,$2,10,'monthly','onetime','legacy-generation',clock_timestamp(),$3,$4)",
    )
    .bind(if mode == "identity" {
      format!("wrong:{workspace}")
    } else {
      format!("license:{workspace}")
    })
    .bind(&workspace)
    .bind(expiry)
    .bind(&original)
    .execute(&db)
    .await
    .unwrap();
    if matches!(mode, "raw" | "normalized" | "revoked") {
      let payload = if mode == "normalized" {
        normalize_license(&original).unwrap().into_owned()
      } else {
        original.clone()
      };
      sqlx::query(
        "INSERT INTO \
         entitlements(id,target_type,target_id,source,subject_id,plan,status,quantity,signed_payload,expires_at) \
         VALUES($1,'workspace',$2,'selfhost_license',$3,'selfhost_team',$4,10,$5,$6)",
      )
      .bind(uuid::Uuid::new_v4().to_string())
      .bind(&workspace)
      .bind(format!("license:{workspace}"))
      .bind(if mode == "revoked" { "revoked" } else { "active" })
      .bind(payload)
      .bind(expiry)
      .execute(&db)
      .await
      .unwrap();
    }
    if matches!(mode, "subject" | "workspace") {
      sqlx::query(
        "INSERT INTO entitlements(id,target_type,target_id,source,subject_id,plan,status,quantity) \
         VALUES($1,'workspace',$2,'selfhost_license',$3,'selfhost_team','active',10)",
      )
      .bind(uuid::Uuid::new_v4().to_string())
      .bind(if mode == "subject" {
        format!("conflict:{workspace}")
      } else {
        workspace.clone()
      })
      .bind(if mode == "workspace" {
        format!("conflict:{workspace}")
      } else {
        format!("license:{workspace}")
      })
      .execute(&db)
      .await
      .unwrap();
    }
    fixtures.push((mode, owner, workspace, original));
  }
  let (online_owner, online_workspace) = fixture(&runtime).await;
  let online_key = format!("license:{online_workspace}");
  let generation = uuid::Uuid::new_v4().to_string();
  let (online_payload, _) = crate::entitlement::signed_test_license(&online_workspace);
  let remote = LicenseServer::new(&online_key);
  remote.push(200, online_payload.clone(), &generation);
  sqlx::query(
    "INSERT INTO installed_licenses(key,workspace_id,quantity,recurring,validate_key,validated_at) \
     VALUES($1,$2,10,'monthly',$3,clock_timestamp())",
  )
  .bind(&online_key)
  .bind(&online_workspace)
  .bind(&generation)
  .execute(&db)
  .await
  .unwrap();
  sqlx::query(
    "INSERT INTO entitlements(id,target_type,target_id,source,subject_id,plan,status,quantity) \
     VALUES($1,'workspace',$2,'selfhost_license',$3,'selfhost_team','needs_reupload',10)",
  )
  .bind(uuid::Uuid::new_v4().to_string())
  .bind(&online_workspace)
  .bind(&online_key)
  .execute(&db)
  .await
  .unwrap();
  runtime.stop().await.unwrap();
  runtime.start().await.unwrap();
  assert!(remote.requests().is_empty());
  for (mode, _, workspace, original) in &fixtures {
    let payload: Option<Vec<u8>> =
      sqlx::query_scalar("SELECT signed_payload FROM entitlements WHERE target_id=$1 AND source='selfhost_license'")
        .bind(workspace)
        .fetch_optional(&db)
        .await
        .unwrap()
        .flatten();
    if matches!(*mode, "raw" | "revoked") {
      assert_eq!(payload.as_deref(), Some(original.as_slice()));
    } else if *mode != "normalized" {
      assert!(payload.is_none());
    }
  }
  runtime.stop().await.unwrap();
  std::sync::Arc::get_mut(&mut runtime.config.write().unwrap())
    .unwrap()
    .deployment = Deployment::SelfHosted;
  runtime.start().await.unwrap();
  assert!(runtime.license_health_worker.lock().await.is_none());
  assert_eq!(remote.requests().len(), 1);
  let admitted = runtime
    .get_installed_license_v1(online_workspace.clone())
    .await
    .unwrap()
    .unwrap();
  assert_eq!(admitted.license.as_deref(), Some(online_payload.as_slice()));
  assert_eq!(admitted.validate_key, generation);
  let status: String = sqlx::query_scalar("SELECT status FROM entitlements WHERE subject_id=$1")
    .bind(&online_key)
    .fetch_one(&db)
    .await
    .unwrap();
  assert_eq!(status, "active");
  runtime.stop().await.unwrap();
  sqlx::query("UPDATE installed_licenses SET validated_at='2000-01-01' WHERE workspace_id=$1")
    .bind(&online_workspace)
    .execute(&db)
    .await
    .unwrap();
  runtime.start().await.unwrap();
  assert_eq!(
    remote.requests().len(),
    1,
    "ordinary renewal must not block API startup"
  );
  sqlx::query("UPDATE installed_licenses SET validated_at=clock_timestamp() WHERE workspace_id=$1")
    .bind(&online_workspace)
    .execute(&db)
    .await
    .unwrap();
  for (mode, _, workspace, original) in &fixtures {
    let valid = matches!(*mode, "missing" | "raw" | "normalized");
    assert_eq!(
      runtime
        .has_workspace_commercial_entitlement_v1(workspace.clone())
        .await
        .unwrap(),
      valid,
      "{mode}"
    );
    let installed = runtime
      .get_installed_license_v1(workspace.clone())
      .await
      .unwrap()
      .unwrap();
    assert_eq!(installed.license.as_deref(), Some(original.as_slice()), "{mode}");
    assert_eq!(installed.validate_key, "legacy-generation");
    if valid {
      let row = sqlx::query(
        "SELECT signed_payload,id,updated_at FROM entitlements WHERE target_id=$1 AND source='selfhost_license'",
      )
      .bind(workspace)
      .fetch_one(&db)
      .await
      .unwrap();
      let payload: Vec<u8> = row.get("signed_payload");
      assert_eq!(payload, normalize_license(original).unwrap().as_ref());
      let updated_at: chrono::DateTime<Utc> = row.get("updated_at");
      runtime
        .admit_offline_licenses(&runtime.pool().await.unwrap())
        .await
        .unwrap();
      let unchanged: chrono::DateTime<Utc> = sqlx::query_scalar("SELECT updated_at FROM entitlements WHERE id=$1")
        .bind(row.get::<String, _>("id"))
        .fetch_one(&db)
        .await
        .unwrap();
      assert_eq!(updated_at, unchanged);
    }
    let change = runtime.check_offline_license(&installed).await.unwrap().unwrap();
    assert_eq!(change.canceled, !valid);
    let retained = runtime
      .get_installed_license_v1(workspace.clone())
      .await
      .unwrap()
      .unwrap();
    assert_eq!(retained.license.as_deref(), Some(original.as_slice()));
  }

  for (http_status, body) in [
    (400, serde_json::json!({"name":"LICENSE_EXPIRED"})),
    (503, serde_json::json!({"name":"INTERNAL_SERVER_ERROR"})),
    (200, serde_json::json!({"invalid":"response"})),
  ] {
    remote.push(http_status, serde_json::to_vec(&body).unwrap(), &generation);
    sqlx::query("UPDATE installed_licenses SET validated_at='2000-01-01' WHERE workspace_id=$1")
      .bind(&online_workspace)
      .execute(&db)
      .await
      .unwrap();
    runtime.check_licenses_v1().await.unwrap();
    let retained = runtime
      .get_installed_license_v1(online_workspace.clone())
      .await
      .unwrap()
      .unwrap();
    assert_eq!(retained.validate_key, generation);
    assert_eq!(retained.license.as_deref(), Some(online_payload.as_slice()));
    let status: String = sqlx::query_scalar("SELECT status FROM entitlements WHERE subject_id=$1")
      .bind(&online_key)
      .fetch_one(&db)
      .await
      .unwrap();
    assert_eq!(status, "expired");
  }
  remote.push(200, online_payload.clone(), &generation);
  let renewed = runtime
    .activate_team_license_v1(online_workspace.clone(), online_key.clone())
    .await
    .unwrap();
  assert_eq!(renewed.validate_key, generation);
  let status: String = sqlx::query_scalar("SELECT status FROM entitlements WHERE subject_id=$1")
    .bind(&online_key)
    .fetch_one(&db)
    .await
    .unwrap();
  assert_eq!(status, "active");
  remote.push(200, br#"{"status":"deactivated"}"#.to_vec(), &generation);
  runtime.remove_team_license_v1(online_workspace.clone()).await.unwrap();
  assert!(
    runtime
      .get_installed_license_v1(online_workspace.clone())
      .await
      .unwrap()
      .is_none()
  );
  let replacement_key = format!("replacement:{online_workspace}");
  let replacement_generation = uuid::Uuid::new_v4().to_string();
  let (replacement_payload, _) = crate::entitlement::signed_test_license_with_id(&online_workspace, &replacement_key);
  let replacement_remote = LicenseServer::new(&replacement_key);
  replacement_remote.push(200, replacement_payload.clone(), &replacement_generation);
  let replacement = runtime
    .activate_team_license_v1(online_workspace.clone(), replacement_key.clone())
    .await
    .unwrap();
  assert_eq!(replacement.key, replacement_key);
  assert_eq!(replacement.license.as_deref(), Some(replacement_payload.as_slice()));
  fixtures.push(("online", online_owner, online_workspace, replacement_payload));

  let (owner, workspace) = fixture(&runtime).await;
  let original = legacy_license(&workspace, Utc::now() + Duration::days(365));
  sqlx::query(
    "INSERT INTO installed_licenses(key,workspace_id,quantity,recurring,variant,validate_key,validated_at,license) \
     VALUES($1,$2,10,'monthly','onetime','legacy-generation',clock_timestamp(),$3)",
  )
  .bind(format!("license:{workspace}"))
  .bind(&workspace)
  .bind(&original)
  .execute(&db)
  .await
  .unwrap();
  sqlx::query(
    "CREATE FUNCTION test_offline_admission_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION \
     'injected license admission failure'; END $$",
  )
  .execute(&db)
  .await
  .unwrap();
  sqlx::query(&format!(
    "CREATE TRIGGER test_offline_admission_failure BEFORE INSERT ON entitlements FOR EACH ROW WHEN \
     (NEW.target_id='{workspace}') EXECUTE FUNCTION test_offline_admission_failure()"
  ))
  .execute(&db)
  .await
  .unwrap();
  runtime.stop().await.unwrap();
  let failed = runtime.start().await;
  sqlx::query("DROP TRIGGER test_offline_admission_failure ON entitlements")
    .execute(&db)
    .await
    .unwrap();
  sqlx::query("DROP FUNCTION test_offline_admission_failure()")
    .execute(&db)
    .await
    .unwrap();
  assert!(failed.is_err());
  assert!(runtime.pool.lock().await.is_none());
  let count: i64 = sqlx::query_scalar("SELECT count(*) FROM entitlements WHERE target_id=$1")
    .bind(&workspace)
    .fetch_one(&db)
    .await
    .unwrap();
  assert_eq!(count, 0);
  runtime.start().await.unwrap();
  assert!(
    runtime
      .has_workspace_commercial_entitlement_v1(workspace.clone())
      .await
      .unwrap()
  );
  fixtures.push(("retry", owner, workspace, original));

  for (_, owner, workspace, _) in fixtures {
    sqlx::query("DELETE FROM entitlements WHERE target_id=$1 OR subject_id=$2")
      .bind(&workspace)
      .bind(format!("license:{workspace}"))
      .execute(&db)
      .await
      .unwrap();
    sqlx::query("DELETE FROM installed_licenses WHERE workspace_id=$1")
      .bind(&workspace)
      .execute(&db)
      .await
      .unwrap();
    sqlx::query("DELETE FROM workspaces WHERE id=$1")
      .bind(&workspace)
      .execute(&db)
      .await
      .unwrap();
    sqlx::query("DELETE FROM users WHERE id=$1")
      .bind(&owner)
      .execute(&db)
      .await
      .unwrap();
  }
  runtime.stop().await.unwrap();
  db.close().await;
}

#[tokio::test]
async fn license_install_revoke_rollback_and_stale_fences() {
  let _guard = DATABASE_TEST_LOCK.lock().await;
  let Some(runtime) = runtime_from_database_url().await.unwrap() else {
    eprintln!("skipping PostgreSQL test: DATABASE_URL not set");
    return;
  };
  std::sync::Arc::get_mut(&mut runtime.config.write().unwrap())
    .unwrap()
    .deployment = Deployment::SelfHosted;
  let pool = runtime.pool().await.unwrap();
  let (_, workspace) = fixture(&runtime).await;
  let (payload, _) = crate::entitlement::signed_test_license(&workspace);
  let key = format!("license:{workspace}");
  let input = || RuntimeLicenseInstallInput {
    workspace_id: workspace.clone(),
    license: payload.clone().into(),
    key: Some(key.clone()),
    validate_key: "generation".into(),
    recurring: "monthly".into(),
    activation: true,
  };
  let installed = runtime.install_license_v1(input()).await.unwrap();
  assert_eq!(installed.quantity, 10);
  let (_, target_workspace) = fixture(&runtime).await;
  let transfer_error = match runtime
    .activate_team_license_v1(target_workspace.clone(), key.clone())
    .await
  {
    Err(error) => error,
    Ok(_) => panic!("activation must not transfer another workspace's license"),
  };
  assert!(transfer_error.to_string().contains("license_already_activated"));
  assert!(
    runtime
      .get_installed_license_v1(target_workspace)
      .await
      .unwrap()
      .is_none()
  );
  assert_eq!(
    runtime
      .get_installed_license_v1(workspace.clone())
      .await
      .unwrap()
      .unwrap()
      .validate_key,
    "generation"
  );
  let mut corrupt = payload.clone();
  corrupt[0] ^= 1;
  sqlx::query("UPDATE entitlements SET signed_payload=$2 WHERE subject_id=$1")
    .bind(&key)
    .bind(&corrupt)
    .execute(&pool)
    .await
    .unwrap();
  assert!(
    !runtime
      .get_byok_entitlement_v1(workspace.clone(), None)
      .await
      .unwrap()
      .server
  );
  let status: String = sqlx::query_scalar("SELECT status FROM entitlements WHERE subject_id=$1")
    .bind(&key)
    .fetch_one(&pool)
    .await
    .unwrap();
  assert_eq!(status, "active");
  assert!(
    runtime
      .refresh_license_v1(RuntimeLicenseRefreshInput {
        workspace_id: workspace.clone(),
        key: key.clone(),
        expected_validate_key: "generation".into(),
        recurring: "monthly".into(),
        license: payload.clone().into(),
      })
      .await
      .unwrap()
      .is_some()
  );
  let (other_identity, _) =
    crate::entitlement::signed_test_license_with_id(&workspace, &format!("other-license:{workspace}"));
  let identity_error = match runtime
    .refresh_license_v1(RuntimeLicenseRefreshInput {
      workspace_id: workspace.clone(),
      key: key.clone(),
      expected_validate_key: "generation".into(),
      recurring: "monthly".into(),
      license: other_identity.into(),
    })
    .await
  {
    Err(error) => error,
    Ok(_) => panic!("license refresh accepted a different signed identity"),
  };
  assert!(identity_error.to_string().contains("license_identity_changed"));
  let identity_after_rejection: (String, String) = sqlx::query_as(
    "SELECT i.validate_key,e.subject_id FROM installed_licenses i JOIN entitlements e ON e.target_type='workspace' \
     AND e.target_id=i.workspace_id AND e.source='selfhost_license' AND e.status='active' WHERE i.workspace_id=$1",
  )
  .bind(&workspace)
  .fetch_one(&pool)
  .await
  .unwrap();
  assert_eq!(identity_after_rejection, ("generation".into(), key.clone()));
  sqlx::query("UPDATE entitlements SET status='revoked' WHERE target_id=$1 AND subject_id=$2")
    .bind(&workspace)
    .bind(&key)
    .execute(&pool)
    .await
    .unwrap();
  assert!(
    runtime
      .refresh_license_v1(RuntimeLicenseRefreshInput {
        workspace_id: workspace.clone(),
        key: key.clone(),
        expected_validate_key: "generation".into(),
        recurring: "monthly".into(),
        license: payload.clone().into(),
      })
      .await
      .unwrap()
      .is_none()
  );
  sqlx::query("UPDATE entitlements SET status='active' WHERE target_id=$1 AND subject_id=$2")
    .bind(&workspace)
    .bind(&key)
    .execute(&pool)
    .await
    .unwrap();

  let (_, one_time_workspace) = fixture(&runtime).await;
  let (one_time_payload, _) = crate::entitlement::signed_test_license(&one_time_workspace);
  runtime
    .install_team_license_file_v1(one_time_workspace.clone(), one_time_payload.into())
    .await
    .unwrap();
  sqlx::query("UPDATE installed_licenses SET validated_at=clock_timestamp()-INTERVAL '2 hours' WHERE workspace_id=$1")
    .bind(&one_time_workspace)
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query(
    "CREATE OR REPLACE FUNCTION rfc11_fail_onetime_refresh() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE \
     EXCEPTION 'injected one-time refresh failure'; END $$",
  )
  .execute(&pool)
  .await
  .unwrap();
  sqlx::query(&format!(
    "CREATE TRIGGER rfc11_fail_onetime_refresh BEFORE UPDATE ON installed_licenses FOR EACH ROW WHEN \
     (OLD.workspace_id='{}') EXECUTE FUNCTION rfc11_fail_onetime_refresh()",
    one_time_workspace
  ))
  .execute(&pool)
  .await
  .unwrap();
  let one_time_refresh = runtime.check_licenses_v1().await;
  sqlx::query("DROP TRIGGER rfc11_fail_onetime_refresh ON installed_licenses")
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query("DROP FUNCTION rfc11_fail_onetime_refresh()")
    .execute(&pool)
    .await
    .unwrap();
  assert!(one_time_refresh.unwrap().transient_failure);
  let one_time_retained: bool =
    sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM installed_licenses WHERE workspace_id=$1)")
      .bind(&one_time_workspace)
      .fetch_one(&pool)
      .await
      .unwrap();
  assert!(one_time_retained);
  let stale = RuntimeLicenseRefreshInput {
    workspace_id: workspace.clone(),
    key: key.clone(),
    expected_validate_key: "stale".into(),
    recurring: "yearly".into(),
    license: payload.clone().into(),
  };
  assert!(runtime.refresh_license_v1(stale).await.unwrap().is_none());
  assert!(
    !runtime
      .revoke_installed_license_v1(workspace.clone(), key.clone(), "stale".into())
      .await
      .unwrap()
  );
  let (admin, _) = fixture(&runtime).await;
  sqlx::query("INSERT INTO workspace_members(id,workspace_id,user_id,role,state) VALUES($1,$2,$3,'admin','active')")
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(&workspace)
    .bind(&admin)
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query(
    "INSERT INTO workspace_invitations(id,workspace_id,normalized_email,status) \
     VALUES($1,$2,'license-rollback@example.com','pending')",
  )
  .bind(uuid::Uuid::new_v4().to_string())
  .bind(&workspace)
  .execute(&pool)
  .await
  .unwrap();
  sqlx::query(
    "CREATE OR REPLACE FUNCTION rfc11_fail_demotion() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION \
     'injected demotion failure'; END $$",
  )
  .execute(&pool)
  .await
  .unwrap();
  sqlx::query(
    "CREATE TRIGGER rfc11_fail_demotion BEFORE UPDATE ON workspace_members FOR EACH ROW WHEN (OLD.role='admin' AND \
     NEW.role='member') EXECUTE FUNCTION rfc11_fail_demotion()",
  )
  .execute(&pool)
  .await
  .unwrap();
  let rejected = runtime
    .revoke_installed_license_v1(workspace.clone(), key.clone(), "generation".into())
    .await;
  sqlx::query("DROP TRIGGER rfc11_fail_demotion ON workspace_members")
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query("DROP FUNCTION rfc11_fail_demotion()")
    .execute(&pool)
    .await
    .unwrap();
  assert!(rejected.unwrap_err().to_string().contains("injected demotion failure"));
  let retained: (i64, i64, String) = sqlx::query_as(
    "SELECT (SELECT count(*) FROM installed_licenses WHERE workspace_id=$1), (SELECT count(*) FROM \
     workspace_invitations WHERE workspace_id=$1), status FROM entitlements WHERE subject_id=$2",
  )
  .bind(&workspace)
  .bind(&key)
  .fetch_one(&pool)
  .await
  .unwrap();
  assert_eq!(retained, (1, 1, "active".into()));
  assert!(
    runtime
      .revoke_installed_license_v1(workspace.clone(), key.clone(), "generation".into())
      .await
      .unwrap()
  );
  let status: String = sqlx::query_scalar("SELECT status FROM entitlements WHERE subject_id=$1")
    .bind(&key)
    .fetch_one(&pool)
    .await
    .unwrap();
  assert_eq!(status, "revoked");
  let (_, reactivated_workspace) = fixture(&runtime).await;
  let (reactivated_payload, _) = crate::entitlement::signed_test_license_with_id(&reactivated_workspace, &key);
  let remote = crate::license::tests::LicenseServer::new(&key);
  let generation = uuid::Uuid::new_v4().to_string();
  remote.push(200, reactivated_payload.clone(), &generation);
  runtime
    .activate_team_license_v1(reactivated_workspace.clone(), key.clone())
    .await
    .unwrap();
  sqlx::query(
    "INSERT INTO entitlements(id,target_type,target_id,source,subject_id,plan,status,quantity,updated_at) \
     VALUES($1,'workspace',$2,'selfhost_license',$3,'selfhost_team','revoked',10,'2000-01-01')",
  )
  .bind(uuid::Uuid::new_v4().to_string())
  .bind(&workspace)
  .bind(&key)
  .execute(&pool)
  .await
  .unwrap();
  remote.push(200, reactivated_payload.clone(), &generation);
  sqlx::query("UPDATE installed_licenses SET validated_at='2000-01-01' WHERE workspace_id=$1")
    .bind(&reactivated_workspace)
    .execute(&pool)
    .await
    .unwrap();
  let health = runtime.check_licenses_v1().await.unwrap();
  assert!(
    health
      .changes
      .iter()
      .any(|change| change.workspace_id == reactivated_workspace && !change.canceled)
  );
  assert_eq!(remote.requests().len(), 2);
  assert_eq!(
    sqlx::query_scalar::<_, String>("SELECT status FROM entitlements WHERE target_id=$1 AND subject_id=$2")
      .bind(&workspace)
      .bind(&key)
      .fetch_one(&pool)
      .await
      .unwrap(),
    "revoked"
  );
}

#[tokio::test]
async fn authoritative_byok_and_mixed_owner_storage_use_current_facts() {
  let _guard = DATABASE_TEST_LOCK.lock().await;
  let Some(runtime) = runtime_from_database_url().await.unwrap() else {
    eprintln!("skipping PostgreSQL test: DATABASE_URL not set");
    return;
  };
  let pool = runtime.pool().await.unwrap();
  let (owner, workspace) = fixture(&runtime).await;
  let (_, team) = fixture(&runtime).await;
  sqlx::query("UPDATE workspace_members SET user_id=$2 WHERE workspace_id=$1 AND role='owner'")
    .bind(&team)
    .bind(&owner)
    .execute(&pool)
    .await
    .unwrap();
  runtime
    .upsert_admin_grant_v1(RuntimeAdminGrantInput {
      target_type: "workspace".into(),
      target_id: team.clone(),
      plan: "team".into(),
      quantity: Some(serde_json::json!(10)),
    })
    .await
    .unwrap();
  for (id, size) in [(&workspace, 200i32), (&team, 130i32)] {
    sqlx::query(
      "INSERT INTO blobs(workspace_id,key,size,mime,status) VALUES($1,'fixture',$2,'text/plain','completed')",
    )
    .bind(id)
    .bind(size)
    .execute(&pool)
    .await
    .unwrap();
  }
  let mut tx = pool.begin().await.unwrap();
  lock_targets(
    &mut tx,
    &[RuntimeEntitlementTarget {
      target_type: "workspace".into(),
      target_id: workspace.clone(),
    }],
  )
  .await
  .unwrap();
  let now = load_decision_time(&mut tx, "test").await.unwrap();
  let subject = resolve_quota_charge(&mut tx, Deployment::Cloud, &workspace, owner.clone(), now)
    .await
    .unwrap();
  let used = super::super::strict_quota::storage_usage(&mut tx, &workspace, &subject, Deployment::Cloud, now)
    .await
    .unwrap();
  assert_eq!(used, 200);
  tx.commit().await.unwrap();
  assert!(
    !runtime
      .get_byok_entitlement_v1(workspace.clone(), Some(owner.clone()))
      .await
      .unwrap()
      .local
  );
  runtime
    .upsert_admin_grant_v1(RuntimeAdminGrantInput {
      target_type: "user".into(),
      target_id: owner.clone(),
      plan: "ai".into(),
      quantity: None,
    })
    .await
    .unwrap();
  assert!(runtime.has_ai_entitlement_v1(owner.clone()).await.unwrap());
  let access = runtime
    .get_byok_entitlement_v1(workspace.clone(), Some(owner.clone()))
    .await
    .unwrap();
  assert!(access.local && access.server);
  assert!(
    !runtime
      .get_byok_entitlement_v1("missing".into(), Some(owner))
      .await
      .unwrap()
      .local
  );
  sqlx::query("DELETE FROM workspace_members WHERE workspace_id=$1 AND role='owner'")
    .bind(&workspace)
    .execute(&pool)
    .await
    .unwrap();
  assert!(
    runtime
      .get_byok_entitlement_v1(workspace, None)
      .await
      .unwrap_err()
      .to_string()
      .contains("workspace_owner_not_found")
  );
}
